"""Level 2: Tool handler integration tests.

Tests that tool handlers correctly interact with mocked external services
(memory, news, scheduler) via session_state closures.
"""

import pytest
from unittest.mock import AsyncMock, patch

from flows.tools import make_tool_handlers


class TestToolHandlerIntegration:
    @pytest.mark.asyncio
    async def test_search_memories_calls_service(self, session_state):
        """search_memories should call services.memory.search with correct params."""
        handlers = make_tool_handlers(session_state)

        with patch("services.memory.search", new_callable=AsyncMock) as mock_search:
            mock_search.return_value = [
                {"content": "Margaret loves her roses"},
            ]
            result = await handlers["search_memories"]({"query": "roses"})

        assert result["status"] == "success"
        assert "roses" in result["result"]
        mock_search.assert_awaited_once_with("senior-test-001", "roses", limit=3)

    @pytest.mark.asyncio
    async def test_web_search_calls_service(self, session_state):
        """web_search should call services.news.web_search_query."""
        handlers = make_tool_handlers(session_state)

        with patch("services.news.web_search_query", new_callable=AsyncMock) as mock_search:
            mock_search.return_value = "Garden show this weekend"
            result = await handlers["web_search"]({"query": "gardening"})

        assert result["status"] == "success"
        assert "Garden show" in result["result"]
        mock_search.assert_awaited_once_with("gardening")

    @pytest.mark.asyncio
    async def test_mark_reminder_updates_session(self, reminder_session_state):
        """mark_reminder_acknowledged should update session and call scheduler."""
        handlers = make_tool_handlers(reminder_session_state)

        with patch("services.reminder_delivery.mark_reminder_acknowledged", new_callable=AsyncMock) as mock_ack:
            result = await handlers["mark_reminder_acknowledged"]({
                "reminder_id": "rem-001",
                "status": "acknowledged",
                "user_response": "I'll take it now",
            })

        assert result["status"] == "success"
        # Handler now tracks user_response (or reminder_id fallback) in reminders_delivered
        assert "I'll take it now" in reminder_session_state.get("reminders_delivered", set())
        mock_ack.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_save_detail_stores_memory(self, session_state):
        """save_important_detail should store to memory service."""
        handlers = make_tool_handlers(session_state)

        with patch("services.memory.store", new_callable=AsyncMock) as mock_store:
            result = await handlers["save_important_detail"]({
                "detail": "Grandson Jake graduated college",
                "category": "family",
            })

        assert result["status"] == "success"
        mock_store.assert_awaited_once_with(
            senior_id="senior-test-001",
            type_="family",
            content="Grandson Jake graduated college",
            source="conversation",
            importance=70,
        )

    @pytest.mark.asyncio
    async def test_search_memories_handles_service_error(self, session_state):
        """Tool handlers should degrade gracefully on service errors."""
        handlers = make_tool_handlers(session_state)

        with patch("services.memory.search", new_callable=AsyncMock) as mock_search:
            mock_search.side_effect = Exception("DB connection failed")
            result = await handlers["search_memories"]({"query": "roses"})

        assert result["status"] == "success"  # Degrades gracefully
        assert "unavailable" in result["result"].lower()
