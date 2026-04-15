"""Tests for bot-level post-call scheduling."""

import asyncio

import pytest


class DummyTracker:
    def __init__(self):
        self.flush_count = 0

    def flush(self):
        self.flush_count += 1


@pytest.mark.asyncio
async def test_start_post_call_once_schedules_single_task(monkeypatch):
    from bot import _start_post_call_once

    calls = []

    async def fake_safe_post_call(session_state, conversation_tracker, elapsed, call_sid):
        calls.append((session_state, conversation_tracker, elapsed, call_sid))

    monkeypatch.setattr("bot._safe_post_call", fake_safe_post_call)

    session_state = {}
    tracker = DummyTracker()

    first = _start_post_call_once(session_state, tracker, 12, "CA_test", "pipeline_ended")
    second = _start_post_call_once(session_state, tracker, 15, "CA_test", "client_disconnected")

    assert first is second
    assert session_state["_post_call_task"] is first

    await first

    assert tracker.flush_count == 1
    assert len(calls) == 1
    assert calls[0][2] == 12


@pytest.mark.asyncio
async def test_start_post_call_once_reuses_existing_task(monkeypatch):
    from bot import _start_post_call_once

    async def fake_safe_post_call(*args, **kwargs):
        raise AssertionError("should not start a second post-call task")

    async def existing_task():
        await asyncio.sleep(0)

    monkeypatch.setattr("bot._safe_post_call", fake_safe_post_call)

    existing = asyncio.create_task(existing_task())
    session_state = {"_post_call_task": existing}
    tracker = DummyTracker()

    result = _start_post_call_once(session_state, tracker, 12, "CA_test", "pipeline_ended")

    assert result is existing
    assert tracker.flush_count == 0

    await existing
