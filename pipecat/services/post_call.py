"""Post-call processing — runs after the Twilio client disconnects.

Orchestrates: conversation completion, call analysis (Gemini Flash),
memory extraction, daily context save, reminder cleanup, and cache clearing.

Extracted from bot.py to keep the pipeline assembly module focused.
"""

from __future__ import annotations

import asyncio

from loguru import logger


def _transcript_has_content(transcript) -> bool:
    if isinstance(transcript, list):
        return any(isinstance(t, dict) and t.get("content") for t in transcript)
    if isinstance(transcript, str):
        return bool(transcript.strip())
    return bool(transcript)


async def _get_post_call_transcript(
    session_state: dict,
    conversation_tracker,
):
    """Return full transcript, falling back to persisted Neon draft."""
    call_sid = session_state.get("call_sid", "unknown")

    if conversation_tracker:
        try:
            conversation_tracker.flush()
        except Exception as e:
            logger.warning("[{cs}] Transcript flush failed: {err}", cs=call_sid, err=str(e))
        if hasattr(conversation_tracker, "flush_pending_persistence"):
            await conversation_tracker.flush_pending_persistence()

    transcript = session_state.get("_full_transcript") or session_state.get("_transcript") or []
    if _transcript_has_content(transcript):
        return transcript

    if not call_sid or call_sid == "unknown":
        return transcript

    try:
        from services.conversations import get_transcript_by_call_sid

        persisted = await get_transcript_by_call_sid(call_sid)
        if _transcript_has_content(persisted):
            if isinstance(persisted, list):
                session_state["_full_transcript"] = persisted
                session_state["_transcript"] = persisted[-40:]
            logger.info(
                "[{cs}] Loaded persisted transcript fallback (turns={turns}, chars={chars})",
                cs=call_sid,
                turns=len(persisted) if isinstance(persisted, list) else 0,
                chars=len(persisted) if isinstance(persisted, str) else 0,
            )
            return persisted
    except Exception as e:
        logger.error("[{cs}] Persisted transcript fallback failed: {err}", cs=call_sid, err=str(e))

    return transcript


