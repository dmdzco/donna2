"""Conversation Director processor — Layer 2 non-blocking analysis.

Sits in the pipeline after Quick Observer. Observes TranscriptionFrames,
fires off async analysis (non-blocking), and injects guidance into the
LLM context.

Primary LLM: Cerebras (~3000 tok/s) with Gemini Flash fallback.

Speculative pre-processing: Detects silence onset via gaps in interim
transcriptions (250ms threshold). Starts Cerebras analysis during the
silence gap so guidance can be injected for the CURRENT turn instead
of being one turn behind.

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
    analyze_turn_speculative,
    fast_provider_available,
    format_director_guidance,
    get_default_direction,
    warmup_fast_providers,
)


class ConversationDirectorProcessor(FrameProcessor):
    """Layer 2 — runs per-turn analysis, caches guidance, takes actions.

    Non-blocking: ``process_frame()`` passes frames through immediately.
    Analysis runs in the background via ``asyncio.create_task()``.

    Speculative pre-processing:
    - Detects silence onset via 250ms gap in InterimTranscriptionFrames
    - Starts Cerebras analysis during silence
    - If speculative completes before final TranscriptionFrame → same-turn guidance
    - Otherwise falls back to previous-turn guidance (existing behavior)

    Fallback actions:
    - Force call end when time limit exceeded
    - Force winding-down guidance when call is running long
    """

    # Default time limits (overridden by call_settings in session_state)
    FORCE_WINDING_DOWN_MINUTES = 9.0
    FORCE_END_MINUTES = 12.0

    # Interim transcription debounce settings (for prefetch)
    INTERIM_DEBOUNCE_SECONDS = 1.0
    INTERIM_MIN_LENGTH = 15

    # Speculative pre-processing settings
    SILENCE_ONSET_SECONDS = 0.250  # 250ms gap triggers speculative analysis
    SPECULATIVE_MIN_LENGTH = 15    # min chars in interim to trigger speculative

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
        self._warmup_done = False

        # Prefetch state
        self._last_interim_prefetch_time = 0.0
        self._last_interim_text = ""

        # Speculative pre-processing state
        self._silence_timer_task: asyncio.Task | None = None
        self._speculative_task: asyncio.Task | None = None
        self._latest_interim_text: str = ""

        # Metrics
        self._speculative_attempts = 0
        self._speculative_hits = 0
        self._speculative_cancels = 0

    def set_pipeline_task(self, task):
        """Set pipeline task reference for direct actions (EndFrame, etc.)."""
        self._pipeline_task = task

    async def process_frame(self, frame: Frame, direction):
        """Non-blocking: inject guidance, start analysis, pass frame."""
        await super().process_frame(frame, direction)

        # --- End of call: log speculative + prefetch metrics ---
        if isinstance(frame, EndFrame) and self._speculative_attempts > 0:
            logger.info(
                "[Director] Call summary: {turns} turns, "
                "{hits}/{attempts} speculative hits ({pct}%), "
                "{cancels} cancels",
                turns=self._turn_count,
                hits=self._speculative_hits,
                attempts=self._speculative_attempts,
                pct=round(self._speculative_hits / self._speculative_attempts * 100),
                cancels=self._speculative_cancels,
            )
        if isinstance(frame, EndFrame):
            web_cache = self._session_state.get("_web_prefetch_cache")
            if web_cache:
                ws = web_cache.stats()
                logger.info(
                    "[Director] Web prefetch: {h}/{t} hits ({p}%), {e} entries",
                    h=ws["hits"], t=ws["total"], p=ws["hit_rate_pct"], e=ws["entries"],
                )

        # --- Final TranscriptionFrame (after VAD 1.2s silence) ---
        if isinstance(frame, TranscriptionFrame):
            self._turn_count += 1
            self._session_state["_last_user_speech_time"] = time.time()

            # Feature flag: skip Director analysis when disabled
            from lib.growthbook import is_on
            if not is_on("director_enabled", self._session_state):
                await self.push_frame(frame, direction)
                return

            # Cerebras warmup on first transcription (warms TCP/TLS)
            if not self._warmup_done:
                self._warmup_done = True
                asyncio.create_task(warmup_fast_providers())

            # Cancel silence timer (final transcription arrived)
            self._cancel_silence_timer()

            # Check speculative result
            speculative_result = self._harvest_speculative(frame.text)

            # Determine which guidance to inject
            goodbye_in_progress = self._session_state.get("_goodbye_in_progress", False)

            if speculative_result and not goodbye_in_progress:
                # SAME-TURN guidance from speculative analysis
                self._speculative_hits += 1
                self._last_result = speculative_result
                await self._inject_guidance(speculative_result)
                await self._take_actions(speculative_result)
                asyncio.create_task(self._run_director_prefetch(speculative_result))
                logger.info("[Director] SAME-TURN guidance injected (speculative)")

            elif self._last_result and not goodbye_in_progress:
                # PREVIOUS-TURN guidance (fallback to existing behavior)
                await self._inject_guidance(self._last_result)
                await self._take_actions(self._last_result)

            # Start regular analysis (only if speculative wasn't used)
            if not speculative_result:
                if self._pending_analysis and not self._pending_analysis.done():
                    self._pending_analysis.cancel()
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

        # --- Interim TranscriptionFrame (while user is still speaking) ---
        if isinstance(frame, InterimTranscriptionFrame):
            text = frame.text or ""

            # Update latest interim for speculative analysis
            self._latest_interim_text = text

            # Cancel silence timer (user is still speaking)
            self._cancel_silence_timer()

            # Cancel any running speculative task (new speech invalidates it)
            if self._speculative_task is not None:
                if not self._speculative_task.done():
                    self._speculative_task.cancel()
                self._speculative_task = None

            # Start new silence timer if text is substantial and Cerebras available
            if len(text) >= self.SPECULATIVE_MIN_LENGTH and fast_provider_available():
                self._silence_timer_task = asyncio.create_task(
                    self._silence_timer(text)
                )

            # Existing debounced prefetch (unchanged)
            now = time.time()
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

    # ------------------------------------------------------------------
    # Speculative pre-processing
    # ------------------------------------------------------------------

    def _cancel_silence_timer(self):
        """Cancel the silence onset timer if running."""
        if self._silence_timer_task is not None and not self._silence_timer_task.done():
            self._silence_timer_task.cancel()
        self._silence_timer_task = None

    async def _silence_timer(self, interim_text: str):
        """Wait for silence threshold, then start speculative analysis."""
        try:
            await asyncio.sleep(self.SILENCE_ONSET_SECONDS)
            # Timer fired — silence confirmed
            logger.debug(
                "[Director] Silence onset ({ms}ms), starting speculative on: {t!r}",
                ms=round(self.SILENCE_ONSET_SECONDS * 1000),
                t=interim_text[:60],
            )
            self._speculative_attempts += 1

            # Cancel any previous speculative task
            if self._speculative_task is not None and not self._speculative_task.done():
                self._speculative_task.cancel()

            transcript = self._session_state.get("_transcript") or []
            self._speculative_task = asyncio.create_task(
                self._run_speculative_analysis(interim_text, transcript)
            )
        except asyncio.CancelledError:
            pass  # Normal: new interim arrived before timer fired

    async def _run_speculative_analysis(self, user_message: str, transcript: list[dict]):
        """Run speculative Cerebras analysis. Result retrieved via _harvest_speculative()."""
        try:
            result = await analyze_turn_speculative(
                user_message,
                self._session_state,
                conversation_history=transcript,
            )
            if result:
                # Fire second-wave prefetch from speculative result
                asyncio.create_task(self._run_director_prefetch(result))
            return result
        except asyncio.CancelledError:
            return None
        except Exception as e:
            logger.debug("[Director] Speculative analysis error: {err}", err=str(e))
            return None

    def _harvest_speculative(self, final_text: str) -> dict | None:
        """Check if speculative analysis completed with a usable result.

        Returns the speculative result if done and text matches final,
        otherwise returns None and cleans up.
        """
        if self._speculative_task is None:
            return None

        if self._speculative_task.done():
            try:
                result = self._speculative_task.result()
            except Exception:
                result = None

            self._speculative_task = None

            if result and self._text_matches(self._latest_interim_text, final_text):
                return result

            # Text diverged — discard
            if result:
                logger.info(
                    "[Director] Speculative discarded: text diverged "
                    "(interim={i!r}, final={f!r})",
                    i=self._latest_interim_text[:40],
                    f=final_text[:40],
                )
                self._speculative_cancels += 1
            return None

        # Still running — cancel it
        self._speculative_task.cancel()
        self._speculative_task = None
        self._speculative_cancels += 1
        logger.info("[Director] Speculative incomplete at final transcription")
        return None

    @staticmethod
    def _text_matches(interim: str, final: str, threshold: float = 0.7) -> bool:
        """Check if interim and final text are similar enough (Jaccard word overlap)."""
        if not interim or not final:
            return False
        words_i = set(interim.lower().split())
        words_f = set(final.lower().split())
        if not words_i or not words_f:
            return False
        intersection = len(words_i & words_f)
        union = len(words_i | words_f)
        return (intersection / union) >= threshold

    # ------------------------------------------------------------------
    # Guidance injection
    # ------------------------------------------------------------------

    async def _inject_guidance(self, result: dict):
        """Inject Director guidance into Claude's context."""
        guidance_text = format_director_guidance(result)
        if not guidance_text:
            return

        # Append token budget hint from Quick Observer if available
        token_rec = self._session_state.get("_token_recommendation")
        if token_rec:
            guidance_text += (
                f"\n[RESPONSE LENGTH: Keep response under "
                f"{token_rec['max_tokens']} tokens — {token_rec['reason']}]"
            )

        # Inject news content when Director recommends mentioning it
        # (news removed from system prompt to save ~300 tokens per turn)
        dir_section = result.get("direction", {})
        if (
            dir_section.get("should_mention_news")
            and not self._session_state.get("_news_injected", False)
        ):
            news_ctx = self._session_state.get("news_context")
            if news_ctx:
                guidance_text += f"\n\n{news_ctx}"
                self._session_state["_news_injected"] = True
                logger.info("[Director] News content injected into context")

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

    # ------------------------------------------------------------------
    # Regular analysis + prefetch (unchanged from original)
    # ------------------------------------------------------------------

    async def _run_analysis(self, user_message: str, transcript: list[dict]):
        """Run Director analysis in background. Caches result for next turn."""
        try:
            result = await analyze_turn(
                user_message,
                self._session_state,
                conversation_history=transcript,
            )
            self._last_result = result

            # Second-wave prefetch from analysis result
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
        """Second-wave prefetch using Director's analysis output.

        Runs memory prefetch and web search prefetch in parallel.
        """
        try:
            from services.prefetch import (
                PrefetchCache, WebPrefetchCache,
                extract_director_queries, extract_web_queries,
                run_prefetch, run_web_prefetch,
            )

            # Memory prefetch (existing, enhanced with Groq extraction)
            if "_prefetch_cache" not in self._session_state:
                self._session_state["_prefetch_cache"] = PrefetchCache()
            cache = self._session_state["_prefetch_cache"]

            queries = extract_director_queries(direction, self._session_state)
            senior_id = self._session_state.get("senior_id")

            tasks = []
            if queries and senior_id:
                tasks.append(run_prefetch(senior_id, queries, cache))

            # Web search prefetch (new — Director predicts factual questions)
            web_queries = extract_web_queries(direction)
            if web_queries:
                if "_web_prefetch_cache" not in self._session_state:
                    self._session_state["_web_prefetch_cache"] = WebPrefetchCache()
                web_cache = self._session_state["_web_prefetch_cache"]
                tasks.append(run_web_prefetch(web_queries, web_cache))

            if not tasks:
                return

            results = await asyncio.gather(*tasks, return_exceptions=True)
            mem_count = results[0] if len(results) > 0 and not isinstance(results[0], Exception) else 0
            web_count = results[-1] if len(results) > 1 and not isinstance(results[-1], Exception) else 0

            if mem_count or web_count:
                logger.info(
                    "[Prefetch] Director 2nd wave: {m} memory, {w} web cached",
                    m=mem_count, w=web_count,
                )

            # Store web prefetch hints for guidance injection
            if web_queries:
                direction["_web_prefetch_hints"] = web_queries

        except Exception as e:
            logger.warning("[Prefetch] Director prefetch error: {err}", err=str(e))

    # ------------------------------------------------------------------
    # Fallback actions + call ending
    # ------------------------------------------------------------------

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
                self._session_state["_end_reason"] = "director_timeout"
                await self._pipeline_task.queue_frame(EndFrame())
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("[Director] Error forcing call end: {err}", err=str(e))
