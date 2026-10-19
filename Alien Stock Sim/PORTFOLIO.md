# Portfolio demo

This configuration uses the original Django templates, trading code, and WebSocket
price engine. It runs in one process with SQLite and in-memory channels. It does
not require MySQL, Redis, Google OAuth, or an AI SDK/key. Each new browser session
gets its own guest account and starting balance. The news area stays blank.

## Local startup

From the portfolio root, install once:

```powershell
python -m venv ".\Alien Stock Sim\.portfolio-venv"
& ".\Alien Stock Sim\.portfolio-venv\Scripts\python.exe" -m pip install -r ".\Alien Stock Sim\requirements-portfolio.txt"
```

Start the demo:

```powershell
& ".\Alien Stock Sim\.portfolio-venv\Scripts\python.exe" ".\Alien Stock Sim\run_portfolio.py"
```

Open http://127.0.0.1:8000/home, or use the link on the portfolio Projects page.
Stop with Ctrl+C. The launcher initializes the separate `portfolio.sqlite3` database.
It never connects to the original MySQL database. The `.portfolio-secret` file keeps
local sessions valid between restarts; both runtime files are ignored by Git.

Prices update every ten seconds. With no Alpha Vantage key, the existing simulator
uses its random price fluctuations and trading effects. Set `ALPHA_VANTAGE_API_KEY`
to add the existing real-market percentage-change influence. Chart.js loads from
the existing CDN. AI generation is disabled independently of the market-data API.

## Hosting as a small demo

Use a Python web service supporting WebSockets, for example Render:

- Root directory: `Alien Stock Sim`
- Build command: `pip install -r requirements-portfolio.txt`
- Start command: `python host_portfolio.py`
- Set `DJANGO_SECRET_KEY` to a private persistent random value.
- Set `DEMO_DEBUG=0`.
- Set `DEMO_ALLOWED_HOSTS` to the service hostname, without the scheme.
- Set `DEMO_CSRF_ORIGINS` to its full HTTPS origin.
- For persistent balances, mount a persistent disk and set `DEMO_DATA_DIR` to its path.

Run a single service instance/process: this profile deliberately uses an in-memory
channel layer and one price engine. Scaling to multiple processes requires shared
channels and a separately coordinated price worker. Anonymous demo accounts are
for showcasing the app, and will accumulate in this demo database.

Render supports Daphne/WebSockets. Its default filesystem is ephemeral, and a paid
persistent disk is needed to retain SQLite changes across service replacement:
[WebSockets](https://render.com/docs/websocket),
[persistent disks](https://render.com/docs/disks).

These files prepare a hosting path; no public deployment has been created. After
deploying, replace the local demo URL in the portfolio with the hosted HTTPS URL.
The original `webapps.settings` / `webapps.asgi` entry points remain available for
the project's full infrastructure configuration.
