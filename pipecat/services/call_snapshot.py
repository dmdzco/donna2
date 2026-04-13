"""Senior call context snapshot — pre-computed after each call.

Collapses 6 per-call DB queries (summaries, turns, daily context,
analysis) into a single JSONB column on the seniors table, read
for free with find_by_phone().
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from loguru import logger
from db import execute
from services.conversations import get_recent_summaries, get_recent_turns
from services.daily_context import get_todays_context, format_todays_context


async def build_snapshot(
    senior_id: str,
    timezone_name: str = "America/New_York",
    analysis: dict | None = None,
) -> dict:
    """Build the context snapshot from current DB state.

    Called after post-call processing completes, so all data
    (analysis, daily context, summaries) is already written.
    """
    recent_summaries = await get_recent_summaries(senior_id, 3)
    recent_turns = await get_recent_turns(senior_id)
    raw_today = await get_todays_context(senior_id, timezone_name)
    todays_context = format_todays_context(raw_today)

    return {
        "last_call_analysis": analysis,
        "recent_summaries": recent_summaries,
        "recent_turns": recent_turns,
        "todays_context": todays_context,
        "snapshot_updated_at": datetime.now(timezone.utc).isoformat(),
    }


async def save_snapshot(senior_id: str, snapshot: dict) -> None:
    """Persist snapshot to seniors.call_context_snapshot."""
    try:
        await execute(
            "UPDATE seniors SET call_context_snapshot = $1 WHERE id = $2",
            json.dumps(snapshot),
            senior_id,
        )
        logger.info("Saved call snapshot")
    except Exception as e:
        logger.error("Failed to save call snapshot: {err}", err=str(e))
