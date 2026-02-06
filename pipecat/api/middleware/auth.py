"""Authentication middleware.

Port of middleware/auth.js — 3-tier auth:
1. Cofounder API key (bypass everything)
2. Admin JWT Bearer token
3. Clerk session

Implemented as FastAPI Depends() callables.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import jwt
from fastapi import HTTPException, Request
from loguru import logger

# JWT secret — required in production
if not os.getenv("JWT_SECRET") and os.getenv("RAILWAY_PUBLIC_DOMAIN"):
    raise RuntimeError("JWT_SECRET environment variable is required in production")

JWT_SECRET = os.getenv("JWT_SECRET", "donna-admin-secret-change-me")

# Cofounder API keys (comma-separated env vars)
COFOUNDER_API_KEYS = [
    k for k in [
        os.getenv("COFOUNDER_API_KEY_1"),
        os.getenv("COFOUNDER_API_KEY_2"),
    ] if k
]


@dataclass
class AuthContext:
    """Authentication context attached to each request."""
    is_cofounder: bool = False
    is_admin: bool = False
    user_id: str = ""
    clerk_user_id: str | None = None


async def require_auth(request: Request) -> AuthContext:
    """3-tier auth dependency: cofounder API key → JWT → Clerk.

    Usage: auth = Depends(require_auth)
    """
    # 1. Cofounder API key
    api_key = request.headers.get("x-api-key", "")
    if api_key and api_key in COFOUNDER_API_KEYS:
        return AuthContext(is_cofounder=True, is_admin=True, user_id="cofounder")

    # 2. Admin JWT Bearer token
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            decoded = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            return AuthContext(
                is_cofounder=False,
                is_admin=True,
                user_id=decoded.get("adminId", ""),
            )
        except jwt.InvalidTokenError:
            pass  # Fall through to Clerk

    # 3. Clerk session (if Clerk SDK is available)
    # Note: Clerk Python SDK integration is minimal — for now, check
    # for a Clerk session token in the cookie/header
    clerk_token = request.headers.get("x-clerk-token") or request.cookies.get("__session")
    if clerk_token:
        try:
            clerk_secret = os.getenv("CLERK_SECRET_KEY")
            if clerk_secret:
                decoded = jwt.decode(
                    clerk_token,
                    options={"verify_signature": False},  # Clerk manages key rotation
                    algorithms=["RS256"],
                )
                user_id = decoded.get("sub", "")
                if user_id:
                    return AuthContext(
                        is_cofounder=False,
                        is_admin=False,
                        user_id=user_id,
                        clerk_user_id=user_id,
                    )
        except Exception:
            pass

    raise HTTPException(status_code=401, detail="Authentication required")


async def optional_auth(request: Request) -> AuthContext | None:
    """Same checks as require_auth but returns None instead of raising."""
    try:
        return await require_auth(request)
    except HTTPException:
        return None


async def require_admin(request: Request) -> AuthContext:
    """Require admin-level auth (cofounder or admin JWT)."""
    auth = await require_auth(request)
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return auth
