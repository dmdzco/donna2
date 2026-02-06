"""Senior profile service.

Port of services/seniors.js — CRUD operations for senior profiles.
"""

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
