"""Reminder scheduler service.

Port of services/scheduler.js — finds due reminders, triggers outbound calls,
and runs the polling loop. Uses asyncio for polling instead of setInterval.

Delivery record CRUD lives in services/reminder_delivery.py.
"""

import asyncio
import os
import re
from datetime import datetime, timezone, timedelta
from loguru import logger
from db import query_one, query_many, execute
from services.reminder_delivery import mark_delivered, format_reminder_prompt

# Lazy-loaded Twilio client
_twilio_client = None

# Pre-fetched context maps (shared state — same semantics as Node.js Maps)
pending_reminder_calls: dict[str, dict] = {}
prefetched_context_by_phone: dict[str, dict] = {}


def _get_twilio_client():
    global _twilio_client
    if _twilio_client is None:
        sid = os.environ.get("TWILIO_ACCOUNT_SID")
        token = os.environ.get("TWILIO_AUTH_TOKEN")
        if sid and token:
            from twilio.rest import Client
            _twilio_client = Client(sid, token)
    return _twilio_client


def _normalize_phone(phone: str) -> str:
    return re.sub(r"\D", "", phone)[-10:]


def get_scheduled_for_time(reminder: dict) -> datetime | None:
    """Calculate the 'scheduled for' time for a reminder instance."""
    scheduled_time = reminder.get("scheduled_time")
    if not scheduled_time:
        return None

    if isinstance(scheduled_time, str):
        scheduled_time = datetime.fromisoformat(scheduled_time)

    if reminder.get("is_recurring"):
        now = datetime.now(timezone.utc)
        return now.replace(
            hour=scheduled_time.hour,
            minute=scheduled_time.minute,
            second=0,
            microsecond=0,
        )
    return scheduled_time


async def get_due_reminders() -> list[dict]:
    """Find reminders that are due now.

    Checks: non-recurring past due, recurring time-of-day match,
    and retry-pending deliveries ready for retry (>30 min since last attempt).
    """
    now = datetime.now(timezone.utc)
    one_minute = now + timedelta(minutes=1)
    thirty_minutes_ago = now - timedelta(minutes=30)

    # Non-recurring reminders due now
    non_recurring = await query_many(
        """SELECT r.*, s.*,
                  r.id AS reminder_id, s.id AS senior_id,
                  r.is_active AS r_active, s.is_active AS s_active
           FROM reminders r
           INNER JOIN seniors s ON r.senior_id = s.id
           WHERE r.is_active = true
             AND r.is_recurring = false
             AND r.scheduled_time <= $1
             AND s.is_active = true""",
        one_minute,
    )

    # Recurring reminders (all active — filter by time-of-day in Python)
    recurring_all = await query_many(
        """SELECT r.*, s.*,
                  r.id AS reminder_id, s.id AS senior_id,
                  r.is_active AS r_active, s.is_active AS s_active
           FROM reminders r
           INNER JOIN seniors s ON r.senior_id = s.id
           WHERE r.is_active = true
             AND r.is_recurring = true
             AND s.is_active = true""",
    )

    # Filter recurring to those whose time-of-day matches now (within 5 min)
    now_minutes = now.hour * 60 + now.minute
    recurring_due = []
    for row in recurring_all:
        st = row.get("scheduled_time")
        if not st:
            continue
        if isinstance(st, str):
            st = datetime.fromisoformat(st)
        sched_minutes = st.hour * 60 + st.minute
        if abs(sched_minutes - now_minutes) <= 5:
            recurring_due.append(row)

    all_candidates = non_recurring + recurring_due

    due_reminders = []
    for candidate in all_candidates:
        reminder = _extract_reminder(candidate)
        senior = _extract_senior(candidate)
        scheduled_for = get_scheduled_for_time(reminder)
        if not scheduled_for:
            continue

        window_start = scheduled_for - timedelta(minutes=5)
        window_end = scheduled_for + timedelta(minutes=5)

        # Check for already acknowledged/confirmed/max_attempts delivery
        existing = await query_one(
            """SELECT id FROM reminder_deliveries
               WHERE reminder_id = $1
                 AND scheduled_for BETWEEN $2 AND $3
                 AND status IN ('acknowledged', 'confirmed', 'max_attempts')
               LIMIT 1""",
            reminder["id"],
            window_start,
            window_end,
        )
        if existing:
            continue

        # Check for already-delivered (pending) delivery
        pending = await query_one(
            """SELECT id FROM reminder_deliveries
               WHERE reminder_id = $1
                 AND scheduled_for BETWEEN $2 AND $3
                 AND status IN ('delivered', 'retry_pending')
               LIMIT 1""",
            reminder["id"],
            window_start,
            window_end,
        )
        if not pending:
            due_reminders.append({
                "reminder": reminder,
                "senior": senior,
                "scheduled_for": scheduled_for,
            })

    # Retries: retry_pending deliveries >30 min since last attempt
    retries = await query_many(
        """SELECT rd.*, r.*, s.*,
                  rd.id AS delivery_id, r.id AS reminder_id, s.id AS senior_id,
                  rd.status AS delivery_status
           FROM reminder_deliveries rd
           INNER JOIN reminders r ON rd.reminder_id = r.id
           INNER JOIN seniors s ON r.senior_id = s.id
           WHERE rd.status = 'retry_pending'
             AND rd.delivered_at < $1
             AND r.is_active = true
             AND s.is_active = true""",
        thirty_minutes_ago,
    )
    for row in retries:
        due_reminders.append({
            "reminder": _extract_reminder(row),
            "senior": _extract_senior(row),
            "scheduled_for": row.get("scheduled_for"),
            "existing_delivery": _extract_delivery(row),
        })

    return due_reminders


