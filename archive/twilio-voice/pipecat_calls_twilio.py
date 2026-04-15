"""Call management API routes.

Port of routes/calls.js — initiate outbound calls, list active, end calls.
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException, Request
from loguru import logger
from twilio.rest import Client as TwilioClient

from api.middleware.auth import require_auth, require_admin, AuthContext
from api.routes.voice import call_metadata
from api.validators.schemas import InitiateCallRequest
from services.audit import fire_and_forget_audit, auth_to_role
from config import get_pipecat_public_url

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


def _format_phone_for_call(phone: str) -> str:
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    if not digits:
        return ""
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    if str(phone or "").startswith("+"):
        return str(phone)
    return f"+{digits}"


@router.post("/api/call")
async def initiate_call(
    request: Request,
    body: InitiateCallRequest,
    auth: AuthContext = Depends(require_auth),
):
    """Initiate an outbound call for an authorized senior.

    Pre-fetches senior context before triggering the Twilio call.
    """
    senior_id = body.senior_id

    fire_and_forget_audit(
        user_id=auth.user_id,
        user_role=auth_to_role(auth),
        action="create",
        resource_type="call",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        metadata={"senior_id": senior_id},
    )
    base_url = get_pipecat_public_url()

    try:
        # Pre-fetch: look up senior and build context
        from services.seniors import get_by_id
        from services.scheduler import prefetch_for_phone

        senior = await get_by_id(senior_id)
        if not senior:
            raise HTTPException(status_code=404, detail="Senior not found")
        if not senior.get("is_active", True):
            raise HTTPException(status_code=400, detail="Senior is not active")

        # Access control for non-admin users
        if not auth.is_admin:
            if not auth.clerk_user_id:
                raise HTTPException(status_code=403, detail="Access denied to this senior")
            from services.caregivers import can_access_senior
            has_access = await can_access_senior(auth.clerk_user_id, senior["id"])
            if not has_access:
                raise HTTPException(status_code=403, detail="Access denied to this senior")

        phone = _format_phone_for_call(senior["phone"])
        if not phone:
            raise HTTPException(status_code=400, detail="Senior phone is not callable")
        await prefetch_for_phone(phone, senior)

        client = _get_twilio()
        call = client.calls.create(
            to=phone,
            from_=os.getenv("TWILIO_PHONE_NUMBER"),
            url=f"{base_url}/voice/answer",
            status_callback=f"{base_url}/voice/status",
            status_callback_event=["initiated", "ringing", "answered", "completed"],
        )

        logger.info("Initiated call {sid} for senior {senior_id}", sid=call.sid, senior_id=senior["id"])
        return {"success": True, "call_sid": call.sid, "senior_id": senior["id"]}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to initiate call: {err}", err=str(e))
        raise HTTPException(status_code=500, detail="Failed to initiate call")


@router.get("/api/calls")
async def list_active_calls(request: Request, auth: AuthContext = Depends(require_admin)):
    """List active calls (admin only)."""
    fire_and_forget_audit(
        user_id=auth.user_id,
        user_role=auth_to_role(auth),
        action="read",
        resource_type="call",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
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
        raise HTTPException(status_code=500, detail="Failed to end call")
