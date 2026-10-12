import logging as _logging
import requests
try:
    # Performs the TLS handshake identically to real Chrome. Cloudflare-fronted
    # click-trackers fingerprint the handshake itself, so plain requests gets
    # blocked from datacenter IPs no matter what headers it sends.
    from curl_cffi import requests as impersonate_requests
except ImportError:
    impersonate_requests = None
    _logging.warning('curl_cffi not installed - falling back to plain requests '
                     '(no browser TLS impersonation; tracker unwrapping will fail more often)')
import trafilatura
from readability import Document
from bs4 import BeautifulSoup
import logging
import random
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from config import BLOCKED_DOMAINS, PROXY_URL

# A full, current browser fingerprint. A truncated UA is an instant bot flag to
# Cloudflare & co., which matters most from datacenter (EC2) IPs.
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}
FETCH_TIMEOUT = 15
FETCH_WORKERS = 8
# Statuses that are usually bot-blocking or rate-limiting rather than a real
# refusal — worth retrying after a pause, especially from a datacenter IP.
RETRY_STATUSES = (403, 429, 503)


def get_with_retry(url: str, timeout: int, attempts: int = 3, stream: bool = False):
    """GET with jittered backoff on rate-limit/bot-block statuses and transient
    network errors. Uses curl_cffi's Chrome impersonation when installed (it sets
    its own coherent header set); falls back to plain requests. Tracker-host
    requests are routed through PROXY_URL when configured, since those hosts
    block datacenter IPs outright. Returns the last response if every attempt
    is refused."""
    proxies = None
    extra_headers = None
    if PROXY_URL and is_tracking_url(url):
        proxies = {'http': PROXY_URL, 'https': PROXY_URL}
        # Zyte's proxy follows redirects server-side by default and never
        # exposes the final URL, so response.url would stay stuck on the
        # tracker. Pass redirects through instead: we follow them ourselves,
        # which is exactly what unwrapping needs. Harmless with non-Zyte
        # proxies (unknown header is just forwarded).
        extra_headers = {'Zyte-Disable-Follow-Redirect': 'true'}
    # Zyte's unblocker proxy terminates TLS itself, so proxied requests fail CA
    # verification. Safe to skip here: these responses are only mined for a
    # redirect target, never trusted content.
    verify = proxies is None
    last_exc = None
    for attempt in range(attempts):
        if attempt:
            time.sleep(attempt + random.random())
        try:
            if impersonate_requests is not None:
                response = impersonate_requests.get(
                    url, timeout=timeout, impersonate='chrome', allow_redirects=True,
                    proxies=proxies, verify=verify, headers=extra_headers)
            else:
                response = requests.get(
                    url, headers={**HEADERS, **(extra_headers or {})}, timeout=timeout,
                    stream=stream, proxies=proxies, verify=verify)
        except Exception as e:
            last_exc = e
            continue
        if response.status_code in RETRY_STATUSES and attempt < attempts - 1:
            response.close()
            continue
        return response
    if last_exc is not None:
        raise last_exc
    raise RuntimeError(f'get_with_retry exhausted {attempts} attempts for {url} without a response')

# Subdomain labels newsletters use for click-tracking redirect hosts. Matched
# against every dot-separated label of the subdomain (e.g. link.mail.beehiiv.com,
# 6a50e11d.click.kit-mail3.com), but never against the registrable domain itself,
# so a site actually named e.g. mail.com is not flagged.
TRACKING_LABELS = {'link', 'links', 'click', 'clicks', 'email', 'e',
                   'track', 'tracking', 'url', 'go', 'mail'}
TRACKING_SUBSTRINGS = ('list-manage.com', 'sendgrid.net', 'rs6.net', 'convertkit-mail', 'kit-mail')


def is_tracking_url(url: str) -> bool:
    """True if the URL's host looks like a newsletter click-tracking redirector."""
    netloc = urllib.parse.urlparse(url).netloc.lower()
    if any(label in TRACKING_LABELS for label in netloc.split('.')[:-2]):
        return True
    return any(sub in netloc for sub in TRACKING_SUBSTRINGS)


def strip_utm(url: str) -> str:
    """Remove utm_* query params so the same article always dedupes to one URL."""
    parsed = urllib.parse.urlparse(url)
    queries = [(k, v) for k, v in urllib.parse.parse_qsl(parsed.query) if not k.startswith('utm_')]
    return parsed._replace(query=urllib.parse.urlencode(queries)).geturl()


def pretty_source_name(url: str) -> str:
    netloc = urllib.parse.urlparse(url).netloc.lower()
    if netloc.startswith('www.'):
        netloc = netloc[4:]
    return netloc


def fetch_all_articles(articles: list[dict]) -> list[dict]:
    """Enriches each article dict with body_text and is_paywalled. Returns updated list."""
    def worker(article):
        try:
            return fetch_article(article)
        except Exception as e:
            logging.warning(f'Failed article fetching with error: {e}')
            return None

    with ThreadPoolExecutor(max_workers=FETCH_WORKERS) as pool:
        results = list(pool.map(worker, articles))
    return [item for item in results if item is not None]

def fetch_article(article_dict: dict) -> dict:
    """Fetches one article URL. Returns the dict with body_text and is_paywalled added."""

    response = get_with_retry(article_dict['url'], timeout=FETCH_TIMEOUT)
    html = response.text
    status_code = response.status_code

    url = article_dict['url']
    source = article_dict['source']
    # If we stored a tracking URL (e.g. link.mail.beehiiv.com) but the request
    # redirected through to the real article, keep the real URL instead.
    if response.url and is_tracking_url(url) and not is_tracking_url(response.url):
        url = strip_utm(response.url)
        source = pretty_source_name(url)

    headline = article_dict['headline']
    # Some newsletters use the raw URL as a link's anchor text; swap in the
    # real page title so the dashboard doesn't show URLs as headlines.
    if headline and headline.lower().startswith(('http://', 'https://', 'www.')):
        headline = extract_title(html) or headline

    body_text = extract_body(html, url)
    is_paywalled = detect_paywall(url, status_code, html, body_text)

    updated_dict = {
        'url': url,
        'source': source,
        'headline': headline,
        'paywall_status': is_paywalled,
        'body_text': body_text
    }
    return updated_dict


def extract_title(html: str) -> str | None:
    """Best-effort page title: trafilatura metadata first, <title> tag fallback.
    Whitespace is collapsed. Returns None when neither yields a title."""
    try:
        meta = trafilatura.extract_metadata(html)
        if meta and meta.title:
            return ' '.join(meta.title.split())
    except Exception:
        pass
    tag = BeautifulSoup(html, 'html.parser').find('title')
    if tag and tag.get_text(strip=True):
        return ' '.join(tag.get_text().split())
    return None

def detect_paywall(url: str, status_code: int, html: str, body_text: str) -> bool:
    """Returns True if any paywall signal is detected."""
    filter_list = [
        'subscribe to read',
        'sign in to continue',
        'subscription options',
        'subscribe to continue',
        'subscribe to keep reading',
        'already a subscriber'
    ]

    if status_code in [402, 403]:
        return True

    for keyword in filter_list:
        if keyword in body_text:
            return True

    if len(body_text) < 500:
        return True

    for domain in BLOCKED_DOMAINS:
        if domain in url:
            return True

    return False

def extract_body(html: str, url: str) -> str:
    """Runs trafilatura, falls back to readability-lxml. Returns extracted text or empty string."""
    body = trafilatura.extract(html)
    if not body:
        doc = Document(html)
        body = BeautifulSoup(doc.summary(), 'html.parser').get_text()
    return body or ''
