"""Prospect service — CRUD for unsubscribed callers.

Tracks callers whose phone number is not in the seniors table.
Stores learned info across calls so return callers can be recognized.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from loguru import logger
from db import query_one, execute


def _normalize_phone(phone: str) -> str:
    """Keep last 10 digits of a phone number."""
    digits = re.sub(r"\D", "", phone)
    return digits[-10:]


async def find_by_phone(phone: str) -> dict | None:
    """Find a prospect by phone number (normalized to last 10 digits)."""
    normalized = _normalize_phone(phone)
    return await query_one("SELECT * FROM prospects WHERE phone = $1", normalized)


async def create(phone: str) -> dict:
    """Create a new prospect record for a first-time unsubscribed caller."""
    normalized = _normalize_phone(phone)
    row = await query_one(
        """INSERT INTO prospects (phone)
           VALUES ($1)
           ON CONFLICT (phone) DO UPDATE SET last_call_at = NOW()
           RETURNING *""",
        normalized,
    )
    logger.info("Created/found prospect: {id} phone=...{last4}",
                id=row["id"], last4=normalized[-4:])
    return row


async def update_after_call(prospect_id: str, data: dict) -> None:
    """Update prospect record after a call completes.

    Args:
        prospect_id: UUID of the prospect.
        data: Dict with optional keys: learned_name, relationship,
              loved_one_name, caller_context (dict to merge).
    """
    fields = ["call_count = call_count + 1", "last_call_at = NOW()", "updated_at = NOW()"]
    values = []
    idx = 1

    for key, col in [
        ("learned_name", "learned_name"),
        ("relationship", "relationship"),
        ("loved_one_name", "loved_one_name"),
    ]:
        if data.get(key):
            fields.append(f"{col} = ${idx}")
            values.append(data[key])
            idx += 1

    # Merge caller_context into existing JSONB
    if data.get("caller_context"):
        fields.append(f"caller_context = caller_context || ${idx}::jsonb")
        values.append(json.dumps(data["caller_context"]))
        idx += 1

    values.append(prospect_id)
    sql = f"UPDATE prospects SET {', '.join(fields)} WHERE id = ${idx}"
    await execute(sql, *values)
    logger.info("Updated prospect {id} after call", id=prospect_id)


def build_context_for_prompt(prospect: dict) -> str:
    """Format prospect data into context string for the onboarding system prompt."""
    parts: list[str] = []

    call_count = prospect.get("call_count", 0)
    name = prospect.get("learned_name")
    relationship = prospect.get("relationship")
    loved_one = prospect.get("loved_one_name")
    ctx = prospect.get("caller_context") or {}
    if isinstance(ctx, str):
        import json as _json
        try:
            ctx = _json.loads(ctx)
        except (ValueError, TypeError):
            ctx = {}

    if call_count > 0 and name:
        parts.append(f"RETURN CALLER: You have spoken with {name} before ({call_count} previous call{'s' if call_count != 1 else ''}).")
        if relationship:
            parts.append(f"They are a {relationship}.")
        if loved_one:
            parts.append(f"They are calling about {loved_one}.")
        call_summary = ctx.get("call_summary")
        if call_summary:
            parts.append(f"Last conversation: {call_summary}")
    else:
        parts.append("NEW CALLER: This is an unsubscribed caller you have not spoken with before.")

    return "\n".join(parts)
