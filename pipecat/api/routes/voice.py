"""Voice webhook routes — Twilio voice answer + status callbacks.

Port of routes/voice.js. Handles:
1. /voice/answer — returns TwiML connecting to WebSocket, pre-fetches context
2. /voice/status — call status updates (completed, failed, etc.)
"""

from __future__ import annotations

import asyncio
import os
import secrets
from xml.sax.saxutils import escape as xml_escape

from fastapi import APIRouter, Request, Response
from loguru import logger
from lib.sanitize import mask_phone

router = APIRouter()

# In-memory call metadata (shared with WebSocket handler)
# call_sid → {senior, memory_context, conversation_id, reminder_prompt, ...}
# When REDIS_URL is set, metadata is also persisted to Redis for multi-instance.
call_metadata: dict[str, dict] = {}
_metadata_lock = asyncio.Lock()


async def _persist_metadata(call_sid: str, data: dict) -> None:
    """Write metadata to Redis if configured (for multi-instance routing)."""
    try:
        from lib.redis_client import get_shared_state
        state = get_shared_state()
        if getattr(state, "is_shared", False):
            await state.set(f"call_metadata:{call_sid}", data, ttl=1800)
    except Exception:
        pass  # Redis is optional — failure is non-fatal


async def _cleanup_metadata(call_sid: str) -> dict | None:
    """Remove metadata from local dict and Redis."""
    metadata = call_metadata.pop(call_sid, None)
    try:
        from lib.redis_client import get_shared_state
        state = get_shared_state()
        if getattr(state, "is_shared", False):
            if metadata is None:
                # May be on a different instance — try Redis
                metadata = await state.get(f"call_metadata:{call_sid}")
            await state.delete(f"call_metadata:{call_sid}")
    except Exception:
        pass
    return metadata


@router.post("/voice/answer")
async def voice_answer(request: Request):
    """Twilio calls this when a call is answered — returns TwiML pointing to WebSocket."""
    # Check capacity before doing any work
    from main import _call_semaphore
    if _call_semaphore.locked():
        logger.warning("At capacity — returning TwiML fallback")
        fallback = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry, all lines are busy right now. I'll call you back in a few minutes. Goodbye!</Say>
    <Hangup/>
