"""Single-process portfolio demo: SQLite, in-memory channels, and no AI calls."""
import os
import secrets

os.environ.setdefault("DJANGO_SECRET_KEY", secrets.token_urlsafe(48))
from .settings import *

PORTFOLIO_DEMO = True
AI_HEADLINES_ENABLED = False
DEBUG = os.getenv("DEMO_DEBUG", "1") == "1"
ALLOWED_HOSTS = os.getenv("DEMO_ALLOWED_HOSTS", "localhost,127.0.0.1,testserver").split(",")
CSRF_TRUSTED_ORIGINS = [s for s in os.getenv("DEMO_CSRF_ORIGINS", "").split(",") if s]
DEMO_DATA_DIR = Path(os.getenv("DEMO_DATA_DIR", str(BASE_DIR)))
DEMO_DATA_DIR.mkdir(parents=True, exist_ok=True)
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": DEMO_DATA_DIR / "portfolio.sqlite3", "OPTIONS": {"timeout": 20}}}
CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
ASGI_APPLICATION = "webapps.portfolio_asgi.application"
ACCOUNT_DEFAULT_HTTP_PROTOCOL = "http"
ALPHA_VANTAGE_API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY", "")
MIDDLEWARE = [*MIDDLEWARE, "alienstocksim.portfolio_middleware.DemoGuestMiddleware"]
# The source snapshot contains no application migrations. Sync only this demo's
# application tables; Django/allauth retain their normal migrations.
MIGRATION_MODULES = {"alienstocksim": None}

