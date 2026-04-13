"""Twilio webhook signature validation middleware.

Verifies that incoming requests to /voice/* endpoints actually come from
Twilio by checking the X-Twilio-Signature header against the request body
using TWILIO_AUTH_TOKEN.

Implemented as a FastAPI Depends() callable, consistent with auth.py.

Set SKIP_TWILIO_VALIDATION=true to bypass in dev/test environments.
"""

from __future__ import annotations

import os

from fastapi import HTTPException, Request
from loguru import logger
from twilio.request_validator import RequestValidator

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
SKIP_VALIDATION = os.getenv("SKIP_TWILIO_VALIDATION", "false").lower() == "true"

if not TWILIO_AUTH_TOKEN and os.getenv("RAILWAY_PUBLIC_DOMAIN") and not SKIP_VALIDATION:
    logger.warning(
        "TWILIO_AUTH_TOKEN not set in production — webhook signature validation disabled"
    )

_validator: RequestValidator | None = (
    RequestValidator(TWILIO_AUTH_TOKEN) if TWILIO_AUTH_TOKEN else None
)


def _reconstruct_url(request: Request) -> str:
    """Build the full request URL that Twilio signed against.

    Railway (and most reverse proxies) terminate TLS and forward requests
    over HTTP internally.  Twilio signs the original public URL (https),
    so we must reconstruct it from the X-Forwarded-* headers.
    """
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    path = request.url.path
    # Include query string if present (Twilio includes it in the signature)
    query = str(request.url.query) if request.url.query else ""
    url = f"{proto}://{host}{path}"
    if query:
        url = f"{url}?{query}"
    return url


async def verify_twilio_signature(request: Request) -> None:
    """FastAPI dependency that validates Twilio webhook signatures.

    Usage:
        @router.post("/voice/answer", dependencies=[Depends(verify_twilio_signature)])
        async def voice_answer(request: Request): ...

    Raises HTTPException 403 if the signature is missing or invalid.
    Passes through silently when validation succeeds or is skipped.
    """
    # Allow bypassing in dev/test
    if SKIP_VALIDATION:
        return

    # No auth token configured — can't validate
    if _validator is None:
        logger.warning("Twilio signature check skipped — no TWILIO_AUTH_TOKEN configured")
        return

    signature = request.headers.get("x-twilio-signature", "")
    if not signature:
        logger.warning("Twilio webhook rejected — missing X-Twilio-Signature header")
        raise HTTPException(status_code=403, detail="Missing Twilio signature")

    # Twilio POSTs form-encoded bodies.  Reading the body first ensures
    # Starlette caches it internally so downstream handlers can still call
    # request.form() without a "body already consumed" error.
    await request.body()

    # Parse form params the same way Twilio's validator expects: dict[str, str]
    form = await request.form()
    params: dict[str, str] = {k: str(v) for k, v in form.items()}

    url = _reconstruct_url(request)

    is_valid = _validator.validate(url, params, signature)

    if not is_valid:
        logger.warning(
            "Twilio webhook rejected — invalid signature (url={url})",
            url=url,
        )
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")

    logger.debug("Twilio signature verified for {url}", url=url)