</Response>"""
        return Response(content=fallback, media_type="text/xml")

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
        phone=mask_phone(target_phone),
    )
    logger.debug(
        "[{cs}] Phone debug: From={frm} To={to} Direction={d} TWILIO_PHONE_NUMBER={tw} is_outbound={ob} target_phone={tp}",
        cs=call_sid,
        frm=mask_phone(from_number),
        to=mask_phone(to_number),
        d=direction,
        tw=mask_phone(twilio_number),
        ob=is_outbound,
        tp=mask_phone(target_phone),
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
    caregiver_notes_content = []
    previous_calls_summary = None
    todays_context = None

    # 1. Check for reminder call (in-memory first, then DB fallback)
    from services.scheduler import get_reminder_context, get_prefetched_context
    reminder_context = get_reminder_context(call_sid)
    prefetched = get_prefetched_context(target_phone)

    if reminder_context:
        senior = reminder_context["senior"]
        memory_context = reminder_context.get("memory_context")
        reminder_prompt = reminder_context.get("reminder_prompt")
        call_type = "reminder"
        logger.info("[{cs}] Reminder call (in-memory)", cs=call_sid)
    elif is_outbound:
        # Outbound call — check DB for reminder delivery (Node.js scheduler)
        from services.reminder_delivery import get_reminder_by_call_sid, format_reminder_prompt as fmt_prompt
        from services.seniors import find_by_phone
        reminder_row = await get_reminder_by_call_sid(call_sid)
        if reminder_row:
            reminder_prompt = fmt_prompt({
                "title": reminder_row.get("title"),
                "description": reminder_row.get("description"),
                "type": reminder_row.get("reminder_type"),
            })
            call_type = "reminder"
            senior = await find_by_phone(target_phone)
            if senior:
                try:
                    from services.memory import build_context
                    memory_context = await build_context(senior["id"], None, senior)
                except Exception as e:
                    logger.error("[{cs}] Memory fetch for reminder failed: {err}", cs=call_sid, err=str(e))
            # Build reminder_context for downstream delivery tracking
            reminder_context = {
                "senior": senior,
                "reminder_prompt": reminder_prompt,
                "reminder": {
                    "title": reminder_row.get("title"),
                    "description": reminder_row.get("description"),
                    "type": reminder_row.get("reminder_type"),
                },
                "delivery": {
                    "id": reminder_row.get("delivery_id"),
                    "reminder_id": reminder_row.get("reminder_id"),
                    "status": reminder_row.get("delivery_status"),
                    "attempt_count": reminder_row.get("attempt_count"),
                },
            }
            logger.info("[{cs}] Reminder call (DB lookup)", cs=call_sid)
        elif prefetched:
            senior = prefetched.get("senior")
            memory_context = prefetched.get("memory_context")
            pre_generated_greeting = prefetched.get("pre_generated_greeting")
            news_context = prefetched.get("news_context")
            recent_turns = prefetched.get("recent_turns")
            logger.info("[{cs}] Manual outbound with pre-fetched context", cs=call_sid)
        else:
            senior = await find_by_phone(target_phone)
            logger.info("[{cs}] Generic outbound call", cs=call_sid)
    else:
        # Inbound — look up senior by phone
        from services.seniors import find_by_phone
        logger.info(
            "[{cs}] Looking up senior by phone: target={tp}",
            cs=call_sid,
            tp=mask_phone(target_phone),
        )
        senior = await find_by_phone(target_phone)
        logger.info("[{cs}] Senior lookup result: found={found}", cs=call_sid, found=bool(senior))
        if senior:
            logger.info("[{cs}] Inbound senior matched", cs=call_sid)

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
            caregiver_notes_content = caregiver_notes if caregiver_notes else []

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

            # --- Inbound greeting (with news/interest/context followups) ---
            from services.greetings import get_inbound_greeting
            import json as _json2
            analysis_data = last_call_analysis or {}
            if isinstance(analysis_data, str):
                try:
                    analysis_data = _json2.loads(analysis_data)
                except Exception:
                    analysis_data = {}
            call_quality = analysis_data.get("call_quality")
            if isinstance(call_quality, str):
                try:
                    call_quality = _json2.loads(call_quality)
                except Exception:
                    call_quality = {}
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
            caregiver_notes_content = caregiver_notes if caregiver_notes else []
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

    # 3. Store metadata for WebSocket handler (locked for concurrent writes)
    ws_token = secrets.token_urlsafe(32)
    async with _metadata_lock:
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
            "caregiver_notes_content": caregiver_notes_content if senior and not prospect else [],
            "call_settings": call_settings,
            "ws_token": ws_token,
        }

    # Also persist to Redis for multi-instance routing
    await _persist_metadata(call_sid, call_metadata[call_sid])

    # Audit: log PHI access when senior data is fetched for a call
    if senior:
        from services.audit import fire_and_forget_audit
        fire_and_forget_audit(
            user_id="system",
            user_role="system",
            action="read",
            resource_type="senior",
            resource_id=str(senior["id"]),
            metadata={"trigger": "voice_answer", "call_sid": call_sid, "call_type": call_type},
        )

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
            <Parameter name="ws_token" value="{xml_escape(str(ws_token), {'"': '&quot;'})}" />
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
        # Clean up metadata (local + Redis)
        metadata = await _cleanup_metadata(call_sid)

        # Clear reminder context
        from services.scheduler import clear_reminder_context
        clear_reminder_context(call_sid)

        if metadata:
            logger.info("[{cs}] Cleaned up call metadata", cs=call_sid)

    return Response(status_code=200)
