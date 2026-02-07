"""Voice webhook routes — Twilio voice answer + status callbacks.

Port of routes/voice.js. Handles:
1. /voice/answer — returns TwiML connecting to WebSocket, pre-fetches context
2. /voice/status — call status updates (completed, failed, etc.)
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Request, Response
from loguru import logger

router = APIRouter()

# In-memory call metadata (shared with WebSocket handler)
# call_sid → {senior, memory_context, conversation_id, reminder_prompt, ...}
call_metadata: dict[str, dict] = {}


@router.post("/voice/answer")
async def voice_answer(request: Request):
    """Twilio calls this when a call is answered — returns TwiML pointing to WebSocket."""
    form = await request.form()
    call_sid = form.get("CallSid", "")
    from_number = form.get("From", "")
    to_number = form.get("To", "")
    direction = form.get("Direction", "")

    twilio_number = os.getenv("TWILIO_PHONE_NUMBER", "")
    is_outbound = from_number == twilio_number or direction == "outbound-api"
    target_phone = to_number if is_outbound else from_number

    logger.info(
        "[{cs}] Call answered ({dir}) target={phone}",
        cs=call_sid,
        dir="outbound" if is_outbound else "inbound",
        phone=target_phone[-4:] if target_phone else "?",
    )
    logger.debug(
        "[{cs}] Phone debug: From={frm} To={to} Direction={d} TWILIO_PHONE_NUMBER={tw} is_outbound={ob} target_phone={tp}",
        cs=call_sid, frm=from_number, to=to_number, d=direction, tw=twilio_number, ob=is_outbound, tp=target_phone,
    )

    senior = None
    memory_context = None
    reminder_prompt = None
    pre_generated_greeting = None
    call_type = "check-in"

    # 1. Check for reminder call (pre-fetched context)
    from services.scheduler import get_reminder_context, get_prefetched_context
    reminder_context = get_reminder_context(call_sid)
    prefetched = get_prefetched_context(target_phone)

    if reminder_context:
        senior = reminder_context["senior"]
        memory_context = reminder_context.get("memory_context")
        reminder_prompt = reminder_context.get("reminder_prompt")
        call_type = "reminder"
        logger.info("[{cs}] Reminder call: {title}", cs=call_sid, title=reminder_context["reminder"].get("title"))
    elif prefetched:
        senior = prefetched.get("senior")
        memory_context = prefetched.get("memory_context")
        pre_generated_greeting = prefetched.get("pre_generated_greeting")
        logger.info("[{cs}] Manual outbound with pre-fetched context", cs=call_sid)
    else:
        # Inbound — look up senior by phone
        from services.seniors import find_by_phone
        logger.info("[{cs}] Looking up senior by phone: target={tp}, normalized={norm}",
                     cs=call_sid, tp=target_phone, norm=target_phone[-10:] if target_phone else "?")
        senior = await find_by_phone(target_phone)
        logger.info("[{cs}] Senior lookup result: {found}", cs=call_sid,
                     found=senior.get("name") if senior else "NOT FOUND")
        if senior:
            logger.info("[{cs}] Inbound from {name}", cs=call_sid, name=senior.get("name", "?"))
            from services.memory import build_context
            memory_context = await build_context(senior["id"], None, senior)
            # Generate greeting so the bot speaks first
            from services.greetings import get_greeting
            greeting_result = get_greeting(
                senior_name=senior.get("name", ""),
                timezone=senior.get("timezone", "America/New_York"),
                interests=senior.get("interests"),
            )
            pre_generated_greeting = greeting_result.get("greeting", "")

    # 2. Create conversation record
    conversation_id = None
    if senior:
        try:
            from services.conversations import create
            conv = await create(senior["id"], call_sid)
            conversation_id = conv.get("id") if conv else None
        except Exception as e:
            logger.error("[{cs}] Error creating conversation: {err}", cs=call_sid, err=str(e))

    # Log memory status
    logger.info(
        "[{cs}] Memory status: has_context={has}, length={ln}, has_greeting={gr}, call_type={ct}",
        cs=call_sid,
        has=memory_context is not None,
        ln=len(memory_context) if memory_context else 0,
        gr=pre_generated_greeting is not None,
        ct=call_type,
    )

    # 3. Store metadata for WebSocket handler
    call_metadata[call_sid] = {
        "senior": senior,
        "memory_context": memory_context,
        "conversation_id": conversation_id,
        "reminder_prompt": reminder_prompt,
        "reminder_context": reminder_context,
        "pre_generated_greeting": pre_generated_greeting,
        "call_type": call_type,
        "target_phone": target_phone,
    }

    # 4. Return TwiML
    base_url = os.getenv("BASE_URL", "")
    ws_url = base_url.replace("https://", "wss://").replace("http://", "ws://")
    senior_id = senior["id"] if senior else ""

    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="{ws_url}/ws">
            <Parameter name="senior_id" value="{senior_id}" />
            <Parameter name="call_sid" value="{call_sid}" />
            <Parameter name="conversation_id" value="{conversation_id or ''}" />
            <Parameter name="call_type" value="{call_type}" />
        </Stream>
    </Connect>
</Response>"""

    return Response(content=twiml, media_type="text/xml")


@router.post("/voice/status")
async def voice_status(request: Request):
    """Twilio status callback — handle call completion."""
    form = await request.form()
    call_sid = form.get("CallSid", "")
    call_status = form.get("CallStatus", "")
    call_duration = form.get("CallDuration", "0")

    logger.info("Call {cs}: {status} ({dur}s)", cs=call_sid, status=call_status, dur=call_duration)

    if call_status in ("completed", "failed", "busy", "no-answer"):
        # Clean up metadata
        metadata = call_metadata.pop(call_sid, None)

        # Clear reminder context
        from services.scheduler import clear_reminder_context
        clear_reminder_context(call_sid)

        if metadata:
            logger.info("[{cs}] Cleaned up call metadata", cs=call_sid)

    return Response(status_code=200)
