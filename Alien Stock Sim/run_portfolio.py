"""Launch the portfolio demo after installing requirements-portfolio.txt once."""
import os
from pathlib import Path
import secrets
import sys

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "webapps.portfolio_settings")
if not os.environ.get("DJANGO_SECRET_KEY"):
    secret_file = ROOT / ".portfolio-secret"
    if not secret_file.exists():
        secret_file.write_text(secrets.token_urlsafe(48), encoding="utf-8")
    os.environ["DJANGO_SECRET_KEY"] = secret_file.read_text(encoding="utf-8").strip()

if __name__ == "__main__":
    from django.core.management import execute_from_command_line
    execute_from_command_line(["manage.py", "migrate", "--run-syncdb", "--noinput"])
    execute_from_command_line(["manage.py", "runserver", "--noreload", "127.0.0.1:8000"])
