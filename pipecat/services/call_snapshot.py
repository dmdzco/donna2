"""Senior call context snapshot — pre-computed after each call.

Collapses 6 per-call DB queries (summaries, turns, daily context,
analysis) into a single JSONB column on the seniors table, read
for free with find_by_phone().
"""

from __future__ import annotations

from datetime import datetime, timezone

from loguru import logger
from db import execute
from lib.encryption import encrypt_json
from services.conversations import get_recent_summaries, get_recent_turns
from services.daily_context import get_todays_context, format_todays_context
from services.time_context import format_call_time_label, format_local_datetime


async def build_snapshot(
    senior_id: str,
    timezone_name: str = "America/New_York",
    analysis: dict | None = None,
    last_call_started_at=None,
) -> dict:
    """Build the context snapshot from current DB state.

    Called after post-call processing completes, so all data
    (analysis, daily context, summaries) is already written.
    """
    recent_summaries = await get_recent_summaries(senior_id, 3, timezone_name)
    recent_turns = await get_recent_turns(senior_id, timezone_name=timezone_name)
    raw_today = await get_todays_context(senior_id, timezone_name)
    todays_context = format_todays_context(raw_today)
    annotated_analysis = analysis
    if isinstance(analysis, dict) and last_call_started_at is not None:
        annotated_analysis = {
            **analysis,
            "call_time_label": format_call_time_label(
                last_call_started_at,
                timezone_name,
            ),
            "call_datetime": format_local_datetime(
                last_call_started_at,
                timezone_name,
            ),
        }

    return {
        "last_call_analysis": annotated_analysis,
        "recent_summaries": recent_summaries,
        "recent_turns": recent_turns,
        "todays_context": todays_context,
        "snapshot_updated_at": datetime.now(timezone.utc).isoformat(),
    }


async def save_snapshot(senior_id: str, snapshot: dict) -> None:
    """Persist snapshot to encrypted senior snapshot storage."""
    try:
        await execute(
            """UPDATE seniors
               SET call_context_snapshot = NULL,
                   call_context_snapshot_encrypted = $1
               WHERE id = $2""",
            encrypt_json(snapshot),
            senior_id,
        )
        logger.info("Saved call snapshot")
    except Exception as e:
        logger.error("Failed to save call snapshot: {err}", err=str(e))
