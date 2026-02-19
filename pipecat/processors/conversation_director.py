"""Conversation Director processor — Layer 2 non-blocking analysis.

Sits in the pipeline after Quick Observer. Observes TranscriptionFrames,
fires off async Gemini Flash analysis (non-blocking), and injects cached
guidance from the PREVIOUS turn into the LLM context.

Also monitors call timing and takes direct fallback actions when Claude
misses tool calls (e.g., force phase transitions, force call end).

NOT in the blocking path — process_frame() passes frames through
immediately and analysis runs in the background.
"""

from __future__ import annotations

import asyncio
import time

from loguru import logger
from pipecat.frames.frames import (
    EndFrame,
    Frame,
    InterimTranscriptionFrame,
    TranscriptionFrame,
    LLMMessagesAppendFrame,
)
from pipecat.processors.frame_processor import FrameProcessor

from services.director_llm import (
    analyze_turn,
    format_director_guidance,
    get_default_direction,
)


class ConversationDirectorProcessor(FrameProcessor):
    """Layer 2 — runs Gemini Flash per turn, caches guidance, takes actions.

    Non-blocking: ``process_frame()`` passes frames through immediately.
    Analysis runs in the background via ``asyncio.create_task()``.
    Cached results are injected as guidance on the NEXT transcription frame.

    Fallback actions:
    - Force call end when time limit exceeded
    - Force winding-down guidance when call is running long
    - Inject reminder delivery guidance when Director recommends it
    """

    # Default time limits (overridden by call_settings in session_state)
    FORCE_WINDING_DOWN_MINUTES = 9.0
    FORCE_END_MINUTES = 12.0

    # Interim transcription debounce settings
    INTERIM_DEBOUNCE_SECONDS = 1.0
    INTERIM_MIN_LENGTH = 15

    def __init__(self, session_state: dict, **kwargs):
        super().__init__(**kwargs)
        self._session_state = session_state
        self._pipeline_task = None
        self._last_result: dict | None = None
        self._pending_analysis: asyncio.Task | None = None
        self._delayed_end_task: asyncio.Task | None = None
        self._turn_count = 0
        self._end_scheduled = False
        self._memory_refreshed = False
        self._last_interim_prefetch_time = 0.0
        self._last_interim_text = ""

    def set_pipeline_task(self, task):
        """Set pipeline task reference for direct actions (EndFrame, etc.)."""
        self._pipeline_task = task

    async def process_frame(self, frame: Frame, direction):
        """Non-blocking: inject cached guidance, start new analysis, pass frame."""
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame):
            self._turn_count += 1
            # Record speech time for turn latency metrics
            self._session_state["_last_user_speech_time"] = time.time()

            # 1. Inject PREVIOUS turn's Director guidance (if available)
            #    Skip if goodbye is in progress — Quick Observer handles ending
            goodbye_in_progress = self._session_state.get("_goodbye_in_progress", False)

            if self._last_result and not goodbye_in_progress:
                guidance_text = format_director_guidance(self._last_result)
                if guidance_text:
                    # Append token budget hint from Quick Observer if available
                    token_rec = self._session_state.get("_token_recommendation") if self._session_state else None
                    if token_rec:
                        guidance_text += f"\n[RESPONSE LENGTH: Keep response under {token_rec['max_tokens']} tokens — {token_rec['reason']}]"
                    await self.push_frame(
                        LLMMessagesAppendFrame(
                            messages=[
                                {
                                    "role": "user",
                                    "content": (
                                        "[Director guidance — do not read aloud]\n"
                                        + guidance_text
                                    ),
                                }
                            ],
                            run_llm=False,
                        )
                    )

                # 2. Take fallback actions based on cached result
                await self._take_actions(self._last_result)

            # 3. Start NEW async analysis for this turn (non-blocking)
            if self._pending_analysis and not self._pending_analysis.done():
                self._pending_analysis.cancel()

            # Read shared transcript from session_state (populated by ConversationTracker)
            transcript = self._session_state.get("_transcript") or []

            self._pending_analysis = asyncio.create_task(
                self._run_analysis(frame.text, transcript)
            )

            # Start speculative prefetch (non-blocking)
            asyncio.create_task(self._run_prefetch(frame.text))

            # Trigger mid-call memory refresh at 5 minutes
            call_start = self._session_state.get("_call_start_time") or time.time()
            refresh_after = (self._session_state.get("call_settings") or {}).get(
                "memory_refresh_after_minutes", 5
            )
            minutes_elapsed = (time.time() - call_start) / 60
            if minutes_elapsed > refresh_after and not self._memory_refreshed:
                self._memory_refreshed = True
                asyncio.create_task(self._refresh_memory())

        # Phase 2: Interim transcription prefetch (debounced)
        if isinstance(frame, InterimTranscriptionFrame):
            now = time.time()
            text = frame.text or ""
            if (
                len(text) >= self.INTERIM_MIN_LENGTH
                and now - self._last_interim_prefetch_time >= self.INTERIM_DEBOUNCE_SECONDS
                and text != self._last_interim_text
            ):
                self._last_interim_prefetch_time = now
                self._last_interim_text = text
                asyncio.create_task(self._run_prefetch(text, source="interim"))

        # Always pass frames through immediately
        await self.push_frame(frame, direction)

    async def _run_analysis(self, user_message: str, transcript: list[dict]):
        """Run Director analysis in background. Caches result for next turn."""
        try:
            result = await analyze_turn(
                user_message,
                self._session_state,
                conversation_history=transcript,
            )
            self._last_result = result

            # Second-wave prefetch: use Gemini's multi-turn context to
            # anticipate what Claude will need (next_topic, reminders, news)
            asyncio.create_task(self._run_director_prefetch(result))
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("[Director] Background analysis error: {err}", err=str(e))
            self._last_result = get_default_direction()

    async def _run_prefetch(self, text: str, source: str = "final"):
        """Speculatively prefetch memories based on user speech (non-blocking)."""
        try:
            from services.prefetch import PrefetchCache, extract_prefetch_queries, run_prefetch

            # Lazily init cache in session_state
            if "_prefetch_cache" not in self._session_state:
                self._session_state["_prefetch_cache"] = PrefetchCache()
            cache = self._session_state["_prefetch_cache"]

            queries = extract_prefetch_queries(text, self._session_state, source=source)
            if not queries:
                logger.info("[Prefetch] No queries extracted from {src}: {t!r}", src=source, t=text[:80])
                return

            senior_id = self._session_state.get("senior_id")
            if not senior_id:
                logger.info("[Prefetch] No senior_id in session_state")
                return

            count = await run_prefetch(senior_id, queries, cache)
            if count > 0:
                logger.info(
                    "[Prefetch] {n} queries cached from {src} transcription (queries={q})",
                    n=count, src=source, q=queries,
                )
            else:
                logger.debug("[Prefetch] 0 results for queries={q}", q=queries)
        except Exception as e:
            logger.warning("[Prefetch] Error: {err}", err=str(e))

    async def _run_director_prefetch(self, direction: dict):
        """Second-wave prefetch using Director's multi-turn analysis.

        Runs after Gemini analysis completes (~150ms). Extracts queries from
        structured output: next_topic, reminder context, news topics, and
        sustained current topics.
        """
        try:
            from services.prefetch import PrefetchCache, extract_director_queries, run_prefetch

            if "_prefetch_cache" not in self._session_state:
                self._session_state["_prefetch_cache"] = PrefetchCache()
            cache = self._session_state["_prefetch_cache"]

            queries = extract_director_queries(direction, self._session_state)
            if not queries:
                return

            senior_id = self._session_state.get("senior_id")
            if not senior_id:
                return

            count = await run_prefetch(senior_id, queries, cache)
            if count > 0:
                logger.info(
                    "[Prefetch] {n} queries cached from Director analysis (2nd wave)",
                    n=count,
                )
        except Exception as e:
            logger.warning("[Prefetch] Director prefetch error: {err}", err=str(e))

    async def _take_actions(self, result: dict):
        """Take direct fallback actions when Claude misses things."""
        analysis = result.get("analysis", {})
        phase = analysis.get("call_phase", "main")
        pacing = result.get("direction", {}).get("pacing_note", "good")

        call_start = self._session_state.get("_call_start_time") or time.time()
        minutes_elapsed = (time.time() - call_start) / 60

        # Read configurable time limits from call_settings
        settings = self._session_state.get("call_settings") or {}
        winding_down_minutes = settings.get("winding_down_minutes", self.FORCE_WINDING_DOWN_MINUTES)
        max_call_minutes = settings.get("max_call_minutes", self.FORCE_END_MINUTES)

        # Force call end if Director says closing AND call is long enough
        if phase == "closing" and minutes_elapsed > 8 and not self._end_scheduled:
            if self._pipeline_task:
                logger.info(
                    "[Director] phase=closing + {m:.1f}min — scheduling end in 5s",
                    m=minutes_elapsed,
                )
                self._end_scheduled = True
                self._delayed_end_task = asyncio.create_task(self._delayed_end(5.0))

        # Inject time-pressure guidance if call exceeds limit
        if (
            pacing == "time_to_close"
            or minutes_elapsed > winding_down_minutes
        ):
            if phase not in ("winding_down", "closing"):
                logger.info(
                    "[Director] Time limit — injecting wrap-up ({m:.1f}min)",
                    m=minutes_elapsed,
                )
                # Override last_result to force wrap-up guidance on next turn
                if self._last_result:
                    self._last_result.setdefault("analysis", {})[
                        "call_phase"
                    ] = "winding_down"
                    self._last_result.setdefault("direction", {})[
                        "pacing_note"
                    ] = "time_to_close"

        # Hard limit — force end
        if minutes_elapsed > max_call_minutes and not self._end_scheduled:
            if self._pipeline_task:
                logger.info(
                    "[Director] Hard time limit ({m:.1f}min) — forcing end",
                    m=minutes_elapsed,
                )
                self._end_scheduled = True
                self._delayed_end_task = asyncio.create_task(self._delayed_end(3.0))

    async def _refresh_memory(self):
        """Refresh memory context mid-call based on current topics."""
        try:
            tracker = self._session_state.get("_conversation_tracker")
            topics = []
            if tracker and hasattr(tracker, "get_topics"):
                topics = tracker.get_topics()
            senior_id = self._session_state.get("senior_id")
            if senior_id and topics:
                from services.memory import refresh_context
                refreshed = await refresh_context(senior_id, topics)
                if refreshed:
                    self._session_state["memory_context"] = refreshed
                    logger.info("[Director] Memory refreshed with {n} topics", n=len(topics))
        except Exception as e:
            logger.error("[Director] Memory refresh failed: {err}", err=str(e))

    async def _delayed_end(self, delay: float):
        """End the call after a delay (lets current audio play)."""
        try:
            await asyncio.sleep(delay)
            if self._pipeline_task:
                logger.info("[Director] Forcing call end via EndFrame")
                await self._pipeline_task.queue_frame(EndFrame())
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("[Director] Error forcing call end: {err}", err=str(e))
