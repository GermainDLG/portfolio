from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from email.utils import parseaddr
from config import GMAIL_TOKEN_PATH
from bs4 import BeautifulSoup
from .fetcher import HEADERS, is_tracking_url, strip_utm, pretty_source_name, get_with_retry
from concurrent.futures import ThreadPoolExecutor
import urllib.parse
import requests
import database
import logging
import base64
import html as html_lib
import re

# Most tracking links in a run hit the same one or two hosts (beehiiv, etc.).
# Keep concurrency modest so a datacenter IP doesn't trip their rate limits.
UNWRAP_WORKERS = 4

BLOCKED_TERMS = ['subscribe', 'unsubscribe', 'view in browser', 'advertise', 'preferences', 'privacy', 'terms', 'mailing list']
CTA_PREFIXES = ('read the full', 'see how', 'watch ', 'download', 'try it',
                'get in touch', 'register', 'sign up', 'join ', 'ready to',
                'start ', 'learn how')
RATING_CHARS = ('🧠', '⭐')
# Anchors that are social-media handles, e.g. "SemiAnalysis (@SemiAnalysis_)"
SOCIAL_HANDLE_RE = re.compile(r'\(@\w+\)')

SCOPES = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
]

NEWSLETTER_SENDERS = [
    'aibreakfast@mail.beehiiv.com',
    'blog@tomtunguz.com',
    'crew@technews.therundown.ai',
    'hi@robotics.therundown.ai',
    'thebatch@deeplearning.ai',
    'connie@strictlyvc.com',
    'oneusefulthing@substack.com',
    'techtrenches@substack.com',
    'hello@deeplearning.ai',
    'news@alphasignal.ai',
    'superhuman@mail.joinsuperhuman.ai',
    'news@daily.therundown.ai',
]

SENDERS = '(' + ' OR '.join(NEWSLETTER_SENDERS) + ')'


def _gmail_auth():
    creds = Credentials.from_authorized_user_file(GMAIL_TOKEN_PATH, SCOPES)
    if not creds.valid:
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(GMAIL_TOKEN_PATH, 'w') as file:
                file.write(creds.to_json())
        else:
            raise RuntimeError('No valid Gmail credentials; re-run the bootstrap auth flow.')
    
    return build('gmail', 'v1', credentials=creds)

def _get_message(service, message_id):
    return (service.users().messages().get(userId="me", id=message_id).execute())

def _find_html_part(part):
    if part['mimeType'] == 'text/html':
        return part['body']['data']
    elif part.get('parts') is not None:
        for child in part['parts']:
            tmp = _find_html_part(child)
            if tmp:
                return tmp
    else:
        return None

def _get_html(msg):
    payload = msg['payload']
    encoded = _find_html_part(payload)
    if encoded is None:
        return ''
    length = len(encoded)
    while length%4 != 0:
        length += 1
    padded = encoded.ljust(length, '=')
    byte_data = base64.urlsafe_b64decode(padded)
    return byte_data.decode('utf-8')

def _get_sender(msg):
    header_list = msg.get('payload').get('headers')
    for header in header_list:
        if header['name'] == "From":
            display_name, email_address = parseaddr(header['value'])
            if display_name:
                return display_name
            else:
                return email_address

def _list_newsletter_messages(service):
    result = []
    processed = database.get_seen_emails()
    params = dict(userId="me", labelIds=["INBOX"], q=f'from:{SENDERS}', maxResults=100)
    response = service.users().messages().list(**params).execute()
    while True:
        for message in response.get('messages', []):
            if message['id'] not in processed:
                result.append(message['id'])
        token = response.get('nextPageToken')
        if not token:
            break
        response = service.users().messages().list(**params, pageToken=token).execute()
    return result

def _find_html_redirect(html: str, base_url: str) -> str | None:
    """Look for a meta-refresh, canonical link, or JS redirect in an interstitial page."""
    patterns = [
        r'http-equiv=["\']?refresh["\']?[^>]*url=([^"\'>\s]+)',
        r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)',
        r'window\.location(?:\.href)?\s*=\s*["\']([^"\']+)',
    ]
    for pattern in patterns:
        m = re.search(pattern, html, re.I)
        if m:
            target = html_lib.unescape(m.group(1))
            return urllib.parse.urljoin(base_url, target)
    return None

def _unwrap_tracking_url(url) -> tuple[str, int | str | None]:
    """Returns (canonical_url, outcome). Outcome is None for non-tracking links,
    the final HTTP status when the tracker responded, or the exception class
    name on a network error — used for the failure breakdown log."""
    if not is_tracking_url(url):
        return strip_utm(url), None
    response = None
    try:
        response = get_with_retry(url, timeout=20, stream=True)
        final = response.url
        if is_tracking_url(final):
            # Redirect chain stalled on the tracker: some (beehiiv included)
            # serve an HTML interstitial instead of a 3xx.
            target = _find_html_redirect(response.text[:20000], final)
            if target:
                final = target
        return strip_utm(final), response.status_code
    except Exception as e:
        return url, type(e).__name__
    finally:
        if response is not None:
            try:
                response.close()
            except Exception:
                pass

