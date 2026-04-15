"""Twilio webhook signature validation middleware.

Verifies that incoming requests to /voice/* endpoints actually come from
Twilio by checking the X-Twilio-Signature header against the request body
using TWILIO_AUTH_TOKEN.

Implemented as a FastAPI Depends() callable, consistent with auth.py.

Set ALLOW_UNSIGNED_TWILIO_WEBHOOKS=true to bypass in local/test environments.
The legacy SKIP_TWILIO_VALIDATION flag is honored outside production only.
"""

from __future__ import annotations

import os

from fastapi import HTTPException, Request
from loguru import logger
from twilio.request_validator import RequestValidator
from config import get_pipecat_public_url, is_production_environment

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

def _truthy(value: str | None) -> bool:
    return str(value or "").lower() in {"1", "true", "yes", "on"}


def _allow_unsigned_webhooks() -> bool:
    if is_production_environment():
        return False
    return (
        _truthy(os.getenv("ALLOW_UNSIGNED_TWILIO_WEBHOOKS"))
        or _truthy(os.getenv("SKIP_TWILIO_VALIDATION"))
    )


def _get_validator() -> RequestValidator | None:
    token = os.getenv("TWILIO_AUTH_TOKEN", "")
    return RequestValidator(token) if token else None


def _reconstruct_url(request: Request) -> str:
    """Build the full request URL that Twilio signed against.

    Railway (and most reverse proxies) terminate TLS and forward requests
    over HTTP internally.  Twilio signs the original public URL (https),
    so we must reconstruct it from the X-Forwarded-* headers.
    """
    path = request.url.path
    # Include query string if present (Twilio includes it in the signature)
    query = str(request.url.query) if request.url.query else ""

    public_url = get_pipecat_public_url()
    if public_url:
        url = f"{public_url.rstrip('/')}{path}"
    else:
        proto = request.headers.get("x-forwarded-proto", request.url.scheme)
        host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
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
    # Allow bypassing in local/test only.
    if _allow_unsigned_webhooks():
        return

    # No auth token configured — can't validate
    validator = _get_validator()
    if validator is None:
        logger.error("Twilio webhook rejected — TWILIO_AUTH_TOKEN is not configured")
        raise HTTPException(status_code=500, detail="Twilio webhook validation is not configured")

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

    is_valid = validator.validate(url, params, signature)

    if not is_valid:
        logger.warning(
            "Twilio webhook rejected — invalid signature (url={url})",
            url=url,
        )
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")

    logger.debug("Twilio signature verified for {url}", url=url)
