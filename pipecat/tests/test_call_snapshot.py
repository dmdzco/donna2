"""Tests for call context snapshot service."""

import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_build_snapshot_includes_all_fields():
    """Snapshot should contain all required context fields."""
    from services.call_snapshot import build_snapshot

    mock_analysis = {
        "engagement_score": 7,
        "call_quality": {"rapport": "strong"},
        "summary": "Discussed garden and weather.",
    }

    with patch("services.call_snapshot.get_recent_summaries", new_callable=AsyncMock) as mock_summaries, \
         patch("services.call_snapshot.get_recent_turns", new_callable=AsyncMock) as mock_turns, \
         patch("services.call_snapshot.get_todays_context", new_callable=AsyncMock) as mock_today, \
         patch("services.call_snapshot.format_todays_context") as mock_format:
        mock_summaries.return_value = "- Yesterday: Talked about garden"
        mock_turns.return_value = "RECENT CONVERSATIONS:\n  Senior: Hello"
        mock_today.return_value = {"previousCallCount": 1, "topicsDiscussed": ["garden"]}
        mock_format.return_value = "EARLIER TODAY: discussed garden"

        snapshot = await build_snapshot(
            senior_id="abc-123",
            timezone_name="America/New_York",
            analysis=mock_analysis,
        )

    assert snapshot["last_call_analysis"] == mock_analysis
    assert snapshot["recent_summaries"] == "- Yesterday: Talked about garden"
    assert snapshot["recent_turns"] == "RECENT CONVERSATIONS:\n  Senior: Hello"
    assert snapshot["todays_context"] == "EARLIER TODAY: discussed garden"
    assert "snapshot_updated_at" in snapshot


@pytest.mark.asyncio
async def test_build_snapshot_handles_no_analysis():
    """Snapshot should work when analysis is None."""
    from services.call_snapshot import build_snapshot

    with patch("services.call_snapshot.get_recent_summaries", new_callable=AsyncMock) as mock_s, \
         patch("services.call_snapshot.get_recent_turns", new_callable=AsyncMock) as mock_t, \
         patch("services.call_snapshot.get_todays_context", new_callable=AsyncMock) as mock_tc, \
         patch("services.call_snapshot.format_todays_context") as mock_f:
        mock_s.return_value = None
        mock_t.return_value = None
        mock_tc.return_value = {"previousCallCount": 0}
        mock_f.return_value = None

        snapshot = await build_snapshot("abc-123", "America/New_York", analysis=None)

    assert snapshot["last_call_analysis"] is None
    assert snapshot["recent_summaries"] is None
    assert snapshot["recent_turns"] is None
    assert snapshot["todays_context"] is None


@pytest.mark.asyncio
async def test_save_snapshot_calls_db():
    """save_snapshot should UPDATE seniors table."""
    from services.call_snapshot import save_snapshot

    snapshot = {"last_call_analysis": None, "snapshot_updated_at": "2026-03-07"}

    with patch("services.call_snapshot.execute", new_callable=AsyncMock) as mock_exec:
        mock_exec.return_value = "UPDATE 1"
        await save_snapshot("abc-123", snapshot)
        mock_exec.assert_called_once()
        sql = mock_exec.call_args[0][0]
        assert "call_context_snapshot" in sql
        assert "seniors" in sql
