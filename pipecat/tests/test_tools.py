"""Tests for LLM tool schemas and handler factory."""

import asyncio

import pytest

from flows.tools import (
    MARK_REMINDER_SCHEMA,
    WEB_SEARCH_SCHEMA,
    make_tool_handlers,
    make_flows_tools,
)


class TestToolSchemas:
    def test_web_search_schema_valid(self):
        assert WEB_SEARCH_SCHEMA["name"] == "web_search"
        assert "query" in WEB_SEARCH_SCHEMA["properties"]
        assert "query" in WEB_SEARCH_SCHEMA["required"]

    def test_mark_reminder_schema_valid(self):
        assert MARK_REMINDER_SCHEMA["name"] == "mark_reminder_acknowledged"
        assert "reminder_id" in MARK_REMINDER_SCHEMA["properties"]
        assert "status" in MARK_REMINDER_SCHEMA["properties"]


class TestToolHandlerFactory:
    def test_make_tool_handlers_returns_active_handlers(self):
        session_state = {"senior_id": "test-123", "senior": {"name": "Test"}}
        handlers = make_tool_handlers(session_state)
        assert "web_search" in handlers
        assert "mark_reminder_acknowledged" in handlers
        # Removed tools should NOT be present
        assert "search_memories" not in handlers
        assert "save_important_detail" not in handlers
        assert "check_caregiver_notes" not in handlers

    def test_handlers_are_async_callables(self):
        session_state = {"senior_id": "test-123"}
        handlers = make_tool_handlers(session_state)
        for name, handler in handlers.items():
            assert asyncio.iscoroutinefunction(handler), f"{name} is not async"

    @pytest.mark.asyncio
    async def test_mark_reminder_fire_and_forget(self):
        """mark_reminder returns immediately with local tracking; DB write is background."""
        session_state = {"senior_id": "test", "reminder_delivery": None}
        handlers = make_tool_handlers(session_state)
        result = await handlers["mark_reminder_acknowledged"]({
            "reminder_id": "rem-1",
            "status": "acknowledged",
        })
        assert result["status"] == "success"
        assert "rem-1" in session_state.get("reminders_delivered", set())


class TestFlowsTools:
    def test_make_flows_tools_returns_active_schemas(self):
        session_state = {"senior_id": "test-123"}
        tools = make_flows_tools(session_state)
        assert len(tools) == 2
        assert "web_search" in tools
        assert "mark_reminder_acknowledged" in tools

    def test_flows_tools_have_handlers(self):
        session_state = {"senior_id": "test-123"}
        tools = make_flows_tools(session_state)
        for name, tool in tools.items():
            assert tool.handler is not None, f"{name} has no handler"
