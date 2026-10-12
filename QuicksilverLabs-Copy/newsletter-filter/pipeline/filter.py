from config import KEYWORDS
import logging

BLOCKLIST = ['sponsored', 'advertisement', 'press release']

def _passes_keyword_check(article: dict) -> bool:
    """Returns True if article matches at least one keyword and no blocklist words."""
    combined_description = (article.get('headline', '') + ' ' + article.get('body_text', '')).lower()

    for word in BLOCKLIST:
        if word.lower() in combined_description:
            return False

    for keyword in KEYWORDS:
        if keyword.lower() in combined_description:
            return True
        
    return False

def apply_keyword_filter(articles: list[dict]) -> list[dict]:
    """Returns only articles that pass the keyword check. Paywalled articles pass through untouched."""
    filtered = []

    for article in articles:
        keyword_status = _passes_keyword_check(article)
        if keyword_status or article['paywall_status']:
            filtered.append(article)

    dropped = len(articles) - len(filtered)
    logging.info(f"Keyword filter: {len(articles)} in, {len(filtered)} passed, {dropped} dropped")
    return filtered