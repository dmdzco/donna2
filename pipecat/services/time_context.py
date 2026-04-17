"""Time-label helpers for cross-call context.

Conversation memory frequently contains relative words like today, tomorrow,
and yesterday. These helpers keep prior-call context anchored to the senior's
local time before it is inserted into prompts.
"""

from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo


def get_timezone(tz_name: str | None) -> ZoneInfo:
    """Return a safe ZoneInfo, falling back to New York."""
    try:
        return ZoneInfo(tz_name or "America/New_York")
    except Exception:
        return ZoneInfo("America/New_York")


def coerce_utc(value) -> datetime | None:
    """Coerce DB timestamps or epoch seconds to aware UTC datetimes."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, timezone.utc)
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    return None


def format_local_datetime(value, tz_name: str | None = None) -> str | None:
    """Format a timestamp in the senior's local timezone."""
    dt_utc = coerce_utc(value)
    if dt_utc is None:
        return None
    local = dt_utc.astimezone(get_timezone(tz_name))
    return local.strftime("%A, %B %-d, %Y at %-I:%M %p")


def _duration_phrase(seconds: float) -> str:
    if seconds < 90:
        return "just now"
    if seconds < 3600:
        minutes = max(1, round(seconds / 60))
        return f"about {minutes} minutes ago"
    if seconds < 86400:
        hours = max(1, round(seconds / 3600))
        return f"about {hours} hour{'s' if hours != 1 else ''} ago"
    days = max(1, round(seconds / 86400))
    return f"{days} day{'s' if days != 1 else ''} ago"


def format_call_time_label(
    started_at,
    tz_name: str | None = None,
    *,
    now=None,
) -> str:
    """Return a human prompt label for when a prior call happened.

    ``started_at`` is treated as UTC when it is a naive DB timestamp. ``now`` is
    injectable for tests and is also treated as UTC when naive.
    """
    started_utc = coerce_utc(started_at)
    if started_utc is None:
        return "previous call"

    now_utc = coerce_utc(now) or datetime.now(timezone.utc)
    delta_seconds = max(0.0, (now_utc - started_utc).total_seconds())
    tz = get_timezone(tz_name)
    local_started = started_utc.astimezone(tz)
    local_now = now_utc.astimezone(tz)
    clock = local_started.strftime("%-I:%M %p")

    days = (local_now.date() - local_started.date()).days
    if days <= 0:
        if delta_seconds < 90:
            return f"Just now at {clock}"
        return f"Earlier today at {clock} ({_duration_phrase(delta_seconds)})"
    if days == 1:
        return f"Yesterday at {clock}"
    if days < 7:
        weekday = local_started.strftime("%A")
        return f"{weekday} at {clock} ({days} days ago)"
    if local_started.year == local_now.year:
        return f"{local_started.strftime('%B %-d')} at {clock} ({days} days ago)"
    return f"{local_started.strftime('%B %-d, %Y')} at {clock}"

