import anthropic
import json
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from config import ANTHROPIC_API_KEY
from database import get_topics

CLASSIFICATION_THRESHOLD = 6
SCORING_WORKERS = 8

_THESIS_PATH = os.path.join(os.path.dirname(__file__), 'mercury_thesis.md')
with open(_THESIS_PATH, encoding='utf-8') as f:
    MERCURY_CONTEXT = (
        "Below is background on Mercury Fund's investment theses. Use it as context for what Mercury cares about when judging relevance.\n\n"
        + f.read()
    )

CLASSIFICATION_SYSTEM_PROMPT = '''You are a topic classifier for Mercury Fund. You are given a list of candidate topics (each with a "name" and a "description") and a single news article (a headline and body text). Your job is to assign the article to exactly ONE topic.

Instructions:
- Rate how well the article fits EACH provided topic on a scale of 1 to 10, judging strictly against that topic's description (10 = an excellent, unambiguous fit; 1 = no real relation).
- Find the single highest-scoring topic. If two topics tie for the highest score, choose the one listed first.
- If that highest score is 6 or greater, the article belongs to that topic.
- If the highest score is below 6, or if no topics are provided, the article belongs to "Other".

Some items have little or no body text — only a headline. In that case judge the topic fit from the headline alone.

Not every item is a real news article. Non-article material must score 1 against EVERY topic, no matter how well its words match a topic description. This includes: subscribe/unsubscribe or preference-center links, social-media handles or profile links, sponsor calls-to-action and cross-promotions, digital products and lead magnets (ebooks, prompt packs, courses, templates), "how to" self-help or listicle content, newsletter section labels or navigation, and sentence fragments that are not a real headline.

Respond with ONLY a JSON object, no other text and no code fences.
- If the article belongs to a specific topic, return its exact name and the 1-10 match score for that topic:
{"topic": "<exact topic name>", "score": <integer 1-10>}
- If the article belongs to "Other", return ONLY the topic and NO score key:
{"topic": "Other"}

Use the topic names exactly as they were given to you. Do not invent topics that were not provided.'''

SYSTEM_PROMPT = '''You are a content analyst for Mercury Fund. Evaluate each article for relevance to Mercury Fund's investment thesis.

RELEVANT content includes:
- Early-stage or emerging AI startups: funding rounds, launches, product announcements
- New AI tools, models, or frameworks relevant to the startup ecosystem
- Acquisitions, partnerships, or exits involving AI startups
- Venture capital activity in the AI space: fund announcements, notable investments
- Regulatory or policy developments directly impacting AI startups
- Research with direct startup or commercialization implications

NOT RELEVANT:
- Articles primarily about large established companies (NVIDIA, Google, Microsoft, OpenAI, Meta, Apple, Amazon) UNLESS the article directly involves a named AI startup (e.g. an acquisition, investment, or partnership)
- General consumer tech news not tied to AI startups
- Sponsored content, ads, or promotional pieces
- Opinion about large-cap tech that does not reference startups

Some items have little or no body text — only a headline (their full content could not be retrieved). When the body is missing or very short, judge relevance from the headline alone and be strict about rejecting anything that is not a real news article. Mark is_relevant=false for promotional or non-article material, including:
- Digital products and lead magnets: ebooks, handbooks, prompt packs, courses, templates (e.g. "1,000+ ChatGPT Prompts", "AI at Work Handbook", "300+ Ultimate AI Tools", "Make Money with AI")
- "How to..." self-help or listicle content
- Newsletter section labels or navigation (e.g. "Community AI workflows", "Everything else in AI today", "Trending AI Tools")
- Sponsor calls-to-action and cross-promotions
A genuine news item or announcement with a real headline (a funding round, product launch, acquisition, model release, etc.) should still be evaluated normally even when its body is missing.

Respond with ONLY a JSON object in this exact format, no other text:
{
  "is_relevant": true or false,
  "score": <integer 1-10, 10 = most relevant to early-stage AI VC>,
  "category": "specific" or "general",
  "topics": ["topic1", "topic2"],
  "summary": "1-2 sentence summary of what this article covers"
}

Category definitions:
- "specific": In-depth analysis, opinion, or commentary on AI startups or VC
- "general": Straight news, funding announcements, product launches, brief updates

Topics should be short consistent labels: "AI Funding", "LLM Startups", "AI Policy", "Acquisitions", "VC Activity", "AI Tools", "Foundation Models", "Robotics", "AI Agents". Assign 1-3 per article.'''

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

