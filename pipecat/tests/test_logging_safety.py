"""Regression tests for PHI-safe log filtering."""

from loguru import logger

from main import _safe_log_filter


def _record(name: str, message: str, level: str = "DEBUG") -> dict:
    return {
        "name": name,
        "message": message,
        "level": logger.level(level),
    }


def test_suppresses_pipecat_library_debug_context_logs():
    record = _record(
        "pipecat.services.anthropic.llm",
        "AnthropicLLMService#0: Generating chat from LLM-specific context [...]",
    )
    assert _safe_log_filter(record) is False


def test_suppresses_twilio_parse_body_even_above_debug():
    record = _record(
        "pipecat.runner.utils",
        "Parsed - Type: twilio, Data: {'body': {'ws_token': 'secret'}}",
        level="INFO",
    )
    assert _safe_log_filter(record) is False


def test_allows_application_debug_logs_without_sensitive_patterns():
    record = _record(
        "processors.conversation_director",
        "[Director] Continuous query started",
    )
    assert _safe_log_filter(record) is True
