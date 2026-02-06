"""Twilio webhook verification middleware.

Port of middleware/twilio.js — validates X-Twilio-Signature on voice endpoints.
"""

from __future__ import annotations

import os

from fastapi import HTTPException, Request
from loguru import logger
from twilio.request_validator import RequestValidator


async def verify_twilio_webhook(request: Request) -> None:
    """FastAPI dependency that validates Twilio webhook signatures.

    Usage: Depends(verify_twilio_webhook)

    In production, rejects unsigned/invalid requests.
    In development (localhost), allows through with a warning.
    """
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    if not auth_token:
        logger.error("TWILIO_AUTH_TOKEN not set — cannot validate webhooks")
        raise HTTPException(status_code=500, detail="Server configuration error")

    signature = request.headers.get("x-twilio-signature", "")

    # Build the URL Twilio signed (respect proxy headers)
    protocol = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host", ""))
    url = f"{protocol}://{host}{request.url.path}"

    # Check for localhost (dev mode)
    is_localhost = "localhost" in host or "127.0.0.1" in host

    if is_localhost and not signature:
        logger.warning("Skipping Twilio signature validation for localhost")
        return

    # Get form params for validation
    form = await request.form()
    params = dict(form)

    validator = RequestValidator(auth_token)
    if not validator.validate(url, params, signature):
        if is_localhost:
            logger.warning("Invalid Twilio signature in dev mode — allowing through")
            return
        logger.warning("Invalid Twilio webhook signature for {path}", path=request.url.path)
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")
