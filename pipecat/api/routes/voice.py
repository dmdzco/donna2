"""Archived Twilio voice route placeholder.

The active voice ingress is Telnyx in ``api.routes.telnyx``. The previous
Twilio route implementation is preserved under ``archive/twilio-voice`` and is
not mounted by ``main.py``.
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()
