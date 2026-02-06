"""Call management API routes.

Port of routes/calls.js — initiate outbound calls, list active, end calls.
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from twilio.rest import Client as TwilioClient

from api.middleware.auth import require_auth, require_admin, AuthContext
from api.routes.voice import call_metadata
from api.validators.schemas import InitiateCallRequest

router = APIRouter()

# Lazy Twilio client
_twilio_client: TwilioClient | None = None


def _get_twilio() -> TwilioClient:
    global _twilio_client
    if _twilio_client is None:
        sid = os.getenv("TWILIO_ACCOUNT_SID")
        token = os.getenv("TWILIO_AUTH_TOKEN")
        if not sid or not token:
            raise HTTPException(status_code=500, detail="Twilio not configured")
        _twilio_client = TwilioClient(sid, token)
    return _twilio_client


@router.post("/api/call")
async def initiate_call(
    body: InitiateCallRequest,
    auth: AuthContext = Depends(require_auth),
):
    """Initiate an outbound call to a phone number.

    Pre-fetches senior context before triggering the Twilio call.
    """
    phone = body.phone_number
    base_url = os.getenv("BASE_URL", "")

    try:
        # Pre-fetch: look up senior and build context
        from services.seniors import find_by_phone
        from services.scheduler import prefetch_for_phone

        senior = await find_by_phone(phone)
        if senior:
            # Access control for non-cofounder users
            if not auth.is_cofounder and auth.clerk_user_id:
                from services.caregivers import can_access_senior
                has_access = await can_access_senior(auth.clerk_user_id, senior["id"])
                if not has_access:
                    raise HTTPException(status_code=403, detail="Access denied to this senior")
            await prefetch_for_phone(phone, senior)

        client = _get_twilio()
        call = client.calls.create(
            to=phone,
            from_=os.getenv("TWILIO_PHONE_NUMBER"),
            url=f"{base_url}/voice/answer",
            status_callback=f"{base_url}/voice/status",
            status_callback_event=["initiated", "ringing", "answered", "completed"],
        )

        logger.info("Initiated call {sid} to ***{last4}", sid=call.sid, last4=phone[-4:])
        return {"success": True, "call_sid": call.sid}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to initiate call: {err}", err=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/calls")
async def list_active_calls(auth: AuthContext = Depends(require_admin)):
    """List active calls (admin only)."""
    return {
        "active_calls": len(call_metadata),
        "call_sids": list(call_metadata.keys()),
    }


@router.post("/api/calls/{call_sid}/end")
async def end_call(call_sid: str, auth: AuthContext = Depends(require_admin)):
    """End an active call (admin only)."""
    try:
        client = _get_twilio()
        client.calls(call_sid).update(status="completed")
        return {"success": True}
    except Exception as e:
        logger.error("Failed to end call {sid}: {err}", sid=call_sid, err=str(e))
        raise HTTPException(status_code=500, detail=str(e))
