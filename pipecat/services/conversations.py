"""Conversation history service.

Port of services/conversations.js — CRUD for call records + summary/transcript retrieval.
"""

import json
import math
from datetime import datetime, timezone
from loguru import logger
from db import query_one, query_many, execute


async def create(data: dict) -> dict:
    """Create a new conversation record."""
    row = await query_one(
        """INSERT INTO conversations (senior_id, call_sid, started_at, status)
           VALUES ($1, $2, $3, 'in_progress')
           RETURNING *""",
        data.get("seniorId"),
        data.get("callSid"),
        data.get("startedAt") or datetime.now(timezone.utc),
    )
    logger.info("Created conversation {id} callSid={cs}", id=row["id"], cs=data.get("callSid"))
    return row


async def complete(call_sid: str, data: dict) -> dict | None:
    """Update a conversation when a call ends."""
    row = await query_one(
        """UPDATE conversations SET
             ended_at = NOW(),
             duration_seconds = $1,
             status = $2,
             summary = $3,
             transcript = $4,
             call_metrics = $5,
             sentiment = $6,
             concerns = $7
           WHERE call_sid = $8
           RETURNING *""",
        data.get("durationSeconds"),
        data.get("status", "completed"),
        data.get("summary"),
        json.dumps(data["transcript"]) if data.get("transcript") else None,
        json.dumps(data["callMetrics"]) if data.get("callMetrics") else None,
        data.get("sentiment"),
        data.get("concerns"),
        call_sid,
    )
    if row:
        logger.info("Completed conversation {id} ({dur}s)", id=row["id"], dur=data.get("durationSeconds"))
    return row


async def get_by_call_sid(call_sid: str) -> dict | None:
    """Get a conversation by its Twilio call SID."""
    return await query_one("SELECT * FROM conversations WHERE call_sid = $1", call_sid)


async def get_for_senior(senior_id: str, limit: int = 10) -> list[dict]:
    """Get recent conversations for a senior."""
    return await query_many(
        "SELECT * FROM conversations WHERE senior_id = $1 ORDER BY started_at DESC LIMIT $2",
        senior_id,
        limit,
    )


async def update_summary(call_sid: str, summary: str) -> dict | None:
    """Update conversation summary (called after post-call analysis)."""
    try:
        row = await query_one(
            "UPDATE conversations SET summary = $1 WHERE call_sid = $2 RETURNING *",
            summary,
            call_sid,
        )
        if row:
            logger.info("Updated summary for callSid={cs}", cs=call_sid)
        return row
    except Exception as e:
        logger.error("Error updating summary: {err}", err=str(e))
        return None


async def get_recent_summaries(senior_id: str, limit: int = 3) -> str | None:
    """Get recent call summaries formatted as a context string."""
    rows = await query_many(
        """SELECT summary, started_at, duration_seconds
           FROM conversations
           WHERE senior_id = $1
             AND status = 'completed'
             AND summary IS NOT NULL
             AND summary != ''
           ORDER BY started_at DESC
           LIMIT $2""",
        senior_id,
        limit,
    )
    if not rows:
        return None

    now = datetime.now(timezone.utc)
    lines = []
    for row in rows:
        delta = now - row["started_at"]
        days_ago = delta.days
        if days_ago == 0:
            time_ago = "Earlier today"
        elif days_ago == 1:
            time_ago = "Yesterday"
        else:
            time_ago = f"{days_ago} days ago"
        duration = f"({round(row['duration_seconds'] / 60)} min)" if row.get("duration_seconds") else ""
        lines.append(f"- {time_ago} {duration}: {row['summary']}")

    return "\n".join(lines)


async def get_recent_history(senior_id: str, message_limit: int = 6) -> list[dict]:
    """Legacy: get recent conversation messages for context."""
    rows = await query_many(
        """SELECT transcript, started_at
           FROM conversations
           WHERE senior_id = $1
             AND status = 'completed'
             AND transcript IS NOT NULL
           ORDER BY started_at DESC
           LIMIT 2""",
        senior_id,
    )
    if not rows:
        return []

    all_messages: list[dict] = []
    for row in rows:
        try:
            transcript = row["transcript"]
            if isinstance(transcript, str):
                transcript = json.loads(transcript)
            if isinstance(transcript, list):
                msgs = [
                    {"role": m["role"], "content": m["content"], "fromPreviousCall": True}
                    for m in transcript[-4:]
                ]
                all_messages.extend(msgs)
        except Exception:
            pass

    return all_messages[-message_limit:]


async def get_recent(limit: int = 20) -> list[dict]:
    """Get all recent conversations with senior names (admin view)."""
    return await query_many(
        """SELECT c.*, s.name AS senior_name
           FROM conversations c
           LEFT JOIN seniors s ON c.senior_id = s.id
           ORDER BY c.started_at DESC
           LIMIT $1""",
        limit,
    )
