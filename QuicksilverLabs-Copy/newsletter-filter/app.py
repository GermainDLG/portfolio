from flask import Flask, render_template, request, jsonify, redirect, url_for, session, send_file
from werkzeug.middleware.proxy_fix import ProxyFix
from htmldocx import HtmlToDocx
from authlib.integrations.flask_client import OAuth
from functools import wraps
import os
import io
from database import (
    get_pending_articles,
    get_pending_manual_articles,
    get_extra_articles,
    init_db,
    update_article_status,
    get_confirmed_articles,
    get_denied_articles,
    mark_reviewed_as_sent,
    get_topics,
    create_topic,
    delete_topic,
    count_pending_in_topic,
    set_top_news_state,
    VALID_STATUSES,
    PRIORITIES,
    get_recent_run_ids,
    get_articles_for_runs)
from run_digest import run_pipeline, reset_last_run, reset_available
import logging
from datetime import datetime
from pipeline.dispatcher import render_digest, build_buckets
from config import (
    SECRET_KEY, 
    DB_PATH, 
    COGNITO_DOMAIN, 
    COGNITO_CLIENT_ID, 
    COGNITO_CLIENT_SECRET, 
    COGNITO_USER_POOL_ID, 
    PUBLIC_BASE_URL,
    DISABLE_AUTH)



app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)
app.secret_key = SECRET_KEY
init_db()


oauth = OAuth(app)
cognito = oauth.register(
    name='cognito',
    client_id=COGNITO_CLIENT_ID,
    client_secret=COGNITO_CLIENT_SECRET,
    server_metadata_url=(
        f'https://cognito-idp.us-east-1.amazonaws.com'
        f'/{COGNITO_USER_POOL_ID}/.well-known/openid-configuration'
    ),
    client_kwargs={'scope': 'openid email profile'},
)

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user' not in session:
            if DISABLE_AUTH:
                session['user'] = {}
                return f(*args, **kwargs)
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated


def _backup_to_s3() -> None:
    if not os.getenv('ON_SERVER'):
        return
    import boto3
    key = f"digest-{datetime.utcnow().strftime('%Y-%m-%dT%H-%M-%S')}.db"
    boto3.client('s3', region_name='us-east-1').upload_file(
        DB_PATH, 'quicksilverlabs-digest-backups', key
    )
    logging.info(f'DB backed up to s3://quicksilverlabs-digest-backups/{key}')


def build_archive_runs(run_ids: list[str], articles: list[dict], topics: list[dict]) -> list[dict]:
    """Assemble the `runs` structure the archive template iterates. For each run_id
    (kept in the given newest-first order), select that run's articles, parse the
    run_id ISO timestamp into a display `date`, tally `article_count` (all of them)
    and `accepted_count` (those with accepted == 1), and group the run's articles
    into topic buckets via build_buckets(run_articles, topics, always_show_other=False)
    so the groups match the dashboard (empty topic buckets and an empty 'Other' are
    omitted). Returns one dict per run: {id, date, article_count, accepted_count,
    categories}, where `categories` is the bucket list ({'name', 'articles'}) the
    template renders under each run."""
    result = []
    for run_id in run_ids:
        date = datetime.fromisoformat(run_id).strftime('%m/%d/%Y, %H:%M:%S')
        curr_articles = []
        accepted_count = 0
        for article in articles:
            if article['run_id'] == run_id:
                curr_articles.append(article)
                if article['accepted']:
                    accepted_count += 1

        article_count = len(curr_articles)
        categories = build_buckets(curr_articles, topics, always_show_other=False)

        item = {
            'id': run_id,
            'date': date,
            'article_count': article_count,
            'accepted_count': accepted_count,
            'categories': categories
        }
        result.append(item)
    return result

def count_sources(*article_lists: list[dict]) -> list[dict]:
    """Tally articles per source across one or more article lists (each item dict
    carries a 'source' key, since the dashboard getters SELECT *). Returns a list of
    {'source': str, 'count': int} dicts sorted by count descending. Powers the
    right-hand Sources tracker box. Counts every article passed in, so feeding it the
    pending + manual + confirmed + denied lists yields an 'all on the page' tally."""
    result = []
    accounted = False
    for article_list in article_lists:
        for article in article_list:
            curr_source = article.get('source')
            accounted = False
            for preexisting in result:
                if curr_source == preexisting['source']:
                    preexisting['count'] += 1
                    accounted = True
            if not accounted:
                item = dict()
                item['source'] = curr_source
                item['count'] = 1
                result.append(item)
    result.sort(key=lambda item: item['count'], reverse=True)
    return result
            
            




