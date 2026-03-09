"""Voice webhook routes — Twilio voice answer + status callbacks.

Port of routes/voice.js. Handles:
1. /voice/answer — returns TwiML connecting to WebSocket, pre-fetches context
2. /voice/status — call status updates (completed, failed, etc.)
"""

from __future__ import annotations

import os
from xml.sax.saxutils import escape as xml_escape

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
    prospect = None
    memory_context = None
    reminder_prompt = None
    pre_generated_greeting = None
    news_context = None
    recent_turns = None
    call_type = "check-in"
    last_call_analysis = None
    call_settings = None
    has_caregiver_notes = False
    previous_calls_summary = None
    todays_context = None

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
        news_context = prefetched.get("news_context")
        recent_turns = prefetched.get("recent_turns")
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

            # --- Parallel fetch: memory + caregiver notes (only dynamic queries) ---
            import asyncio
            from services.memory import build_context
            from services.caregivers import get_pending_notes

            mem_result, notes_result = await asyncio.gather(
                build_context(senior["id"], None, senior),
                get_pending_notes(senior["id"]),
                return_exceptions=True,
            )

            memory_context = mem_result if not isinstance(mem_result, Exception) else None
            if isinstance(mem_result, Exception):
                logger.error("[{cs}] Memory fetch failed: {err}", cs=call_sid, err=mem_result)

            caregiver_notes = notes_result if not isinstance(notes_result, Exception) else []
            if isinstance(notes_result, Exception):
                logger.error("[{cs}] Caregiver notes fetch failed: {err}", cs=call_sid, err=notes_result)

            has_caregiver_notes = bool(caregiver_notes)

            # --- News: read from DB (pre-cached daily at 5 AM, never fetched live) ---
            import json as _json
            raw_cached_news = senior.get("cached_news")
            if raw_cached_news:
                try:
                    from services.news import select_stories_for_call
                    news_context = select_stories_for_call(
                        raw_cached_news,
                        interests=senior.get("interests"),
                        interest_scores=senior.get("interest_scores"),
                        count=3,
                    )
                except Exception:
                    news_context = raw_cached_news  # fallback: use full cached text

            # --- Read pre-computed snapshot (came with find_by_phone) ---
            snapshot = senior.get("call_context_snapshot")
            if isinstance(snapshot, str):
                try:
                    snapshot = _json.loads(snapshot)
                except Exception:
                    snapshot = None

            if snapshot:
                last_call_analysis = snapshot.get("last_call_analysis")
                previous_calls_summary = snapshot.get("recent_summaries")
                recent_turns = snapshot.get("recent_turns")
                todays_context = snapshot.get("todays_context")
                logger.info("[{cs}] Using pre-computed snapshot (updated {ts})",
                            cs=call_sid, ts=snapshot.get("snapshot_updated_at", "?"))
            else:
                # No snapshot yet (first call ever) — fetch individually
                logger.info("[{cs}] No snapshot, fetching context individually", cs=call_sid)
                from services.call_analysis import get_latest_analysis
                from services.conversations import get_recent_summaries, get_recent_turns
                from services.daily_context import get_todays_context, format_todays_context
                last_call_analysis = await get_latest_analysis(senior["id"])
                previous_calls_summary = await get_recent_summaries(senior["id"], 3)
                recent_turns = await get_recent_turns(senior["id"])
                raw_ctx = await get_todays_context(senior["id"], senior.get("timezone", "America/New_York"))
                todays_context = format_todays_context(raw_ctx)

            # --- call_settings from senior row (no extra query needed) ---
            from services.seniors import DEFAULT_CALL_SETTINGS
            raw_settings = senior.get("call_settings") or {}
            if isinstance(raw_settings, str):
                try:
                    raw_settings = _json.loads(raw_settings)
                except Exception:
                    raw_settings = {}
            call_settings = {**DEFAULT_CALL_SETTINGS, **raw_settings}

            # --- Inbound greeting ---
            from services.greetings import get_inbound_greeting
            greeting_result = get_inbound_greeting(
                senior_name=senior.get("name", ""),
                senior_id=senior.get("id"),
            )
            pre_generated_greeting = greeting_result.get("greeting", "")
        else:
            # Unknown caller — onboarding flow
            call_type = "onboarding"
            try:
                from services.prospects import find_by_phone as find_prospect, create as create_prospect
                prospect = await find_prospect(target_phone)
                if not prospect:
                    prospect = await create_prospect(target_phone)
                logger.info("[{cs}] Onboarding: prospect={pid} call_count={n}",
                            cs=call_sid, pid=str(prospect["id"])[:8],
                            n=prospect.get("call_count", 0))
                # For return callers, load prospect memory context
                if prospect.get("call_count", 0) > 0:
                    try:
                        from services.memory import search as memory_search
                        results = await memory_search(
                            senior_id=None, query="caller information",
                            limit=5, prospect_id=str(prospect["id"]),
                        )
                        if results:
                            memory_context = "\n".join(
                                f"- {r['content']}" for r in results
                            )
                    except Exception as e:
                        logger.error("[{cs}] Error loading prospect memories: {err}",
                                     cs=call_sid, err=str(e))
            except Exception as e:
                logger.error("[{cs}] Error in prospect lookup/create: {err}",
                             cs=call_sid, err=str(e))

    # Load remaining context for outbound paths (reminder/prefetched).
    # Inbound path handles everything inline above via snapshot + parallel.
    if senior and (reminder_context or prefetched):
        import json as _json

        # Read snapshot from senior row (free — already loaded)
        snapshot = senior.get("call_context_snapshot")
        if isinstance(snapshot, str):
            try:
                snapshot = _json.loads(snapshot)
            except Exception:
                snapshot = None
        if snapshot:
            last_call_analysis = snapshot.get("last_call_analysis")
            if not previous_calls_summary:
                previous_calls_summary = snapshot.get("recent_summaries")
            if not recent_turns:
                recent_turns = snapshot.get("recent_turns")
            if not todays_context:
                todays_context = snapshot.get("todays_context")

        # call_settings from senior row (no extra query)
        from services.seniors import DEFAULT_CALL_SETTINGS
        raw_settings = senior.get("call_settings") or {}
        if isinstance(raw_settings, str):
            try:
                raw_settings = _json.loads(raw_settings)
            except Exception:
                raw_settings = {}
        call_settings = {**DEFAULT_CALL_SETTINGS, **raw_settings}

        # Caregiver notes
        try:
            from services.caregivers import get_pending_notes as _get_notes
            caregiver_notes = await _get_notes(senior["id"])
            has_caregiver_notes = bool(caregiver_notes)
        except Exception as e:
            logger.error("[{cs}] Error fetching caregiver notes: {err}", cs=call_sid, err=str(e))

    # 2. Create conversation record
    conversation_id = None
    prospect_id = str(prospect["id"]) if prospect else None
    if senior:
        try:
            from services.conversations import create
            conv = await create(senior["id"], call_sid)
            conversation_id = str(conv["id"]) if conv else None
        except Exception as e:
            logger.error("[{cs}] Error creating conversation: {err}", cs=call_sid, err=str(e))
    elif prospect:
        try:
            from services.conversations import create
            conv = await create(None, call_sid, prospect_id=prospect_id)
            conversation_id = str(conv["id"]) if conv else None
        except Exception as e:
            logger.error("[{cs}] Error creating onboarding conversation: {err}", cs=call_sid, err=str(e))

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
        "prospect": prospect,
        "prospect_id": prospect_id,
        "memory_context": memory_context,
        "conversation_id": conversation_id,
        "reminder_prompt": reminder_prompt,
        "reminder_context": reminder_context,
        "pre_generated_greeting": pre_generated_greeting,
        "previous_calls_summary": previous_calls_summary,
        "recent_turns": recent_turns,
        "todays_context": todays_context,
        "news_context": news_context,
        "is_outbound": is_outbound,
        "call_type": call_type,
        "target_phone": target_phone,
        "last_call_analysis": last_call_analysis,
        "has_caregiver_notes": has_caregiver_notes,
        "call_settings": call_settings,
    }

    # 4. Return TwiML
    base_url = os.getenv("BASE_URL", "")
    ws_url = base_url.replace("https://", "wss://").replace("http://", "ws://")
    senior_id = senior["id"] if senior else ""

    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="{ws_url}/ws">
            <Parameter name="senior_id" value="{xml_escape(str(senior_id), {'"': '&quot;'})}" />
            <Parameter name="call_sid" value="{xml_escape(str(call_sid), {'"': '&quot;'})}" />
            <Parameter name="conversation_id" value="{xml_escape(str(conversation_id or ''), {'"': '&quot;'})}" />
            <Parameter name="call_type" value="{xml_escape(str(call_type), {'"': '&quot;'})}" />
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
