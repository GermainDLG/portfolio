"""Verify all local portfolio links and demo resources over HTTP."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit
from urllib.request import build_opener, ProxyHandler
import sys
static_server = None
if '--static' in sys.argv:
    from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
    from functools import partial
    from threading import Thread
    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self, *args): pass
    static_server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(Path(__file__).resolve().parent.parent)))
    Thread(target=static_server.serve_forever, daemon=True).start()
    BASE = f'http://127.0.0.1:{static_server.server_port}/local-preview/'
else:
    BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8084/' 
opener = build_opener(ProxyHandler({}))
class Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.links=[]
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        key='href' if tag in ('a','link') else 'src' if tag in ('script','img') else None
        if key and attrs.get(key): self.links.append(attrs[key])
queue=[urljoin(BASE,'index.html'),urljoin(BASE,'orbital-forecasting/index.html')]
seen=set()
while queue:
    url=queue.pop()
    url=url.split('#')[0]
    if url in seen: continue
    seen.add(url)
    with opener.open(url, timeout=10) as response:
        assert response.status==200,(url,response.status)
        data=response.read()
        if 'text/html' in response.headers.get('Content-Type',''):
            parser=Links();parser.feed(data.decode('utf-8'))
            for link in parser.links:
                child=urljoin(url,link).split('#')[0]
                if urlsplit(child).netloc==urlsplit(BASE).netloc and child not in seen:
                    queue.append(child)
with opener.open(urljoin(BASE,'beyondmaps/data/bodies.json'),timeout=10) as r:
    import json
    assert len(json.load(r)) > 0
print(f'PASS: {len(seen)} local pages, project links, stylesheets, scripts, images, and PDFs returned HTTP 200; BeyondMaps planet dataset loads.')

if static_server:
    static_server.shutdown()
    static_server.server_close()
