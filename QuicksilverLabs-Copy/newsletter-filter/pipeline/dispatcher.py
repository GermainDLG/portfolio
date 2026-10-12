from database import get_confirmed_articles, get_topics
from jinja2 import Environment, FileSystemLoader, select_autoescape
from datetime import datetime
from email.mime.text import MIMEText
import base64
from config import RECIPIENTS, GMAIL_ADDRESS, ALLOWED_DOMAINS, PUBLIC_BASE_URL
from pipeline.email_ingestion import _gmail_auth


def _check_recipient_domains(recipients: list[str]) -> None:
    """Raise ValueError if any recipient's domain is not in ALLOWED_DOMAINS.
    Extracts the domain after '@' (lowercased) for each address and verifies
    membership. Refuses the whole send if any recipient fails."""
    if recipients == []:
        raise ValueError("No recipients configured")
    for recipient in recipients:
        separated = recipient.split('@')
        if len(separated) != 2:
            raise ValueError('Malformed email with multiple @')
        domain = separated[1].strip().lower()
        if domain not in ALLOWED_DOMAINS:
            raise ValueError(f"{domain} not allowed in ALLOWED_DOMAINS")
    return


def render_digest():
    articles = get_confirmed_articles()
    pinned = [a for a in articles if a.get('top_news_state') == 'pinned']
    rest = [a for a in articles if a.get('top_news_state') != 'pinned']

    top_news = sorted(pinned, key=lambda a: a.get('relevance_score') or 0, reverse=True)
    rest = sorted(rest, key=lambda a: a.get('relevance_score') or 0, reverse=True)

    env = Environment(loader=FileSystemLoader('templates'),
                      autoescape=select_autoescape(['html']))
    buckets = build_buckets(rest, get_topics(), always_show_other=False)
    template = env.get_template('email_digest.html')
    html_body = template.render(
        date_str=datetime.now().strftime('%B %d, %Y'),
        top_news=top_news,
        buckets=buckets,
        public_base_url=PUBLIC_BASE_URL
    )
    return html_body, len(articles)

def build_buckets(articles: list[dict], topics: list[dict], always_show_other: bool = True) -> list[dict]:
    """Group articles into ordered buckets by topic for rendering. Input order is
    preserved within each bucket. Returns a list of {'name': str, 'articles': list[dict]}:
    one bucket per topic (in get_topics() creation order) that has >= 1 matching article
    — empty topic buckets are omitted — followed by an 'Other' bucket collecting every
    article whose `topic` is 'Other', is missing, or doesn't match a current topic name.
    always_show_other=True (default, dashboard) keeps 'Other' even when empty;
    always_show_other=False (email) omits empty buckets, including 'Other'."""

    topic_dict = dict()
    result = []
    for topic in topics:
        topic_name = topic['name']
        topic_dict[topic_name] = []
    topic_dict["Other"] = []

    for article in articles:
        article_topic = article['topic']
        if article_topic in topic_dict.keys():
            topic_dict[article_topic].append(article)
        else:
            topic_dict['Other'].append(article)
    

    for key in topic_dict.keys():
        if not topic_dict[key] and not (key == 'Other' and always_show_other):
            continue
        result.append({'name': key, 'articles': topic_dict[key]})
    
    return result


# ------------ RETIRED EMAIL SEND ---------------

# def main():
#     return send_digest(RECIPIENTS)

# if __name__ == '__main__':
#     main()

# def send_digest(recipients, html_body=None):
#     _check_recipient_domains(recipients)
#     service = _gmail_auth()

#     if html_body is None:
#         html_body, count = render_digest()
#     else:
#         count = len(get_confirmed_articles())

#     message = MIMEText(html_body, 'html', 'utf-8')
#     message['To'] = ', '.join(recipients)
#     message['From'] = GMAIL_ADDRESS
#     message['Subject'] = f'Quicksilver Labs Newsletter - {datetime.now().strftime('%B %d, %Y')}'
#     raw = base64.urlsafe_b64encode(message.as_bytes()).decode()

#     sent = service.users().messages().send(
#         userId='me',
#         body={'raw': raw},
#     ).execute()
#     return {'message_id': sent['id'], 'count': count}
