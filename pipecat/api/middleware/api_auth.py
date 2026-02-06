"""API key authentication middleware.

Port of middleware/api-auth.js — DONNA_API_KEY with constant-time comparison.
If DONNA_API_KEY is not set, auth is disabled (development mode).
"""

from __future__ import annotations

import hmac
import os

from fastapi import HTTPException, Request

# Route prefixes that use JWT auth instead of API key
EXEMPT_PREFIXES = ("/admin/", "/observability/")


async def require_api_key(request: Request) -> None:
    """FastAPI dependency for API key authentication.

    Usage: Depends(require_api_key)
    """
    expected = os.getenv("DONNA_API_KEY")

    # Dev mode — no API key configured
    if not expected:
        return

    # Skip for routes that handle their own auth
    if any(request.url.path.startswith(prefix) for prefix in EXEMPT_PREFIXES):
        return

    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization required")

    provided = auth_header[7:]

    # Constant-time comparison
    if not hmac.compare_digest(provided.encode(), expected.encode()):
        raise HTTPException(status_code=403, detail="Invalid API key")