def score_articles(articles: list[dict]) -> list[dict]:
    """Scores all articles, keeping is_relevant on each. The Extra decision now
    happens in classify_articles (an article is 'extra' only if it matches no
    topic AND fails the thesis)."""
    def worker(article):
        try:
            return score_article(article)
        except Exception as e:
            logging.warning(f'Failed article scoring with error: {e}')
            return None

    with ThreadPoolExecutor(max_workers=SCORING_WORKERS) as pool:
        scored = list(pool.map(worker, articles))

    return [article for article in scored if article is not None]

def score_article(article: dict) -> dict:
    """Scores one article. Returns enriched dict or None if Claude marks it irrelevant."""
    
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=350,
        system=[
            {
                'type': 'text',
                'text': MERCURY_CONTEXT,
                'cache_control': {'type': 'ephemeral'}
            },
            {
            "type": "text",
            "text": SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"}
            }
        ],
        messages=[
            {
            "role": "user",
            "content": f"Headline: {article['headline']}\n\nBody: {article['body_text']}"
            }
        ]
    )

    text = message.content[0].text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    result = json.loads(text.strip())
    article.update(result)
    article['relevance_score'] = article.get('score')

    return article

def classify_articles(articles: list[dict]) -> list[dict]:
    """Classify EVERY article against the current topics, then apply the
    topic-OR-thesis gate: an article goes to status='extra' only if it matched
    no topic AND Claude marked it thesis-irrelevant. Non-paywalled articles get
    article['topic'] set (and 'score' overwritten with the topic-match score on
    a match). Paywalled articles get a headline-only probe on a throwaway copy —
    a topic match saves them from Extra, but they are never bucketed, so their
    own topic/score stay untouched (they go to Manual Review). The probe is
    skipped when the article is already thesis-relevant, since its result
    couldn't change anything. On a
    classification error the gate degrades to thesis-only, matching the old
    behavior. Returns the full list (same dicts, mutated in place)."""
    topics = get_topics()

    def worker(article):
        matched = False
        try:
            if article['paywall_status'] == 0:
                classify_article(article, topics)
                matched = article.get('topic') != 'Other'
            elif article.get('is_relevant') != True:
                probe = {'headline': article['headline'], 'body_text': article.get('body_text', '')}
                classify_article(probe, topics)
                matched = probe.get('topic') != 'Other'
        except Exception as e:
            logging.warning(f'Failed article classification with error: {e}')
            if article['paywall_status'] == 0:
                article['topic'] = 'Other'
        if not matched and article.get('is_relevant') != True:
            article['status'] = 'extra'
        return article

    with ThreadPoolExecutor(max_workers=SCORING_WORKERS) as pool:
        return list(pool.map(worker, articles))


def classify_article(article: dict, topics: list[dict]) -> dict:
    """The second Claude call. Rate the article 1-10 against EACH topic in `topics`,
    then pick the highest-scoring topic. If that top score >= CLASSIFICATION_THRESHOLD,
    set article['topic'] to that topic's name; otherwise set it to 'Other'. Set
    article['score'] to the topic-match score (see the open question below for the
    'Other' case). Tie-break: `topics` arrives in creation order (id ASC from
    get_topics), so iterating in order and keeping a strict '>' max makes the
    first-created topic win a tie. Handle the empty-topics case (all deleted) by
    routing to 'Other'. Returns the mutated article."""
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=350,
        system=[
            {
                'type': 'text',
                'text': MERCURY_CONTEXT,
                'cache_control': {'type': 'ephemeral'}
            },
            {
            "type": "text",
            "text": CLASSIFICATION_SYSTEM_PROMPT,
            'cache_control': {'type': 'ephemeral'}
            }
        ],
        messages=[{
            "role": "user",
            "content": f"Topics: {topics}\n\nHeadline: {article['headline']}\n\nBody: {article['body_text']}"
        }]
    )

    text = message.content[0].text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    result = json.loads(text.strip())
    article.update(result)

    return article