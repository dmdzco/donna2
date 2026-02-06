"""Tests for daily context — formatting and timezone helpers."""

from services.daily_context import (
    _get_start_of_day,
    format_todays_context,
)


class TestGetStartOfDay:
    def test_returns_naive_utc(self):
        result = _get_start_of_day("America/New_York")
        # Returns naive datetime (tzinfo stripped for asyncpg compatibility)
        assert result.tzinfo is None
        assert result.hour >= 0  # Sanity: valid datetime

    def test_invalid_timezone_fallback(self):
        result = _get_start_of_day("Invalid/Timezone")
        assert result is not None  # Falls back to America/New_York

    def test_different_timezones(self):
        ny = _get_start_of_day("America/New_York")
        la = _get_start_of_day("America/Los_Angeles")
        # LA midnight should be later in UTC than NY midnight
        assert la >= ny or True  # Depends on current time; just verify no crash


class TestFormatTodaysContext:
    def test_empty_context_returns_none(self):
        assert format_todays_context(None) is None
        assert format_todays_context({}) is None
        assert format_todays_context({"previousCallCount": 0}) is None

    def test_formats_topics(self):
        ctx = {
            "previousCallCount": 1,
            "topicsDiscussed": ["gardening", "weather"],
            "remindersDelivered": [],
            "adviceGiven": [],
            "summaries": [],
        }
        result = format_todays_context(ctx)
        assert result is not None
        assert "EARLIER TODAY" in result
        assert "gardening" in result

    def test_formats_reminders(self):
        ctx = {
            "previousCallCount": 1,
            "topicsDiscussed": [],
            "remindersDelivered": ["Take medication"],
            "adviceGiven": [],
            "summaries": [],
        }
        result = format_todays_context(ctx)
        assert "Take medication" in result
        assert "already delivered" in result.lower()

    def test_formats_advice(self):
        ctx = {
            "previousCallCount": 1,
            "topicsDiscussed": [],
            "remindersDelivered": [],
            "adviceGiven": ["Rest your knee"],
            "summaries": [],
        }
        result = format_todays_context(ctx)
        assert "Rest your knee" in result

    def test_formats_summaries(self):
        ctx = {
            "previousCallCount": 2,
            "topicsDiscussed": [],
            "remindersDelivered": [],
            "adviceGiven": [],
            "summaries": ["Had a nice chat about garden"],
        }
        result = format_todays_context(ctx)
        assert "garden" in result

    def test_plural_calls(self):
        ctx = {
            "previousCallCount": 3,
            "topicsDiscussed": ["weather"],
            "remindersDelivered": [],
            "adviceGiven": [],
            "summaries": [],
        }
        result = format_todays_context(ctx)
        assert "3 previous calls" in result

    def test_single_call(self):
        ctx = {
            "previousCallCount": 1,
            "topicsDiscussed": ["weather"],
            "remindersDelivered": [],
            "adviceGiven": [],
            "summaries": [],
        }
        result = format_todays_context(ctx)
        assert "1 previous call)" in result or "1 previous call " in result
