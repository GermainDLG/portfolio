"""Serve only portfolio preview assets on localhost; no project source is modified."""
import argparse
import sys
sys.dont_write_bytecode = True
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
from prepare import prepare

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
BEYONDMAPS = HERE / "beyondmaps"
MOUNTS = {
    "/resumes/": (HERE / "resumes", {".pdf"}),
    "/media/": (HERE / "media", {".png", ".jpg", ".webp", ".svg"}),
    "/orbital-forecasting/": (HERE / "orbital-forecasting", {".html"}),
    "/beyondmaps/": (BEYONDMAPS, {".html", ".css", ".js", ".json", ".svg", ".png", ".jpg", ".webp"}),
    # The existing BeyondMaps build uses root-relative asset/data URLs.
    "/assets/": (BEYONDMAPS / "assets", {".css", ".js", ".png", ".jpg", ".svg", ".webp"}),
    "/data/": (BEYONDMAPS / "data", {".json"}),
    "/data-harmony/": (ROOT / "QuicksilverLabs-Copy/data-harmony-ui", {".html", ".css", ".js"}),
    "/documents/": (HERE / "documents", {".pdf", ".mp4"}),
}
EXACT = {
    "/": HERE / "index.html",
    "/index.html": HERE / "index.html",
    "/portfolio.css": HERE / "portfolio.css",
    "/portfolio.js": HERE / "portfolio.js",
    "/portrait.jpg": HERE / "portrait.jpg",
    "/portfolio_image.jpg": HERE / "portfolio_image.jpg",
    "/resume.pdf": HERE / "resume.pdf",
    "/newsletter-preview/index.html": HERE / "newsletter-preview/index.html",
    "/newsletter-preview/": ROOT / "QuicksilverLabs-Copy/newsletter-filter/digest_dryrun.html",
    "/favicon.svg": BEYONDMAPS / "favicon.svg",
    "/icons.svg": BEYONDMAPS / "icons.svg",
}


class PreviewHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        request_path = unquote(urlsplit(path).path)
        exact = EXACT.get(request_path)
        if exact:
            return str(exact)
        for prefix, (directory, extensions) in MOUNTS.items():
            if request_path.startswith(prefix):
                relative = request_path[len(prefix):]
                if not relative or relative.endswith("/"):
                    relative += "index.html"
                base = directory.resolve()
                candidate = (base / relative).resolve()
                if candidate.is_relative_to(base) and candidate.suffix.lower() in extensions:
                    return str(candidate)
        return str(HERE / "__not_served__")

    def list_directory(self, path):
        self.send_error(404)
        return None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    prepare()
    if not (BEYONDMAPS / "index.html").is_file():
        print("Note: BeyondMaps's production build is missing; its preview will be unavailable.")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), PreviewHandler)
    print(f"Portfolio preview: http://localhost:{args.port}", flush=True)
    print("Press Ctrl+C to stop.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
