import sqlite3
from config import DB_PATH
from datetime import datetime

RESERVED_TOPIC_NAMES = {'other'}
DEFAULT_TOPICS = [
    ('Startup Funding <25M', 'This category should contain all news regarding startups raising less than 25 million dollars of funding in the current round.'),
    ('Startup Funding 25->100M', 'This category should contain all news regarding startups raising between 25 and 100 million dollars of funding in the current round.'),
    ('Startup Funding 100M+', 'This category should contain all news regarding startups raising more than 100 million dollars of funding in the current round.')
]
PRIORITIES = {'neutral', 'pinned'}
VALID_STATUSES = {'pending', 'confirmed', 'denied'}

def init_db() -> None:
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute('''CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL UNIQUE,
        headline TEXT,
        source TEXT,
        summary TEXT,
        score REAL,
        relevance_score REAL,
        category TEXT,
        topic TEXT,
        paywall_status INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        top_news_state TEXT DEFAULT 'neutral',
        accepted INTEGER,
        run_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );''')

        connection.execute('''CREATE TABLE IF NOT EXISTS seen_urls (
            url TEXT PRIMARY KEY,
            seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );''')

        connection.execute('''CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );''')

        connection.execute('''CREATE TABLE IF NOT EXISTS seen_emails (
            message_id TEXT PRIMARY KEY,
            processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );''')

        connection.execute('''CREATE TABLE IF NOT EXISTS topics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );''')

        migrate_articles(connection)
    seed_default_topics()


def get_setting(key: str) -> str | None:
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            'SELECT value FROM settings WHERE key = ?', (key,)
        ).fetchone()
        return row[0] if row else None


def set_setting(key: str, value: str) -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
            (key, value)
        )


def delete_setting(key: str) -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('DELETE FROM settings WHERE key = ?', (key,))


def get_seen_urls() -> set[str]:
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute('SELECT url FROM seen_urls').fetchall()
        return {row[0] for row in rows}

def get_seen_emails() -> set[str]:
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute('SELECT message_id FROM seen_emails').fetchall()
        return {row[0] for row in rows}

def get_existing_article_urls() -> set[str]:
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute('SELECT url FROM articles').fetchall()
        return {row[0] for row in rows}


