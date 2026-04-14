"""Tests for API routes — health check and voice routes using FastAPI TestClient."""

import os
from unittest.mock import AsyncMock, patch, MagicMock

import pytest
from fastapi.testclient import TestClient

# Set required env vars before importing app
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("TWILIO_ACCOUNT_SID", "ACtest")
os.environ.setdefault("TWILIO_AUTH_TOKEN", "test-token")
os.environ.setdefault("TWILIO_PHONE_NUMBER", "+15551234567")
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/testdb")
os.environ.setdefault("SKIP_TWILIO_VALIDATION", "true")

from main import app


@pytest.fixture
def client():
    return TestClient(app)


class TestHealthEndpoint:
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
    @patch("services.scheduler.get_reminder_context", return_value=None)
    @patch("services.scheduler.get_prefetched_context", return_value=None)
    @patch("services.seniors.find_by_phone", new_callable=AsyncMock, return_value=None)
    def test_voice_answer_returns_twiml(self, mock_find, mock_prefetch, mock_reminder, client):
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

    @patch("services.scheduler.get_reminder_context", return_value=None)
    @patch("services.scheduler.get_prefetched_context", return_value=None)
    @patch("services.reminder_delivery.get_reminder_by_call_sid", new_callable=AsyncMock, return_value=None)
    @patch("services.seniors.find_by_phone", new_callable=AsyncMock, return_value=None)
    def test_voice_answer_includes_params(self, mock_find, mock_reminder_db, mock_prefetch, mock_reminder, client):
        """Test that TwiML includes stream parameters."""
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
    async def test_bot_loads_metadata_from_shared_state(self):
        """WebSocket setup should recover metadata when local call map misses."""
        from bot import _load_call_metadata

        class FakeRedisState:
            is_shared = True

            async def get(self, key):
                assert key == "call_metadata:CAredis"
                return {"ws_token": "token-123", "call_type": "check-in"}

        session_state = {"_call_metadata": {}}
        with patch("lib.redis_client.get_shared_state", return_value=FakeRedisState()):
            metadata = await _load_call_metadata("CAredis", session_state)

        assert metadata["ws_token"] == "token-123"
        assert session_state["_call_metadata"]["CAredis"] == metadata

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
            json={"phone_number": "+15559876543"},
        )
        assert response.status_code == 401

    def test_end_call_requires_auth(self, client):
        """POST /api/calls/:sid/end should require admin auth."""
        response = client.post("/api/calls/CA123/end")
        assert response.status_code == 401
