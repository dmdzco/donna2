"""Voice webhook routes — Twilio voice answer + status callbacks.

Port of routes/voice.js. Handles:
1. /voice/answer — returns TwiML connecting to WebSocket, pre-fetches context
2. /voice/status — call status updates (completed, failed, etc.)
"""

from __future__ import annotations

import asyncio
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from xml.sax.saxutils import escape as xml_escape
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Request, Response
from loguru import logger
from api.middleware.twilio import verify_twilio_signature
from config import get_pipecat_public_url
from lib.sanitize import mask_phone

router = APIRouter()

# In-memory call metadata (shared with WebSocket handler)
# call_sid → {senior, memory_context, conversation_id, reminder_prompt, ...}
# When REDIS_URL is set, metadata is also persisted to Redis for multi-instance.
call_metadata: dict[str, dict] = {}
_metadata_lock = asyncio.Lock()


async def _persist_metadata(call_sid: str, data: dict) -> None:
    """Write encrypted metadata to Redis if configured (for multi-instance routing)."""
    try:
        from lib.redis_client import get_shared_state
        from lib.shared_state_phi import encode_phi_payload
        state = get_shared_state()
        if getattr(state, "is_shared", False):
            await state.set(f"call_metadata:{call_sid}", encode_phi_payload(data), ttl=1800)
    except Exception as exc:
        logger.warning("[{cs}] Redis metadata write failed: {err}", cs=call_sid, err=str(exc))


async def get_call_metadata(call_sid: str) -> dict | None:
    """Load call metadata from local memory, then Redis fallback."""
    metadata = call_metadata.get(call_sid)
    if metadata is not None:
        return metadata
    try:
        from lib.redis_client import get_shared_state
        from lib.shared_state_phi import decode_phi_payload
        state = get_shared_state()
        if getattr(state, "is_shared", False):
            raw_metadata = await state.get(f"call_metadata:{call_sid}")
            metadata = decode_phi_payload(raw_metadata, label="call metadata")
            if metadata is not None:
                call_metadata[call_sid] = metadata
            return metadata
    except Exception as exc:
        logger.warning("[{cs}] Redis metadata lookup failed: {err}", cs=call_sid, err=str(exc))
    return None


async def mark_ws_token_consumed(call_sid: str, metadata: dict) -> None:
    """Mark the WebSocket admission token as consumed without expiring the call."""
    metadata["ws_token_consumed"] = True
    metadata["ws_token_consumed_at"] = time.time()
    call_metadata[call_sid] = metadata
    await _persist_metadata(call_sid, metadata)


async def _cleanup_metadata(call_sid: str) -> dict | None:
    """Remove metadata from local dict and Redis."""
    metadata = call_metadata.pop(call_sid, None)
    try:
        from lib.redis_client import get_shared_state
        state = get_shared_state()
        if getattr(state, "is_shared", False):
            if metadata is None:
                # May be on a different instance — try Redis
                from lib.shared_state_phi import decode_phi_payload
                metadata = decode_phi_payload(
                    await state.get(f"call_metadata:{call_sid}"),
                    label="call metadata",
                )
            await state.delete(f"call_metadata:{call_sid}")
    except Exception:
        pass
    return metadata


def _no_phi_unavailable_twiml() -> Response:
    """Return a safe TwiML hangup without revealing account or senior state."""
    twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry, Donna is not available for this number right now. Goodbye.</Say>
    <Hangup/>
