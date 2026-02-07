"""Reminder delivery record management.

CRUD operations for reminder_deliveries table — marking deliveries as
acknowledged, confirmed, retry_pending, or max_attempts. Also formats
reminder text for injection into system prompts.

Split from scheduler.py to separate delivery tracking (used by bot.py,
tools.py) from the polling loop and call triggering (used by main.py).
"""

from loguru import logger
from db import query_one, execute


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
                 status = $1, acknowledged_at = NOW(), user_response = $2
               WHERE id = $3 RETURNING *""",
            status,
            user_response,
            delivery_id,
        )
        logger.info("Delivery {did} marked {s}", did=delivery_id, s=status)
        return row
    except Exception as e:
        logger.error("Failed to mark acknowledgment: {err}", err=str(e))
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
