import database
import feedparser
from urllib.parse import urlparse
import logging
from datetime import datetime, timedelta, timezone
from config import SOURCE_URLS


def _valid_feed_article(published: datetime, last_search: datetime, link: str, excluded: set[str]) -> bool:
    if published > last_search:
        if link not in excluded:
            return True
    return False

def _get_source_name(url: str) -> str:
    return urlparse(url).netloc

def scrape_all_sources() -> tuple[list[dict], str]:
    """Main entry point. Returns combined list of {url, headline, source} dicts."""
    last_search_ISO = database.get_setting('last_search_at')
    if last_search_ISO is None:
        last_search = datetime.now(timezone.utc) - timedelta(days=1)
        scrape_time = datetime.now(timezone.utc).isoformat()
    else:
        last_search = datetime.fromisoformat(last_search_ISO)
        scrape_time = datetime.now(timezone.utc).isoformat()

    seen = database.get_seen_urls()
    existing = database.get_existing_article_urls()
    excluded = seen | existing
    result = []
    for url in SOURCE_URLS:
        try:
            new_articles = _scrape_source(url, last_search, excluded)
            logging.info(f"Source {url}: extracted {len(new_articles)} articles")
            result.extend(new_articles)
        except Exception as e:
            logging.warning(f"failed with error: {e}")
    
    return result, scrape_time

def _scrape_source(url: str, last_search: datetime, excluded: set[str]) -> list[dict]:
    """Parses RSS/Atom feeds; returns [] for non-feed URLs."""
    source_name = _get_source_name(url)
    feed = feedparser.parse(url)
    if feed.entries: #checking if non-empty/non-null
        return _scrape_feed(feed, last_search, source_name, excluded)
    else:
        return []

def _scrape_feed(feed, last_search: datetime, source_name: str, excluded: set[str]) -> list[dict]:
    """Parses an RSS or Atom feed. Uses feedparser."""
    result = []
    for entry in feed.entries:
        if not entry.get('published_parsed'):
            continue
        title = entry.get('title')
        link = entry.get('link')
        published_raw = entry.get('published_parsed')
        published = datetime(*published_raw[:6], tzinfo=timezone.utc)
        # summary = entry.summary or ''
        # could use this later?

        if _valid_feed_article(published, last_search, link, excluded):
            item = {
                'url': link,
                'headline': title,
                'source': source_name
            }

            result.append(item)

    return result