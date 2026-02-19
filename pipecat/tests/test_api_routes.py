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

from main import app


@pytest.fixture
def client():
    return TestClient(app)


class TestHealthEndpoint:
    @patch("db.check_health", new_callable=AsyncMock, return_value=True)
    def test_health_returns_ok(self, mock_db_health, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "donna-pipecat"
        assert "active_calls" in data
        assert data["database"] == "ok"
        assert "circuit_breakers" in data

    @patch("db.check_health", new_callable=AsyncMock, return_value=False)
    def test_health_degraded_when_db_down(self, mock_db_health, client):
        response = client.get("/health")
        assert response.status_code == 200
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
    @patch("services.seniors.find_by_phone", new_callable=AsyncMock, return_value=None)
    def test_voice_answer_includes_params(self, mock_find, mock_prefetch, mock_reminder, client):
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