@app.route('/topics', methods=['POST'])
@login_required
def create_topic_route():
    """Body: {'name': str, 'description': str}. Calls database.create_topic(); on its
    ValueError (empty fields, reserved 'Other', or duplicate name) returns
    {ok: False, error: <message>} with 400. On success returns {ok: True, id, name}
    (the new chip's id + name; description is intentionally NOT returned)."""

    data = request.get_json(silent=True) or {}
    name = data.get('name') or ''
    description = data.get('description') or ''
    try:
        id = create_topic(name, description)
        return {
            'ok': True,
            'id': id,
            'name': name.strip()
        }
        
    except Exception as e:
        return jsonify({
            'ok': False,
            'error': f'{e}'
        }), 400


@app.route('/topics/<int:topic_id>', methods=['DELETE'])
@login_required
def delete_topic_route(topic_id):
    """Delete a topic, enforcing the empty-bucket rule. Resolve the topic's name from
    get_topics() (404 if the id doesn't exist). If count_pending_in_topic(name) > 0,
    refuse with {ok: False, error: 'The bucket must be empty to delete the chip and
    topic.'} and 400 (the JS shows this in a small popup). Otherwise call
    delete_topic(topic_id) and return {ok: True}."""

    topics = get_topics()
    for topic in topics:
        if topic['id'] == topic_id:
            topic_name = topic['name']
            if count_pending_in_topic(topic_name) > 0:
                return jsonify({
                    'ok': False,
                    'error': 'The bucket must be empty to delete the chip and topic'
                }), 400
            else:
                delete_topic(topic_id)
                return {'ok': True}
    
    return jsonify({'ok': False, 'error': 'No topic with that id'}), 404


@app.route('/')
def archive():
    """Renders archive.html with the last 3 runs, each grouped into topic buckets"""
    recent_run_ids = get_recent_run_ids()
    recent_articles = get_articles_for_runs(recent_run_ids)
    topics = get_topics()
    return render_template('archive.html', runs=build_archive_runs(recent_run_ids, recent_articles, topics))


@app.route('/dashboard')
@login_required
def dashboard():
    """Renders dashboard.html with pending articles split into main + manual lists."""
    topics = get_topics()
    pending = get_pending_articles()
    manual = get_pending_manual_articles()
    confirmed = get_confirmed_articles()
    denied = get_denied_articles()
    extra = get_extra_articles()
    buckets = build_buckets(pending, topics)
    return render_template(
        'dashboard.html',
        buckets=buckets,
        topics=topics,
        manual_articles=manual,
        confirmed_articles=confirmed,
        denied_articles=denied,
        extra_articles=extra,
        source_counts=count_sources(pending, manual, confirmed, denied, extra),
        reset_available=reset_available()
    )


@app.route('/download', methods=['POST'])
@login_required
def download():
    confirmed = get_confirmed_articles()
    if not confirmed:
        return jsonify(ok=False, error='No confirmed articles to download'), 400
    
    data = request.get_json(silent=True) or {}
    html_body = data.get('html')
    try:
        parsed_doc = HtmlToDocx().parse_html_string(html_body)
        buffer = io.BytesIO()
        parsed_doc.save(buffer)
        buffer.seek(0)
    except Exception as e:
        return jsonify(ok=False, error=str(e)), 500
    count = mark_reviewed_as_sent()
    try:
        _backup_to_s3()
    except Exception as e:
        logging.warning(f'S3 backup failed (non-fatal): {e}')
    date = datetime.now().strftime('%m-%d-%Y')
    return send_file(
        path_or_file=buffer,
        as_attachment=True,
        download_name=f'QSAIL-newsletter-{date}.docx',
        mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )


