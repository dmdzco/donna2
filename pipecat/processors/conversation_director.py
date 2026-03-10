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
    TTSSpeakFrame,
    LLMMessagesAppendFrame,
)
from pipecat.processors.frame_processor import FrameProcessor

import re

from services.director_llm import (
    analyze_turn,
    analyze_turn_speculative,
    fast_provider_available,
    format_director_guidance,
    get_default_direction,
    warmup_fast_providers,
)

# Social/conversational questions that do NOT need a web search.
# Blocklist approach: any "?" triggers a search UNLESS it matches here.
# Better to search unnecessarily than to miss a real factual question.
_SOCIAL_Q_PATTERN = re.compile(
    r"(?:how are you|how have you been|how(?:'s| is) it going|what(?:'s| is) up"
    r"|how do you feel|how(?:'s| is) your|how(?:'s| is) everything"
    r"|what do you think|what(?:'s| is) your (?:name|opinion|favorite)"
    r"|could you say|can you hear|can you tell me about yourself"
    r"|do you remember|did I tell you|what was I saying|what did I say"
    r"|are you there|are you listening|you know what I mean"
    r"|isn't that (?:right|something|nice|funny|great|wonderful|terrible)"
    r"|right\?$|okay\?$|yeah\?$|huh\?$|really\?$|no\?$"
    r"|don't you think|wouldn't you say|shall we|should we"
    r"|can you (?:help|remind|call)|will you (?:remember|call)"
    r"|what(?:'s| is) (?:wrong|the matter)|why are you)",
    re.I,
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
        self._speculative_tasks: list[asyncio.Task] = []  # all in-flight speculatives
        self._latest_interim_text: str = ""

        # Web search gating state
        self._web_search_task: asyncio.Task | None = None
        self._web_search_query: str = ""
        self._web_searches_gated = 0
        self._web_searches_completed = 0
        self._web_searches_timed_out = 0

        # Metrics
        self._speculative_attempts = 0
        self._speculative_hits = 0
        self._speculative_misses = 0

    MAX_CONCURRENT_SPECULATIVE = 3  # cap concurrent Groq calls

    def set_pipeline_task(self, task):
        """Set pipeline task reference for direct actions (EndFrame, etc.)."""
        self._pipeline_task = task

    async def process_frame(self, frame: Frame, direction):
        """Non-blocking: inject guidance, start analysis, pass frame."""
        await super().process_frame(frame, direction)

        # --- End of call: log speculative + prefetch + web search metrics ---
        if isinstance(frame, EndFrame):
            if self._speculative_attempts > 0:
                logger.info(
                    "[Director] Call summary: {turns} turns, "
                    "{hits}/{attempts} speculative hits ({pct}%), "
                    "{misses} misses",
                    turns=self._turn_count,
                    hits=self._speculative_hits,
                    attempts=self._speculative_attempts,
                    pct=round(self._speculative_hits / self._speculative_attempts * 100),
                    misses=self._speculative_misses,
                )
            if self._web_searches_gated > 0:
                logger.info(
                    "[Director] Web search: {g} gated, {c} completed, {t} timed out",
                    g=self._web_searches_gated,
                    c=self._web_searches_completed,
                    t=self._web_searches_timed_out,
                )
            await self.push_frame(frame, direction)
            return

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

            # Inject any prefetched memories into Claude's context proactively
            # (so Claude doesn't need to call search_memories tool)
            await self._inject_prefetched_memories(frame.text)

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

            # Question-mark triggered web search: if Deepgram transcribed a
            # factual question (has ? and matches factual patterns), start
            # a web search immediately — no need to wait for Director LLM.
            if "?" in frame.text and not self._session_state.get("_goodbye_in_progress"):
                self._maybe_start_question_web_search(frame.text)

            # Trigger mid-call memory refresh at 5 minutes
            call_start = self._session_state.get("_call_start_time") or time.time()
            refresh_after = (self._session_state.get("call_settings") or {}).get(
                "memory_refresh_after_minutes", 5
            )
            minutes_elapsed = (time.time() - call_start) / 60
            if minutes_elapsed > refresh_after and not self._memory_refreshed:
                self._memory_refreshed = True
                asyncio.create_task(self._refresh_memory())

            # Web search gating: hold frame if web search in-flight
            await self._handle_web_gating(frame, direction)
            return

        # --- Interim TranscriptionFrame (while user is still speaking) ---
        if isinstance(frame, InterimTranscriptionFrame):
            text = frame.text or ""

            # Update latest interim for speculative analysis
            self._latest_interim_text = text

            # Cancel silence timer (user is still speaking)
            self._cancel_silence_timer()

            # DON'T cancel running speculative — let it complete (fire-and-forget).
            # Deepgram sends interim refinements even after the user stops speaking,
            # which would repeatedly cancel speculative and leave no time window.
            # Instead, we let the first speculative run and check text overlap at harvest.

            # Cancel web search if interim text diverges significantly
            if self._web_search_task is not None and not self._web_search_task.done():
                if self._web_search_query and not self._text_matches(
                    text, self._web_search_query, threshold=0.4
                ):
                    self._web_search_task.cancel()
                    self._web_search_task = None
                    self._web_search_query = ""
                    logger.info("[Director] Web search cancelled: interim text diverged")

            # Start silence timer — always, even if a speculative is running.
            # Each completed speculative builds cached context (memory prefetch).
            if len(text) >= self.SPECULATIVE_MIN_LENGTH and fast_provider_available():
                self._silence_timer_task = asyncio.create_task(
                    self._silence_timer(text)
                )

            # Question-mark in interim: start web search early
            if "?" in text and not self._session_state.get("_goodbye_in_progress"):
                self._maybe_start_question_web_search(text)

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

            await self.push_frame(frame, direction)
            return

        # All other frames — pass through immediately
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

            # Clean up completed tasks
            self._speculative_tasks = [
                t for t in self._speculative_tasks if not t.done()
            ]

            # Cap concurrent speculatives
            if len(self._speculative_tasks) >= self.MAX_CONCURRENT_SPECULATIVE:
                logger.debug("[Director] Speculative cap reached ({n})", n=len(self._speculative_tasks))
                return

            # Timer fired — silence confirmed
            logger.debug(
                "[Director] Silence onset ({ms}ms), starting speculative on: {t!r}",
                ms=round(self.SILENCE_ONSET_SECONDS * 1000),
                t=interim_text[:60],
            )
            self._speculative_attempts += 1

            transcript = self._session_state.get("_transcript") or []
            task = asyncio.create_task(
                self._run_speculative_analysis(interim_text, transcript)
            )
            self._speculative_tasks.append(task)
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

                # Web search is NOT triggered from Director analysis.
                # The question-mark trigger on interim frames fires earlier
                # than any Director analysis could complete.
            return result
        except asyncio.CancelledError:
            return None
        except Exception as e:
            logger.debug("[Director] Speculative analysis error: {err}", err=str(e))
            return None

    def _harvest_speculative(self, final_text: str) -> dict | None:
        """Check all completed speculative analyses for a usable result.

        Picks the best text-matching completed result. Incomplete tasks
        keep running — their prefetch results still build the cache.
        """
        if not self._speculative_tasks:
            return None

        best_result = None
        still_running = 0

        for task in self._speculative_tasks:
            if task.done():
                try:
                    result = task.result()
                except Exception:
                    continue
                if result and self._text_matches(
                    self._latest_interim_text, final_text, threshold=0.5
                ):
                    best_result = result
            else:
                still_running += 1

        # Clear completed tasks, keep running ones (they build cache)
        self._speculative_tasks = [t for t in self._speculative_tasks if not t.done()]

        if best_result:
            return best_result

        if still_running:
            self._speculative_misses += 1
            logger.info(
                "[Director] No speculative match at final transcription "
                "({n} still running, building cache)",
                n=still_running,
            )
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
    # Question-triggered web search
    # ------------------------------------------------------------------

    def _maybe_start_question_web_search(self, text: str):
        """Start a web search if text contains a question mark.

        Blocklist approach: any "?" triggers a search UNLESS the text
        matches known social/conversational patterns. Better to search
        unnecessarily than to miss a real factual question.
        """
        # Skip if web search already in-flight
        if self._web_search_task is not None and not self._web_search_task.done():
            return

        # Skip social/rhetorical questions
        if _SOCIAL_Q_PATTERN.search(text):
            return

        # Check feature flag
        from lib.growthbook import is_on
        if not is_on("news_search_enabled", self._session_state):
            return

        # Use the full text as the search query
        query = text.strip()
        if len(query) < 10:
            return

        self._web_search_query = query
        self._web_search_task = asyncio.create_task(
            self._run_web_search(query)
        )
        logger.info(
            "[Director] Question-triggered web search: {q!r}",
            q=query[:80],
        )

    # ------------------------------------------------------------------
    # Web search gating
    # ------------------------------------------------------------------

    async def _run_web_search(self, query: str) -> str | None:
        """Run a web search via OpenAI. Returns result string or None."""
        try:
            from services.news import web_search_query
            result = await asyncio.wait_for(web_search_query(query), timeout=12.0)
            return result
        except asyncio.TimeoutError:
            logger.warning("[Director] Web search timed out for q={q!r}", q=query)
            return None
        except asyncio.CancelledError:
            return None
        except Exception as e:
            logger.warning("[Director] Web search error for q={q!r}: {err}", q=query, err=str(e))
            return None

    async def _handle_web_gating(self, frame: TranscriptionFrame, direction):
        """Gate the TranscriptionFrame if a web search is in-flight.

        If search is still running: push filler TTS, await result, inject into context.
        If search is already done: inject result immediately (no filler needed).
        Always pushes the frame at the end.
        """
        if self._web_search_task is not None:
            if not self._web_search_task.done():
                # Search still in-flight — push filler and wait
                self._web_searches_gated += 1
                logger.info("[Director] Web search gating activated, pushing filler")
                await self.push_frame(
                    TTSSpeakFrame(text="Let me check on that for you."),
                    direction,
                )
                try:
                    result = await asyncio.wait_for(
                        asyncio.shield(self._web_search_task), timeout=10.0
                    )
                    if result:
                        await self._inject_web_result(result)
                        self._web_searches_completed += 1
                    else:
                        self._web_searches_timed_out += 1
                except asyncio.TimeoutError:
                    logger.warning("[Director] Web search gating timed out")
                    self._web_searches_timed_out += 1
                except Exception as e:
                    logger.warning("[Director] Web search gating error: {err}", err=str(e))
                    self._web_searches_timed_out += 1
            else:
                # Search already completed — inject result if available
                try:
                    result = self._web_search_task.result()
                    if result:
                        await self._inject_web_result(result)
                        self._web_searches_completed += 1
                        logger.info("[Director] Pre-completed web result injected (no filler needed)")
                except Exception:
                    pass

            # Clean up
            self._web_search_task = None
            self._web_search_query = ""

        await self.push_frame(frame, direction)

    async def _run_and_inject_web_result(self, query: str):
        """Run web search and inject result into context (from regular analysis path).

        Unlike the gating path (speculative), this runs AFTER the frame has passed.
        The result will be available for Claude's next LLM call.
        """
        start = time.time()
        try:
            result = await self._run_web_search(query)
            elapsed_ms = round((time.time() - start) * 1000)
            if result:
                await self._inject_web_result(result)
                self._web_searches_completed += 1
                logger.info(
                    "[Director] Regular-path web search completed: q={q!r} ({ms}ms, {n} chars)",
                    q=query, ms=elapsed_ms, n=len(result),
                )
            else:
                logger.warning(
                    "[Director] Regular-path web search returned empty: q={q!r} ({ms}ms)",
                    q=query, ms=elapsed_ms,
                )
            self._web_search_task = None
            self._web_search_query = ""
        except Exception as e:
            elapsed_ms = round((time.time() - start) * 1000)
            logger.warning(
                "[Director] Regular-path web search error: q={q!r} ({ms}ms) {err}",
                q=query, ms=elapsed_ms, err=str(e),
            )
            self._web_search_task = None
            self._web_search_query = ""

    async def _inject_web_result(self, result: str):
        """Inject web search result into Claude's context."""
        logger.info("[Director] Web result injected ({n} chars)", n=len(result))
        await self.push_frame(
            LLMMessagesAppendFrame(
                messages=[
                    {
                        "role": "user",
                        "content": (
                            "[WEB RESULT — do not read this tag aloud]\n"
                            f"{result}\n"
                            "Use this to answer naturally. Don't say 'let me check' — "
                            "the senior already heard a filler."
                        ),
                    }
                ],
                run_llm=False,
            )
        )

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
    # Proactive memory injection
    # ------------------------------------------------------------------

    async def _inject_prefetched_memories(self, user_text: str):
        """Inject cached prefetch results into Claude's context proactively.

        Checks the prefetch cache for memories relevant to the current user
        speech and injects them as context — Claude doesn't need to call
        search_memories for these.
        """
        cache = self._session_state.get("_prefetch_cache")
        if not cache:
            return

        cached = cache.get(user_text, threshold=0.3)
        if not cached:
            return

        # Format memories for injection
        memory_lines = [r["content"] for r in cached if r.get("content")]
        if not memory_lines:
            return

        memory_text = "\n".join(f"- {line}" for line in memory_lines)
        logger.info(
            "[Director] Proactive memory injection: {n} memories for {t!r}",
            n=len(memory_lines), t=user_text[:50],
        )

        await self.push_frame(
            LLMMessagesAppendFrame(
                messages=[
                    {
                        "role": "user",
                        "content": (
                            "[MEMORY CONTEXT — do not read this tag aloud]\n"
                            "You remember from past conversations:\n"
                            f"{memory_text}\n"
                            "Weave these naturally if relevant. Say \"I remember you telling me...\" "
                            "not \"My records show...\". Don't force it if it doesn't fit."
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

            # Web search is NOT triggered here (regular analysis path).
            # By the time regular analysis completes, the question-mark trigger
            # (on interims) or speculative analysis (on 250ms silence) already
            # started the search. This path fires too late to add value.
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
        """Second-wave prefetch using Director's analysis output (memory only).

        Web searches are now handled directly by the Director via _run_web_search,
        not through the prefetch cache system.
        """
        try:
            from services.prefetch import (
                PrefetchCache,
                extract_director_queries,
                run_prefetch,
            )

            if "_prefetch_cache" not in self._session_state:
                self._session_state["_prefetch_cache"] = PrefetchCache()
            cache = self._session_state["_prefetch_cache"]

            queries = extract_director_queries(direction, self._session_state)
            senior_id = self._session_state.get("senior_id")

            if not queries or not senior_id:
                return

            count = await run_prefetch(senior_id, queries, cache)
            if count:
                logger.info(
                    "[Prefetch] Director 2nd wave: {m} memory cached",
                    m=count,
                )

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
