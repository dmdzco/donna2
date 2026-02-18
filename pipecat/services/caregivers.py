"""Caregiver service.

Port of services/caregivers.js — manages caregiver-senior relationships via Clerk user IDs.
"""

from __future__ import annotations

from loguru import logger
from db import query_one, query_many, execute


async def link_user_to_senior(
    clerk_user_id: str, senior_id: str, role: str = "caregiver"
) -> dict:
    """Link a Clerk user to a senior (creates caregiver assignment)."""
    row = await query_one(
        """INSERT INTO caregivers (clerk_user_id, senior_id, role)
           VALUES ($1, $2, $3)
           RETURNING *""",
        clerk_user_id,
        senior_id,
        role,
    )
    logger.info("Linked user {uid} to senior {sid} as {role}", uid=clerk_user_id, sid=senior_id, role=role)
    return row


async def get_seniors_for_user(clerk_user_id: str) -> list[dict]:
    """Get all seniors accessible by a Clerk user."""
    rows = await query_many(
        """SELECT s.*, c.role
           FROM caregivers c
           INNER JOIN seniors s ON c.senior_id = s.id
           WHERE c.clerk_user_id = $1 AND s.is_active = true""",
        clerk_user_id,
    )
    return rows


async def can_access_senior(clerk_user_id: str, senior_id: str) -> bool:
    """Check if a Clerk user can access a senior."""
    row = await query_one(
        """SELECT id FROM caregivers
           WHERE clerk_user_id = $1 AND senior_id = $2
           LIMIT 1""",
        clerk_user_id,
        senior_id,
    )
    return row is not None


async def get_users_for_senior(senior_id: str) -> list[dict]:
    """Get all Clerk users who can access a senior."""
    rows = await query_many(
        "SELECT clerk_user_id, role FROM caregivers WHERE senior_id = $1",
        senior_id,
    )
    return rows


async def unlink_user_from_senior(clerk_user_id: str, senior_id: str) -> bool:
    """Remove a user's access to a senior. Returns True if a row was deleted."""
    result = await execute(
        "DELETE FROM caregivers WHERE clerk_user_id = $1 AND senior_id = $2",
        clerk_user_id,
        senior_id,
    )
    # asyncpg execute returns 'DELETE N'
    return not result.endswith("0")


async def get_assignment(clerk_user_id: str, senior_id: str) -> dict | None:
    """Get assignment details for a specific user-senior pair."""
    return await query_one(
        "SELECT * FROM caregivers WHERE clerk_user_id = $1 AND senior_id = $2",
        clerk_user_id,
        senior_id,
    )
