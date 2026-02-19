"""Pipeline metrics logger — captures LLM/TTS timing and usage data.

Intercepts MetricsFrame system frames emitted by Pipecat services when
enable_metrics=True. Logs TTFB for LLM and TTS, token usage, and
total turn latency (user speech → first audio output).

Place at the end of the pipeline — system frames flow through all processors.
"""

from __future__ import annotations

import time

from loguru import logger
from pipecat.frames.frames import EndFrame, Frame, MetricsFrame
from pipecat.processors.frame_processor import FrameProcessor

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
    """Logs LLM TTFB, TTS TTFB, token usage, and per-turn latency."""

    def __init__(self, session_state: dict, **kwargs):
        super().__init__(**kwargs)
        self._session_state = session_state
        self._turn_count = 0

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

        # Identify service type from processor name
        is_llm = "llm" in proc.lower() or "anthropic" in proc.lower()
        is_tts = "tts" in proc.lower() or "eleven" in proc.lower()

        if is_llm:
            logger.info("[Metrics] LLM TTFB: {ms}ms", ms=ms)
        elif is_tts:
            logger.info("[Metrics] TTS TTFB: {ms}ms", ms=ms)
            # Calculate total turn latency (user speech end → first audio)
            speech_time = self._session_state.get("_last_user_speech_time")
            if speech_time:
                turn_ms = round((time.time() - speech_time) * 1000)
                logger.info("[Metrics] Turn latency (speech→audio): {ms}ms", ms=turn_ms)
        else:
            logger.info("[Metrics] {proc} TTFB: {ms}ms", proc=proc, ms=ms)

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

    def _log_tts_usage(self, item: TTSUsageMetricsData):
        logger.info("[Metrics] TTS characters: {n}", n=item.value)

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