# Path segments that mark newsletter chrome (preference centers, share/subscribe
# pages) rather than articles. Checked against the post-unwrap URL, so tracking
# links that resolve to these pages are dropped too.
JUNK_PATH_SEGMENTS = {'subscribe', 'unsubscribe', 'preferences', 'account',
                      'login', 'signup', 'sign-up', 'share', 'refer',
                      'referral', 'referrals', 'advertise', 'sponsor',
                      'upgrade', 'privacy', 'terms'}


def _is_junk_url(url: str) -> bool:
    """True for links that can't be articles: homepages (empty path) and
    newsletter-chrome paths (preference centers, share/subscribe pages)."""
    path = urllib.parse.urlparse(url).path
    segments = [s.lower() for s in path.split('/') if s]
    if not segments:
        return True
    return any(s in JUNK_PATH_SEGMENTS for s in segments)


def _generic_checker(a, seen):
    text = a.get_text(strip=True)
    href = a['href']
    block = a.find_parent(['p','td','li','div'])
    block_text = block.get_text(strip=True) if block else text
    ratio = 0
    if len(block_text) != 0:
        ratio = len(text) / len(block_text)
    if len(text) < 20:
        return False
    if urllib.parse.urlparse(href).scheme not in ('http', 'https'):
        return False
    if href in seen:
        return False
    if any(word.lower() in text.lower() for word in BLOCKED_TERMS):
        return False
    if text.lower().startswith(CTA_PREFIXES):
        return False
    if any(ch in text for ch in RATING_CHARS):
        return False
    if SOCIAL_HANDLE_RE.search(text):
        return False
    if ratio <= 0.1:
        return False
    return True

def _fix_letter_spacing(spaced: str, tight: str) -> str:
    """Repair 'H e a d l i n e' artifacts. Some newsletters (e.g. AlphaSignal) wrap
    every letter in its own tag, so joining child nodes with ' ' spaces out each
    letter. If most tokens are single characters, fall back to the tight join
    (no separator between tags), which reassembles the real words."""
    tokens = spaced.split(' ')
    if len(tokens) < 6:
        return spaced
    singles = sum(1 for t in tokens if len(t) == 1)
    if singles / len(tokens) >= 0.6 and len(tight) < len(spaced):
        return tight
    return spaced

def _parse_generic(html: str) -> list[dict]:
    soup = BeautifulSoup(html, 'html.parser')
    links = soup.find_all('a', href=True)
    seen = set()
    result = []
    for a in links:
        href = a['href']
        raw_text = a.get_text(separator=' ', strip=True)
        removed_whitespace = re.sub(r'\s+', ' ', raw_text)
        tight = re.sub(r'\s+', ' ', a.get_text()).strip()
        removed_whitespace = _fix_letter_spacing(removed_whitespace, tight)
        text = re.sub(r'^\s*(?:[▸•\-]+|\d+[\.\)])?\s*', '', removed_whitespace)
        if _generic_checker(a, seen):
            seen.add(href)
            item = {
                'url': href,
                'headline': text
            }
            result.append(item)
    return result

def ingest_all_emails() -> tuple[list[dict], list[str]]:
    service = _gmail_auth()
    seen = database.get_seen_urls()
    existing = database.get_existing_article_urls()
    excluded = seen | existing
    result = []
    processed_ids = []

    message_ids = _list_newsletter_messages(service)
    raw_items = []  # (message_id, url, headline)
    for message_id in message_ids:
        try:
            msg = _get_message(service, message_id)
            html = _get_html(msg)
            for item in _parse_generic(html):
                raw_items.append((message_id, item['url'], item['headline']))
            # Fully parsed: mark seen even if every link ends up excluded,
            # so the message isn't re-downloaded and re-unwrapped next run.
            processed_ids.append(message_id)
        except Exception as e:
            logging.warning(f"Failed to retrieve message {message_id} with error: {e}")

    with ThreadPoolExecutor(max_workers=UNWRAP_WORKERS) as pool:
        unwrapped = list(pool.map(_unwrap_tracking_url, [url for (_, url, _) in raw_items]))
    canonical_urls = [u for (u, _) in unwrapped]

    failures = {}
    for (_, raw_url, _), (canonical, outcome) in zip(raw_items, unwrapped):
        if is_tracking_url(canonical):
            domain = urllib.parse.urlparse(raw_url).netloc.lower()
            key = f'{domain} [{outcome}]'
            failures[key] = failures.get(key, 0) + 1
    if failures:
        from .fetcher import impersonate_requests
        from config import PROXY_URL
        breakdown = ', '.join(f'{k}: {v}' for k, v in sorted(failures.items(), key=lambda kv: -kv[1]))
        transport = 'curl_cffi' if impersonate_requests is not None else 'requests'
        proxy = 'on' if PROXY_URL else 'off'
        logging.warning(
            f'{sum(failures.values())}/{len(canonical_urls)} links still on tracking domains '
            f'after unwrap (transport: {transport}, proxy: {proxy}). '
            f'By origin [final status]: {breakdown}')

    junk_dropped = 0
    for (message_id, _, headline), canonical_url in zip(raw_items, canonical_urls):
        if _is_junk_url(canonical_url):
            junk_dropped += 1
            continue
        if canonical_url not in excluded:
            entry = {
                'url': canonical_url,
                'headline': headline,
                'source': pretty_source_name(canonical_url)
            }
            result.append(entry)
            excluded.add(canonical_url)

    if junk_dropped:
        logging.info(f'Dropped {junk_dropped} junk links (homepages / newsletter chrome)')
    return result, processed_ids