"""Tests for pipeline metrics accumulation."""

from __future__ import annotations

from pipecat.metrics.metrics import TTFBMetricsData

from processors.metrics_logger import MetricsLoggerProcessor


def test_metrics_logger_counts_llm_invocations_without_inflating_turn_count(session_state):
    processor = MetricsLoggerProcessor(session_state=session_state)
    session_state["_current_turn_sequence"] = 1

    processor._log_ttfb(
        TTFBMetricsData(processor="AnthropicLLMService", value=0.42)
    )
    processor._log_ttfb(
        TTFBMetricsData(processor="AnthropicLLMService", value=0.31)
    )

    metrics = session_state["_call_metrics"]
    assert metrics["llm_invocation_count"] == 2
    assert metrics["turn_count"] == 1

    session_state["_current_turn_sequence"] = 2
    processor._log_ttfb(
        TTFBMetricsData(processor="AnthropicLLMService", value=0.28)
    )

    assert metrics["llm_invocation_count"] == 3
    assert metrics["turn_count"] == 2