async def run_post_call(
    session_state: dict,
    conversation_tracker,
    duration_seconds: int,
) -> None:
    """Run post-call processing: analysis, memory extraction, DB updates.

    Args:
        session_state: Call session dict with senior_id, call_sid, transcript, etc.
        conversation_tracker: ConversationTrackerProcessor with .state attribute.
        duration_seconds: Total call duration.
    """
    call_sid = session_state.get("call_sid", "unknown")
    conversation_id = session_state.get("conversation_id")
    senior_id = session_state.get("senior_id")
    senior = session_state.get("senior")

    logger.info("[{cs}] Running post-call processing", cs=call_sid)

    # Route onboarding calls to a separate post-call flow
    if session_state.get("call_type") == "onboarding":
        return await _run_onboarding_post_call(
            session_state, conversation_tracker, duration_seconds
        )

    # Collect full transcript from session, falling back to persisted Neon draft.
    transcript = await _get_post_call_transcript(session_state, conversation_tracker)
    analysis = None

    # Step 1: Complete conversation (must run first — prerequisite for all)
    try:
        if conversation_id:
            from services.conversations import complete
            await complete(call_sid, {
                "duration_seconds": duration_seconds,
                "status": "completed",
                "transcript": transcript,
            })
    except Exception as e:
        logger.error("[{cs}] Post-call step 1 (complete conversation) failed: {err}", cs=call_sid, err=str(e))

    # --- Parallel group: independent steps (2, 3, 5, 6) ---
    async def _step2_analysis():
        from lib.growthbook import is_on
        if not (_transcript_has_content(transcript) and senior and is_on("post_call_analysis_enabled", session_state)):
            return None
        from services.call_analysis import analyze_completed_call, save_call_analysis
        result = await analyze_completed_call(transcript, senior)
        if conversation_id and senior_id:
            await save_call_analysis(conversation_id, senior_id, result)
        summary = result.get("summary") if result else None
        if summary and summary != "Analysis unavailable":
            from services.conversations import update_summary
            await update_summary(call_sid, summary)
            logger.info("[{cs}] Persisted call summary ({n} chars)", cs=call_sid, n=len(summary))
        return result

    async def _step3_memory():
        if not (_transcript_has_content(transcript) and senior_id):
            return
        from services.memory import extract_from_conversation
        if isinstance(transcript, list):
            def _text(content):
                if content is None:
                    return ""
                if isinstance(content, str):
                    return content
                if isinstance(content, list):
                    return " ".join(
                        b.get("text", "") for b in content
                        if isinstance(b, dict) and b.get("type") == "text"
                    )
                return str(content)

            formatted = "\n".join(
                f"{t.get('role', 'unknown')}: {_text(t.get('content'))}"
                for t in transcript if isinstance(t, dict)
            )
        else:
            formatted = str(transcript)
        await extract_from_conversation(senior_id, formatted, conversation_id or "unknown")

    async def _step5_reminder():
        reminder_delivery = session_state.get("reminder_delivery")
        if reminder_delivery:
            delivered_set = session_state.get("reminders_delivered", set())
            if not delivered_set:
                from services.reminder_delivery import mark_call_ended_without_acknowledgment
                await mark_call_ended_without_acknowledgment(reminder_delivery["id"])

    async def _step6_cache():
        if senior_id:
            from services.context_cache import clear_cache
            clear_cache(senior_id)
        if call_sid:
            from services.scheduler import clear_reminder_context_async
            await clear_reminder_context_async(call_sid)

    results = await asyncio.gather(
        _step2_analysis(),
        _step3_memory(),
        _step5_reminder(),
        _step6_cache(),
        return_exceptions=True,
    )

    # Extract analysis result (step 2)
    analysis_result = results[0]
    if isinstance(analysis_result, Exception):
        logger.error("[{cs}] Post-call step 2 (call analysis) failed: {err}", cs=call_sid, err=str(analysis_result))
    else:
        analysis = analysis_result
    for i, (step_name, r) in enumerate(zip(
        ["call analysis", "memory extraction", "reminder cleanup", "cache clearing"],
        results,
    )):
        if isinstance(r, Exception) and i > 0:  # step 2 already logged above
            logger.error("[{cs}] Post-call ({step}) failed: {err}", cs=call_sid, step=step_name, err=str(r))

    # --- Sequential group: steps that depend on analysis ---

    # 2.5 Trigger caregiver notifications
    try:
        if analysis and senior_id:
            await _trigger_caregiver_notification(
                senior_id, call_sid, analysis, duration_seconds
            )
    except Exception as e:
        logger.error("[{cs}] Post-call step 2.5 (caregiver notification) failed: {err}", cs=call_sid, err=str(e))

    # 3.5 Discover new interests from the call
    try:
        if senior_id and senior and analysis:
            from services.interest_discovery import discover_new_interests, add_interests_to_senior
            tracker_topics = (
                conversation_tracker.state.topics_discussed
                if conversation_tracker else []
            )
            existing_interests = senior.get("interests") or []
            new_interests = discover_new_interests(
                existing_interests, analysis, tracker_topics
            )
            if new_interests:
                updated = await add_interests_to_senior(
                    senior_id, new_interests, existing_interests
                )
                senior["interests"] = updated
                logger.info(
                    "[{cs}] Discovered {n} new interests: {new}",
                    cs=call_sid, n=len(new_interests), new=new_interests,
                )
    except Exception as e:
        logger.error("[{cs}] Post-call step 3.5 (interest discovery) failed: {err}", cs=call_sid, err=str(e))

    # 3.6 Compute and persist interest engagement scores
    try:
        if senior_id and senior:
            from services.interest_discovery import compute_interest_scores, update_interest_scores
            interests = senior.get("interests") or []
            if interests:
                scores = await compute_interest_scores(senior_id, interests)
                await update_interest_scores(senior_id, scores)
                logger.info("[{cs}] Updated interest scores", cs=call_sid)
    except Exception as e:
        logger.error("[{cs}] Post-call step 3.6 (interest scores) failed: {err}", cs=call_sid, err=str(e))

    # 4. Save daily context
    try:
        if senior_id and conversation_tracker:
            from services.daily_context import save_call_context
            senior = session_state.get("senior") or {}
            await save_call_context(
                senior_id=senior_id,
                call_sid=call_sid,
                data={
                    "topics_discussed": conversation_tracker.state.topics_discussed,
                    "advice_given": conversation_tracker.state.advice_given,
                    "reminders_delivered": list(
                        session_state.get("reminders_delivered", set())
                    ),
                    "timezone": senior.get("timezone", "America/New_York"),
                    "summary": analysis.get("summary") if analysis else None,
                },
            )
    except Exception as e:
        logger.error("[{cs}] Post-call step 4 (daily context) failed: {err}", cs=call_sid, err=str(e))

    # 7. Rebuild call context snapshot for next call
    try:
        if senior_id:
            from services.call_snapshot import build_snapshot, save_snapshot
            tz = (senior or {}).get("timezone", "America/New_York")
            snapshot = await build_snapshot(senior_id, tz, analysis)
            await save_snapshot(senior_id, snapshot)
    except Exception as e:
        logger.error("[{cs}] Post-call step 7 (call snapshot) failed: {err}", cs=call_sid, err=str(e))

    # 8. Persist call metrics for observability
    try:
        await _persist_call_metrics(session_state, duration_seconds, conversation_tracker)
    except Exception as e:
        logger.error("[{cs}] Post-call step 8 (call metrics) failed: {err}", cs=call_sid, err=str(e))

    logger.info("[{cs}] Post-call processing complete", cs=call_sid)


