from database import (
    insert_articles, mark_articles_seen, mark_messages_seen, set_setting, init_db,
    get_setting, delete_setting, delete_articles_by_run, remove_seen_urls, remove_seen_emails,
    clear_previous_articles, restore_article_states)
from pipeline.scorer import score_articles, classify_articles
from pipeline.dispatcher import render_digest
from pipeline.email_ingestion import ingest_all_emails
from pipeline.filter import apply_keyword_filter
from pipeline.scraper import scrape_all_sources
from pipeline.fetcher import fetch_all_articles
from datetime import datetime, timedelta, timezone
import argparse
import json
import logging

RESET_WINDOW_HOURS = 2

def run_pipeline() -> dict:
    """Runs the full pipeline once. Returns a summary dict of stage counts for logging."""
    init_db()

    prev_last_search = get_setting('last_search_at')
    scraped, scrape_time = scrape_all_sources()
    ingested, processed_message_ids = ingest_all_emails()
    combined = scraped + ingested
    fetched = fetch_all_articles(combined)
    filtered = apply_keyword_filter(fetched)
    scored = score_articles(filtered)
    classified = classify_articles(scored)
    run_id = datetime.now().isoformat()
    # An empty run must not swap the dashboard state: only clear the previous
    # articles (and stake a new undo point below) when something was found.
    cleared_snapshot = clear_previous_articles() if classified else []
    insert_articles(classified, run_id)
    url_list = []
    for tmp in combined:
        url_list.append(tmp['url'])
    mark_articles_seen(url_list)
    processed_message_ids = list(dict.fromkeys(processed_message_ids))
    for message_id in processed_message_ids:
        mark_messages_seen(message_id)
    set_setting('last_search_at', scrape_time)
    if classified:
        set_setting('last_run_undo', json.dumps({
            'run_id': run_id,
            'prev_last_search_at': prev_last_search,
            'completed_at': datetime.now(timezone.utc).isoformat(),
            'urls': url_list,
            'message_ids': processed_message_ids,
            'cleared_snapshot': cleared_snapshot,
        }))

    counts = {
        'scraped': len(scraped),
        'ingested': len(ingested),
        'fetched': len(fetched),
        'filtered': len(filtered),
        'scored': len(scored),
        'inserted': len(classified),
        'cleared': len(cleared_snapshot)
    }
    return counts


def reset_available() -> bool:
    """True if the last run finished within RESET_WINDOW_HOURS and can be undone."""
    raw = get_setting('last_run_undo')
    if not raw:
        return False
    try:
        undo = json.loads(raw)
        completed = datetime.fromisoformat(undo['completed_at'])
    except (ValueError, KeyError):
        return False
    return datetime.now(timezone.utc) <= completed + timedelta(hours=RESET_WINDOW_HOURS)


def reset_last_run() -> dict:
    """Pure undo of the most recent pipeline run — no re-scrape. Deletes the
    articles that run inserted (any status), un-marks its seen URLs and Gmail
    messages, and restores last_search_at to its pre-run value, so the next
    Start Search re-covers the same window and can find the same articles.
    Raises ValueError if there is no run to reset or the 2-hour window has
    passed."""
    raw = get_setting('last_run_undo')
    if not raw:
        raise ValueError('No recent search to reset.')
    if not reset_available():
        raise ValueError('The reset window (2 hours) has passed.')
    undo = json.loads(raw)
    deleted = delete_articles_by_run(undo['run_id'])
    restored = restore_article_states(undo.get('cleared_snapshot') or [])
    urls = undo.get('urls') or []
    message_ids = undo.get('message_ids') or []
    remove_seen_urls(urls)
    remove_seen_emails(message_ids)
    if undo.get('prev_last_search_at'):
        set_setting('last_search_at', undo['prev_last_search_at'])
    else:
        delete_setting('last_search_at')
    delete_setting('last_run_undo')
    logging.info(
        f"Reset: deleted {deleted} articles from run {undo['run_id']}, "
        f"restored {restored} cleared articles, "
        f"unmarked {len(urls)} urls and {len(message_ids)} messages, "
        f"restored last_search_at={undo.get('prev_last_search_at')}")
    return {
        'deleted_articles': deleted,
        'restored_articles': restored,
        'unmarked_urls': len(urls),
        'unmarked_messages': len(message_ids),
    }



def main():
    parser = argparse.ArgumentParser(description='Mercury Fund AI digest runner.')
    sub = parser.add_subparsers(dest='command', required=True)

    sub.add_parser('run', help='Scrape, score, and populate the dashboard.')

    send_p = sub.add_parser('send', help='Render and send the digest.')
    send_p.add_argument('--dry-run', action='store_true',
                        help='Render HTML to a file instead of sending.')

    args = parser.parse_args()

    if args.command == 'run':
        print(run_pipeline())

if __name__ == '__main__':
    main()
