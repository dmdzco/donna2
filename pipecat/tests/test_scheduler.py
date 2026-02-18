"""Tests for services/scheduler.py — reminder scheduling + outbound calls."""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, AsyncMock, MagicMock

from services.scheduler import (
    get_scheduled_for_time,
    get_reminder_context,
    clear_reminder_context,
    get_prefetched_context,
    pending_reminder_calls,
    prefetched_context_by_phone,
    _normalize_phone,
    _extract_reminder,
    _extract_senior,
    _extract_delivery,
)


class TestGetScheduledForTime:
    def test_non_recurring_passthrough(self):
        dt = datetime(2025, 6, 15, 9, 30, tzinfo=timezone.utc)
        reminder = {"scheduled_time": dt, "is_recurring": False}
        assert get_scheduled_for_time(reminder) == dt

    def test_recurring_normalizes_to_today(self):
        dt = datetime(2025, 1, 1, 14, 30, tzinfo=timezone.utc)
        reminder = {"scheduled_time": dt, "is_recurring": True}
        result = get_scheduled_for_time(reminder)
        now = datetime.now(timezone.utc)
        assert result.hour == 14
        assert result.minute == 30
        assert result.day == now.day

    def test_string_parsing(self):
        reminder = {"scheduled_time": "2025-06-15T09:30:00+00:00", "is_recurring": False}
        result = get_scheduled_for_time(reminder)
        assert result.hour == 9
        assert result.minute == 30

    def test_none_scheduled_time(self):
        assert get_scheduled_for_time({"scheduled_time": None}) is None
        assert get_scheduled_for_time({}) is None


class TestInMemoryOps:
    @pytest.fixture(autouse=True)
    def clear_maps(self):
        pending_reminder_calls.clear()
        prefetched_context_by_phone.clear()
        yield
        pending_reminder_calls.clear()
        prefetched_context_by_phone.clear()

    def test_get_reminder_context(self):
        pending_reminder_calls["CA-123"] = {"reminder": {"id": "r1"}}
        assert get_reminder_context("CA-123")["reminder"]["id"] == "r1"

    def test_get_reminder_context_unknown(self):
        assert get_reminder_context("CA-999") is None

    def test_clear_reminder_context(self):
        pending_reminder_calls["CA-123"] = {"data": True}
        clear_reminder_context("CA-123")
        assert "CA-123" not in pending_reminder_calls

    def test_get_prefetched_context_one_time_use(self):
        prefetched_context_by_phone["5551234567"] = {"senior": {"name": "Test"}}
        result = get_prefetched_context("5551234567")
        assert result is not None
        assert get_prefetched_context("5551234567") is None

    def test_get_prefetched_context_unknown(self):
        assert get_prefetched_context("0000000000") is None


class TestNormalizePhone:
    def test_strips_formatting(self):
        assert _normalize_phone("(555) 123-4567") == "5551234567"

    def test_strips_country_code(self):
        assert _normalize_phone("+15551234567") == "5551234567"

    def test_already_clean(self):
        assert _normalize_phone("5551234567") == "5551234567"

    def test_with_spaces(self):
        assert _normalize_phone("555 123 4567") == "5551234567"


class TestExtractHelpers:
    def test_extract_reminder(self):
        row = {"reminder_id": "r1", "id": "other", "title": "Take pills", "type": "medication", "description": "500mg", "scheduled_time": None, "is_recurring": False, "cron_expression": None, "r_active": True, "is_active": False, "senior_id": "s1", "last_delivered_at": None}
        result = _extract_reminder(row)
        assert result["id"] == "r1"
        assert result["title"] == "Take pills"
        assert result["is_active"] is True

    def test_extract_senior(self):
        row = {"senior_id": "s1", "name": "Margaret", "phone": "+15551234567", "timezone": "America/New_York", "interests": ["gardening"], "family_info": None, "medical_notes": None, "s_active": True, "is_active": False}
        result = _extract_senior(row)
        assert result["id"] == "s1"
        assert result["name"] == "Margaret"
        assert result["is_active"] is True

    def test_extract_delivery(self):
        row = {"delivery_id": "d1", "reminder_id": "r1", "scheduled_for": None, "delivered_at": None, "delivery_status": "delivered", "status": "other", "attempt_count": 1, "call_sid": "CA-1"}
        result = _extract_delivery(row)
        assert result["id"] == "d1"
        assert result["status"] == "delivered"


class TestTriggerReminderCall:
    @pytest.fixture(autouse=True)
    def clear_maps(self):
        pending_reminder_calls.clear()
        yield
        pending_reminder_calls.clear()

    @pytest.mark.asyncio
    async def test_returns_none_without_twilio(self):
        with patch("services.scheduler._get_twilio_client", return_value=None):
            from services.scheduler import trigger_reminder_call
            result = await trigger_reminder_call({"id": "r1"}, {"id": "s1", "name": "Test", "phone": "+15551234567"}, "https://example.com")
            assert result is None

    @pytest.mark.asyncio
    async def test_creates_call_and_delivery(self):
        mock_call = MagicMock()
        mock_call.sid = "CA-new-123"
        mock_client = MagicMock()
        mock_client.calls.create.return_value = mock_call
        mock_delivery = {"id": "d-new", "attempt_count": 1}

        with patch("services.scheduler._get_twilio_client", return_value=mock_client), \
             patch("services.memory.build_context", new_callable=AsyncMock, return_value="Memory context"), \
             patch("services.scheduler.query_one", new_callable=AsyncMock, return_value=mock_delivery), \
             patch.dict("os.environ", {"TWILIO_PHONE_NUMBER": "+10000000000"}):
            from services.scheduler import trigger_reminder_call
            result = await trigger_reminder_call(
                {"id": "r1", "title": "Take pills"},
                {"id": "s1", "name": "Test", "phone": "+15551234567"},
                "https://example.com",
            )
            assert result is not None
            assert result["sid"] == "CA-new-123"
            assert "CA-new-123" in pending_reminder_calls

    @pytest.mark.asyncio
    async def test_handles_exception(self):
        mock_client = MagicMock()
        mock_client.calls.create.side_effect = Exception("Twilio error")
        with patch("services.scheduler._get_twilio_client", return_value=mock_client), \
             patch("services.memory.build_context", new_callable=AsyncMock, return_value="ctx"), \
             patch.dict("os.environ", {"TWILIO_PHONE_NUMBER": "+10000000000"}):
            from services.scheduler import trigger_reminder_call
            result = await trigger_reminder_call({"id": "r1"}, {"id": "s1", "name": "Test", "phone": "+15551234567"}, "https://example.com")
            assert result is None
