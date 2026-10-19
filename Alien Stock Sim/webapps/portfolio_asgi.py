"""ASGI entry point without the original Redis-dependent startup worker."""
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "webapps.portfolio_settings")
from django.core.asgi import get_asgi_application
from django.contrib.staticfiles.handlers import ASGIStaticFilesHandler

http_application = ASGIStaticFilesHandler(get_asgi_application())
from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from alienstocksim.routing import websocket_urlpatterns

application = ProtocolTypeRouter({
    "http": http_application,
    "websocket": AuthMiddlewareStack(URLRouter(websocket_urlpatterns)),
})