async def _persist_call_metrics(
    session_state: dict,
    duration_seconds: int,
    conversation_tracker,
) -> None:
    """Write per-call metrics to call_metrics table for observability."""
    import time
    from db.client import execute
    from lib.circuit_breaker import get_breaker_states

    call_sid = session_state.get("call_sid")
    senior_id = session_state.get("senior_id")
    call_type = session_state.get("call_type", "check-in")

    # Finalize the last phase duration
    phase_durations = session_state.get("_phase_durations", {})
    current_phase = session_state.get("_current_phase")
    phase_start = session_state.get("_phase_start_time")
    if current_phase and phase_start:
        phase_durations[current_phase] = round(time.time() - phase_start)

    # Gather accumulated metrics from MetricsLogger
    cm = session_state.get("_call_metrics", {})
    llm_vals = cm.get("llm_ttfb_values", [])
    tts_vals = cm.get("tts_ttfb_values", [])
    turn_vals = cm.get("turn_latency_values", [])

    latency = {}
    if llm_vals:
        latency["llm_ttfb_avg_ms"] = round(sum(llm_vals) / len(llm_vals))
    if tts_vals:
        latency["tts_ttfb_avg_ms"] = round(sum(tts_vals) / len(tts_vals))
    if turn_vals:
        latency["turn_avg_ms"] = round(sum(turn_vals) / len(turn_vals))

    token_usage = cm.get("token_usage", {})
    if cm.get("tts_characters"):
        token_usage["tts_characters"] = cm["tts_characters"]

    turn_count = cm.get("turn_count", 0)
    tools_used = session_state.get("_tools_used", [])
    breaker_states = get_breaker_states()

    # Determine end_reason from session state
    end_reason = session_state.get("_end_reason", "unknown")

    import json
    await execute(
        """INSERT INTO call_metrics
           (call_sid, senior_id, call_type, duration_seconds, end_reason,
            turn_count, phase_durations, latency, breaker_states,
            tools_used, token_usage, error_count)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)""",
        call_sid,
        senior_id,
        call_type,
        duration_seconds,
        end_reason,
        turn_count,
        json.dumps(phase_durations) if phase_durations else None,
        json.dumps(latency) if latency else None,
        json.dumps(breaker_states) if breaker_states else None,
        tools_used or None,
        json.dumps(token_usage) if any(token_usage.values()) else None,
        0,
    )
    logger.info(
        "[{cs}] Call metrics persisted (turns={t}, duration={d}s)",
        cs=call_sid, t=turn_count, d=duration_seconds,
    )


