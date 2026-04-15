"""Tests for LLM context provenance capture."""

from __future__ import annotations

import time

from services.context_trace import get_context_trace, record_context_event


def test_record_context_event_captures_source_content_and_offset(session_state):
    session_state["_call_start_time"] = time.time() - 1

    event = record_context_event(
        session_state,
        source="memory_context",
        action="injected",
        label="Prefetched memories injected",
        content="- Likes roses",
        provider="prefetch_cache",
        item_count=1,
        latency_ms=42,
        metadata={"cache_hit": True},
    )

    assert event is not None
    assert event["source"] == "memory_context"
    assert event["action"] == "injected"
    assert event["content"] == "- Likes roses"
    assert event["item_count"] == 1
    assert event["latency_ms"] == 42
    assert event["metadata"] == {"cache_hit": True}
    assert event["timestamp_offset_ms"] is not None

    trace = get_context_trace(session_state)
    assert trace["version"] == 1
    assert trace["event_count"] == 1
    assert trace["events"][0]["label"] == "Prefetched memories injected"


def test_record_context_event_dedupe_key_prevents_duplicate_seed(session_state):
    first = record_context_event(
        session_state,
        source="system_prompt",
        action="seeded",
        label="Subscriber system prompt",
        content="prompt",
        dedupe_key="system",
    )
    second = record_context_event(
        session_state,
        source="system_prompt",
        action="seeded",
        label="Subscriber system prompt",
        content="prompt",
        dedupe_key="system",
    )

    assert first is not None
    assert second is None
    assert get_context_trace(session_state)["event_count"] == 1
