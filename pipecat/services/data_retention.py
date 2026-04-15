"""Data retention service -- scheduled purge of expired PHI data.

HIPAA requires defined retention periods for protected health information.
This service runs daily as a background asyncio loop and deletes data older
than the configured retention period for each table.

Retention periods are configurable via environment variables (see config.py).
Purges use batched deletes via CTEs to avoid long-running transactions
and excessive lock contention on production.
"""

from __future__ import annotations

import asyncio

from loguru import logger

from config import settings
from db.client import query_one

# ---------------------------------------------------------------------------
# Table configuration
# ---------------------------------------------------------------------------
# Each entry maps a table name to the date column used for age comparison.
# Only tables listed here (and in ALLOWED_TABLES) will be purged.

TABLE_DATE_COLUMNS: dict[str, str] = {
    "conversations": "started_at",
    "memories": "created_at",
    "call_analyses": "created_at",
    "daily_call_context": "call_date",
    "call_metrics": "created_at",
    "reminder_deliveries": "created_at",
    "notifications": "sent_at",
    "waitlist": "created_at",
    "audit_logs": "created_at",
}

ALLOWED_TABLES = frozenset(TABLE_DATE_COLUMNS.keys())

BATCH_SIZE = 5000


# ---------------------------------------------------------------------------
# Core purge logic
# ---------------------------------------------------------------------------

async def _purge_table(table: str, date_column: str, retention_days: int) -> int:
    """Delete rows from *table* older than *retention_days* in batches.

    Returns the total number of rows deleted across all batches.
    """
    assert table in ALLOWED_TABLES, f"Table {table!r} is not in ALLOWED_TABLES"

    total_deleted = 0

    while True:
        # Use a CTE so we can count the deleted rows in one round-trip.
        # The table and column names come from our own hardcoded config, not
        # user input, so the f-string is safe here.
        result = await query_one(
            f"WITH batch AS ("
            f"  SELECT ctid"
            f"  FROM {table}"
            f"  WHERE {date_column} < NOW() - make_interval(days => $1)"
            f"  ORDER BY {date_column}"
            f"  LIMIT {BATCH_SIZE}"
            f"), deleted AS ("
            f"  DELETE FROM {table} AS target"
            f"  USING batch"
            f"  WHERE target.ctid = batch.ctid"
            f"  RETURNING 1"
            f") SELECT count(*) AS count FROM deleted",
            retention_days,
        )
        batch_count = result["count"] if result else 0
        total_deleted += batch_count

        # If we deleted fewer than the batch size, we're done.
        if batch_count < BATCH_SIZE:
            break

        # Yield to the event loop between batches so we don't starve callers.
        await asyncio.sleep(0.1)

    return total_deleted


async def _redact_conversation_phi(retention_days: int) -> int:
    """Null old conversation transcripts/summaries while retaining metadata."""
    total_redacted = 0

    while True:
        result = await query_one(
            f"WITH batch AS ("
            f"  SELECT ctid"
            f"  FROM conversations"
            f"  WHERE started_at < NOW() - make_interval(days => $1)"
            f"    AND ("
            f"      summary IS NOT NULL"
            f"      OR summary_encrypted IS NOT NULL"
            f"      OR transcript IS NOT NULL"
            f"      OR transcript_encrypted IS NOT NULL"
            f"      OR transcript_text_encrypted IS NOT NULL"
            f"      OR concerns IS NOT NULL"
            f"    )"
            f"  ORDER BY started_at"
            f"  LIMIT {BATCH_SIZE}"
            f"), redacted AS ("
            f"  UPDATE conversations AS target"
            f"  SET summary = NULL,"
            f"      summary_encrypted = NULL,"
            f"      transcript = NULL,"
            f"      transcript_encrypted = NULL,"
            f"      transcript_text_encrypted = NULL,"
            f"      concerns = NULL"
            f"  FROM batch"
            f"  WHERE target.ctid = batch.ctid"
            f"  RETURNING 1"
            f") SELECT count(*) AS count FROM redacted",
            retention_days,
        )
        batch_count = result["count"] if result else 0
        total_redacted += batch_count
        if batch_count < BATCH_SIZE:
            break
        await asyncio.sleep(0.1)

    return total_redacted


async def purge_expired_data() -> dict[str, int]:
    """Delete rows older than their retention period from all PHI tables.

    Returns a dict mapping table name -> number of rows deleted.
    Skips tables whose retention period is set to 0 (disabled).
    """
    retention_days = {
        "conversation_phi": settings.retention_conversations_days,
        "conversations": settings.retention_conversation_metadata_days,
        "memories": settings.retention_memories_days,
        "call_analyses": settings.retention_call_analyses_days,
        "daily_call_context": settings.retention_daily_context_days,
        "call_metrics": settings.retention_call_metrics_days,
        "reminder_deliveries": settings.retention_reminder_deliveries_days,
        "notifications": settings.retention_notifications_days,
        "waitlist": settings.retention_waitlist_days,
        "audit_logs": settings.retention_audit_logs_days,
    }

    results: dict[str, int] = {}

    for table, days in retention_days.items():
        if days <= 0:
            # 0 means retention is disabled for this table -- skip.
            continue

        try:
            if table == "conversation_phi":
                results[table] = await _redact_conversation_phi(days)
                continue

            date_col = TABLE_DATE_COLUMNS.get(table)
            if not date_col:
                continue

            deleted = await _purge_table(table, date_col, days)
            results[table] = deleted
        except Exception as exc:
            # Log the error but continue with the remaining tables so a
            # single missing table (e.g. audit_logs not yet created) doesn't
            # block the whole purge cycle.
            logger.warning(
                "Data retention: failed to purge {table}: {err}",
                table=table,
                err=str(exc),
            )
            results[table] = -1

    return results


# ---------------------------------------------------------------------------
# Background loop
# ---------------------------------------------------------------------------

PURGE_INTERVAL_SECONDS = 24 * 60 * 60  # 24 hours


async def start_retention_loop() -> None:
    """Run the data retention purge once every 24 hours.

    Call once at startup via ``asyncio.create_task(start_retention_loop())``.
    The first purge runs 60 seconds after startup to let the DB pool warm up.
    """
    # Wait briefly so the server can finish starting up.
    await asyncio.sleep(60)

    while True:
        try:
            results = await purge_expired_data()
            total = sum(v for v in results.values() if v > 0)
            if total > 0:
                logger.info(
                    "Data retention purge complete: {results} (total={total})",
                    results=results,
                    total=total,
                )
            else:
                logger.debug("Data retention purge: nothing to delete")
        except Exception as exc:
            logger.error("Data retention purge failed: {err}", err=str(exc))

        await asyncio.sleep(PURGE_INTERVAL_SECONDS)
