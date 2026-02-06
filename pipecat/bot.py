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
from processors.conversation_tracker import ConversationTrackerProcessor
from processors.guidance_stripper import GuidanceStripperProcessor
from processors.quick_observer import QuickObserverProcessor


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
        session_state.setdefault("senior", metadata.get("senior"))
        session_state.setdefault("senior_id", (metadata.get("senior") or {}).get("id"))
        session_state.setdefault("memory_context", metadata.get("memory_context"))
        session_state.setdefault("conversation_id", metadata.get("conversation_id"))
        session_state.setdefault("reminder_prompt", metadata.get("reminder_prompt"))
        session_state.setdefault("call_type", metadata.get("call_type", "check-in"))
        reminder_ctx = metadata.get("reminder_context")
        if reminder_ctx:
            session_state.setdefault("reminder_delivery", reminder_ctx.get("delivery"))
        greeting = metadata.get("pre_generated_greeting")
        if greeting:
            session_state.setdefault("greeting", greeting)
        logger.info("[{cs}] Populated session from call_metadata", cs=call_sid)

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
            vad_enabled=True,
            vad_analyzer=SileroVADAnalyzer(
                params=VADParams(
                    confidence=0.6,
                    stop_secs=1.2,
                    min_volume=0.5,
                ),
            ),
            vad_audio_passthrough=True,
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
    )

    # -------------------------------------------------------------------------
    # Custom processors
    # -------------------------------------------------------------------------
    quick_observer = QuickObserverProcessor()
    conversation_tracker = ConversationTrackerProcessor()
    guidance_stripper = GuidanceStripperProcessor()

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
            context_aggregator.user(),
            llm,
            conversation_tracker,
            guidance_stripper,
            tts,
            transport.output(),
            context_aggregator.assistant(),
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            allow_interruptions=True,
            enable_metrics=True,
            audio_in_sample_rate=8000,
            audio_out_sample_rate=8000,
        ),
    )

    # -------------------------------------------------------------------------
    # Flow Manager (call phase management)
    # -------------------------------------------------------------------------
    flows_tools = make_flows_tools(session_state)
    initial_node = build_initial_node(session_state, flows_tools)

    # Global tools available in ALL nodes
    global_tools = [
        flows_tools["search_memories"],
        flows_tools["save_important_detail"],
    ]

    flow_manager = FlowManager(
        task=task,
        llm=llm,
        context_aggregator=context_aggregator,
        transport=transport,
        global_functions=global_tools,
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
        await _run_post_call(session_state, conversation_tracker, elapsed)
        await task.queue_frame(EndFrame())

    # -------------------------------------------------------------------------
    # Run pipeline
    # -------------------------------------------------------------------------
    runner = PipelineRunner(handle_sigint=False)

    logger.info("[{cs}] Pipeline ready, running...", cs=call_sid)
    await runner.run(task)

    logger.info("[{cs}] Pipeline ended", cs=call_sid)


async def _run_post_call(
    session_state: dict,
    conversation_tracker: ConversationTrackerProcessor,
    duration_seconds: int,
) -> None:
    """Run post-call processing: analysis, memory extraction, DB updates.

    Called after the Twilio client disconnects.
    """
    call_sid = session_state.get("call_sid", "unknown")
    conversation_id = session_state.get("conversation_id")
    senior_id = session_state.get("senior_id")
    senior = session_state.get("senior")

    logger.info("[{cs}] Running post-call processing", cs=call_sid)

    # Collect transcript from session
    transcript = session_state.get("_transcript", [])

    try:
        # 1. Complete conversation record
        if conversation_id:
            from services.conversations import complete
            await complete(call_sid, {
                "duration_seconds": duration_seconds,
                "status": "completed",
                "transcript": transcript,
            })

        # 2. Run call analysis (Gemini Flash)
        if transcript and senior:
            from services.call_analysis import analyze_completed_call, save_call_analysis
            analysis = await analyze_completed_call(transcript, senior)
            if conversation_id and senior_id:
                await save_call_analysis(conversation_id, senior_id, analysis)

        # 3. Extract and store memories
        if transcript and senior_id:
            from services.memory import extract_from_conversation
            await extract_from_conversation(
                senior_id, transcript, conversation_id or "unknown"
            )

        # 4. Save daily context
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
                },
            )

        # 5. Handle reminder cleanup
        reminder_delivery = session_state.get("reminder_delivery")
        if reminder_delivery:
            delivered_set = session_state.get("reminders_delivered", set())
            if not delivered_set:
                from services.scheduler import mark_call_ended_without_acknowledgment
                await mark_call_ended_without_acknowledgment(reminder_delivery["id"])

        # 6. Clear caches
        if senior_id:
            from services.context_cache import clear_cache
            clear_cache(senior_id)
        if call_sid:
            from services.scheduler import clear_reminder_context
            clear_reminder_context(call_sid)

        logger.info("[{cs}] Post-call processing complete", cs=call_sid)

    except Exception as e:
        logger.error("[{cs}] Post-call error: {err}", cs=call_sid, err=str(e))
