"""Tests for LLM context provenance capture."""

from __future__ import annotations

import time

from services.context_trace import (
    MAX_CONTEXT_EVENTS,
    get_context_trace,
    record_context_event,
    record_latency_event,
    summarize_stage_latencies,
)


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


def test_record_latency_event_updates_trace_and_stage_summary(session_state):
    session_state["_trace_start_time"] = time.time() - 2

    first = record_latency_event(
        session_state,
        stage="tool.web_search",
        source="web_search",
        action="result",
        label="web_search result",
        provider="llm_tool",
        latency_ms=640,
        metadata={"tool": "web_search"},
    )
    second = record_latency_event(
        session_state,
        stage="tool.web_search",
        source="web_search",
        label="web_search retry",
        provider="llm_tool",
        latency_ms=860,
    )

    assert first is not None
    assert second is not None

    summary = summarize_stage_latencies(session_state)
    assert summary["tool.web_search"]["count"] == 2
    assert summary["tool.web_search"]["avg_ms"] == 750
    assert summary["tool.web_search"]["p95_ms"] == 860
    assert summary["tool.web_search"]["max_ms"] == 860

    trace = get_context_trace(session_state)
    assert trace["latency_breakdown"]["tool.web_search"]["avg_ms"] == 750
    assert trace["events"][0]["metadata"]["stage"] == "tool.web_search"


def test_priority_latency_events_survive_event_trimming(session_state):
    record_latency_event(
        session_state,
        stage="call.answer_to_ws",
        source="call_lifecycle",
        label="Voice answer to media stream",
        latency_ms=1200,
    )

    for index in range(MAX_CONTEXT_EVENTS):
        record_context_event(
            session_state,
            source="memory_context",
            action="injected",
            label=f"Context {index}",
            content=f"chunk {index}",
        )

    trace = get_context_trace(session_state)

    assert trace is not None
    assert trace["event_count"] == MAX_CONTEXT_EVENTS
    assert any(event["metadata"].get("stage") == "call.answer_to_ws" for event in trace["events"])
    assert not any(event["label"] == "Context 0" for event in trace["events"])
