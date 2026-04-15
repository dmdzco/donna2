"""Tests for API routes — health check and voice routes using FastAPI TestClient."""

import base64
import os
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch, MagicMock

import pytest
from fastapi.testclient import TestClient
from twilio.request_validator import RequestValidator

# Set required env vars before importing app
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("TWILIO_ACCOUNT_SID", "ACtest")
os.environ.setdefault("TWILIO_AUTH_TOKEN", "test-token")
os.environ.setdefault("TWILIO_PHONE_NUMBER", "+15551234567")
os.environ.setdefault("ALLOW_UNSIGNED_TWILIO_WEBHOOKS", "true")

from main import app


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

    key = base64.urlsafe_b64encode(b"m" * 32).decode().rstrip("=")
    monkeypatch.setenv("FIELD_ENCRYPTION_KEY", key)
    monkeypatch.setattr(encryption, "_KEY", None)
    monkeypatch.setattr(encryption, "_aes", None)


@pytest.fixture
def client():
    return TestClient(app)


class TestHealthEndpoint:
    @patch("db.check_health", side_effect=AssertionError("/live must not call database readiness"))
    def test_live_returns_ok_without_database_check(self, mock_db_health, client):
        response = client.get("/live")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "donna-pipecat"
        assert "active_calls" in data
        assert "database" not in data
        mock_db_health.assert_not_called()

    @patch("db.check_health", new_callable=AsyncMock, return_value=True)
    @patch("db.client.get_pool_stats", new_callable=AsyncMock, return_value={"size": 5, "idle": 3, "max": 50, "min": 5})
    def test_health_returns_ok(self, mock_pool_stats, mock_db_health, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "donna-pipecat"
        assert "active_calls" in data
        assert data["database"] == "ok"
        assert "pool" in data
        assert "circuit_breakers" in data

    @patch("db.check_health", new_callable=AsyncMock, return_value=False)
    @patch("db.client.get_pool_stats", new_callable=AsyncMock, return_value={})
    def test_health_degraded_when_db_down(self, mock_pool_stats, mock_db_health, client):
        response = client.get("/health")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "degraded"
        assert data["database"] == "error"


class TestVoiceAnswerEndpoint:
    def test_cached_news_requires_fresh_timestamp(self):
        from api.routes.voice import _cached_news_context_from_senior

        senior = {
            "id": "senior-1",
            "cached_news": "- Fresh gardening story",
            "cached_news_updated_at": datetime.now(timezone.utc) - timedelta(hours=48),
        }

        assert _cached_news_context_from_senior(senior) is None

    def test_cached_news_selects_fresh_stories(self):
        from api.routes.voice import _cached_news_context_from_senior

        senior = {
            "id": "senior-1",
            "cached_news": "- Fresh gardening story",
            "cached_news_updated_at": datetime.now(timezone.utc),
            "interests": ["gardening"],
            "interest_scores": {"gardening": 5},
        }

        with patch("services.news.select_stories_for_call", return_value="selected news") as mock_select:
            assert _cached_news_context_from_senior(senior) == "selected news"

        mock_select.assert_called_once()

    def test_cached_news_must_be_from_senior_local_today(self):
        from api.routes.voice import _cached_news_context_from_senior

        senior = {
            "id": "senior-1",
            "timezone": "America/New_York",
            "cached_news": "- Yesterday's gardening story",
            "cached_news_updated_at": datetime.now(timezone.utc) - timedelta(days=1),
        }

        assert _cached_news_context_from_senior(senior) is None

    @patch("services.scheduler.get_reminder_context_async", new_callable=AsyncMock, return_value=None)
    @patch("services.scheduler.get_prefetched_context", return_value=None)
    @patch("services.seniors.find_any_by_phone", new_callable=AsyncMock, return_value=None)
    @patch("services.seniors.find_by_phone", new_callable=AsyncMock, return_value=None)
    def test_voice_answer_returns_twiml(self, mock_find, mock_find_any, mock_prefetch, mock_reminder, client):
        """Test that /voice/answer returns valid TwiML XML."""
        response = client.post(
            "/voice/answer",
            data={
                "CallSid": "CA123test",
                "From": "+15559876543",
                "To": "+15551234567",
                "Direction": "inbound",
            },
        )
        assert response.status_code == 200
        assert "text/xml" in response.headers["content-type"]
        assert "<Response>" in response.text
        assert "<Stream" in response.text
        assert "/ws" in response.text
        assert "ws_token" in response.text

    @patch("services.scheduler.get_reminder_context_async", new_callable=AsyncMock, return_value=None)
    @patch("services.scheduler.get_prefetched_context", return_value=None)
    @patch("services.reminder_delivery.get_reminder_by_call_sid", new_callable=AsyncMock, return_value=None)
    @patch("services.conversations.create", new_callable=AsyncMock, return_value={"id": "conv-456"})
    @patch("api.routes.voice._hydrate_senior_call_context", new_callable=AsyncMock)
    @patch("services.seniors.find_by_phone", new_callable=AsyncMock)
    def test_voice_answer_includes_params(self, mock_find, mock_hydrate, mock_create, mock_reminder_db, mock_prefetch, mock_reminder, client):
        """Test that TwiML includes stream parameters."""
        mock_find.return_value = {
            "id": "senior-456",
            "name": "Margaret",
            "phone": "5559876543",
            "timezone": "America/New_York",
            "is_active": True,
        }
        mock_hydrate.return_value = {
            "memory_context": "memory",
            "pre_generated_greeting": "Hello Margaret",
            "news_context": None,
            "recent_turns": None,
            "previous_calls_summary": None,
            "todays_context": None,
            "last_call_analysis": None,
            "call_settings": {},
            "has_caregiver_notes": False,
            "caregiver_notes_content": [],
        }

        response = client.post(
            "/voice/answer",
            data={
                "CallSid": "CA456test",
                "From": "+15551234567",
                "To": "+15559876543",
                "Direction": "outbound-api",
            },
        )
        assert response.status_code == 200
        assert "call_sid" in response.text
        assert "CA456test" in response.text
        assert "ws_token" in response.text

    @patch("services.scheduler.get_reminder_context_async", new_callable=AsyncMock, return_value=None)
    @patch("services.scheduler.get_prefetched_context", return_value=None)
    @patch("services.reminder_delivery.wait_for_reminder_by_call_sid", new_callable=AsyncMock)
    @patch("services.conversations.create", new_callable=AsyncMock, return_value={"id": "conv-reminder"})
    @patch("api.routes.voice._hydrate_senior_call_context", new_callable=AsyncMock)
    @patch("services.seniors.find_by_phone", new_callable=AsyncMock)
    def test_voice_answer_waits_for_reminder_delivery_when_tagged(
        self,
        mock_find,
        mock_hydrate,
        mock_create,
        mock_wait_reminder_db,
        mock_prefetch,
        mock_reminder,
        client,
    ):
        """Tagged reminder calls wait for Node's reminder_deliveries row."""
        mock_wait_reminder_db.return_value = {
            "delivery_id": "delivery-123",
            "reminder_id": "reminder-123",
            "delivery_status": "delivered",
            "attempt_count": 1,
            "title": "Take metformin",
            "description": "With dinner",
            "reminder_type": "medication",
        }
        mock_find.return_value = {
            "id": "senior-789",
            "name": "Margaret",
            "phone": "5559876543",
            "timezone": "America/New_York",
            "is_active": True,
        }
        mock_hydrate.return_value = {
            "memory_context": "memory",
            "pre_generated_greeting": "Hello Margaret",
            "news_context": None,
            "recent_turns": None,
            "previous_calls_summary": None,
            "todays_context": None,
            "last_call_analysis": None,
            "call_settings": {},
            "has_caregiver_notes": False,
            "caregiver_notes_content": [],
        }

        response = client.post(
            "/voice/answer?call_type=reminder",
            data={
                "CallSid": "CAremindertest",
                "From": "+15551234567",
                "To": "+15559876543",
                "Direction": "outbound-api",
            },
        )

        assert response.status_code == 200
        assert 'name="call_type" value="reminder"' in response.text
        mock_wait_reminder_db.assert_awaited_once_with("CAremindertest")
        mock_create.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_bot_loads_metadata_from_local_state_first(self):
        """WebSocket setup should use local metadata before shared state."""
        from bot import _load_call_metadata

        metadata = {"ws_token": "local-token", "call_type": "check-in"}
        session_state = {"_call_metadata": {"CAlocal": metadata}}

        with patch("lib.redis_client.get_shared_state") as mock_shared:
            loaded = await _load_call_metadata("CAlocal", session_state)

        assert loaded is metadata
        mock_shared.assert_not_called()

    @pytest.mark.asyncio
    async def test_bot_loads_metadata_from_encrypted_shared_state(self, monkeypatch):
        """WebSocket setup should recover metadata when local call map misses."""
        from bot import _load_call_metadata
        from lib.shared_state_phi import encode_phi_payload

        enable_test_encryption(monkeypatch)
        payload = encode_phi_payload({"ws_token": "token-123", "call_type": "check-in"})

        class FakeRedisState:
            async def get(self, key):
                assert key == "call_metadata:CAredis"
                return payload

            is_shared = True

        session_state = {"_call_metadata": {}}
        with patch("lib.redis_client.get_shared_state", return_value=FakeRedisState()):
            metadata = await _load_call_metadata("CAredis", session_state)

        assert metadata["ws_token"] == "token-123"
        assert session_state["_call_metadata"]["CAredis"] == metadata

    @pytest.mark.asyncio
    async def test_voice_metadata_persisted_encrypted_and_recovered_from_shared_state(self, monkeypatch):
        """Call metadata written for multi-instance routing should be encrypted."""
        from api.routes import voice
        from lib.encryption import decrypt_json

        enable_test_encryption(monkeypatch)
        state = FakeSharedState()
        metadata = {
            "senior": {"id": "senior-1"},
            "memory_context": "Known routine context.",
            "call_type": "check-in",
            "ws_token": "token-abc",
        }

        voice.call_metadata.clear()
        try:
            with patch("lib.redis_client.get_shared_state", return_value=state):
                await voice._persist_metadata("CAencrypted", metadata)

                encrypted = state.data["call_metadata:CAencrypted"]
                assert isinstance(encrypted, str)
                assert encrypted.startswith("enc:")
                assert decrypt_json(encrypted)["memory_context"] == "Known routine context."

                loaded = await voice.get_call_metadata("CAencrypted")

            assert loaded["senior"]["id"] == "senior-1"
            assert loaded["memory_context"] == "Known routine context."
            assert voice.call_metadata["CAencrypted"] == loaded
        finally:
            voice.call_metadata.clear()

    @pytest.mark.asyncio
    async def test_bot_metadata_missing_without_shared_state(self):
        """Missing metadata should stay missing when Redis is not configured."""
        from bot import _load_call_metadata

        class FakeInMemoryState:
            pass

        session_state = {"_call_metadata": {}}
        with patch("lib.redis_client.get_shared_state", return_value=FakeInMemoryState()):
            metadata = await _load_call_metadata("CAmissing", session_state)

        assert metadata == {}

    def test_voice_answer_rejects_unsigned_webhook_in_production(self, client, monkeypatch):
        monkeypatch.setenv("ENVIRONMENT", "production")
        monkeypatch.setenv("PIPECAT_PUBLIC_URL", "https://pipecat.test")
        monkeypatch.setenv("TWILIO_AUTH_TOKEN", "test-token")
        monkeypatch.delenv("ALLOW_UNSIGNED_TWILIO_WEBHOOKS", raising=False)
        monkeypatch.delenv("SKIP_TWILIO_VALIDATION", raising=False)

        response = client.post(
            "/voice/answer",
            data={
                "CallSid": "CAunsigned",
                "From": "+15559876543",
                "To": "+15551234567",
                "Direction": "inbound",
            },
        )

        assert response.status_code == 403

    @patch("services.scheduler.get_reminder_context_async", new_callable=AsyncMock, return_value=None)
    @patch("services.scheduler.get_prefetched_context", return_value=None)
    @patch("services.seniors.find_any_by_phone", new_callable=AsyncMock, return_value=None)
    @patch("services.seniors.find_by_phone", new_callable=AsyncMock, return_value=None)
    def test_voice_answer_accepts_valid_twilio_signature(
        self, mock_find, mock_find_any, mock_prefetch, mock_reminder, client, monkeypatch
    ):
        monkeypatch.setenv("ENVIRONMENT", "production")
        monkeypatch.setenv("PIPECAT_PUBLIC_URL", "https://pipecat.test")
        monkeypatch.setenv("TWILIO_AUTH_TOKEN", "test-token")
        monkeypatch.delenv("ALLOW_UNSIGNED_TWILIO_WEBHOOKS", raising=False)
        monkeypatch.delenv("SKIP_TWILIO_VALIDATION", raising=False)

        data = {
            "CallSid": "CAsigned",
            "From": "+15559876543",
            "To": "+15551234567",
            "Direction": "inbound",
        }
        signature = RequestValidator("test-token").compute_signature(
            "https://pipecat.test/voice/answer",
            data,
        )

        response = client.post(
            "/voice/answer",
            data=data,
            headers={"X-Twilio-Signature": signature},
        )

        assert response.status_code == 200
        assert "wss://pipecat.test/ws" in response.text
        assert "ws_token" in response.text

    @patch("services.scheduler.get_reminder_context_async", new_callable=AsyncMock, return_value=None)
    @patch("services.scheduler.get_prefetched_context", return_value=None)
    @patch("services.seniors.find_any_by_phone", new_callable=AsyncMock)
    @patch("services.seniors.find_by_phone", new_callable=AsyncMock, return_value=None)
    def test_voice_answer_inactive_senior_uses_no_phi_hangup(
        self, mock_find, mock_find_any, mock_prefetch, mock_reminder, client
    ):
        """Inactive seniors should not create conversations or load PHI context."""
        mock_find_any.return_value = {
            "id": "senior-inactive",
            "phone": "5559876543",
            "is_active": False,
        }

        response = client.post(
            "/voice/answer",
            data={
                "CallSid": "CAinactive",
                "From": "+15559876543",
                "To": "+15551234567",
                "Direction": "inbound",
            },
        )

        assert response.status_code == 200
        assert "<Hangup/>" in response.text
        assert "<Stream" not in response.text


class TestVoiceStatusEndpoint:
    def test_voice_status_completed(self, client):
        response = client.post(
            "/voice/status",
            data={
                "CallSid": "CA789test",
                "CallStatus": "completed",
                "CallDuration": "120",
            },
        )
        assert response.status_code == 200

    def test_voice_status_failed(self, client):
        response = client.post(
            "/voice/status",
            data={
                "CallSid": "CA999test",
                "CallStatus": "failed",
                "CallDuration": "0",
            },
        )
        assert response.status_code == 200


class TestCallsEndpointAuth:
    def test_list_calls_requires_auth(self, client):
        """GET /api/calls should require admin auth."""
        response = client.get("/api/calls")
        assert response.status_code == 401

    def test_initiate_call_requires_auth(self, client):
        """POST /api/call should require auth."""
        response = client.post(
            "/api/call",
            json={"seniorId": "senior-test"},
        )
        assert response.status_code == 401

    def test_end_call_requires_auth(self, client):
        """POST /api/calls/:sid/end should require admin auth."""
        response = client.post("/api/calls/CA123/end")
        assert response.status_code == 401