def _format_transcript(transcript: list | str) -> str:
    """Convert transcript (list of message dicts or string) to readable text."""
    if isinstance(transcript, str):
        return transcript
    if not isinstance(transcript, list):
        return str(transcript)

    def _text(content):
        if content is None:
            return ""
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return " ".join(
                b.get("text", "") for b in content
                if isinstance(b, dict) and b.get("type") == "text"
                and not b.get("text", "").startswith("[EPHEMERAL")
                and not b.get("text", "").startswith("[Internal")
            )
        return str(content)

    lines = []
    for turn in transcript:
        if not isinstance(turn, dict):
            continue
        role = turn.get("role", "unknown")
        text = _text(turn.get("content")).strip()
        if text and not text.startswith("[EPHEMERAL") and not text.startswith("[Internal"):
            label = "Donna" if role == "assistant" else "Caller"
            lines.append(f"{label}: {text}")
    return "\n".join(lines)


async def _summarize_onboarding_call(transcript: list | str, call_sid: str) -> str | None:
    """Summarize an onboarding call transcript into a brief context for the next call.

    Uses Gemini Flash for speed and cost. Returns a short paragraph or None on failure.
    """
    import os
    import google.generativeai as genai

    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        logger.warning("[{cs}] No GOOGLE_API_KEY, skipping onboarding summary", cs=call_sid)
        return None

    formatted = _format_transcript(transcript)
    if not formatted or len(formatted) < 50:
        logger.info("[{cs}] Transcript too short for summary", cs=call_sid)
        return None

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.0-flash")

    prompt = (
        "Summarize this onboarding phone call between Donna (an AI companion service for seniors) "
        "and a prospective caller. Extract:\n"
        "- Caller's name (if given)\n"
        "- Who they're calling about (parent, grandparent, themselves) and that person's name\n"
        "- What they learned about Donna\n"
        "- Any concerns or questions they raised\n"
        "- Any details about the senior (interests, health, living situation)\n"
        "- Whether they seemed interested in signing up\n\n"
        "Write 2-4 sentences as a brief context note that Donna can reference on the next call. "
        "Be specific — use names and details, not vague summaries.\n\n"
        f"TRANSCRIPT:\n{formatted}"
    )

    try:
        response = await model.generate_content_async(
            prompt,
            generation_config=genai.GenerationConfig(
                max_output_tokens=200,
                temperature=0.3,
            ),
        )
        summary = response.text.strip()
        logger.info("[{cs}] Onboarding summary generated ({n} chars)", cs=call_sid, n=len(summary))
        return summary
    except Exception as e:
        logger.error("[{cs}] Onboarding summary failed: {err}", cs=call_sid, err=str(e))
        return None


