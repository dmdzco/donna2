"""Pipeline metrics logger — captures LLM/TTS timing and usage data.

Intercepts MetricsFrame system frames emitted by Pipecat services when
enable_metrics=True. Logs TTFB for LLM and TTS, token usage, and
total turn latency (user speech → first audio output).

Accumulates structured metrics into session_state["_call_metrics"] so
post_call.py can persist them to the call_metrics table.

Place at the end of the pipeline — system frames flow through all processors.
"""

from __future__ import annotations

import time

from loguru import logger
from pipecat.frames.frames import EndFrame, Frame, MetricsFrame
from pipecat.processors.frame_processor import FrameProcessor
from services.context_trace import record_latency_event

try:
    from pipecat.metrics.metrics import (
        TTFBMetricsData,
        LLMUsageMetricsData,
        ProcessingMetricsData,
        TTSUsageMetricsData,
    )

    _HAS_METRICS = True
except ImportError:
    _HAS_METRICS = False


class MetricsLoggerProcessor(FrameProcessor):
    """Logs LLM TTFB, TTS TTFB, token usage, and per-turn latency.

    Accumulates per-call metrics into session_state["_call_metrics"]:
    - llm_ttfb_values: list of LLM TTFB ms values
    - tts_ttfb_values: list of TTS TTFB ms values
    - turn_latency_values: list of end-to-end turn latency ms values
    - token_usage: {prompt_tokens, completion_tokens, cache_read_tokens}
    - tts_characters: total TTS characters
    - turn_count: number of conversational user turns
    - llm_invocation_count: number of LLM requests during the call
    """

    def __init__(self, session_state: dict, **kwargs):
        super().__init__(**kwargs)
        self._session_state = session_state
        # Initialize metrics accumulator
        metrics = self._session_state.setdefault("_call_metrics", {})
        metrics.setdefault("llm_ttfb_values", [])
        metrics.setdefault("tts_ttfb_values", [])
        metrics.setdefault("turn_latency_values", [])
        metrics.setdefault(
            "token_usage",
            {
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "cache_read_tokens": 0,
            },
        )
        metrics.setdefault("tts_characters", 0)
        metrics.setdefault("turn_count", 0)
        metrics.setdefault("llm_invocation_count", 0)
        metrics.setdefault("stage_latency_values", {})

    async def process_frame(self, frame: Frame, direction):
        await super().process_frame(frame, direction)

        if isinstance(frame, MetricsFrame) and _HAS_METRICS:
            self._log_metrics(frame)

        # Log prefetch stats at call end
        if isinstance(frame, EndFrame):
            self._log_prefetch_stats()

        await self.push_frame(frame, direction)

    def _log_metrics(self, frame: MetricsFrame):
        for item in frame.data:
            if isinstance(item, TTFBMetricsData):
                self._log_ttfb(item)
            elif isinstance(item, LLMUsageMetricsData):
                self._log_llm_usage(item)
            elif isinstance(item, TTSUsageMetricsData):
                self._log_tts_usage(item)
            elif isinstance(item, ProcessingMetricsData):
                ms = round(item.value * 1000)
                if ms > 500:
                    logger.info(
                        "[Metrics] {proc} processing: {ms}ms",
                        proc=item.processor,
                        ms=ms,
                    )

    def _log_ttfb(self, item: TTFBMetricsData):
        ms = round(item.value * 1000)
        proc = item.processor or "unknown"
        proc_lower = proc.lower()
        metrics = self._session_state["_call_metrics"]
        turn_sequence = self._session_state.get("_current_turn_sequence")
        self._update_turn_count(turn_sequence)

        # Identify service type from processor name
        is_llm = any(token in proc_lower for token in ("llm", "anthropic", "claude", "groq", "openai"))
        is_tts = any(token in proc_lower for token in ("tts", "eleven", "cartesia"))

        if is_llm:
            logger.info("[Metrics] LLM TTFB: {ms}ms", ms=ms)
            metrics["llm_ttfb_values"].append(ms)
            metrics["llm_invocation_count"] += 1
            record_latency_event(
                self._session_state,
                stage="llm_ttfb",
                source="llm_latency",
                action="measured",
                label="LLM first token",
                provider=proc,
                latency_ms=ms,
                turn_sequence=turn_sequence,
                metadata={"processor": proc},
            )
        elif is_tts:
            logger.info("[Metrics] TTS TTFB: {ms}ms", ms=ms)
            metrics["tts_ttfb_values"].append(ms)
            record_latency_event(
                self._session_state,
                stage="tts_ttfb",
                source="tts_latency",
                action="measured",
                label="TTS first audio",
                provider=proc,
                latency_ms=ms,
                turn_sequence=turn_sequence,
                metadata={"processor": proc},
            )
            # Calculate total turn latency (user speech end → first audio)
            speech_time = self._session_state.get("_last_user_speech_time")
            if speech_time:
                turn_ms = round((time.time() - speech_time) * 1000)
                logger.info("[Metrics] Turn latency (speech→audio): {ms}ms", ms=turn_ms)
                metrics["turn_latency_values"].append(turn_ms)
                record_latency_event(
                    self._session_state,
                    stage="turn.total",
                    source="turn_latency",
                    action="measured",
                    label="Turn speech to audio",
                    provider=proc,
                    latency_ms=turn_ms,
                    turn_sequence=turn_sequence,
                )
        else:
            logger.info("[Metrics] {proc} TTFB: {ms}ms", proc=proc, ms=ms)

    def _update_turn_count(self, turn_sequence) -> None:
        if not isinstance(turn_sequence, int) or turn_sequence < 0:
            return
        metrics = self._session_state["_call_metrics"]
        metrics["turn_count"] = max(metrics.get("turn_count", 0), turn_sequence)

    def _log_llm_usage(self, item: LLMUsageMetricsData):
        tokens = item.value
        if not tokens:
            return
        prompt = getattr(tokens, "prompt_tokens", 0) or 0
        completion = getattr(tokens, "completion_tokens", 0) or 0
        cache_read = getattr(tokens, "cache_read_input_tokens", 0) or 0
        parts = [f"prompt={prompt}", f"completion={completion}"]
        if cache_read:
            parts.append(f"cache_read={cache_read}")
        logger.info("[Metrics] LLM tokens: {info}", info=", ".join(parts))

        # Accumulate totals
        usage = self._session_state["_call_metrics"]["token_usage"]
        usage["prompt_tokens"] += prompt
        usage["completion_tokens"] += completion
        usage["cache_read_tokens"] += cache_read

    def _log_tts_usage(self, item: TTSUsageMetricsData):
        logger.info("[Metrics] TTS characters: {n}", n=item.value)
        self._session_state["_call_metrics"]["tts_characters"] += (item.value or 0)

    def _log_prefetch_stats(self):
        cache = self._session_state.get("_prefetch_cache")
        if cache:
            stats = cache.stats()
            if stats["total"] > 0:
                logger.info(
                    "[Metrics] Prefetch: hits={h} misses={m} rate={r}% entries={e}",
                    h=stats["hits"],
                    m=stats["misses"],
                    r=stats["hit_rate_pct"],
                    e=stats["entries"],
                )
