"""Tests for services/reminder_delivery.py — delivery CRUD + prompt formatting."""

import pytest
from unittest.mock import patch, AsyncMock


class TestMarkDelivered:
    @pytest.mark.asyncio
    async def test_executes_update_query(self):
        with patch("services.reminder_delivery.execute", new_callable=AsyncMock) as mock_exec:
            from services.reminder_delivery import mark_delivered
            await mark_delivered("rem-001")
            mock_exec.assert_called_once()
            assert "UPDATE reminders" in mock_exec.call_args[0][0]
            assert mock_exec.call_args[0][1] == "rem-001"


class TestMarkReminderAcknowledged:
    @pytest.mark.asyncio
    async def test_returns_none_for_empty_delivery_id(self):
        from services.reminder_delivery import mark_reminder_acknowledged
        assert await mark_reminder_acknowledged("", "acknowledged", "ok") is None

    @pytest.mark.asyncio
    async def test_returns_none_for_none_delivery_id(self):
        from services.reminder_delivery import mark_reminder_acknowledged
        assert await mark_reminder_acknowledged(None, "acknowledged", "ok") is None

    @pytest.mark.asyncio
    async def test_returns_none_for_invalid_status(self):
        from services.reminder_delivery import mark_reminder_acknowledged
        assert await mark_reminder_acknowledged("del-001", "invalid", "ok") is None

    @pytest.mark.asyncio
    async def test_accepts_acknowledged(self):
        with patch("services.reminder_delivery.query_one", new_callable=AsyncMock, return_value={"id": "del-001", "status": "acknowledged"}):
            from services.reminder_delivery import mark_reminder_acknowledged
            result = await mark_reminder_acknowledged("del-001", "acknowledged", "I'll take it")
            assert result is not None

    @pytest.mark.asyncio
    async def test_accepts_confirmed(self):
        with patch("services.reminder_delivery.query_one", new_callable=AsyncMock, return_value={"id": "del-001", "status": "confirmed"}):
            from services.reminder_delivery import mark_reminder_acknowledged
            result = await mark_reminder_acknowledged("del-001", "confirmed", "already took it")
            assert result is not None

    @pytest.mark.asyncio
    async def test_returns_none_on_db_error(self):
        with patch("services.reminder_delivery.query_one", new_callable=AsyncMock, side_effect=Exception("DB error")):
            from services.reminder_delivery import mark_reminder_acknowledged
            assert await mark_reminder_acknowledged("del-001", "acknowledged", "ok") is None


class TestMarkCallEndedWithoutAcknowledgment:
    @pytest.mark.asyncio
    async def test_noop_for_empty_id(self):
        from services.reminder_delivery import mark_call_ended_without_acknowledgment
        await mark_call_ended_without_acknowledgment("")

    @pytest.mark.asyncio
    async def test_noop_for_none_id(self):
        from services.reminder_delivery import mark_call_ended_without_acknowledgment
        await mark_call_ended_without_acknowledgment(None)

    @pytest.mark.asyncio
    async def test_skips_if_acknowledged(self):
        with patch("services.reminder_delivery.query_one", new_callable=AsyncMock, return_value={"id": "d1", "status": "acknowledged", "attempt_count": 1}), \
             patch("services.reminder_delivery.execute", new_callable=AsyncMock) as mock_exec:
            from services.reminder_delivery import mark_call_ended_without_acknowledgment
            await mark_call_ended_without_acknowledgment("d1")
            mock_exec.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_if_confirmed(self):
        with patch("services.reminder_delivery.query_one", new_callable=AsyncMock, return_value={"id": "d1", "status": "confirmed", "attempt_count": 1}), \
             patch("services.reminder_delivery.execute", new_callable=AsyncMock) as mock_exec:
            from services.reminder_delivery import mark_call_ended_without_acknowledgment
            await mark_call_ended_without_acknowledgment("d1")
            mock_exec.assert_not_called()

    @pytest.mark.asyncio
    async def test_retry_pending_if_attempts_lt_2(self):
        with patch("services.reminder_delivery.query_one", new_callable=AsyncMock, return_value={"id": "d1", "status": "delivered", "attempt_count": 1}), \
             patch("services.reminder_delivery.execute", new_callable=AsyncMock) as mock_exec:
            from services.reminder_delivery import mark_call_ended_without_acknowledgment
            await mark_call_ended_without_acknowledgment("d1")
            assert mock_exec.call_args[0][1] == "retry_pending"

    @pytest.mark.asyncio
    async def test_max_attempts_if_attempts_gte_2(self):
        with patch("services.reminder_delivery.query_one", new_callable=AsyncMock, return_value={"id": "d1", "status": "delivered", "attempt_count": 2}), \
             patch("services.reminder_delivery.execute", new_callable=AsyncMock) as mock_exec:
            from services.reminder_delivery import mark_call_ended_without_acknowledgment
            await mark_call_ended_without_acknowledgment("d1")
            assert mock_exec.call_args[0][1] == "max_attempts"

    @pytest.mark.asyncio
    async def test_delivery_not_found(self):
        with patch("services.reminder_delivery.query_one", new_callable=AsyncMock, return_value=None), \
             patch("services.reminder_delivery.execute", new_callable=AsyncMock) as mock_exec:
            from services.reminder_delivery import mark_call_ended_without_acknowledgment
            await mark_call_ended_without_acknowledgment("d-999")
            mock_exec.assert_not_called()


class TestFormatReminderPrompt:
    def test_basic_reminder(self):
        from services.reminder_delivery import format_reminder_prompt
        result = format_reminder_prompt({"title": "Take pills", "type": "generic"})
        assert "Take pills" in result
        assert "IMPORTANT REMINDER" in result

    def test_medication_type(self):
        from services.reminder_delivery import format_reminder_prompt
        result = format_reminder_prompt({"title": "Take metformin", "type": "medication"})
        assert "medication reminder" in result.lower()

    def test_appointment_type(self):
        from services.reminder_delivery import format_reminder_prompt
        result = format_reminder_prompt({"title": "Dr visit", "type": "appointment"})
        assert "appointment reminder" in result.lower()

    def test_includes_description(self):
        from services.reminder_delivery import format_reminder_prompt
        result = format_reminder_prompt({"title": "Take pills", "description": "500mg with dinner", "type": "medication"})
        assert "500mg with dinner" in result

    def test_no_description(self):
        from services.reminder_delivery import format_reminder_prompt
        result = format_reminder_prompt({"title": "Take pills"})
        assert "naturally" in result.lower()
