"""Donna voice pipeline — Gemini 3.1 Flash Live variant.

Replaces the 3-hop STT->Claude->TTS stack with a single native audio model.

Pipeline:
    Twilio transport.input()
    -> GeminiLiveLLMService (Aoede voice, Gemini 3.1 Flash Live)
    -> ConversationTrackerProcessor (transcript for post-call)
    -> transport.output()

Called from bot.py when voice_backend flag == "gemini_live".
No Director, no Observer, no FlowManager, no separate STT/TTS.
"""

from __future__ import annotations

import asyncio
import os
import time

from loguru import logger

from pipecat.frames.frames import EndFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask

try:
    from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService
except ImportError as e:
    raise ImportError(
        "GeminiLiveLLMService not available. "
        "Add 'google' to pipecat-ai extras in pyproject.toml and redeploy."
    ) from e

from processors.conversation_tracker import ConversationTrackerProcessor
from services.post_call import run_post_call


def _build_system_prompt(session_state: dict) -> str:
    """Build the single-phase system prompt for the Gemini Live pipeline."""
    from prompts import BASE_SYSTEM_PROMPT

    sections = [BASE_SYSTEM_PROMPT]

    senior = session_state.get("senior") or {}
    first_name = senior.get("name", "").split()[0] if senior.get("name") else "there"

    memory = session_state.get("memory_context")
    if memory:
        sections.append(f"MEMORIES ABOUT {first_name.upper()}:\n{memory}")

    todays_ctx = session_state.get("todays_context")
    if todays_ctx:
        sections.append(f"TODAY'S CONTEXT:\n{todays_ctx}")

    recent_turns = session_state.get("recent_turns")
    if recent_turns:
        sections.append(f"RECENT CONVERSATION HISTORY:\n{recent_turns}")

    news = session_state.get("news_context")
    if news:
        sections.append(f"NEWS FOR THIS CALL:\n{news}")

    notes = session_state.get("_caregiver_notes_content") or []
    if notes:
        formatted = "\n".join(
            f"- {n.get('content', '') if isinstance(n, dict) else str(n)}"
            for n in notes if (n.get("content") if isinstance(n, dict) else n)
        )
        sections.append(f"CAREGIVER NOTES (share naturally):\n{formatted}")

    reminder_prompt = session_state.get("reminder_prompt")
    if reminder_prompt:
        sections.append(f"REMINDERS TO DELIVER:\n{reminder_prompt}")

    is_outbound = session_state.get("is_outbound", True)
    if is_outbound:
        opening = f"START THE CALL: Greet {first_name} warmly and ask how they're doing."
    else:
        opening = f"INBOUND CALL: {first_name} is calling you. Respond warmly to their greeting."

    sections.append(f"""{opening}

CONVERSATION STYLE: Natural, warm dialogue. Weave in reminders early if present. Reference memories naturally — "I remember you mentioned..." Don't dump everything at once.

TOOLS AVAILABLE:
- search_memories: Search their memory bank when they mention something from the past
- web_search: Look up current info. Say a filler BEFORE calling ("Let me find out for you")
- save_important_detail: Save new things they share (health changes, family news, interests)
- mark_reminder_acknowledged: Mark reminders as delivered after they respond
- end_call: Call ONLY when the senior says goodbye and is done. Say your goodbye FIRST, then call this tool.

ENDING THE CALL: When the senior says goodbye or wants to go, say a warm brief farewell and IMMEDIATELY call end_call. Never let the call drift after goodbyes — the senior will hear silence.""")

    return "\n\n".join(sections)


async def _safe_post_call(session_state: dict, conversation_tracker, elapsed: int, call_sid: str):
    try:
        await run_post_call(session_state, conversation_tracker, elapsed)
    except Exception as e:
        logger.error("[{cs}] Gemini post-call failed: {err}", cs=call_sid, err=str(e))


async def run_gemini_pipeline(
    session_state: dict,
    transport,
    start_time: float,
) -> None:
    """Run the Gemini Live voice pipeline.

    Args:
        session_state: Pre-populated call context (same as bot.py uses)
        transport: FastAPIWebsocketTransport already created by bot.py
        start_time: Call start time.time() for elapsed calculation
    """
    call_sid = session_state.get("call_sid", "unknown")
    logger.info("[{cs}] Starting Gemini Live pipeline (Aoede voice)", cs=call_sid)

    system_prompt = _build_system_prompt(session_state)
    logger.debug("[{cs}] Gemini system prompt: {n} chars", cs=call_sid, n=len(system_prompt))

    # task_ref: mutable container so end_call handler can queue EndFrame
    task_ref = [None]

    from flows.gemini_tools import _build_gemini_tools, register_gemini_tools

    llm = GeminiLiveLLMService(
        api_key=os.getenv("GOOGLE_API_KEY", ""),
        model="models/gemini-3.1-flash-live-preview",
        voice_id="Aoede",
        system_instruction=system_prompt,
        tools=_build_gemini_tools(session_state),
    )

    # Register tool handlers before pipeline starts
    register_gemini_tools(llm, session_state, task_ref)

    conversation_tracker = ConversationTrackerProcessor(session_state=session_state)
    session_state["_conversation_tracker"] = conversation_tracker

    pipeline = Pipeline([
        transport.input(),
        llm,
        conversation_tracker,
        transport.output(),
    ])

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            allow_interruptions=True,
            enable_metrics=True,
            enable_usage_metrics=True,
            audio_in_sample_rate=8000,
            audio_out_sample_rate=8000,
        ),
    )

    # Wire task_ref so end_call tool can trigger EndFrame
    task_ref[0] = task

    @transport.event_handler("on_client_disconnected")
    async def on_disconnected(transport_ref, websocket_ref):
        elapsed = round(time.time() - start_time)
        logger.info("[{cs}] Gemini: client disconnected after {s}s", cs=call_sid, s=elapsed)
        session_state.setdefault("_end_reason", "user_hangup")
        conversation_tracker.flush()
        await task.queue_frame(EndFrame())
        asyncio.create_task(_safe_post_call(session_state, conversation_tracker, elapsed, call_sid))

    runner = PipelineRunner(handle_sigint=False)
    logger.info("[{cs}] Gemini pipeline ready, running...", cs=call_sid)
    await runner.run(task)
    logger.info("[{cs}] Gemini pipeline ended", cs=call_sid)
