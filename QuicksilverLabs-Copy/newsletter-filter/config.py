from dotenv import load_dotenv
import os

load_dotenv()

def _ssm(name: str, fallback: str) -> str:
    import boto3
    client = boto3.client('ssm', region_name='us-east-1')
    try:
        resp = client.get_parameter(Name=f'/digest/{name}', WithDecryption=True)
        return resp['Parameter']['Value']
    except Exception:
        return fallback

def _get(name: str, default: str = '') -> str:
    if os.getenv('ON_SERVER'):
        return _ssm(name, os.getenv(name, default))
    return os.getenv(name, default)

ALLOWED_DOMAINS: list[str] = [d.strip().lower() for d in _get("ALLOWED_DOMAINS").split(",") if d.strip()]
BLOCKED_DOMAINS: list[str] = [u.strip() for u in _get("BLOCKED_DOMAINS").split(",") if u.strip()]
SOURCE_URLS: list[str] = [u.strip() for u in _get("SOURCE_URLS").split(",") if u.strip()]
RECIPIENTS: list[str] = [r.strip() for r in _get("RECIPIENTS").split(',') if r.strip()]
KEYWORDS: list[str] = [k.strip() for k in _get("KEYWORDS").split(",") if k.strip()]
ANTHROPIC_API_KEY: str = _get("ANTHROPIC_API_KEY")
# Optional egress proxy for newsletter click-tracker requests (beehiiv etc. block
# datacenter IPs). Format: http://user:pass@host:port  — leave empty for direct.
PROXY_URL: str = _get("PROXY_URL", "")
GMAIL_TOKEN_PATH: str = _get("GMAIL_TOKEN_PATH")
GMAIL_ADDRESS: str = _get("GMAIL_ADDRESS")
DB_PATH: str = _get("DB_PATH", "digest.db")
PUBLIC_BASE_URL: str = _get("PUBLIC_BASE_URL", "http://127.0.0.1:5000")
SECRET_KEY: str = _get("SECRET_KEY", "dev-secret-change-me")
COGNITO_DOMAIN: str = _get("COGNITO_DOMAIN", "")          # e.g. qsail-digest.auth.us-east-1.amazoncognito.com
COGNITO_CLIENT_ID: str = _get("COGNITO_CLIENT_ID", "")    # App client ID from the User Pool
COGNITO_CLIENT_SECRET: str = _get("COGNITO_CLIENT_SECRET", "")  # App client secret
COGNITO_USER_POOL_ID: str = _get("COGNITO_USER_POOL_ID", "")    # e.g. us-east-1_XXXXXXXXX
DISABLE_AUTH: bool = _get("DISABLE_AUTH", "0") == "1"