"""Donna voice pipeline — core bot entry point.

Assembles the full Pipecat pipeline for a single call session:
  Twilio WebSocket → Deepgram STT → Quick Observer → LLM Context →
  Anthropic Claude → Conversation Tracker → Guidance Stripper →
  ElevenLabs TTS → Twilio output

Called once per incoming WebSocket connection from Twilio.
"""

from __future__ import annotations

import asyncio
import os
import time

from deepgram import LiveOptions
from loguru import logger
from starlette.websockets import WebSocket

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import EndFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.runner.utils import parse_telephony_websocket
from pipecat.serializers.twilio import TwilioFrameSerializer
from pipecat.services.anthropic.llm import AnthropicLLMService
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.transports.websocket.fastapi import (
    FastAPIWebsocketTransport,
    FastAPIWebsocketParams,
)
from pipecat_flows import FlowManager

from flows.nodes import build_initial_node
from flows.tools import make_flows_tools
from processors.conversation_director import ConversationDirectorProcessor
from processors.conversation_tracker import ConversationTrackerProcessor
from processors.guidance_stripper import GuidanceStripperProcessor
from processors.metrics_logger import MetricsLoggerProcessor
from processors.quick_observer import QuickObserverProcessor
from services.post_call import run_post_call


async def _safe_post_call(session_state: dict, conversation_tracker, elapsed: int, call_sid: str):
    """Run post-call in background with its own error boundary."""
    try:
        await run_post_call(session_state, conversation_tracker, elapsed)
    except Exception as e:
        logger.error("[{cs}] Background post-call failed: {err}", cs=call_sid, err=str(e))