async def _run_onboarding_post_call(
    session_state: dict,
    conversation_tracker,
    duration_seconds: int,
) -> None:
    """Post-call processing for onboarding (unsubscribed caller) calls.

    Lighter than subscriber post-call: no daily context, interest discovery,
    reminder cleanup, or caregiver notifications.
    """
    call_sid = session_state.get("call_sid", "unknown")
    conversation_id = session_state.get("conversation_id")
    prospect_id = session_state.get("prospect_id")

    logger.info("[{cs}] Running onboarding post-call processing", cs=call_sid)

    transcript = await _get_post_call_transcript(session_state, conversation_tracker)

    # 1. Complete conversation record
    try:
        if conversation_id:
            from services.conversations import complete
            await complete(call_sid, {
                "duration_seconds": duration_seconds,
                "status": "completed",
                "transcript": transcript,
            })
    except Exception as e:
        logger.error("[{cs}] Onboarding post-call step 1 (complete conversation) failed: {err}",
                     cs=call_sid, err=str(e))

    formatted_transcript = _format_transcript(transcript)

    async def _step2_memory():
        if not (formatted_transcript and prospect_id):
            return
        from services.memory import extract_from_conversation
        await extract_from_conversation(
            None,
            formatted_transcript,
            conversation_id or "unknown",
            prospect_id=prospect_id,
        )

    async def _step3_prospect_update():
        if not prospect_id:
            return

        from services.prospects import extract_prospect_details, update_after_call

        update_data: dict = {}
        if formatted_transcript:
            summary_result, details_result = await asyncio.gather(
                _summarize_onboarding_call(transcript, call_sid),
                extract_prospect_details(formatted_transcript),
                return_exceptions=True,
            )

            if isinstance(summary_result, Exception):
                logger.error(
                    "[{cs}] Onboarding summary failed: {err}",
                    cs=call_sid,
                    err=str(summary_result),
                )
            elif summary_result:
                update_data.setdefault("caller_context", {})["call_summary"] = summary_result
                logger.info(
                    "[{cs}] Stored onboarding call summary ({n} chars)",
                    cs=call_sid,
                    n=len(summary_result),
                )

            if isinstance(details_result, Exception):
                logger.error(
                    "[{cs}] Prospect detail extraction failed: {err}",
                    cs=call_sid,
                    err=str(details_result),
                )
            elif details_result:
                extracted_keys = list(details_result.keys())
                detail_context = details_result.pop("caller_context", None)
                update_data.update(details_result)
                if detail_context:
                    update_data.setdefault("caller_context", {}).update(detail_context)
                logger.info(
                    "[{cs}] Extracted prospect detail fields: {keys}",
                    cs=call_sid,
                    keys=extracted_keys,
                )

        # update_after_call increments call_count once, even if no transcript/details.
        await update_after_call(prospect_id, update_data)

    results = await asyncio.gather(
        _step2_memory(),
        _step3_prospect_update(),
        return_exceptions=True,
    )
    for step_name, result in zip(["memory extraction", "prospect update"], results):
        if isinstance(result, Exception):
            logger.error(
                "[{cs}] Onboarding post-call ({step}) failed: {err}",
                cs=call_sid,
                step=step_name,
                err=str(result),
            )

    logger.info("[{cs}] Onboarding post-call processing complete", cs=call_sid)


async def _trigger_caregiver_notification(
    senior_id: str,
    call_sid: str,
    analysis: dict,
    duration: int,
) -> None:
    """POST to Node.js API to trigger caregiver notifications."""
    import os
    import httpx

    node_url = os.environ.get(
        "NODE_API_URL", "https://donna-api-production-2450.up.railway.app"
    )
    from config import get_service_api_key

    api_key = get_service_api_key("pipecat") or get_service_api_key("notifications") or ""

    if not api_key:
        logger.warning("DONNA_API_KEYS has no pipecat/notifications key, skipping caregiver notification")
        return

    headers = {"X-API-Key": api_key, "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        # Trigger call_completed notification
        try:
            await client.post(
                f"{node_url}/api/notifications/trigger",
                json={
                    "event_type": "call_completed",
                    "senior_id": str(senior_id),
                    "data": {
                        "call_sid": call_sid,
                        "duration_seconds": duration,
                        "summary": analysis.get("summary"),
                        "mood": analysis.get("mood"),
                        "caregiver_sms": analysis.get("caregiver_sms"),
                        "topics": analysis.get("topics_discussed", []),
                        "engagement_score": analysis.get("engagement_score"),
                        "concerns": analysis.get("concerns", []),
                        "positive_observations": analysis.get(
                            "positive_observations", []
                        ),
                    },
                },
                headers=headers,
            )
            logger.info(
                "[{cs}] Triggered call_completed notification", cs=call_sid
            )
        except Exception as e:
            logger.error(
                "[{cs}] call_completed notification failed: {err}",
                cs=call_sid,
                err=str(e),
            )

        # Trigger concern_detected for high-severity concerns
        for concern in analysis.get("concerns") or []:
            if isinstance(concern, dict) and concern.get("severity") == "high":
                try:
                    await client.post(
                        f"{node_url}/api/notifications/trigger",
                        json={
                            "event_type": "concern_detected",
                            "senior_id": senior_id,
                            "data": concern,
                        },
                        headers=headers,
                    )
                    logger.info(
                        "[{cs}] Triggered concern_detected notification",
                        cs=call_sid,
                    )
                except Exception as e:
                    logger.error(
                        "[{cs}] concern_detected notification failed: {err}",
                        cs=call_sid,
                        err=str(e),
                    )
