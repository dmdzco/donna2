"""Reminder delivery record management.

CRUD operations for reminder_deliveries table — marking deliveries as
acknowledged, confirmed, retry_pending, or max_attempts. Also formats
reminder text for injection into system prompts.

Split from scheduler.py to separate delivery tracking (used by bot.py,
tools.py) from the polling loop and call triggering (used by main.py).
"""

from __future__ import annotations

import asyncio
import time

from loguru import logger
from db import query_one, execute
from lib.encryption import encrypt
from lib.phi import decrypt_reminder_phi


async def mark_delivered(reminder_id: str) -> None:
    """Update last_delivered_at on the reminders table."""
    await execute(
        "UPDATE reminders SET last_delivered_at = NOW() WHERE id = $1",
        reminder_id,
    )
    logger.info("Marked reminder delivered: {rid}", rid=reminder_id)


async def mark_reminder_acknowledged(
    delivery_id: str, status: str, user_response: str | None
) -> dict | None:
    """Mark a delivery as acknowledged or confirmed."""
    if not delivery_id:
        logger.error("No delivery_id provided for acknowledgment")
        return None

    if status not in ("acknowledged", "confirmed"):
        logger.error("Invalid status: {s}", s=status)
        return None

    try:
        row = await query_one(
            """UPDATE reminder_deliveries SET
                 status = $1, acknowledged_at = NOW(),
                 user_response = NULL, user_response_encrypted = $2
               WHERE id = $3 RETURNING *""",
            status,
            encrypt(user_response),
            delivery_id,
        )
        logger.info("Delivery {did} marked {s}", did=delivery_id, s=status)
        return row
    except Exception as e:
        logger.error("Failed to mark acknowledgment: {err}", err=str(e))
        return None


async def get_delivery_status(delivery_id: str) -> dict | None:
    """Fetch the current status for a reminder delivery."""
    if not delivery_id:
        return None

    try:
        return await query_one(
            "SELECT id, status, attempt_count FROM reminder_deliveries WHERE id = $1",
            delivery_id,
        )
    except Exception as e:
        logger.error("Failed to fetch delivery status: {err}", err=str(e))
        return None


async def mark_call_ended_without_acknowledgment(delivery_id: str) -> None:
    """Handle call end without acknowledgment — set retry_pending or max_attempts."""
    if not delivery_id:
        return

    try:
        delivery = await query_one(
            "SELECT * FROM reminder_deliveries WHERE id = $1", delivery_id
        )
        if not delivery:
            logger.info("Delivery not found: {did}", did=delivery_id)
            return

        if delivery["status"] in ("acknowledged", "confirmed"):
            logger.info("Delivery already handled: {did} status={s}", did=delivery_id, s=delivery["status"])
            return

        new_status = "max_attempts" if delivery.get("attempt_count", 0) >= 2 else "retry_pending"
        await execute(
            "UPDATE reminder_deliveries SET status = $1 WHERE id = $2",
            new_status,
            delivery_id,
        )
        logger.info("Delivery {did} -> {s} (attempt={a})", did=delivery_id, s=new_status, a=delivery.get("attempt_count"))
    except Exception as e:
        logger.error("Failed to update delivery status: {err}", err=str(e))


async def get_reminder_by_call_sid(call_sid: str) -> dict | None:
    """Look up an active reminder delivery by Twilio call_sid.

    Used when Pipecat receives an outbound call from the Node.js scheduler.
    The scheduler writes call_sid to reminder_deliveries, so Pipecat can
    detect reminder calls without cross-process shared state.

    Returns dict with reminder + delivery info, or None if not a reminder call.
    """
    if not call_sid:
        return None

    row = await query_one(
        """SELECT rd.id AS delivery_id, rd.reminder_id, rd.scheduled_for,
                  rd.status AS delivery_status, rd.attempt_count,
                  r.title, r.title_encrypted, r.description,
                  r.description_encrypted, r.type AS reminder_type
           FROM reminder_deliveries rd
           JOIN reminders r ON rd.reminder_id = r.id
           WHERE rd.call_sid = $1
           LIMIT 1""",
        call_sid,
    )
    if row:
        row = decrypt_reminder_phi(row)
        logger.info("Found reminder for call {cs}", cs=call_sid)
    return row


async def wait_for_reminder_by_call_sid(
    call_sid: str,
    *,
    timeout_seconds: float = 2.0,
    initial_delay_seconds: float = 0.1,
    max_delay_seconds: float = 0.5,
) -> dict | None:
    """Look up a reminder delivery, waiting briefly for scheduler DB writes.

    Twilio can request /voice/answer before the Node scheduler has committed the
    reminder_deliveries row containing call_sid. Waiting here keeps the call on
    the reminder path instead of incorrectly falling through to a generic call.
    """
    if not call_sid:
        return None

    deadline = time.monotonic() + timeout_seconds
    delay = initial_delay_seconds
    attempts = 0

    while True:
        attempts += 1
        row = await get_reminder_by_call_sid(call_sid)
        if row:
            if attempts > 1:
                logger.info(
                    "Found reminder for call {cs} after {attempts} attempts",
                    cs=call_sid,
                    attempts=attempts,
                )
            return row

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            logger.warning(
                "Reminder delivery not found for call {cs} after {attempts} attempts",
                cs=call_sid,
                attempts=attempts,
            )
            return None

        await asyncio.sleep(min(delay, remaining))
        delay = min(delay * 2, max_delay_seconds)


def format_reminder_prompt(reminder: dict) -> str:
    """Format a reminder for injection into system prompt."""
    lines = ["\n\nIMPORTANT REMINDER TO DELIVER:"]
    lines.append(f'You are calling to remind them about: "{reminder.get("title", "")}"')
    if reminder.get("description"):
        lines.append(f"Details: {reminder['description']}")
    rtype = reminder.get("type")
    if rtype == "medication":
        lines.append("This is a medication reminder - be gentle but clear about the importance of taking their medication.")
    elif rtype == "appointment":
        lines.append("This is an appointment reminder - make sure they know the time and any preparation needed.")
    lines.append("\nDeliver this reminder naturally in the conversation - don't sound robotic or alarming.")
    lines.append("Start with a warm greeting, then mention the reminder.")
    return "\n".join(lines)