@app.route('/send/preview')
@login_required
def send_preview():
    """GET-only page shown when 'Send Newsletter' is clicked, before the real send.
    Guard: if get_confirmed_articles() is empty, redirect to dashboard (mirror /send's
    'nothing to send' check) instead of showing an empty editor. Otherwise call
    render_digest() to get the current digest HTML (same function /send's default path
    uses) and render 'send_preview.html' with that HTML (e.g. as `html_body`) so the
    template can embed it in an editable iframe. Does not touch the database or mark
    anything as sent — purely a preview/edit screen; the real send still happens via
    POST /send from the preview page's Send button."""

    confirmed = get_confirmed_articles()
    if not confirmed:
        return redirect(url_for('dashboard'))
    
    try:
        html_body, count = render_digest()
        return render_template(
        'send_preview.html',
        html_body=html_body
        )
    except Exception as e:
        logging.exception(f'Preview failed: {e}')
        return redirect(url_for('dashboard'))


@app.route('/run', methods=['POST'])
@login_required
def run():
    """Calls run_digest() synchronously. Returns JSON {ok, counts}."""
    try:
        counts = run_pipeline()
        return jsonify(ok=True, counts=counts)
    except Exception as e:
        logging.exception(f'Pipeline run failed with error: {e}')
        return jsonify(ok=False, error=str(e)), 500


@app.route('/reset', methods=['POST'])
@login_required
def reset():
    """Pure undo of the most recent run (within 2 hours): deletes its articles and
    un-marks them as seen so the next search can find them again. No re-scrape."""
    try:
        counts = reset_last_run()
        return jsonify(ok=True, counts=counts)
    except ValueError as e:
        return jsonify(ok=False, error=str(e)), 400
    except Exception as e:
        logging.exception(f'Reset failed: {e}')
        return jsonify(ok=False, error=str(e)), 500


@app.route('/articles/<int:article_id>/status', methods=['POST'])
@login_required
def update_status(article_id):
    """Body: {'status': 'confirmed'|'denied'|'pending'}. Updates DB. Returns {ok}."""
    data = request.get_json(silent=True) or {}
    status = data.get('status')
    if status not in VALID_STATUSES:
        return jsonify(ok=False, error='invalid status'), 400
    update_article_status(article_id, status)
    return jsonify(ok=True)


@app.route('/articles/<int:article_id>/top-news', methods=['POST'])
@login_required
def update_top_news_state(article_id):
    data = request.get_json(silent=True) or {}
    top_news_state = data.get('top_news_state')
    if top_news_state not in PRIORITIES:
        return jsonify(ok=False, error='invalid news state'), 400
    set_top_news_state(article_id, top_news_state)
    return jsonify(ok=True)


@app.route('/login')
def login():
    redirect_uri = url_for('callback', _external=True)
    return cognito.authorize_redirect(redirect_uri)


@app.route('/callback')
def callback():
    token = cognito.authorize_access_token()
    session['user'] = token.get('userinfo')
    return redirect(url_for('dashboard'))


@app.route('/logout')
def logout():
    session.clear()
    logout_url = (
        f'https://{COGNITO_DOMAIN}/logout'
        f'?client_id={COGNITO_CLIENT_ID}'
        f'&logout_uri={PUBLIC_BASE_URL}/'
    )
    return redirect(logout_url)

if __name__ == '__main__':
    app.run(debug=True, port=5000)



# --------------- RETIRED EMAIL SEND ----------------------
# @app.route('/send', methods=['POST'])
# @login_required
# def send():
#     confirmed = get_confirmed_articles()
#     if not confirmed:
#         return jsonify(ok=False, error='No confirmed articles to send'), 400
    
#     data = request.get_json(silent=True) or {}
#     html_body = data.get('html')
#     try:
#         recipients = [r['email'] for r in get_recipients()] or RECIPIENTS
#         result = send_digest(recipients, html_body=html_body)
#     except Exception as e:
#         logging.exception(f'Digest send failed: {e}')
#         return jsonify(ok=False, error=str(e)), 500
#     count = mark_reviewed_as_sent()
#     try:
#         _backup_to_s3()
#     except Exception as e:
#         logging.warning(f'S3 backup failed (non-fatal): {e}')
#     return jsonify(ok=True, sent=result, archived=count)