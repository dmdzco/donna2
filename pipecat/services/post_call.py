"""Post-call processing — runs after the Twilio client disconnects.

Orchestrates: conversation completion, call analysis (Gemini Flash),
memory extraction, daily context save, reminder cleanup, and cache clearing.

Extracted from bot.py to keep the pipeline assembly module focused.
"""

from __future__ import annotations

import asyncio

from loguru import logger


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

    # Collect transcript from session
    transcript = session_state.get("_transcript", [])
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
        if not (transcript and senior):
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
        if not (transcript and senior_id):
            return
        from services.memory import extract_from_conversation
        if isinstance(transcript, list):
            formatted = "\n".join(
                f"{t.get('role', 'unknown')}: {t.get('content', '')}"
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
            from services.scheduler import clear_reminder_context
            clear_reminder_context(call_sid)

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

    logger.info("[{cs}] Post-call processing complete", cs=call_sid)


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

    transcript = session_state.get("_transcript", [])

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

    # 2. Extract and store memories with prospect_id
    try:
        if transcript and prospect_id:
            from services.memory import extract_from_conversation
            if isinstance(transcript, list):
                formatted_transcript = "\n".join(
                    f"{turn.get('role', 'unknown')}: {turn.get('content', '')}"
                    for turn in transcript
                    if isinstance(turn, dict)
                )
            else:
                formatted_transcript = str(transcript)
            await extract_from_conversation(
                None, formatted_transcript, conversation_id or "unknown",
                prospect_id=prospect_id,
            )
    except Exception as e:
        logger.error("[{cs}] Onboarding post-call step 2 (memory extraction) failed: {err}",
                     cs=call_sid, err=str(e))

    # 3. Update prospect record with learned info
    try:
        if prospect_id:
            from services.prospects import update_after_call
            # Collect what we learned from the conversation tracker
            update_data: dict = {}

            # The prospect fields (learned_name, relationship, loved_one_name)
            # are already updated in real-time by save_prospect_detail tool handler.
            # Here we just increment call_count and update last_call_at.
            await update_after_call(prospect_id, update_data)
    except Exception as e:
        logger.error("[{cs}] Onboarding post-call step 3 (update prospect) failed: {err}",
                     cs=call_sid, err=str(e))

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
        "NODE_API_URL", "https://donna-production.up.railway.app"
    )
    api_key = os.environ.get("DONNA_API_KEY", "")

    if not api_key:
        logger.warning("DONNA_API_KEY not set, skipping caregiver notification")
        return

    headers = {"X-API-Key": api_key, "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        # Trigger call_completed notification
        try:
            await client.post(
                f"{node_url}/api/notifications/trigger",
                json={
                    "event_type": "call_completed",
                    "senior_id": senior_id,
                    "data": {
                        "call_sid": call_sid,
                        "duration_seconds": duration,
                        "summary": analysis.get("summary"),
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
