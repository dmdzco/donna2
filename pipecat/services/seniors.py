"""Senior profile service.

Port of services/seniors.js — CRUD operations for senior profiles.
"""

from __future__ import annotations

import json
import re
from loguru import logger
from db import query_one, query_many, execute


def _normalize_phone(phone: str) -> str:
    """Keep last 10 digits of a phone number."""
    digits = re.sub(r"\D", "", phone)
    return digits[-10:]


async def find_by_phone(phone: str) -> dict | None:
    """Find a senior by phone number (normalized to last 10 digits)."""
    normalized = _normalize_phone(phone)
    return await query_one("SELECT * FROM seniors WHERE phone = $1", normalized)


async def create(data: dict) -> dict:
    """Create a new senior profile."""
    phone = _normalize_phone(data["phone"])
    row = await query_one(
        """INSERT INTO seniors (name, phone, timezone, interests, family_info,
           medical_notes, preferred_call_times, city, state, zip_code, additional_info)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING *""",
        data.get("name"),
        phone,
        data.get("timezone", "America/New_York"),
        data.get("interests"),
        data.get("familyInfo"),
        data.get("medicalNotes"),
        data.get("preferredCallTimes"),
        data.get("city"),
        data.get("state"),
        data.get("zipCode"),
        data.get("additionalInfo"),
    )
    logger.info("Created senior: {name} {phone}", name=row["name"], phone=phone)
    return row


async def update(senior_id: str, data: dict) -> dict | None:
    """Update a senior profile. Returns updated row or None."""
    fields = []
    values = []
    idx = 1

    for key, col in [
        ("name", "name"),
        ("phone", "phone"),
        ("timezone", "timezone"),
        ("interests", "interests"),
        ("interest_scores", "interest_scores"),
        ("familyInfo", "family_info"),
        ("medicalNotes", "medical_notes"),
        ("preferredCallTimes", "preferred_call_times"),
        ("city", "city"),
        ("state", "state"),
        ("zipCode", "zip_code"),
        ("additionalInfo", "additional_info"),
    ]:
        if key in data:
            val = data[key]
            if key == "phone":
                val = _normalize_phone(val)
            elif key == "interest_scores" and isinstance(val, dict):
                val = json.dumps(val)
            fields.append(f"{col} = ${idx}")
            values.append(val)
            idx += 1

    if not fields:
        return await get_by_id(senior_id)

    fields.append(f"updated_at = NOW()")
    values.append(senior_id)

    sql = f"UPDATE seniors SET {', '.join(fields)} WHERE id = ${idx} RETURNING *"
    return await query_one(sql, *values)


async def list_active() -> list[dict]:
    """List all active seniors."""
    return await query_many("SELECT * FROM seniors WHERE is_active = true")


async def get_by_id(senior_id: str) -> dict | None:
    """Get a senior by ID."""
    return await query_one("SELECT * FROM seniors WHERE id = $1", senior_id)


async def delete(senior_id: str) -> dict | None:
    """Soft-delete a senior (set is_active = false)."""
    return await query_one(
        "UPDATE seniors SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *",
        senior_id,
    )


DEFAULT_CALL_SETTINGS = {
    "max_call_minutes": 12,
    "winding_down_minutes": 9,
    "goodbye_delay_seconds": 2.0,
    "greeting_followup_chance": 0.6,
    "memory_decay_half_life_days": 30,
    "max_consecutive_questions": 2,
    "memory_refresh_after_minutes": 5,
}


async def get_call_settings(senior_id: str) -> dict:
    """Get per-senior call settings, with defaults."""
    row = await query_one(
        "SELECT call_settings FROM seniors WHERE id = $1", senior_id
    )
    overrides = (row or {}).get("call_settings") or {}
    if isinstance(overrides, str):
        import json as _json
        try:
            overrides = _json.loads(overrides)
        except Exception:
            overrides = {}
    return {**DEFAULT_CALL_SETTINGS, **overrides}
