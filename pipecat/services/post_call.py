"""Post-call processing — runs after the Twilio client disconnects.

Orchestrates: conversation completion, call analysis (Gemini Flash),
memory extraction, daily context save, reminder cleanup, and cache clearing.

Extracted from bot.py to keep the pipeline assembly module focused.
"""

from __future__ import annotations

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

    # Collect transcript from session
    transcript = session_state.get("_transcript", [])

    analysis = None

    # Each step has its own try/except so a failure in one step
    # (e.g. Gemini outage) doesn't prevent the others from running.

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
        logger.error("[{cs}] Post-call step 1 (complete conversation) failed: {err}", cs=call_sid, err=str(e))

    # 2. Run call analysis (Gemini Flash)
    try:
        if transcript and senior:
            from services.call_analysis import analyze_completed_call, save_call_analysis
            analysis = await analyze_completed_call(transcript, senior)
            if conversation_id and senior_id:
                await save_call_analysis(conversation_id, senior_id, analysis)

            # Persist summary to conversations table so get_recent_summaries() works
            summary = analysis.get("summary") if analysis else None
            if summary and summary != "Analysis unavailable":
                from services.conversations import update_summary
                await update_summary(call_sid, summary)
                logger.info("[{cs}] Persisted call summary ({n} chars)", cs=call_sid, n=len(summary))
    except Exception as e:
        logger.error("[{cs}] Post-call step 2 (call analysis) failed: {err}", cs=call_sid, err=str(e))

    # 3. Extract and store memories
    try:
        if transcript and senior_id:
            from services.memory import extract_from_conversation
            # Format transcript list into readable text for LLM extraction
            if isinstance(transcript, list):
                formatted_transcript = "\n".join(
                    f"{turn.get('role', 'unknown')}: {turn.get('content', '')}"
                    for turn in transcript
                    if isinstance(turn, dict)
                )
            else:
                formatted_transcript = str(transcript)
            await extract_from_conversation(
                senior_id, formatted_transcript, conversation_id or "unknown"
            )
    except Exception as e:
        logger.error("[{cs}] Post-call step 3 (memory extraction) failed: {err}", cs=call_sid, err=str(e))

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
                # Update senior dict in session so step 3.6 uses fresh interests
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

    # 5. Handle reminder cleanup
    try:
        reminder_delivery = session_state.get("reminder_delivery")
        if reminder_delivery:
            delivered_set = session_state.get("reminders_delivered", set())
            if not delivered_set:
                from services.reminder_delivery import mark_call_ended_without_acknowledgment
                await mark_call_ended_without_acknowledgment(reminder_delivery["id"])
    except Exception as e:
        logger.error("[{cs}] Post-call step 5 (reminder cleanup) failed: {err}", cs=call_sid, err=str(e))

    # 6. Clear caches (always runs even if earlier steps failed)
    try:
        if senior_id:
            from services.context_cache import clear_cache
            clear_cache(senior_id)
        if call_sid:
            from services.scheduler import clear_reminder_context
            clear_reminder_context(call_sid)
    except Exception as e:
        logger.error("[{cs}] Post-call step 6 (cache clearing) failed: {err}", cs=call_sid, err=str(e))

    logger.info("[{cs}] Post-call processing complete", cs=call_sid)
