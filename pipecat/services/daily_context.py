"""Same-day cross-call memory service.

Port of services/daily-context.js — tracks what happened in each call
so subsequent calls on the same day don't repeat topics/reminders/advice.
"""

from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from loguru import logger
from db import query_one, query_many


def _get_start_of_day(tz_name: str = "America/New_York") -> datetime:
    """Get midnight (start of day) in the given timezone, returned as UTC datetime."""
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("America/New_York")

    now = datetime.now(tz)
    midnight_local = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight_local.astimezone(timezone.utc)


async def save_call_context(senior_id: str, call_sid: str, data: dict) -> dict | None:
    """Save context from a completed call.

    Accepts snake_case keys: topics_discussed, reminders_delivered,
    advice_given, key_moments, summary, timezone.
    """
    try:
        call_date = _get_start_of_day(data.get("timezone", "America/New_York"))
        row = await query_one(
            """INSERT INTO daily_call_context
               (senior_id, call_date, call_sid, topics_discussed, reminders_delivered,
                advice_given, key_moments, summary)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               RETURNING *""",
            senior_id,
            call_date,
            call_sid,
            data.get("topics_discussed", []),
            data.get("reminders_delivered", []),
            data.get("advice_given", []),
            data.get("key_moments", []),
            data.get("summary"),
        )
        logger.info("Saved call context for senior {sid}, call {cs}", sid=senior_id, cs=call_sid)
        return row
    except Exception as e:
        logger.error("Error saving call context: {err}", err=str(e))
        return None


async def get_todays_context(
    senior_id: str, tz_name: str = "America/New_York"
) -> dict:
    """Load all context from today's previous calls for a senior."""
    empty = {
        "topicsDiscussed": [],
        "remindersDelivered": [],
        "adviceGiven": [],
        "keyMoments": [],
        "previousCallCount": 0,
        "summaries": [],
    }

    try:
        start_of_day = _get_start_of_day(tz_name)
        rows = await query_many(
            """SELECT * FROM daily_call_context
               WHERE senior_id = $1 AND call_date >= $2
               ORDER BY created_at""",
            senior_id,
            start_of_day,
        )
        if not rows:
            return empty

        topics: set[str] = set()
        reminders: set[str] = set()
        advice: set[str] = set()
        key_moments: list = []
        summaries: list[str] = []

        for row in rows:
            for t in (row.get("topics_discussed") or []):
                topics.add(t)
            for r in (row.get("reminders_delivered") or []):
                reminders.add(r)
            for a in (row.get("advice_given") or []):
                advice.add(a)
            km = row.get("key_moments")
            if km:
                if isinstance(km, list):
                    key_moments.extend(km)
                else:
                    key_moments.append(km)
            if row.get("summary"):
                summaries.append(row["summary"])

        return {
            "topicsDiscussed": list(topics),
            "remindersDelivered": list(reminders),
            "adviceGiven": list(advice),
            "keyMoments": key_moments,
            "previousCallCount": len(rows),
            "summaries": summaries,
        }
    except Exception as e:
        logger.error("Error loading today's context: {err}", err=str(e))
        return empty


async def was_reminder_delivered_today(
    senior_id: str, reminder_title: str, tz_name: str = "America/New_York"
) -> bool:
    """Check if a specific reminder was already delivered today."""
    ctx = await get_todays_context(senior_id, tz_name)
    title_lower = reminder_title.lower()
    return any(
        title_lower in r.lower() or r.lower() in title_lower
        for r in ctx["remindersDelivered"]
    )


def format_todays_context(todays_context: dict | None) -> str | None:
    """Format today's context as a prompt section for system prompt injection."""
    if not todays_context or todays_context.get("previousCallCount", 0) == 0:
        return None

    count = todays_context["previousCallCount"]
    plural = "s" if count > 1 else ""
    lines = [f"EARLIER TODAY (from {count} previous call{plural}):"]

    td = todays_context.get("topicsDiscussed") or []
    if td:
        lines.append(f"- You already discussed: {', '.join(td)}")

    rd = todays_context.get("remindersDelivered") or []
    if rd:
        lines.append(f"- Reminders already delivered today: {', '.join(rd)}")
        lines.append('  -> If a reminder was already given today, ask "Did you get a chance to [do it]?" instead of repeating it')

    ag = todays_context.get("adviceGiven") or []
    if ag:
        lines.append(f"- Advice already given: {', '.join(ag)}")

    sm = todays_context.get("summaries") or []
    if sm:
        lines.append(f"- What happened earlier: {'; '.join(s for s in sm if s)}")

    lines.append(
        "\nDo NOT repeat reminders or advice from earlier today. "
        'Reference them naturally: "This morning I mentioned...", "Earlier I reminded you about..."'
    )
    return "\n".join(lines)