async def trigger_reminder_call(
    reminder: dict,
    senior: dict,
    base_url: str,
    scheduled_for: datetime | None = None,
    existing_delivery: dict | None = None,
) -> dict | None:
    """Trigger an outbound call for a reminder. Pre-fetches context first."""
    client = _get_twilio_client()
    if not client:
        logger.error("Twilio not configured")
        return None

    try:
        logger.info("Pre-fetching context for {name}", name=senior.get("name"))

        from services.memory import build_context
        memory_context = await build_context(senior["id"], None, senior)
        reminder_prompt = format_reminder_prompt(reminder)

        logger.info("Context ready, triggering call (ctx_len={n})", n=len(memory_context or ""))

        call = client.calls.create(
            to=senior["phone"],
            from_=os.environ["TWILIO_PHONE_NUMBER"],
            url=f"{base_url}/voice/answer",
            status_callback=f"{base_url}/voice/status",
            status_callback_event=["initiated", "ringing", "answered", "completed"],
        )

        target_scheduled_for = scheduled_for or get_scheduled_for_time(reminder) or datetime.now(timezone.utc)

        # Create or update delivery record
        if existing_delivery:
            delivery = await query_one(
                """UPDATE reminder_deliveries SET
                     delivered_at = NOW(), call_sid = $1,
                     attempt_count = $2, status = 'delivered'
                   WHERE id = $3 RETURNING *""",
                call.sid,
                existing_delivery.get("attempt_count", 0) + 1,
                existing_delivery["id"],
            )
            logger.info("Updated delivery {did} attempt={a}", did=delivery["id"], a=delivery["attempt_count"])
        else:
            delivery = await query_one(
                """INSERT INTO reminder_deliveries
                   (reminder_id, scheduled_for, delivered_at, call_sid, status, attempt_count)
                   VALUES ($1, $2, NOW(), $3, 'delivered', 1)
                   RETURNING *""",
                reminder["id"],
                target_scheduled_for,
                call.sid,
            )
            logger.info("Created delivery {did}", did=delivery["id"])

        pending_reminder_calls[call.sid] = {
            "reminder": reminder,
            "senior": senior,
            "memory_context": memory_context,
            "reminder_prompt": reminder_prompt,
            "triggered_at": datetime.now(timezone.utc),
            "delivery": delivery,
            "scheduled_for": target_scheduled_for,
        }

        logger.info("Call initiated callSid={cs}", cs=call.sid)
        return {"sid": call.sid, "delivery": delivery}

    except Exception as e:
        logger.error("Failed to initiate call: {err}", err=str(e))
        return None


async def prefetch_for_phone(phone_number: str, senior: dict | None) -> dict:
    """Pre-fetch context for a manual outbound call."""
    logger.info("Pre-fetching for manual call: {name}", name=senior.get("name") if senior else "unknown")

    memory_context = None
    pre_generated_greeting = None

    if senior:
        try:
            from services.context_cache import get_cache
            cached = get_cache(senior["id"])
        except ImportError:
            cached = None

        if cached:
            memory_context = cached.get("memory_context")
            pre_generated_greeting = cached.get("greeting")
            logger.info("Using cached context for {name}", name=senior.get("name"))
        else:
            from services.memory import build_context
            memory_context = await build_context(senior["id"], None, senior)

    recent_turns = None
    if cached:
        recent_turns = cached.get("recent_turns")

    normalized = _normalize_phone(phone_number)
    prefetched_context_by_phone[normalized] = {
        "senior": senior,
        "memory_context": memory_context,
        "pre_generated_greeting": pre_generated_greeting,
        "recent_turns": recent_turns,
        "fetched_at": datetime.now(timezone.utc),
    }

    logger.info("Pre-fetch complete phone={p} greeting_ready={g}", p=normalized, g=bool(pre_generated_greeting))
    return {"senior": senior, "memory_context": memory_context, "pre_generated_greeting": pre_generated_greeting}