async def run_bot(websocket: WebSocket, session_state: dict) -> None:
    """Run the Donna voice pipeline for a single call.

    Args:
        websocket: Starlette WebSocket from Twilio.
        session_state: Pre-populated dict with call context:
            - senior_id: str
            - senior: dict (profile)
            - memory_context: str | None
            - greeting: str | None
            - reminder_prompt: str | None
            - reminder_delivery: dict | None
            - reminders_delivered: set
            - conversation_id: str | None
            - call_sid: str | None
            - call_type: str ("check-in" | "reminder")
            - previous_calls_summary: str | None
            - todays_context: str | None
    """
    start_time = time.time()

    # -------------------------------------------------------------------------
    # Parse Twilio WebSocket handshake
    # -------------------------------------------------------------------------
    transport_type, call_data = await parse_telephony_websocket(websocket)
    stream_sid = call_data.get("stream_id", "")
    call_sid = call_data.get("call_id", "") or session_state.get("call_sid", "unknown")
    session_state["call_sid"] = call_sid

    logger.info("[{cs}] Stream connected: {ss} (type={tt})", cs=call_sid, ss=stream_sid, tt=transport_type)

    # Populate session_state from call_metadata (pre-fetched by /voice/answer)
    call_meta = session_state.get("_call_metadata", {})
    metadata = call_meta.get(call_sid, {})
    if metadata:
        # Use `or` assignment — setdefault won't overwrite pre-initialized None values
        session_state["senior"] = session_state.get("senior") or metadata.get("senior")
        session_state["senior_id"] = session_state.get("senior_id") or (metadata.get("senior") or {}).get("id")
        session_state["memory_context"] = session_state.get("memory_context") or metadata.get("memory_context")
        session_state["conversation_id"] = session_state.get("conversation_id") or metadata.get("conversation_id")
        session_state["reminder_prompt"] = session_state.get("reminder_prompt") or metadata.get("reminder_prompt")
        # call_type is pre-initialized to "check-in" (truthy), so `or` won't overwrite.
        # Always take metadata's value when present.
        if metadata.get("call_type"):
            session_state["call_type"] = metadata["call_type"]
        reminder_ctx = metadata.get("reminder_context")
        if reminder_ctx:
            session_state["reminder_delivery"] = session_state.get("reminder_delivery") or reminder_ctx.get("delivery")
        greeting = metadata.get("pre_generated_greeting")
        if greeting:
            session_state["greeting"] = session_state.get("greeting") or greeting
        session_state["previous_calls_summary"] = session_state.get("previous_calls_summary") or metadata.get("previous_calls_summary")
        session_state["recent_turns"] = session_state.get("recent_turns") or metadata.get("recent_turns")
        session_state["todays_context"] = session_state.get("todays_context") or metadata.get("todays_context")
        session_state["news_context"] = session_state.get("news_context") or metadata.get("news_context")
        if "is_outbound" in metadata:
            session_state["is_outbound"] = metadata["is_outbound"]
        logger.info(
            "[{cs}] Populated session: senior={name}, memory={mem_len}ch, greeting={gr}, reminder={rem}",
            cs=call_sid,
            name=(session_state.get("senior") or {}).get("name", "none"),
            mem_len=len(session_state.get("memory_context") or ""),
            gr=bool(session_state.get("greeting")),
            rem=bool(session_state.get("reminder_prompt")),
        )

    # Also merge custom parameters from TwiML <Stream> params
    body = call_data.get("body", {})
    if body.get("senior_id") and not session_state.get("senior_id"):
        session_state["senior_id"] = body["senior_id"]
    if body.get("conversation_id") and not session_state.get("conversation_id"):
        session_state["conversation_id"] = body["conversation_id"]
    if body.get("call_type") and session_state.get("call_type") == "check-in":
        session_state["call_type"] = body["call_type"]

    senior_name = (session_state.get("senior") or {}).get("name", "unknown")
    logger.info("[{cs}] Starting pipeline for {name}", cs=call_sid, name=senior_name)

    # -------------------------------------------------------------------------
    # Transport (Twilio ↔ FastAPI WebSocket)
    # -------------------------------------------------------------------------
    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            add_wav_header=False,
            vad_analyzer=SileroVADAnalyzer(
                params=VADParams(
                    confidence=0.6,
                    stop_secs=1.2,
                    min_volume=0.5,
                ),
            ),
            serializer=TwilioFrameSerializer(
                stream_sid=stream_sid,
                call_sid=call_sid,
                account_sid=os.getenv("TWILIO_ACCOUNT_SID"),
                auth_token=os.getenv("TWILIO_AUTH_TOKEN"),
            ),
        ),
    )

    # -------------------------------------------------------------------------
    # STT (Deepgram)
    # -------------------------------------------------------------------------
    stt = DeepgramSTTService(
        api_key=os.getenv("DEEPGRAM_API_KEY", ""),
        live_options=LiveOptions(
            model="nova-3-general",
            language="en",
            sample_rate=8000,
            encoding="linear16",
            channels=1,
            interim_results=True,
            smart_format=True,
            punctuate=True,
        ),
    )

    # -------------------------------------------------------------------------
    # LLM (Anthropic Claude)
    # -------------------------------------------------------------------------
    llm = AnthropicLLMService(
        api_key=os.getenv("ANTHROPIC_API_KEY", ""),
        model="claude-sonnet-4-5-20250929",
    )

    # -------------------------------------------------------------------------
    # TTS (ElevenLabs)
    # -------------------------------------------------------------------------
    tts = ElevenLabsTTSService(
        api_key=os.getenv("ELEVENLABS_API_KEY", ""),
        voice_id=os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM"),
        model="eleven_turbo_v2_5",
        params=ElevenLabsTTSService.InputParams(speed=0.9),
    )

    # -------------------------------------------------------------------------
    # Custom processors
    # -------------------------------------------------------------------------
    quick_observer = QuickObserverProcessor(session_state=session_state)
    conversation_director = ConversationDirectorProcessor(session_state=session_state)
    conversation_tracker = ConversationTrackerProcessor(session_state=session_state)
    guidance_stripper = GuidanceStripperProcessor()
    metrics_logger = MetricsLoggerProcessor(session_state=session_state)

    # Record call start time for Director's phase timing
    session_state["_call_start_time"] = time.time()

    # Store conversation tracker in session_state for Flow nodes to reference
    session_state["_conversation_tracker"] = conversation_tracker

    # -------------------------------------------------------------------------
    # Context aggregators (user ↔ assistant message pairing)
    # -------------------------------------------------------------------------
    context = OpenAILLMContext()
    context_aggregator = llm.create_context_aggregator(context)

    # -------------------------------------------------------------------------
    # Pipeline assembly
    # -------------------------------------------------------------------------
    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            quick_observer,
            conversation_director,
            context_aggregator.user(),
            llm,
            conversation_tracker,
            guidance_stripper,
            tts,
            transport.output(),
            context_aggregator.assistant(),
            metrics_logger,
        ]
    )

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

    # Store pipeline task in session_state for tool handlers (e.g. typing sound)
    session_state["_pipeline_task"] = task

    # Give processors references to the task so they can force-end calls
    # Quick Observer: instant goodbye detection (regex, 3.5s delay)
    # Director: time-based call ending + phase-based fallbacks
    quick_observer.set_pipeline_task(task)
    conversation_director.set_pipeline_task(task)

    # -------------------------------------------------------------------------
    # Flow Manager (call phase management)
    # -------------------------------------------------------------------------
    flows_tools = make_flows_tools(session_state)
    initial_node = build_initial_node(session_state, flows_tools)

    flow_manager = FlowManager(
        task=task,
        llm=llm,
        context_aggregator=context_aggregator,
        transport=transport,
    )

    # Store flow_manager in session state for processors that need it
    session_state["_flow_manager"] = flow_manager

    # -------------------------------------------------------------------------
    # Event handlers
    # -------------------------------------------------------------------------
    @transport.event_handler("on_client_connected")
    async def on_connected(transport_ref, websocket_ref):
        logger.info("[{cs}] Client connected, initializing flow", cs=call_sid)
        await flow_manager.initialize(initial_node)

    @transport.event_handler("on_client_disconnected")
    async def on_disconnected(transport_ref, websocket_ref):
        elapsed = round(time.time() - start_time)
        logger.info("[{cs}] Client disconnected after {s}s", cs=call_sid, s=elapsed)
        # End pipeline first so runner.run() unblocks, then run post-call in background.
        # Previously run_post_call was awaited before EndFrame, so if Gemini/OpenAI
        # hung during analysis the pipeline would never terminate.
        await task.queue_frame(EndFrame())
        asyncio.create_task(_safe_post_call(session_state, conversation_tracker, elapsed, call_sid))

    # -------------------------------------------------------------------------
    # Run pipeline
    # -------------------------------------------------------------------------
    runner = PipelineRunner(handle_sigint=False)

    logger.info("[{cs}] Pipeline ready, running...", cs=call_sid)
    await runner.run(task)

    logger.info("[{cs}] Pipeline ended", cs=call_sid)


