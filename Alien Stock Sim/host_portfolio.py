"""Single-process ASGI launcher for a small hosted portfolio demo."""
import os
from run_portfolio import ROOT
from django.core.management import execute_from_command_line

if __name__ == "__main__":
    execute_from_command_line(["manage.py", "migrate", "--run-syncdb", "--noinput"])
    from daphne.cli import CommandLineInterface
    CommandLineInterface().run(["-b", "0.0.0.0", "-p", os.getenv("PORT", "8000"), "webapps.portfolio_asgi:application"])