def insert_articles(articles: list[dict], run_id: str | None = None) -> None:
    if not articles:
        return
    if run_id is None:
        run_id = datetime.now().isoformat()
    with sqlite3.connect(DB_PATH) as conn:
        for article in articles:
            conn.execute(
                '''INSERT OR IGNORE INTO articles
                   (url, headline, source, paywall_status, score, relevance_score, category, topic, summary, run_id, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (
                    article.get('url'),
                    article.get('headline'),
                    article.get('source'),
                    article.get('paywall_status', 0),
                    article.get('score'),
                    article.get('relevance_score'),
                    article.get('category'),
                    article.get('topic'),
                    article.get('summary'),
                    run_id,
                    article.get('status', 'pending')
                )
            )


def mark_articles_seen(urls: list[str]) -> None:
    """Adds URLs to seen_urls so they're excluded from future scrapes."""
    if not urls:
        return
    with sqlite3.connect(DB_PATH) as conn:
        conn.executemany(
            'INSERT OR IGNORE INTO seen_urls (url) VALUES (?)',
            [(url,) for url in urls]
        )

def delete_articles_by_run(run_id: str) -> int:
    """Remove every article a single pipeline run inserted. Used by search reset."""
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.execute('DELETE FROM articles WHERE run_id = ?', (run_id,))
        return cur.rowcount


def clear_previous_articles() -> list[dict]:
    """Snapshot-and-clear for the new search 'state'. Selects every row with
    status IN ('pending', 'denied') — everything on the dashboard except
    Accepted — into a snapshot of {'id', 'status', 'accepted'} dicts, then
    flips those rows to status='cleared', accepted=0 (rejected-by-default).
    Returns the snapshot so run_pipeline can stash it in last_run_undo for
    reset to restore. Returns [] when there is nothing to clear."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            '''SELECT id, status, accepted FROM articles
               WHERE status IN ('pending', 'denied')'''
        ).fetchall()
        snapshot = [dict(row) for row in rows]
        conn.execute(
            '''UPDATE articles SET status = 'cleared', accepted = 0
               WHERE status IN ('pending', 'denied')'''
        )
        return snapshot


def restore_article_states(snapshot: list[dict]) -> int:
    """Reset undo: restore each snapshotted row's previous 'status' and
    'accepted' values. accepted may be None (pending rows) and is written back
    as NULL. Rows deleted since the snapshot simply match nothing. No-op on
    empty/None input. Returns the number of snapshot entries processed."""
    if not snapshot:
        return 0
    with sqlite3.connect(DB_PATH) as conn:
        conn.executemany(
            'UPDATE articles SET status = ?, accepted = ? WHERE id = ?',
            [(row['status'], row['accepted'], row['id']) for row in snapshot]
        )
    return len(snapshot)


def remove_seen_urls(urls: list[str]) -> None:
    """Un-mark URLs so a reset re-scrape picks them up again."""
    if not urls:
        return
    with sqlite3.connect(DB_PATH) as conn:
        conn.executemany('DELETE FROM seen_urls WHERE url = ?', [(url,) for url in urls])


def remove_seen_emails(message_ids: list[str]) -> None:
    """Un-mark Gmail messages so a reset re-scrape re-ingests them."""
    if not message_ids:
        return
    with sqlite3.connect(DB_PATH) as conn:
        conn.executemany('DELETE FROM seen_emails WHERE message_id = ?', [(m,) for m in message_ids])


def mark_messages_seen(message_id: str) -> None:
    if not message_id:
        return
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('INSERT OR IGNORE INTO seen_emails (message_id) VALUES (?)', (message_id,))

def get_pending_articles() -> list[dict]:
    """All rows with status='pending' and paywall_status=0, ordered by score DESC."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            '''SELECT * FROM articles
               WHERE status = ? AND paywall_status = ?
               ORDER BY score DESC''',
            ('pending', 0)
        ).fetchall()
        return [dict(row) for row in rows]


def get_pending_manual_articles() -> list[dict]:
    """All rows with status='pending' and paywall_status=1. No score ordering."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            '''SELECT * FROM articles
               WHERE status = ? AND paywall_status = ?''',
            ('pending', 1)
        ).fetchall()
        return [dict(row) for row in rows]


def get_extra_articles() -> list[dict]:
    """Irrelevant ('extra') articles from the most recent run only, by score DESC."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            '''SELECT * FROM articles
               WHERE status = 'extra'
                 AND run_id = (SELECT MAX(run_id) FROM articles)
               ORDER BY relevance_score DESC''').fetchall()
        return [dict(row) for row in rows]


def update_article_status(article_id: int, status: str) -> None:
    """status is one of: 'pending', 'confirmed', 'denied'."""
    if status not in VALID_STATUSES:
        raise ValueError(f'Invalid article status: {status}')

    accepted = {'confirmed': 1, 'denied': 0, 'pending': None}[status]

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            'UPDATE articles SET status = ?, accepted = ? WHERE id = ?',
            (status, accepted, article_id)
        )
        if status != 'confirmed':
            conn.execute(
                'UPDATE articles SET top_news_state = ? WHERE id = ?',
                ('neutral', article_id)
            )

def get_confirmed_articles() -> list[dict]:
    """All rows with status='confirmed'. For pre-rendering the Accepted panel."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            'SELECT * FROM articles WHERE status = ? ORDER BY score DESC',
            ('confirmed',)
        ).fetchall()
        return [dict(row) for row in rows]


def get_denied_articles() -> list[dict]:
    """All rows with status='denied'. For pre-rendering the Rejected panel."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            'SELECT * FROM articles WHERE status = ? ORDER BY score DESC',
            ('denied',)
        ).fetchall()
        return [dict(row) for row in rows]


def mark_reviewed_as_sent() -> int:
    """Flips all confirmed and denied rows to 'sent'. Returns row count affected."""
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.execute(
            "UPDATE articles SET status = 'sent' WHERE status IN ('confirmed', 'denied')"
        )
        return cur.rowcount
    
def migrate_articles(conn) -> None:
    """Idempotent in-place migration: add `topic` if missing, drop legacy `topics`."""
    cols = {row[1] for row in conn.execute('PRAGMA table_info(articles)').fetchall()}
    if 'topic' not in cols:
        conn.execute('ALTER TABLE articles ADD COLUMN topic TEXT')
    if 'relevance_score' not in cols:
        conn.execute('ALTER TABLE articles ADD COLUMN relevance_score REAL')
    if 'top_news_state' not in cols:
        conn.execute("ALTER TABLE articles ADD COLUMN top_news_state TEXT DEFAULT 'neutral'")
    if 'topics' in cols:
        try:
            conn.execute('ALTER TABLE articles DROP COLUMN topics')
        except sqlite3.OperationalError:
            # SQLite < 3.35 has no DROP COLUMN
            pass
    if 'accepted' not in cols:
        conn.execute('ALTER TABLE articles ADD COLUMN accepted INTEGER')
        conn.execute("UPDATE articles SET accepted = 1 WHERE status = 'confirmed'")
        conn.execute("UPDATE articles SET accepted = 0 WHERE status = 'denied'")
    return


def seed_default_topics() -> None:
    """Seed the 3 presets exactly once, gated by a settings flag (not an empty table)."""
    if get_setting('topics_seeded') == 'true':
        return
    with sqlite3.connect(DB_PATH) as conn:
        for name, description in DEFAULT_TOPICS:
            conn.execute('INSERT OR IGNORE INTO topics (name, description) VALUES (?, ?)',
                         (name, description))
        
    set_setting('topics_seeded', 'true')


def get_topics() -> list[dict]:
    """Return all topics as dicts (id, name, description) in creation order (id ASC)"""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute('SELECT id, name, description FROM topics ORDER BY id').fetchall()
        return [dict(row) for row in rows]


def create_topic(name: str, description: str) -> int:
    """Insert a topic, return its id. Raise ValueError on empty fields, reserved 'Other',
    or duplicate name."""
    name = (name or '').strip()
    description = (description or '').strip()
    if not name or not description:
        raise ValueError('Topic name and description are required')
    if name.lower() in RESERVED_TOPIC_NAMES:
        raise ValueError('This name is reserved')
    with sqlite3.connect(DB_PATH) as conn:
        try:
            cur = conn.execute(
                'INSERT INTO topics (name, description) VALUES (?, ?)',
                (name, description)
            )
            if cur.lastrowid is not None:
                return cur.lastrowid
            else:
                raise ValueError(f'Topic could not be created. Try again')
        except sqlite3.IntegrityError:
            raise ValueError(f'A topic named "{name}" already exists.')
        


def delete_topic(topic_id: int) -> int:
    """Delete a topic by id; return rowcount. Empty-bucket rule enforced by caller."""
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.execute('DELETE FROM topics WHERE id = ?', (topic_id, ))
        return cur.rowcount


def count_pending_in_topic(name: str) -> int:
    """Pending, non-paywalled cards in a topic's bucket. Deletion allowed only when 0."""
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            '''SELECT COUNT(*) FROM articles
                WHERE status = 'pending' AND paywall_status = 0 AND topic = ?''',
                (name, )).fetchone()
        return row[0]

def set_top_news_state(article_id, state):
    if state not in PRIORITIES:
        raise ValueError(f'Invalid top_news_state: {state}')
    
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            'UPDATE articles SET top_news_state = ? WHERE id = ?',
            (state, article_id)
        )

def get_recent_run_ids(limit: int = 3) -> list[str]:
    """The most recent `limit` distinct run_ids (newest first). Each run_id is the
    ISO timestamp stamped on every article a single pipeline run inserts, so this is
    the list of the last N scrapes the archive shows."""
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute(
            '''SELECT DISTINCT run_id FROM articles
               WHERE run_id IS NOT NULL
               ORDER BY run_id DESC
               LIMIT ?''',
            (limit,)
        ).fetchall()
        return [row[0] for row in rows]


def get_articles_for_runs(run_ids: list[str]) -> list[dict]:
    """All articles (any status, paywalled or not) for the given run_ids, ordered by
    run_id DESC then score DESC. Powers the archive, which shows every article a
    scrape pulled regardless of whether it was accepted."""
    if not run_ids:
        return []
    placeholders = ','.join('?' for _ in run_ids)
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            f'''SELECT * FROM articles
                WHERE run_id IN ({placeholders})
                  AND status != 'extra'
                ORDER BY run_id DESC, score DESC''',
            run_ids
        ).fetchall()
        return [dict(row) for row in rows]