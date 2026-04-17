"""Tests for services/scheduler.py — reminder scheduling + outbound calls."""

import base64
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, AsyncMock

from services.scheduler import (
    REMINDER_CONTEXT_TTL_SECONDS,
    get_scheduled_for_time,
    get_reminder_context,
    get_reminder_context_async,
    store_reminder_context,
    clear_reminder_context,
    clear_reminder_context_async,
    cleanup_stale_contexts,
    get_prefetched_context,
    pending_reminder_calls,
    prefetched_context_by_phone,
    _normalize_phone,
    _extract_reminder,
    _extract_senior,
    _extract_delivery,
)


class FakeSharedState:
    is_shared = True

    def __init__(self):
        self.data = {}
        self.ttls = {}
        self.deleted = []

    async def set(self, key, value, ttl=None):
        self.data[key] = value
        self.ttls[key] = ttl

    async def get(self, key):
        return self.data.get(key)

    async def delete(self, key):
        self.deleted.append(key)
        self.data.pop(key, None)


def enable_test_encryption(monkeypatch):
    from lib import encryption

    key = base64.urlsafe_b64encode(b"r" * 32).decode().rstrip("=")
    monkeypatch.setenv("FIELD_ENCRYPTION_KEY", key)
    monkeypatch.setattr(encryption, "_KEY", None)
    monkeypatch.setattr(encryption, "_aes", None)


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

    @pytest.mark.asyncio
    async def test_get_reminder_context_async_uses_local_first(self):
        pending_reminder_calls["CA-123"] = {"reminder": {"id": "local"}}
        with patch("lib.redis_client.get_shared_state") as mock_shared:
            result = await get_reminder_context_async("CA-123")
        assert result["reminder"]["id"] == "local"
        mock_shared.assert_not_called()

    @pytest.mark.asyncio
    async def test_get_reminder_context_async_loads_shared_state(self):
        """Legacy raw dict reminder contexts remain readable during rollout."""
        state = FakeSharedState()
        state.data["reminder_ctx:CA-redis"] = {"reminder": {"id": "shared"}}
        with patch("lib.redis_client.get_shared_state", return_value=state):
            result = await get_reminder_context_async("CA-redis")
        assert result["reminder"]["id"] == "shared"
        assert pending_reminder_calls["CA-redis"] == result

    @pytest.mark.asyncio
    async def test_get_reminder_context_async_decrypts_shared_state(self, monkeypatch):
        from lib.encryption import decrypt_json
        from lib.shared_state_phi import encode_phi_payload

        enable_test_encryption(monkeypatch)
        state = FakeSharedState()
        encrypted = encode_phi_payload({"reminder": {"id": "shared-encrypted"}})
        assert isinstance(encrypted, str) and encrypted.startswith("enc:")
        assert decrypt_json(encrypted)["reminder"]["id"] == "shared-encrypted"
        state.data["reminder_ctx:CA-redis"] = encrypted

        with patch("lib.redis_client.get_shared_state", return_value=state):
            result = await get_reminder_context_async("CA-redis")

        assert result["reminder"]["id"] == "shared-encrypted"
        assert pending_reminder_calls["CA-redis"] == result

    @pytest.mark.asyncio
    async def test_store_reminder_context_writes_local_and_encrypted_shared_state(self, monkeypatch):
        from lib.encryption import decrypt_json

        enable_test_encryption(monkeypatch)
        state = FakeSharedState()
        context = {"reminder": {"id": "r1"}, "triggered_at": datetime.now(timezone.utc)}
        with patch("lib.redis_client.get_shared_state", return_value=state):
            await store_reminder_context("CA-123", context)
        assert pending_reminder_calls["CA-123"] == context
        encrypted = state.data["reminder_ctx:CA-123"]
        assert isinstance(encrypted, str)
        assert encrypted.startswith("enc:")
        decoded = decrypt_json(encrypted)
        assert decoded["reminder"]["id"] == "r1"
        assert isinstance(decoded["triggered_at"], str)
        assert state.ttls["reminder_ctx:CA-123"] == REMINDER_CONTEXT_TTL_SECONDS

    def test_clear_reminder_context(self):
        pending_reminder_calls["CA-123"] = {"data": True}
        clear_reminder_context("CA-123")
        assert "CA-123" not in pending_reminder_calls

    @pytest.mark.asyncio
    async def test_clear_reminder_context_async_deletes_shared_state(self):
        state = FakeSharedState()
        pending_reminder_calls["CA-123"] = {"data": True}
        state.data["reminder_ctx:CA-123"] = {"data": True}
        with patch("lib.redis_client.get_shared_state", return_value=state):
            await clear_reminder_context_async("CA-123")
        assert "CA-123" not in pending_reminder_calls
        assert state.deleted == ["reminder_ctx:CA-123"]
        assert "reminder_ctx:CA-123" not in state.data

    def test_cleanup_stale_contexts_handles_string_timestamps(self):
        old = datetime.now(timezone.utc) - timedelta(minutes=45)
        pending_reminder_calls["CA-old"] = {"triggered_at": old.isoformat()}
        assert cleanup_stale_contexts(max_age_minutes=30) == 1
        assert "CA-old" not in pending_reminder_calls

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
    @pytest.mark.asyncio
    async def test_creates_telnyx_call(self):
        mock_create = AsyncMock(return_value={"callSid": "v2:call-control"})
        with patch("api.routes.telnyx.create_telnyx_outbound_call", mock_create):
            from services.scheduler import trigger_reminder_call

            result = await trigger_reminder_call(
                {"id": "r1", "title": "Take pills"},
                {"id": "s1", "name": "Test", "phone": "+15551234567"},
                "https://example.com",
            )

        assert result == {"sid": "v2:call-control"}
        body = mock_create.await_args.args[0]
        assert body.senior_id == "s1"
        assert body.call_type == "reminder"
        assert body.reminder_id == "r1"

    @pytest.mark.asyncio
    async def test_handles_exception(self):
        with patch("api.routes.telnyx.create_telnyx_outbound_call", new_callable=AsyncMock, side_effect=Exception("Telnyx error")):
            from services.scheduler import trigger_reminder_call
            result = await trigger_reminder_call({"id": "r1"}, {"id": "s1", "name": "Test", "phone": "+15551234567"}, "https://example.com")
            assert result is None
