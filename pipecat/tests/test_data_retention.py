"""Tests for data retention service (HIPAA compliance purge jobs)."""

import asyncio
import pytest
from unittest.mock import AsyncMock, patch, MagicMock


# ---------------------------------------------------------------------------
# _purge_table
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_purge_table_single_batch():
    """When fewer rows than BATCH_SIZE exist, one batch suffices."""
    from services.data_retention import _purge_table

    with patch("services.data_retention.query_one", new_callable=AsyncMock) as mock_q:
        mock_q.return_value = {"count": 42}

        deleted = await _purge_table("conversations", "created_at", 365)

    assert deleted == 42
    mock_q.assert_called_once()
    sql = mock_q.call_args[0][0]
    assert "conversations" in sql
    assert "created_at" in sql
    assert "make_interval" in sql


@pytest.mark.asyncio
async def test_purge_table_multi_batch():
    """When there are more rows than BATCH_SIZE, multiple batches run."""
    from services.data_retention import _purge_table, BATCH_SIZE

    with patch("services.data_retention.query_one", new_callable=AsyncMock) as mock_q:
        # First call returns a full batch, second call returns partial.
        mock_q.side_effect = [
            {"count": BATCH_SIZE},
            {"count": 123},
        ]

        deleted = await _purge_table("memories", "created_at", 730)

    assert deleted == BATCH_SIZE + 123
    assert mock_q.call_count == 2


@pytest.mark.asyncio
async def test_purge_table_rejects_unknown_table():
    """Tables not in ALLOWED_TABLES must be rejected."""
    from services.data_retention import _purge_table

    with pytest.raises(AssertionError):
        await _purge_table("users", "created_at", 90)


@pytest.mark.asyncio
async def test_purge_table_no_rows():
    """When there are zero rows to delete, returns 0."""
    from services.data_retention import _purge_table

    with patch("services.data_retention.query_one", new_callable=AsyncMock) as mock_q:
        mock_q.return_value = {"count": 0}

        deleted = await _purge_table("call_metrics", "created_at", 180)

    assert deleted == 0


@pytest.mark.asyncio
async def test_purge_table_none_result():
    """When query_one returns None, treat as 0 deleted."""
    from services.data_retention import _purge_table

    with patch("services.data_retention.query_one", new_callable=AsyncMock) as mock_q:
        mock_q.return_value = None

        deleted = await _purge_table("daily_call_context", "created_at", 90)

    assert deleted == 0


# ---------------------------------------------------------------------------
# purge_expired_data
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_purge_expired_data_calls_all_tables():
    """purge_expired_data should attempt to purge each configured table."""
    from services.data_retention import purge_expired_data

    with patch("services.data_retention._purge_table", new_callable=AsyncMock) as mock_purge:
        mock_purge.return_value = 0

        results = await purge_expired_data()

    # Should have attempted all 7 tables
    assert mock_purge.call_count == 7
    tables_purged = {call.args[0] for call in mock_purge.call_args_list}
    assert "conversations" in tables_purged
    assert "memories" in tables_purged
    assert "call_analyses" in tables_purged
    assert "daily_call_context" in tables_purged
    assert "call_metrics" in tables_purged
    assert "reminder_deliveries" in tables_purged
    assert "audit_logs" in tables_purged


@pytest.mark.asyncio
async def test_purge_expired_data_skips_zero_retention():
    """Tables with retention_days=0 should be skipped."""
    from services.data_retention import purge_expired_data

    with patch("services.data_retention.settings") as mock_settings, \
         patch("services.data_retention._purge_table", new_callable=AsyncMock) as mock_purge:
        # Set all retention to 0 except conversations
        mock_settings.retention_conversations_days = 365
        mock_settings.retention_memories_days = 0
        mock_settings.retention_call_analyses_days = 0
        mock_settings.retention_daily_context_days = 0
        mock_settings.retention_call_metrics_days = 0
        mock_settings.retention_reminder_deliveries_days = 0
        mock_settings.retention_audit_logs_days = 0

        mock_purge.return_value = 5

        results = await purge_expired_data()

    assert mock_purge.call_count == 1
    assert mock_purge.call_args[0][0] == "conversations"


@pytest.mark.asyncio
async def test_purge_expired_data_handles_table_error():
    """If one table fails, the others should still be attempted."""
    from services.data_retention import purge_expired_data

    call_count = 0

    async def _side_effect(table, col, days):
        nonlocal call_count
        call_count += 1
        if table == "memories":
            raise Exception("relation does not exist")
        return 10

    with patch("services.data_retention._purge_table", new_callable=AsyncMock) as mock_purge:
        mock_purge.side_effect = _side_effect

        results = await purge_expired_data()

    # All 7 tables should be attempted even though memories failed
    assert call_count == 7
    assert results["memories"] == -1
    assert results["conversations"] == 10


@pytest.mark.asyncio
async def test_purge_expired_data_returns_deleted_counts():
    """Results dict should map table names to deleted counts."""
    from services.data_retention import purge_expired_data

    async def _side_effect(table, col, days):
        return {"conversations": 5, "memories": 0, "call_analyses": 3}.get(table, 0)

    with patch("services.data_retention._purge_table", new_callable=AsyncMock) as mock_purge:
        mock_purge.side_effect = _side_effect

        results = await purge_expired_data()

    assert results["conversations"] == 5
    assert results["memories"] == 0
    assert results["call_analyses"] == 3


# ---------------------------------------------------------------------------
# Retention period config
# ---------------------------------------------------------------------------

def test_default_retention_periods():
    """Verify default retention periods match HIPAA requirements."""
    from config import Settings

    s = Settings()
    assert s.retention_conversations_days == 365
    assert s.retention_memories_days == 730
    assert s.retention_call_analyses_days == 365
    assert s.retention_daily_context_days == 90
    assert s.retention_call_metrics_days == 180
    assert s.retention_reminder_deliveries_days == 90
    assert s.retention_audit_logs_days == 730


# ---------------------------------------------------------------------------
# ALLOWED_TABLES validation
# ---------------------------------------------------------------------------

def test_allowed_tables_matches_config():
    """ALLOWED_TABLES should match exactly the keys in TABLE_DATE_COLUMNS."""
    from services.data_retention import ALLOWED_TABLES, TABLE_DATE_COLUMNS

    assert ALLOWED_TABLES == frozenset(TABLE_DATE_COLUMNS.keys())


def test_all_tables_have_created_at_column():
    """All tables in TABLE_DATE_COLUMNS should use 'created_at'."""
    from services.data_retention import TABLE_DATE_COLUMNS

    for table, col in TABLE_DATE_COLUMNS.items():
        assert col == "created_at", f"{table} uses {col!r}, expected 'created_at'"
