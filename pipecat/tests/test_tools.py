"""Tests for LLM tool schemas and handler factory."""

import pytest

from flows.tools import (
    SEARCH_MEMORIES_SCHEMA,
    GET_NEWS_SCHEMA,
    MARK_REMINDER_SCHEMA,
    SAVE_DETAIL_SCHEMA,
    make_tool_handlers,
    make_flows_tools,
)


class TestToolSchemas:
    def test_search_memories_schema_valid(self):
        assert SEARCH_MEMORIES_SCHEMA["name"] == "search_memories"
        assert "query" in SEARCH_MEMORIES_SCHEMA["properties"]
        assert "query" in SEARCH_MEMORIES_SCHEMA["required"]

    def test_get_news_schema_valid(self):
        assert GET_NEWS_SCHEMA["name"] == "get_news"
        assert "topic" in GET_NEWS_SCHEMA["properties"]
        assert "topic" in GET_NEWS_SCHEMA["required"]

    def test_mark_reminder_schema_valid(self):
        assert MARK_REMINDER_SCHEMA["name"] == "mark_reminder_acknowledged"
        assert "reminder_id" in MARK_REMINDER_SCHEMA["properties"]
        assert "status" in MARK_REMINDER_SCHEMA["properties"]

    def test_save_detail_schema_valid(self):
        assert SAVE_DETAIL_SCHEMA["name"] == "save_important_detail"
        assert "detail" in SAVE_DETAIL_SCHEMA["properties"]
        assert "category" in SAVE_DETAIL_SCHEMA["properties"]
        assert "detail" in SAVE_DETAIL_SCHEMA["required"]


class TestToolHandlerFactory:
    def test_make_tool_handlers_returns_all_handlers(self):
        session_state = {"senior_id": "test-123", "senior": {"name": "Test"}}
        handlers = make_tool_handlers(session_state)
        assert "search_memories" in handlers
        assert "get_news" in handlers
        assert "mark_reminder_acknowledged" in handlers
        assert "save_important_detail" in handlers

    def test_handlers_are_async_callables(self):
        session_state = {"senior_id": "test-123"}
        handlers = make_tool_handlers(session_state)
        import asyncio
        for name, handler in handlers.items():
            assert asyncio.iscoroutinefunction(handler), f"{name} is not async"

    @pytest.mark.asyncio
    async def test_search_memories_no_senior(self):
        session_state = {"senior_id": None}
        handlers = make_tool_handlers(session_state)
        result = await handlers["search_memories"]({"query": "gardening"})
        assert result["status"] == "error"
        assert "No senior" in result["error"]

    @pytest.mark.asyncio
    async def test_save_detail_no_senior(self):
        session_state = {"senior_id": None}
        handlers = make_tool_handlers(session_state)
        result = await handlers["save_important_detail"]({"detail": "test", "category": "fact"})
        assert result["status"] == "error"

    @pytest.mark.asyncio
    async def test_mark_reminder_no_delivery(self):
        session_state = {"senior_id": "test", "reminder_delivery": None}
        handlers = make_tool_handlers(session_state)
        result = await handlers["mark_reminder_acknowledged"]({
            "reminder_id": "rem-1",
            "status": "acknowledged",
        })
        assert result["status"] == "success"
        assert "rem-1" in session_state.get("reminders_delivered", set())


class TestFlowsTools:
    def test_make_flows_tools_returns_schemas(self):
        session_state = {"senior_id": "test-123"}
        tools = make_flows_tools(session_state)
        assert len(tools) == 4
        assert "search_memories" in tools
        assert "get_news" in tools
        assert "mark_reminder_acknowledged" in tools
        assert "save_important_detail" in tools

    def test_flows_tools_have_handlers(self):
        session_state = {"senior_id": "test-123"}
        tools = make_flows_tools(session_state)
        for name, tool in tools.items():
            assert tool.handler is not None, f"{name} has no handler"
