"""Call management API routes for the Telnyx voice path."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from loguru import logger

from api.middleware.auth import require_auth, require_admin, AuthContext
from api.routes.call_context import call_metadata
from api.routes.telnyx import TelnyxOutboundCallRequest, create_telnyx_outbound_call, end_telnyx_call
from api.validators.schemas import InitiateCallRequest
from services.audit import fire_and_forget_audit, auth_to_role

router = APIRouter()


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

    Pipecat creates the Telnyx call and hydrates context on the voice service.
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
    try:
        from services.seniors import get_by_id

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

        call = await create_telnyx_outbound_call(
            TelnyxOutboundCallRequest(seniorId=senior_id, callType="check-in")
        )

        logger.info("Initiated Telnyx call {sid} for senior {senior_id}", sid=call["callSid"], senior_id=senior["id"])
        return {
            "success": True,
            "provider": "telnyx",
            "call_sid": call["callSid"],
            "call_control_id": call["callControlId"],
            "senior_id": senior["id"],
        }

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
        return await end_telnyx_call(call_sid)
    except Exception as e:
        logger.error("Failed to end call {sid}: {err}", sid=call_sid, err=str(e))
        raise HTTPException(status_code=500, detail="Failed to end call")
