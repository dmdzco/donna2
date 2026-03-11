"""Level 2: Tool handler integration tests.

Tests that tool handlers correctly interact with mocked external services
(memory, news, scheduler) via session_state closures.
"""

import pytest
from unittest.mock import AsyncMock, patch

from flows.tools import make_tool_handlers


class TestToolHandlerIntegration:
    @pytest.mark.asyncio
    async def test_mark_reminder_updates_session(self, reminder_session_state):
        """mark_reminder_acknowledged should update session (fire-and-forget DB write)."""
        handlers = make_tool_handlers(reminder_session_state)

        result = await handlers["mark_reminder_acknowledged"]({
            "reminder_id": "rem-001",
            "status": "acknowledged",
            "user_response": "I'll take it now",
        })

        assert result["status"] == "success"
        # Handler tracks user_response (or reminder_id fallback) in reminders_delivered
        assert "I'll take it now" in reminder_session_state.get("reminders_delivered", set())

    @pytest.mark.asyncio
    async def test_web_search_handles_empty_query(self, session_state):
        """web_search should handle empty query gracefully."""
        handlers = make_tool_handlers(session_state)
        result = await handlers["web_search"]({"query": ""})
        assert result["status"] == "success"

    def test_only_active_tools_returned(self, session_state):
        """All 5 tools should be in handlers."""
        handlers = make_tool_handlers(session_state)
        assert set(handlers.keys()) == {"web_search", "mark_reminder_acknowledged", "search_memories", "save_important_detail", "check_caregiver_notes"}
