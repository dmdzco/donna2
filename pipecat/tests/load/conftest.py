"""Shared config for load tests.

Usage:
    cd pipecat
    uv run locust -f tests/load/locustfile_db.py --host=postgresql://...
    uv run locust -f tests/load/locustfile_ws.py --host=wss://donna-pipecat-staging.up.railway.app
"""

import os

# Staging targets (override via env vars)
STAGING_WS_URL = os.getenv(
    "LOAD_TEST_WS_URL", "wss://donna-pipecat-staging.up.railway.app/ws"
)
STAGING_HTTP_URL = os.getenv(
    "LOAD_TEST_HTTP_URL", "https://donna-pipecat-staging.up.railway.app"
)
STAGING_DB_URL = os.getenv("LOAD_TEST_DB_URL", os.getenv("DATABASE_URL", ""))

# Defaults
DEFAULT_CALL_DURATION_S = 30  # seconds per simulated call
DEFAULT_RAMP_RATE = 10  # users per second during ramp
