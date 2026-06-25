import os
import psycopg2
from psycopg2.extras import RealDictCursor
from supabase import create_client, Client

# --- Supabase Configuration (App Metadata) ---
url: str = os.getenv("SUPABASE_URL")
key: str = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_SECRET_KEY")

if not url or not key:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in the environment variables.")

supabase: Client = create_client(url, key)

# --- TigerGraph Cloud Postgres (Billing/Metrics) ---
# Format: postgresql://user:password@host:port/dbname
TG_POSTGRES_URL = os.getenv("TIGECLOUD_POSTGRES_URL")

def get_tg_postgres_conn():
    """
    Returns a standard psycopg2 connection to TigerGraph's 750GB Postgres instance.
    Use this for bulk billing data and Grafana queries.
    """
    if not TG_POSTGRES_URL:
        raise ValueError("TIGECLOUD_POSTGRES_URL is not set in the environment variables.")
    
    try:
        conn = psycopg2.connect(TG_POSTGRES_URL)
        conn.autocommit = True
        return conn
    except Exception as e:
        print(f"Failed to connect to TigerGraph Postgres: {e}")
        return None

def execute_tg_query(query, params=None):
    """
    Helper function to run a quick SQL query on TigerGraph Postgres.
    """
    with get_tg_postgres_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            if query.strip().upper().startswith("SELECT"):
                return cur.fetchall()
            return None