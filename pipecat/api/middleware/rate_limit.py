"""Rate limiting middleware.

Port of middleware/rate-limit.js — 5 rate limiters using slowapi.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

# Rate limit strings for use with @limiter.limit() decorator
API_LIMIT = "100/minute"        # All /api/* routes
CALL_LIMIT = "5/minute"         # Call initiation endpoints
WRITE_LIMIT = "30/minute"       # POST/PUT/DELETE operations
AUTH_LIMIT = "10/minute"        # Login/auth endpoints
WEBHOOK_LIMIT = "500/minute"    # Twilio webhooks
