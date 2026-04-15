"""Tests for temporal grounding labels used in prompt context."""

from datetime import datetime, timezone, timedelta


def test_format_call_time_label_same_day_includes_clock_and_elapsed():
    from services.time_context import format_call_time_label

    now = datetime(2026, 4, 14, 20, 30, tzinfo=timezone.utc)
    started = now - timedelta(minutes=30)

    label = format_call_time_label(started, "America/Chicago", now=now)

    assert "Earlier today" in label
    assert "about 30 minutes ago" in label
    assert "PM" in label


def test_format_call_time_label_uses_senior_local_day():
    from services.time_context import format_call_time_label

    # UTC date changed, but this is still April 14 in America/Los_Angeles.
    now = datetime(2026, 4, 15, 6, 30, tzinfo=timezone.utc)
    started = datetime(2026, 4, 15, 5, 45, tzinfo=timezone.utc)

    label = format_call_time_label(started, "America/Los_Angeles", now=now)

    assert label.startswith("Earlier today")


def test_format_call_time_label_yesterday():
    from services.time_context import format_call_time_label

    now = datetime(2026, 4, 15, 20, 0, tzinfo=timezone.utc)
    started = now - timedelta(days=1, hours=2)

    label = format_call_time_label(started, "America/Chicago", now=now)

    assert label.startswith("Yesterday")
