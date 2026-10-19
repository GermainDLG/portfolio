"""Create an isolated anonymous demo account for each browser session."""
import uuid
from django.contrib.auth import login
from django.contrib.auth.models import User
from django.conf import settings
from alienstocksim.models import Profile


class DemoGuestMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if settings.PORTFOLIO_DEMO and not request.user.is_authenticated and not request.path.startswith(("/static/", "/admin/", "/accounts/")):
            user = User.objects.create_user(username=f"guest_{uuid.uuid4().hex[:12]}")
            Profile.objects.create(user=user)
            login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        return self.get_response(request)