</Response>"""
    return Response(content=twiml, media_type="text/xml")


def _json_dict(value) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            import json
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


def _senior_is_inactive(senior: dict | None) -> bool:
    if not senior:
        return False
    return senior.get("is_active") is False or senior.get("isActive") is False


def _parse_db_timestamp(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            return None
    else:
        return None

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _cached_news_context_from_senior(senior: dict, *, max_age_hours: int = 36) -> str | None:
    """Return selected cached news only when the daily cache is fresh."""
    raw_cached_news = senior.get("cached_news") or senior.get("cachedNews")
    if not raw_cached_news:
        return None

    updated_at = _parse_db_timestamp(
        senior.get("cached_news_updated_at") or senior.get("cachedNewsUpdatedAt")
    )
    sid = str(senior.get("id", ""))[:8]
    if not updated_at:
        logger.warning("[News] Cached news has no freshness timestamp; skipping senior={sid}", sid=sid)
        return None

    timezone_name = senior.get("timezone") or "America/New_York"
    try:
        senior_tz = ZoneInfo(timezone_name)
    except Exception:
        senior_tz = ZoneInfo("America/New_York")
    if updated_at.astimezone(senior_tz).date() != datetime.now(senior_tz).date():
        logger.warning("[News] Cached news not from today; skipping senior={sid}", sid=sid)
        return None

    age = datetime.now(timezone.utc) - updated_at
    if age > timedelta(hours=max_age_hours):
        logger.warning(
            "[News] Cached news stale; skipping senior={sid} age_hours={age}",
            sid=sid,
            age=round(age.total_seconds() / 3600, 1),
        )
        return None

    try:
        from services.news import select_stories_for_call
        return select_stories_for_call(
            raw_cached_news,
            interests=senior.get("interests"),
            interest_scores=senior.get("interest_scores"),
            count=3,
        )
    except Exception:
        return raw_cached_news


async def _hydrate_senior_call_context(
    *,
    senior: dict,
    call_sid: str,
    is_outbound: bool,
    memory_context=None,
    pre_generated_greeting=None,
    news_context=None,
    recent_turns=None,
    previous_calls_summary=None,
    todays_context=None,
    last_call_analysis=None,
    call_settings=None,
    caregiver_notes_content=None,
) -> dict:
    """Load PHI-bearing call context for any active known senior.

    Node-created outbound calls cross a process boundary before Pipecat answers
    Twilio. Hydrating here makes manual and welfare calls independent of Node's
    in-memory prefetch maps.
    """
    senior_id = senior["id"]

    tasks: list[tuple[str, object]] = []
    if memory_context is None:
        from services.memory import build_context
        tasks.append(("memory_context", build_context(senior_id, None, senior)))
    if caregiver_notes_content is None:
        from services.caregivers import get_pending_notes
        tasks.append(("caregiver_notes_content", get_pending_notes(senior_id)))

    if tasks:
        results = await asyncio.gather(*(task for _, task in tasks), return_exceptions=True)
        for (name, _), result in zip(tasks, results):
            if isinstance(result, Exception):
                logger.error("[{cs}] Context fetch failed: {name}: {err}", cs=call_sid, name=name, err=str(result))
                if name == "caregiver_notes_content":
                    caregiver_notes_content = []
            elif name == "memory_context":
                memory_context = result
            elif name == "caregiver_notes_content":
                caregiver_notes_content = result or []

    if news_context is None:
        news_context = _cached_news_context_from_senior(senior)

    snapshot = senior.get("call_context_snapshot")
    if isinstance(snapshot, str):
        try:
            import json
            snapshot = json.loads(snapshot)
        except Exception:
            snapshot = None

    if snapshot:
        last_call_analysis = last_call_analysis if last_call_analysis is not None else snapshot.get("last_call_analysis")
        previous_calls_summary = previous_calls_summary if previous_calls_summary is not None else snapshot.get("recent_summaries")
        recent_turns = recent_turns if recent_turns is not None else snapshot.get("recent_turns")
        todays_context = todays_context if todays_context is not None else snapshot.get("todays_context")
        logger.info(
            "[{cs}] Using senior call snapshot (updated {ts})",
            cs=call_sid,
            ts=snapshot.get("snapshot_updated_at", "?"),
        )
    elif (
        last_call_analysis is None
        and previous_calls_summary is None
        and recent_turns is None
        and todays_context is None
    ):
        logger.info("[{cs}] No senior snapshot, fetching call history individually", cs=call_sid)
        from services.call_analysis import get_latest_analysis
        from services.conversations import get_recent_summaries, get_recent_turns
        from services.daily_context import get_todays_context, format_todays_context

        senior_tz = senior.get("timezone", "America/New_York")
        analysis_result, summaries_result, turns_result, today_result = await asyncio.gather(
            get_latest_analysis(senior_id, senior_tz),
            get_recent_summaries(senior_id, 3, senior_tz),
            get_recent_turns(senior_id, timezone_name=senior_tz),
            get_todays_context(senior_id, senior_tz),
            return_exceptions=True,
        )
        if not isinstance(analysis_result, Exception):
            last_call_analysis = analysis_result
        if not isinstance(summaries_result, Exception):
            previous_calls_summary = summaries_result
        if not isinstance(turns_result, Exception):
            recent_turns = turns_result
        if not isinstance(today_result, Exception):
            todays_context = format_todays_context(today_result)

    if call_settings is None:
        from services.seniors import DEFAULT_CALL_SETTINGS
        call_settings = {
            **DEFAULT_CALL_SETTINGS,
            **_json_dict(senior.get("call_settings") or {}),
        }

    if not pre_generated_greeting:
        try:
            analysis_data = _json_dict(last_call_analysis or {})
            call_quality = _json_dict(analysis_data.get("call_quality") or {})
            if is_outbound:
                from services.greetings import get_greeting
                greeting_result = get_greeting(
                    senior_name=senior.get("name", ""),
                    timezone=senior.get("timezone"),
                    interests=senior.get("interests"),
                    last_call_summary=previous_calls_summary or analysis_data.get("summary"),
                    senior_id=senior_id,
                    news_context=news_context,
                    interest_scores=senior.get("interest_scores"),
                    last_call_sentiment=(
                        analysis_data.get("sentiment")
                        or analysis_data.get("mood")
                        or call_quality.get("rapport")
                    ),
                    last_call_engagement=analysis_data.get("engagement_score"),
                    followup_chance=(call_settings or {}).get("greeting_followup_chance", 0.6),
                )
                pre_generated_greeting = greeting_result.get("greeting", "")
            else:
                from services.greetings import get_inbound_greeting
                greeting_result = get_inbound_greeting(
                    senior_name=senior.get("name", ""),
                    senior_id=senior_id,
                )
                pre_generated_greeting = greeting_result.get("greeting", "")
        except Exception as e:
            logger.error("[{cs}] Greeting generation failed: {err}", cs=call_sid, err=str(e))

    caregiver_notes_content = caregiver_notes_content or []

    return {
        "memory_context": memory_context,
        "pre_generated_greeting": pre_generated_greeting,
        "news_context": news_context,
        "recent_turns": recent_turns,
        "previous_calls_summary": previous_calls_summary,
        "todays_context": todays_context,
        "last_call_analysis": last_call_analysis,
        "call_settings": call_settings,
        "has_caregiver_notes": bool(caregiver_notes_content),
        "caregiver_notes_content": caregiver_notes_content,
    }


@router.post("/voice/answer", dependencies=[Depends(verify_twilio_signature)])
async def voice_answer(request: Request):
    """Twilio calls this when a call is answered — returns TwiML pointing to WebSocket."""
    request_started_at = time.time()

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
    call_type_hint = (request.query_params.get("call_type") or "").lower()

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
    caregiver_notes_content = None
    previous_calls_summary = None
    todays_context = None

    # 1. Check for reminder call (local/Redis prefetch first, then DB fallback)
    from services.scheduler import get_reminder_context_async, get_prefetched_context
    reminder_context = await get_reminder_context_async(call_sid)
    prefetched = get_prefetched_context(target_phone)

    if reminder_context:
        senior = reminder_context["senior"]
        memory_context = reminder_context.get("memory_context")
        reminder_prompt = reminder_context.get("reminder_prompt")
        call_type = "reminder"
        logger.info("[{cs}] Reminder call (prefetched context)", cs=call_sid)
    elif is_outbound:
        # Outbound call — check DB for reminder delivery (Node.js scheduler)
        from services.reminder_delivery import (
            get_reminder_by_call_sid,
            wait_for_reminder_by_call_sid,
            format_reminder_prompt as fmt_prompt,
        )
        from services.seniors import find_by_phone
        if call_type_hint == "reminder":
            reminder_row = await wait_for_reminder_by_call_sid(call_sid)
        else:
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
        from services.seniors import find_any_by_phone, find_by_phone
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

            # --- News: read fresh DB cache only (pre-cached daily; no live fetch here) ---
            import json as _json
            news_context = _cached_news_context_from_senior(senior)

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
                senior_tz = senior.get("timezone", "America/New_York")
                last_call_analysis = await get_latest_analysis(senior["id"], senior_tz)
                previous_calls_summary = await get_recent_summaries(senior["id"], 3, senior_tz)
                recent_turns = await get_recent_turns(senior["id"], timezone_name=senior_tz)
                raw_ctx = await get_todays_context(senior["id"], senior_tz)
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
            inactive_match = await find_any_by_phone(target_phone)
            if _senior_is_inactive(inactive_match):
                logger.warning("[{cs}] Inactive senior phone matched; using no-PHI unavailable path", cs=call_sid)
                return _no_phi_unavailable_twiml()

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

    if is_outbound and senior is None and prospect is None:
        logger.warning("[{cs}] Outbound call has no active senior match; using no-PHI unavailable path", cs=call_sid)
        return _no_phi_unavailable_twiml()

    if _senior_is_inactive(senior):
        logger.warning("[{cs}] Inactive senior context rejected; using no-PHI unavailable path", cs=call_sid)
        return _no_phi_unavailable_twiml()

    # Load remaining context for outbound paths (reminder/prefetched).
    # A common hydration pass below fills generic outbound calls too.
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

    if senior and not prospect:
        hydrated = await _hydrate_senior_call_context(
            senior=senior,
            call_sid=call_sid,
            is_outbound=is_outbound,
            memory_context=memory_context,
            pre_generated_greeting=pre_generated_greeting,
            news_context=news_context,
            recent_turns=recent_turns,
            previous_calls_summary=previous_calls_summary,
            todays_context=todays_context,
            last_call_analysis=last_call_analysis,
            call_settings=call_settings,
            caregiver_notes_content=caregiver_notes_content,
        )
        memory_context = hydrated["memory_context"]
        pre_generated_greeting = hydrated["pre_generated_greeting"]
        news_context = hydrated["news_context"]
        recent_turns = hydrated["recent_turns"]
        previous_calls_summary = hydrated["previous_calls_summary"]
        todays_context = hydrated["todays_context"]
        last_call_analysis = hydrated["last_call_analysis"]
        call_settings = hydrated["call_settings"]
        has_caregiver_notes = hydrated["has_caregiver_notes"]
        caregiver_notes_content = hydrated["caregiver_notes_content"]

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
    ws_token_expires_at = time.time() + 300
    context_ready_at = time.time()
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
            "ws_token_expires_at": ws_token_expires_at,
            "ws_token_consumed": False,
            "_trace_start_time": request_started_at,
            "_voice_answer_started_at": request_started_at,
            "_voice_answer_context_ready_at": context_ready_at,
        }

    voice_answer_completed_at = time.time()
    call_metadata[call_sid]["_voice_answer_completed_at"] = voice_answer_completed_at
    call_metadata[call_sid]["_voice_answer_context_ms"] = round(
        (context_ready_at - request_started_at) * 1000
    )
    call_metadata[call_sid]["_voice_answer_total_ms"] = round(
        (voice_answer_completed_at - request_started_at) * 1000
    )

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
    base_url = get_pipecat_public_url()
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


@router.post("/voice/status", dependencies=[Depends(verify_twilio_signature)])
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
        from services.scheduler import clear_reminder_context_async
        await clear_reminder_context_async(call_sid)

        if metadata:
            logger.info("[{cs}] Cleaned up call metadata", cs=call_sid)

    return Response(status_code=200)
