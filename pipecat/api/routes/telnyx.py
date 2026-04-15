"""Telnyx Call Control routes.

This path keeps Donna's core voice pipeline in high-quality linear PCM and only
uses Telnyx-specific codecs at the WebSocket edge.
"""

from __future__ import annotations

import base64
import binascii
import json
import os
import secrets
import time
from typing import Any
from urllib.parse import urlencode

import aiohttp
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from loguru import logger
from pydantic import BaseModel, ConfigDict, Field

from api.middleware.auth import require_service_api_key
from api.routes.voice import (
    _cleanup_metadata,
    _hydrate_senior_call_context,
    _metadata_lock,
    _persist_metadata,
    _senior_is_inactive,
    call_metadata,
)
from config import get_pipecat_public_url, get_settings, is_production_environment
from lib.sanitize import mask_phone

router = APIRouter()

_TERMINAL_EVENTS = {
    "call.hangup",
    "call.completed",
    "call.failed",
    "call.no_answer",
    "call.busy",
}


class TelnyxOutboundCallRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    senior_id: str = Field(alias="seniorId")
    call_type: str = Field(default="check-in", alias="callType")


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


def _telnyx_headers() -> dict[str, str]:
    cfg = get_settings()
    if not cfg.telnyx_api_key:
        raise HTTPException(status_code=500, detail="Telnyx API key is not configured")
    return {
        "Authorization": f"Bearer {cfg.telnyx_api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _public_base_url() -> str:
    base_url = get_pipecat_public_url()
    if not base_url:
        raise HTTPException(status_code=500, detail="PIPECAT_PUBLIC_URL is not configured")
    return base_url.rstrip("/")


def _telnyx_event_url() -> str:
    return f"{_public_base_url()}/telnyx/events"


def _telnyx_stream_url(ws_token: str) -> str:
    ws_base = _public_base_url().replace("https://", "wss://").replace("http://", "ws://")
    return f"{ws_base}/ws?{urlencode({'ws_token': ws_token})}"


def _telnyx_stream_options(ws_token: str) -> dict[str, Any]:
    cfg = get_settings()
    codec = (cfg.telnyx_stream_codec or "L16").upper()
    if codec not in {"PCMU", "PCMA", "G722", "OPUS", "AMR-WB", "L16"}:
        logger.warning("Unsupported TELNYX_STREAM_CODEC={codec}; using L16", codec=codec)
        codec = "L16"

    return {
        "stream_url": _telnyx_stream_url(ws_token),
        "stream_track": "both_tracks",
        "stream_codec": codec,
        "stream_bidirectional_mode": "rtp",
        "stream_bidirectional_codec": codec,
    }


def _verify_telnyx_signature(raw_body: bytes, request: Request) -> None:
    cfg = get_settings()
    if (
        not is_production_environment()
        and os.getenv("ALLOW_UNSIGNED_TELNYX_WEBHOOKS", "").lower() == "true"
    ):
        return

    public_key = cfg.telnyx_public_key
    signature = request.headers.get("telnyx-signature-ed25519", "")
    timestamp = request.headers.get("telnyx-timestamp", "")
    if not public_key or not signature or not timestamp:
        raise HTTPException(status_code=403, detail="Missing Telnyx signature")

    try:
        now = int(time.time())
        ts = int(timestamp)
        if abs(now - ts) > cfg.telnyx_webhook_tolerance_seconds:
            raise HTTPException(status_code=403, detail="Stale Telnyx signature")

        verifier = Ed25519PublicKey.from_public_bytes(base64.b64decode(public_key))
        verifier.verify(
            base64.b64decode(signature),
            timestamp.encode("utf-8") + b"|" + raw_body,
        )
    except HTTPException:
        raise
    except (ValueError, binascii.Error, InvalidSignature) as exc:
        raise HTTPException(status_code=403, detail="Invalid Telnyx signature") from exc


async def _telnyx_post(endpoint: str, payload: dict[str, Any] | None = None) -> dict:
    async with aiohttp.ClientSession() as session:
        async with session.post(endpoint, headers=_telnyx_headers(), json=payload or {}) as response:
            body_text = await response.text()
            if response.status < 200 or response.status >= 300:
                logger.error(
                    "Telnyx API request failed status={status} response={response}",
                    status=response.status,
                    response=body_text[:300],
                )
                raise HTTPException(status_code=502, detail="Telnyx API request failed")
            if not body_text:
                return {}
            return json.loads(body_text)


async def _store_senior_metadata(
    *,
    call_control_id: str,
    senior: dict,
    is_outbound: bool,
    call_type: str,
    target_phone: str,
    ws_token: str,
) -> dict:
    hydrated = await _hydrate_senior_call_context(
        senior=senior,
        call_sid=call_control_id,
        is_outbound=is_outbound,
    )

    conversation_id = None
    try:
        from services.conversations import create

        conv = await create(senior["id"], call_control_id)
        conversation_id = str(conv["id"]) if conv else None
    except Exception as exc:
        logger.error("[{cid}] Error creating Telnyx conversation: {err}", cid=call_control_id, err=str(exc))

    metadata = {
        "senior": senior,
        "prospect": None,
        "prospect_id": None,
        "memory_context": hydrated["memory_context"],
        "conversation_id": conversation_id,
        "reminder_prompt": None,
        "reminder_context": None,
        "pre_generated_greeting": hydrated["pre_generated_greeting"],
        "previous_calls_summary": hydrated["previous_calls_summary"],
        "recent_turns": hydrated["recent_turns"],
        "todays_context": hydrated["todays_context"],
        "news_context": hydrated["news_context"],
        "is_outbound": is_outbound,
        "call_type": call_type,
        "target_phone": target_phone,
        "last_call_analysis": hydrated["last_call_analysis"],
        "has_caregiver_notes": hydrated["has_caregiver_notes"],
        "caregiver_notes_content": hydrated["caregiver_notes_content"],
        "call_settings": hydrated["call_settings"],
        "ws_token": ws_token,
        "ws_token_expires_at": time.time() + 300,
        "ws_token_consumed": False,
        "telephony_provider": "telnyx",
    }

    async with _metadata_lock:
        call_metadata[call_control_id] = metadata
    await _persist_metadata(call_control_id, metadata)

    try:
        from services.audit import fire_and_forget_audit

        fire_and_forget_audit(
            user_id="system",
            user_role="system",
            action="read",
            resource_type="senior",
            resource_id=str(senior["id"]),
            metadata={
                "trigger": "telnyx_call",
                "call_sid": call_control_id,
                "call_type": call_type,
            },
        )
    except Exception:
        pass

    return metadata


async def _store_prospect_metadata(
    *,
    call_control_id: str,
    target_phone: str,
    ws_token: str,
) -> None:
    prospect = None
    prospect_id = None
    memory_context = None
    try:
        from services.prospects import create as create_prospect
        from services.prospects import find_by_phone as find_prospect

        prospect = await find_prospect(target_phone)
        if not prospect:
            prospect = await create_prospect(target_phone)
        prospect_id = str(prospect["id"]) if prospect else None
    except Exception as exc:
        logger.error("[{cid}] Error in Telnyx prospect lookup/create: {err}", cid=call_control_id, err=str(exc))

    try:
        from services.conversations import create

        await create(None, call_control_id, prospect_id=prospect_id)
    except Exception as exc:
        logger.error("[{cid}] Error creating Telnyx onboarding conversation: {err}", cid=call_control_id, err=str(exc))

    metadata = {
        "senior": None,
        "prospect": prospect,
        "prospect_id": prospect_id,
        "memory_context": memory_context,
        "conversation_id": None,
        "is_outbound": False,
        "call_type": "onboarding",
        "target_phone": target_phone,
        "ws_token": ws_token,
        "ws_token_expires_at": time.time() + 300,
        "ws_token_consumed": False,
        "telephony_provider": "telnyx",
    }
    async with _metadata_lock:
        call_metadata[call_control_id] = metadata
    await _persist_metadata(call_control_id, metadata)


async def _answer_telnyx_call(call_control_id: str, ws_token: str) -> None:
    payload = _telnyx_stream_options(ws_token)
    endpoint = f"https://api.telnyx.com/v2/calls/{call_control_id}/actions/answer"
    await _telnyx_post(endpoint, payload)
    logger.info("[{cid}] Telnyx inbound call answered with media stream", cid=call_control_id)


async def _hangup_telnyx_call(call_control_id: str) -> None:
    endpoint = f"https://api.telnyx.com/v2/calls/{call_control_id}/actions/hangup"
    await _telnyx_post(endpoint, {})


async def _handle_call_initiated(payload: dict[str, Any]) -> None:
    call_control_id = payload.get("call_control_id", "")
    if not call_control_id:
        return

    cfg = get_settings()
    from_number = payload.get("from", "")
    to_number = payload.get("to", "")
    is_outbound = _format_phone_for_call(from_number) == _format_phone_for_call(cfg.telnyx_phone_number)
    target_phone = to_number if is_outbound else from_number

    if is_outbound:
        logger.info("[{cid}] Telnyx outbound initiated", cid=call_control_id)
        return

    try:
        from main import _call_semaphore

        if _call_semaphore.locked():
            logger.warning("[{cid}] At capacity; hanging up Telnyx inbound call", cid=call_control_id)
            await _hangup_telnyx_call(call_control_id)
            return
    except Exception:
        pass

    logger.info(
        "[{cid}] Telnyx inbound call target={phone}",
        cid=call_control_id,
        phone=mask_phone(target_phone),
    )

    ws_token = secrets.token_urlsafe(32)
    from services.seniors import find_any_by_phone, find_by_phone

    senior = await find_by_phone(target_phone)
    if senior:
        await _store_senior_metadata(
            call_control_id=call_control_id,
            senior=senior,
            is_outbound=False,
            call_type="check-in",
            target_phone=target_phone,
            ws_token=ws_token,
        )
        await _answer_telnyx_call(call_control_id, ws_token)
        return

    inactive_match = await find_any_by_phone(target_phone)
    if _senior_is_inactive(inactive_match):
        logger.warning("[{cid}] Inactive Telnyx caller matched; hanging up", cid=call_control_id)
        await _hangup_telnyx_call(call_control_id)
        return

    await _store_prospect_metadata(
        call_control_id=call_control_id,
        target_phone=target_phone,
        ws_token=ws_token,
    )
    await _answer_telnyx_call(call_control_id, ws_token)


@router.post("/telnyx/events")
async def telnyx_events(request: Request, background_tasks: BackgroundTasks):
    raw_body = await request.body()
    _verify_telnyx_signature(raw_body, request)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON") from exc

    data = event.get("data") or {}
    event_type = data.get("event_type", "")
    payload = data.get("payload") or {}
    call_control_id = payload.get("call_control_id", "")

    if event_type == "call.initiated":
        background_tasks.add_task(_handle_call_initiated, payload)
    elif event_type in _TERMINAL_EVENTS and call_control_id:
        await _cleanup_metadata(call_control_id)
        logger.info("[{cid}] Cleaned up Telnyx metadata event={event}", cid=call_control_id, event=event_type)

    return {"received": True}


@router.post("/telnyx/outbound")
async def telnyx_outbound_call(
    body: TelnyxOutboundCallRequest,
    _service_label: str = Depends(require_service_api_key),
):
    cfg = get_settings()
    if not cfg.telnyx_connection_id or not cfg.telnyx_phone_number:
        raise HTTPException(status_code=500, detail="Telnyx connection is not configured")

    from services.seniors import get_by_id

    senior = await get_by_id(body.senior_id)
    if not senior:
        raise HTTPException(status_code=404, detail="Senior not found")
    if _senior_is_inactive(senior):
        raise HTTPException(status_code=400, detail="Senior is not active")

    target_phone = _format_phone_for_call(senior.get("phone", ""))
    if not target_phone:
        raise HTTPException(status_code=400, detail="Senior phone is not callable")

    ws_token = secrets.token_urlsafe(32)
    payload = {
        "connection_id": cfg.telnyx_connection_id,
        "to": target_phone,
        "from": cfg.telnyx_phone_number,
        "webhook_url": _telnyx_event_url(),
        "webhook_url_method": "POST",
        **_telnyx_stream_options(ws_token),
    }

    response = await _telnyx_post("https://api.telnyx.com/v2/calls", payload)
    call_data = response.get("data") or {}
    call_control_id = call_data.get("call_control_id")
    if not call_control_id:
        raise HTTPException(status_code=502, detail="Telnyx did not return a call_control_id")

    await _store_senior_metadata(
        call_control_id=call_control_id,
        senior=senior,
        is_outbound=True,
        call_type=body.call_type,
        target_phone=target_phone,
        ws_token=ws_token,
    )

    logger.info("[{cid}] Initiated Telnyx outbound call for senior {sid}", cid=call_control_id, sid=str(senior["id"])[:8])
    return {
        "success": True,
        "provider": "telnyx",
        "callSid": call_control_id,
        "callControlId": call_control_id,
        "seniorId": senior["id"],
    }


@router.post("/telnyx/calls/{call_control_id}/end")
async def telnyx_end_call(
    call_control_id: str,
    _service_label: str = Depends(require_service_api_key),
):
    await _hangup_telnyx_call(call_control_id)
    await _cleanup_metadata(call_control_id)
    return {"success": True, "provider": "telnyx", "callSid": call_control_id}
