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
from pipecat.frames.frames import EndFrame, Frame, TranscriptionFrame, LLMMessagesAppendFrame
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

    # Force winding-down guidance after this many minutes
    FORCE_WINDING_DOWN_MINUTES = 9.0
    # Hard call end after this many minutes
    FORCE_END_MINUTES = 12.0

    def __init__(self, session_state: dict, **kwargs):
        super().__init__(**kwargs)
        self._session_state = session_state
        self._pipeline_task = None
        self._last_result: dict | None = None
        self._pending_analysis: asyncio.Task | None = None
        self._turn_count = 0
        self._end_scheduled = False

    def set_pipeline_task(self, task):
        """Set pipeline task reference for direct actions (EndFrame, etc.)."""
        self._pipeline_task = task

    async def process_frame(self, frame: Frame, direction):
        """Non-blocking: inject cached guidance, start new analysis, pass frame."""
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame):
            self._turn_count += 1

            # 1. Inject PREVIOUS turn's Director guidance (if available)
            #    Skip if goodbye is in progress — Quick Observer handles ending
            goodbye_in_progress = self._session_state.get("_goodbye_in_progress", False)

            if self._last_result and not goodbye_in_progress:
                guidance_text = format_director_guidance(self._last_result)
                if guidance_text:
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
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("[Director] Background analysis error: {err}", err=str(e))
            self._last_result = get_default_direction()

    async def _take_actions(self, result: dict):
        """Take direct fallback actions when Claude misses things."""
        analysis = result.get("analysis", {})
        phase = analysis.get("call_phase", "main")
        pacing = result.get("direction", {}).get("pacing_note", "good")

        call_start = self._session_state.get("_call_start_time") or time.time()
        minutes_elapsed = (time.time() - call_start) / 60

        # Force call end if Director says closing AND call is long enough
        if phase == "closing" and minutes_elapsed > 8 and not self._end_scheduled:
            if self._pipeline_task:
                logger.info(
                    "[Director] phase=closing + {m:.1f}min — scheduling end in 5s",
                    m=minutes_elapsed,
                )
                self._end_scheduled = True
                asyncio.create_task(self._delayed_end(5.0))

        # Inject time-pressure guidance if call exceeds limit
        if (
            pacing == "time_to_close"
            or minutes_elapsed > self.FORCE_WINDING_DOWN_MINUTES
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
        if minutes_elapsed > self.FORCE_END_MINUTES and not self._end_scheduled:
            if self._pipeline_task:
                logger.info(
                    "[Director] Hard time limit ({m:.1f}min) — forcing end",
                    m=minutes_elapsed,
                )
                self._end_scheduled = True
                asyncio.create_task(self._delayed_end(3.0))

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
