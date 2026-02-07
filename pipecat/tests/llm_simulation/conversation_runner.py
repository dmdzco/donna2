"""Conversation Runner — orchestrates reactive LLM-vs-LLM simulation tests.

Assembles a test pipeline with the REAL AnthropicLLMService, runs a reactive
conversation loop between Donna and the SeniorSimulator, then evaluates the
result with the ConversationObserver.
"""

from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass, field
from unittest.mock import AsyncMock, MagicMock, patch

from loguru import logger
from pipecat.frames.frames import (
    EndFrame,
    Frame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMMessagesUpdateFrame,
    TextFrame,
    TranscriptionFrame,
    UserStartedSpeakingFrame,
    UserStoppedSpeakingFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.processors.frame_processor import FrameProcessor
from pipecat.services.anthropic.llm import AnthropicLLMService
from pipecat_flows import FlowManager

from flows.nodes import build_initial_node
from flows.tools import make_flows_tools
from processors.conversation_director import ConversationDirectorProcessor
from processors.conversation_tracker import ConversationTrackerProcessor
from processors.guidance_stripper import GuidanceStripperProcessor
from processors.quick_observer import QuickObserverProcessor
from services.director_llm import get_default_direction

from tests.llm_simulation.observer import (
    ConversationEvaluation,
    ConversationObserver,
    EvaluationCriteria,
)
from tests.llm_simulation.senior_simulator import SeniorPersona, SeniorSimulator
from tests.mocks.mock_tts import MockTTSProcessor
from tests.mocks.mock_transport import TestInputTransport, TestOutputTransport


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass
class SimulationConfig:
    """Configuration for a single simulation run."""

    senior_persona: SeniorPersona
    scenario_instructions: str
    evaluation_criteria: EvaluationCriteria
    scenario_description: str = ""
    max_turns: int = 10
    response_timeout: float = 30.0
    overall_timeout: float = 120.0
    donna_model: str = "claude-sonnet-4-5-20250929"
    simulator_model: str = "claude-haiku-4-5-20251001"
    observer_model: str = "claude-haiku-4-5-20251001"
    call_type: str = "check-in"
    memory_context: str | None = None
    reminder_prompt: str | None = None
    reminder_delivery: dict | None = None


@dataclass
class ConversationResult:
    """Result of a completed simulation run."""

    transcript: list[dict]
    evaluation: ConversationEvaluation
    turn_count: int
    ended_naturally: bool
    duration_seconds: float
    donna_model: str
    error: str | None = None


# ---------------------------------------------------------------------------
# ResponseCollector — aggregates streamed LLM text into full responses
# ---------------------------------------------------------------------------

class ContextResetDetector(FrameProcessor):
    """Detects LLMMessagesUpdateFrame (context resets) before the user aggregator.

    The user aggregator consumes LLMMessagesUpdateFrame without forwarding it,
    so the ResponseCollector downstream never sees it. This processor sits
    BEFORE the aggregator and tracks when context resets occur, allowing the
    conversation runner to detect when RESET_WITH_SUMMARY has wiped injected
    speech and re-inject it.
    """

    def __init__(self, activity_event: asyncio.Event, **kwargs):
        super().__init__(**kwargs)
        self._activity = activity_event
        self._reset_count = 0

    @property
    def reset_count(self) -> int:
        return self._reset_count

    async def process_frame(self, frame: Frame, direction):
        await super().process_frame(frame, direction)
        if isinstance(frame, LLMMessagesUpdateFrame):
            self._reset_count += 1
            logger.debug("[ContextResetDetector] LLMMessagesUpdateFrame ({} msgs), count={}",
                         len(frame.messages), self._reset_count)
            self._activity.set()
        await self.push_frame(frame, direction)


class ResponseCollector(FrameProcessor):
    """Watches for LLM response frames and aggregates streamed text.

    Sets an asyncio.Event when a complete response (between
    LLMFullResponseStartFrame and LLMFullResponseEndFrame) is collected.

    Accepts an external ``activity_event`` (shared with ContextResetDetector)
    that fires on ANY pipeline activity — text responses, context resets, etc.
    The idle-wait mechanism uses this to detect async operations like
    RESET_WITH_SUMMARY that don't produce visible text responses.
    """

    def __init__(self, activity_event: asyncio.Event | None = None, **kwargs):
        super().__init__(**kwargs)
        self._current_chunks: list[str] = []
        self._collecting = False
        self._latest_response: str = ""
        self._response_ready = asyncio.Event()
        self._activity = activity_event or asyncio.Event()

    async def process_frame(self, frame: Frame, direction):
        await super().process_frame(frame, direction)

        if isinstance(frame, LLMFullResponseStartFrame):
            self._collecting = True
            self._current_chunks = []
            self._activity.set()
        elif isinstance(frame, LLMFullResponseEndFrame):
            if self._collecting:
                self._latest_response = "".join(self._current_chunks).strip()
                self._collecting = False
                if self._latest_response:
                    self._response_ready.set()
                self._activity.set()
        elif isinstance(frame, TextFrame) and self._collecting:
            self._current_chunks.append(frame.text)

        await self.push_frame(frame, direction)

    async def wait_for_response(self, timeout: float = 30.0) -> str:
        """Block until the next full LLM response is available."""
        self._response_ready.clear()
        await asyncio.wait_for(self._response_ready.wait(), timeout=timeout)
        return self._latest_response

    async def wait_for_activity(self, timeout: float = 2.0) -> bool:
        """Wait for any pipeline activity. Returns True if activity detected."""
        self._activity.clear()
        try:
            await asyncio.wait_for(self._activity.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            return False

    def drain(self) -> None:
        """Discard any pending/stale response so the next wait_for_response
        blocks until a truly new response arrives."""
        self._response_ready.clear()
        self._activity.clear()
        self._latest_response = ""
        self._current_chunks = []
        self._collecting = False

    @property
    def latest_response(self) -> str:
        return self._latest_response


# ---------------------------------------------------------------------------
# ConversationRunner
# ---------------------------------------------------------------------------

class ConversationRunner:
    """Orchestrates a full simulated conversation between Donna and a senior."""

    def __init__(self, config: SimulationConfig):
        self._config = config

    async def run(self) -> ConversationResult:
        """Run a full simulated conversation and return results."""
        start_time = time.time()
        transcript: list[dict] = []
        ended_naturally = False
        error_msg: str | None = None

        try:
            result = await asyncio.wait_for(
                self._run_conversation(transcript),
                timeout=self._config.overall_timeout,
            )
            ended_naturally = result
        except asyncio.TimeoutError:
            error_msg = f"Conversation exceeded overall timeout ({self._config.overall_timeout}s)"
            logger.warning(error_msg)
        except Exception as exc:
            error_msg = f"Conversation error: {exc}"
            logger.error(error_msg)

        duration = time.time() - start_time

        # Run observer evaluation
        observer = ConversationObserver(
            criteria=self._config.evaluation_criteria,
            model=self._config.observer_model,
        )
        persona = self._config.senior_persona
        persona_desc = (
            f"{persona.name}, {persona.age}, {persona.personality}. "
            f"Interests: {', '.join(persona.interests)}"
        )
        evaluation = await observer.evaluate(
            transcript=transcript,
            scenario_context=self._config.scenario_description,
            senior_persona=persona_desc,
            ended_naturally=ended_naturally,
        )

        return ConversationResult(
            transcript=transcript,
            evaluation=evaluation,
            turn_count=len([t for t in transcript if t["role"] == "senior"]),
            ended_naturally=ended_naturally,
            duration_seconds=duration,
            donna_model=self._config.donna_model,
            error=error_msg,
        )

    async def _run_conversation(self, transcript: list[dict]) -> bool:
        """Run the reactive conversation loop. Returns True if ended naturally."""
        cfg = self._config

        # -- Build session state -----------------------------------------------
        session_state = {
            "senior_id": "senior-sim-001",
            "senior": {
                "id": "senior-sim-001",
                "name": cfg.senior_persona.name,
                "interests": cfg.senior_persona.interests,
                "medical_notes": cfg.senior_persona.medical_notes,
                "timezone": "America/New_York",
            },
            "memory_context": cfg.memory_context,
            "greeting": None,
            "reminder_prompt": cfg.reminder_prompt,
            "reminder_delivery": cfg.reminder_delivery,
            "reminders_delivered": set(),
            "conversation_id": "conv-sim-001",
            "call_sid": "CA-sim-001",
            "call_type": cfg.call_type,
            "previous_calls_summary": None,
            "todays_context": None,
            "_call_start_time": time.time(),
            "_transcript": [],
        }

        # -- Build pipeline components ----------------------------------------
        input_transport = TestInputTransport()
        output_transport = TestOutputTransport()

        quick_observer = QuickObserverProcessor(session_state=session_state)
        conversation_director = ConversationDirectorProcessor(session_state=session_state)
        conversation_tracker = ConversationTrackerProcessor(session_state=session_state)
        guidance_stripper = GuidanceStripperProcessor()
        # Shared event: fires when either the ResponseCollector sees LLM
        # output OR the ContextResetDetector sees LLMMessagesUpdateFrame
        pipeline_activity = asyncio.Event()
        context_reset_detector = ContextResetDetector(activity_event=pipeline_activity)
        response_collector = ResponseCollector(activity_event=pipeline_activity)
        tts = MockTTSProcessor()

        session_state["_conversation_tracker"] = conversation_tracker

        # Real Anthropic LLM
        llm = AnthropicLLMService(
            api_key=os.environ["ANTHROPIC_API_KEY"],
            model=cfg.donna_model,
        )

        context = OpenAILLMContext()
        context_aggregator = llm.create_context_aggregator(context)

        pipeline = Pipeline(
            [
                input_transport,
                quick_observer,
                conversation_director,
                context_reset_detector,
                context_aggregator.user(),
                llm,
                conversation_tracker,
                guidance_stripper,
                response_collector,
                tts,
                output_transport,
                context_aggregator.assistant(),
            ]
        )

        task = PipelineTask(
            pipeline,
            params=PipelineParams(
                enable_metrics=True,
            ),
        )

        quick_observer.set_pipeline_task(task)
        conversation_director.set_pipeline_task(task)

        # -- Flow Manager (call phase management) ------------------------------
        # Mock all tool service backends so tool handlers don't hit real DBs
        mock_patches = self._build_service_mocks()

        with mock_patches:
            flows_tools = make_flows_tools(session_state)
            initial_node = build_initial_node(session_state, flows_tools)

            flow_manager = FlowManager(
                task=task,
                llm=llm,
                context_aggregator=context_aggregator,
                transport=output_transport,
            )
            session_state["_flow_manager"] = flow_manager

            # -- Senior Simulator --------------------------------------------------
            simulator = SeniorSimulator(
                persona=cfg.senior_persona,
                scenario_instructions=cfg.scenario_instructions,
                max_turns=cfg.max_turns,
                model=cfg.simulator_model,
            )

            runner = PipelineRunner(handle_sigint=False)

            # -- Start pipeline in background ----------------------------------
            pipeline_task = asyncio.create_task(runner.run(task))

            # Small delay for pipeline to start processing
            await asyncio.sleep(0.3)

            # Initialize flow (triggers opening greeting via respond_immediately)
            await flow_manager.initialize(initial_node)

            # -- Reactive conversation loop ------------------------------------
            ended_naturally = False
            try:
                # 1. Wait for Donna's opening greeting
                donna_greeting = await response_collector.wait_for_response(
                    timeout=cfg.response_timeout
                )
                transcript.append({"role": "donna", "content": donna_greeting})
                logger.info("[SIM] Donna: {}", donna_greeting[:100])

                # Wait for pipeline to settle after opening (tool calls like
                # search_memories and transition_to_main + RESET_WITH_SUMMARY
                # may still be in flight)
                await _wait_for_pipeline_idle(response_collector)

                # 2. Get senior's response to the greeting
                senior_reply = await simulator.respond(donna_greeting)
                if senior_reply is None:
                    ended_naturally = True
                    await task.queue_frame(EndFrame())
                    await _safe_wait(pipeline_task)
                    return ended_naturally

                transcript.append({"role": "senior", "content": senior_reply})
                logger.info("[SIM] Senior: {}", senior_reply[:100])

                # Helper: inject user speech with proper VAD signals
                # (matches production Pipecat flow: start→transcription→stop)
                async def _inject_speech(text: str) -> None:
                    await task.queue_frame(UserStartedSpeakingFrame())
                    await task.queue_frame(
                        TranscriptionFrame(
                            text=text,
                            user_id="senior-sim-001",
                            timestamp="",
                            language="en",
                        )
                    )
                    # Small delay to let transcription accumulate before stop
                    await asyncio.sleep(0.1)
                    await task.queue_frame(UserStoppedSpeakingFrame())

                # 3. Reactive loop
                for turn in range(cfg.max_turns - 1):
                    # Record reset count before injection so we can detect
                    # if RESET_WITH_SUMMARY wiped our speech
                    pre_inject_resets = context_reset_detector.reset_count

                    # Inject senior's speech as transcription
                    await _inject_speech(senior_reply)

                    # Wait for Donna's response, with RESET retry logic.
                    # If RESET_WITH_SUMMARY arrives AFTER our injection, it
                    # wipes the context (including our speech). In that case,
                    # re-inject and wait again.
                    donna_response = None
                    for attempt in range(3):
                        try:
                            donna_response = await response_collector.wait_for_response(
                                timeout=cfg.response_timeout
                            )
                            break
                        except asyncio.TimeoutError:
                            resets_since = context_reset_detector.reset_count - pre_inject_resets
                            if resets_since > 0 and attempt < 2:
                                # RESET wiped our speech — re-inject after settle
                                logger.info(
                                    "[SIM] RESET detected after injection (attempt {}), "
                                    "re-injecting speech", attempt + 1,
                                )
                                await _wait_for_pipeline_idle(response_collector)
                                response_collector.drain()
                                pre_inject_resets = context_reset_detector.reset_count
                                await _inject_speech(senior_reply)
                            else:
                                logger.warning(
                                    "[SIM] Donna response timeout at turn {} "
                                    "(resets_since={})", turn + 2, resets_since,
                                )
                                break

                    if donna_response is None:
                        break

                    transcript.append({"role": "donna", "content": donna_response})
                    logger.info("[SIM] Donna: {}", donna_response[:100])

                    # Wait for pipeline to settle — tool calls and context
                    # resets (RESET_WITH_SUMMARY) may still be in flight
                    await _wait_for_pipeline_idle(response_collector)

                    # Check if pipeline ended (goodbye detection)
                    if output_transport.ended:
                        ended_naturally = True
                        break

                    # Get senior's next reply
                    senior_reply = await simulator.respond(donna_response)
                    if senior_reply is None:
                        # Senior said goodbye or max turns hit
                        ended_naturally = True
                        break

                    transcript.append({"role": "senior", "content": senior_reply})
                    logger.info("[SIM] Senior: {}", senior_reply[:100])

                    # Check if simulator detected goodbye in its own response
                    if simulator.ended:
                        # Inject the goodbye so Donna can react
                        await _inject_speech(senior_reply)
                        # Wait briefly for Donna's goodbye response
                        try:
                            donna_goodbye = await response_collector.wait_for_response(
                                timeout=cfg.response_timeout
                            )
                            transcript.append({"role": "donna", "content": donna_goodbye})
                            logger.info("[SIM] Donna (goodbye): {}", donna_goodbye[:100])
                        except asyncio.TimeoutError:
                            pass
                        ended_naturally = True
                        break

            except asyncio.TimeoutError:
                logger.warning("[SIM] Response timeout during conversation")
            except Exception as exc:
                logger.error("[SIM] Error during conversation loop: {}", exc)
                raise

            # -- Clean up pipeline ---------------------------------------------
            if not output_transport.ended:
                await task.queue_frame(EndFrame())
            await _safe_wait(pipeline_task)

            return ended_naturally

    @staticmethod
    def _build_service_mocks():
        """Build a combined context manager that mocks all external service calls."""
        default_direction = get_default_direction()

        class _CombinedMocks:
            """Context manager that patches all service modules."""

            def __init__(self):
                self._patches = []
                self._mocks = []

            def __enter__(self):
                # (target, mock_obj, create) — create=True for attrs that
                # don't exist at module level (e.g. get_news_for_topic is
                # referenced by flows/tools.py but not defined in services/news.py).
                patch_specs = [
                    # Patch Director imports at the point of USE (processors.conversation_director)
                    # not just at the source module — Python's `from X import Y` binds Y locally.
                    ("processors.conversation_director.analyze_turn", AsyncMock(return_value=default_direction), False),
                    ("processors.conversation_director.format_director_guidance", MagicMock(return_value="main/medium/warm | Continue naturally"), False),
                    ("processors.conversation_director.get_default_direction", MagicMock(return_value=default_direction), False),
                    # Also patch at source module for any other callers
                    ("services.director_llm.analyze_turn", AsyncMock(return_value=default_direction), False),
                    ("services.director_llm.format_director_guidance", MagicMock(return_value="main/medium/warm | Continue naturally"), False),
                    ("services.memory.search", AsyncMock(return_value=[
                        {"content": "Margaret planted new roses last spring", "similarity": 0.85},
                    ]), False),
                    ("services.memory.store", AsyncMock(return_value=None), False),
                    ("services.memory.extract_from_conversation", AsyncMock(return_value=None), False),
                    ("services.news.get_news_for_senior", AsyncMock(return_value="The local garden show is this weekend."), False),
                    ("services.reminder_delivery.mark_reminder_acknowledged", AsyncMock(return_value=None), False),
                    ("services.reminder_delivery.mark_call_ended_without_acknowledgment", AsyncMock(return_value=None), False),
                    ("services.scheduler.clear_reminder_context", AsyncMock(return_value=None), False),
                    ("services.conversations.complete", AsyncMock(return_value=None), False),
                    ("services.call_analysis.analyze_completed_call", AsyncMock(return_value={"mood": "positive"}), False),
                    ("services.call_analysis.save_call_analysis", AsyncMock(return_value=None), False),
                    ("services.daily_context.save_call_context", AsyncMock(return_value=None), False),
                    ("services.context_cache.clear_cache", MagicMock(), False),
                ]
                for target, mock_obj, create in patch_specs:
                    p = patch(target, mock_obj, create=create)
                    self._patches.append(p)
                    self._mocks.append(p.__enter__())
                return self

            def __exit__(self, *args):
                for p in reversed(self._patches):
                    p.__exit__(*args)

        return _CombinedMocks()


async def _wait_for_pipeline_idle(
    collector: ResponseCollector,
    idle_timeout: float = 3.0,
    post_activity_timeout: float = 2.0,
    max_wait: float = 20.0,
) -> None:
    """Wait until the pipeline stops producing activity.

    After Donna's text response, tool calls (transition_to_main, search_memories)
    may still be processing asynchronously. RESET_WITH_SUMMARY in particular
    generates a summary via a separate LLM API call (~5s) and then sends an
    LLMMessagesUpdateFrame to reset context — arriving ~8s after the text
    response.

    Strategy:
    - Wait up to ``idle_timeout`` (10s) for the first sign of activity
      (context reset, new LLM response, etc.)
    - Once activity is detected, switch to a shorter ``post_activity_timeout``
      (2s) — once the reset arrives, the pipeline settles quickly
    - Return when no activity is detected within the current timeout
    """
    start = time.time()
    current_timeout = idle_timeout
    while time.time() - start < max_wait:
        active = await collector.wait_for_activity(timeout=current_timeout)
        if active:
            # Got activity — pipeline still active. Use shorter timeout now
            # since once activity starts, follow-up activity arrives quickly.
            current_timeout = post_activity_timeout
            logger.debug("[SIM] Pipeline still active (activity during settle)")
        else:
            # No activity within timeout — pipeline is idle
            elapsed = time.time() - start
            logger.debug("[SIM] Pipeline idle after {:.1f}s", elapsed)
            collector.drain()
            return
    logger.warning("[SIM] Pipeline idle wait hit max_wait ({:.0f}s)", max_wait)
    collector.drain()


async def _safe_wait(task: asyncio.Task, timeout: float = 10.0) -> None:
    """Wait for an asyncio task to finish, suppressing CancelledError."""
    try:
        await asyncio.wait_for(asyncio.shield(task), timeout=timeout)
    except (asyncio.TimeoutError, asyncio.CancelledError):
        if not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
    except Exception:
        pass