def get_prefetched_context(phone_number: str) -> dict | None:
    """Get pre-fetched context for a phone number (one-time use)."""
    normalized = _normalize_phone(phone_number)
    return prefetched_context_by_phone.pop(normalized, None)


def get_reminder_context(call_sid: str) -> dict | None:
    """Get reminder context for a call (if triggered by a reminder)."""
    return pending_reminder_calls.get(call_sid)


def clear_reminder_context(call_sid: str) -> None:
    """Clear reminder context after call ends."""
    pending_reminder_calls.pop(call_sid, None)


# ---------------------------------------------------------------------------
# Row extraction helpers (flat join rows → structured dicts)
# ---------------------------------------------------------------------------

def _extract_reminder(row: dict) -> dict:
    """Extract reminder fields from a joined row."""
    return {
        "id": row.get("reminder_id") or row.get("id"),
        "senior_id": row.get("senior_id"),
        "type": row.get("type"),
        "title": row.get("title"),
        "description": row.get("description"),
        "scheduled_time": row.get("scheduled_time"),
        "is_recurring": row.get("is_recurring"),
        "cron_expression": row.get("cron_expression"),
        "is_active": row.get("r_active") if "r_active" in row else row.get("is_active"),
        "last_delivered_at": row.get("last_delivered_at"),
    }


def _extract_senior(row: dict) -> dict:
    """Extract senior fields from a joined row."""
    return {
        "id": row.get("senior_id"),
        "name": row.get("name"),
        "phone": row.get("phone"),
        "timezone": row.get("timezone"),
        "interests": row.get("interests"),
        "family_info": row.get("family_info"),
        "medical_notes": row.get("medical_notes"),
        "is_active": row.get("s_active") if "s_active" in row else row.get("is_active"),
    }


def _extract_delivery(row: dict) -> dict:
    """Extract delivery fields from a joined row."""
    return {
        "id": row.get("delivery_id"),
        "reminder_id": row.get("reminder_id"),
        "scheduled_for": row.get("scheduled_for"),
        "delivered_at": row.get("delivered_at"),
        "status": row.get("delivery_status") or row.get("status"),
        "attempt_count": row.get("attempt_count"),
        "call_sid": row.get("call_sid"),
    }


# ---------------------------------------------------------------------------
# Scheduler loop (replaces Node.js setInterval)
# ---------------------------------------------------------------------------

async def start_scheduler(base_url: str, interval_seconds: int = 60) -> None:
    """Start the reminder polling loop and hourly context pre-fetch.

    This runs forever — call as an asyncio task:
        asyncio.create_task(start_scheduler(base_url))
    """
    scheduler_enabled = os.environ.get("SCHEDULER_ENABLED", "false").lower()
    if scheduler_enabled != "true":
        logger.info("Scheduler disabled (SCHEDULER_ENABLED != 'true')")
        return

    logger.info("Starting scheduler (interval={i}s)", i=interval_seconds)

    async def check_reminders():
        try:
            due = await get_due_reminders()
            if due:
                logger.info("Found {n} due reminders", n=len(due))
            for item in due:
                result = await trigger_reminder_call(
                    item["reminder"],
                    item["senior"],
                    base_url,
                    item.get("scheduled_for"),
                    item.get("existing_delivery"),
                )
                if result:
                    await mark_delivered(item["reminder"]["id"])
        except Exception as e:
            logger.error("Error checking reminders: {err}", err=str(e))

    async def prefetch_loop():
        while True:
            try:
                from services.context_cache import run_daily_prefetch
                await run_daily_prefetch()
            except Exception as e:
                logger.error("Context pre-fetch error: {err}", err=str(e))
            await asyncio.sleep(3600)  # Every hour

    # Initial checks
    await check_reminders()

    asyncio.create_task(prefetch_loop())
    logger.info("Context pre-caching enabled (hourly check for 5 AM local time)")

    # Polling loop
    while True:
        await asyncio.sleep(interval_seconds)
        await check_reminders()
