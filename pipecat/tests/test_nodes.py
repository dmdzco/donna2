"""Tests for Pipecat Flows call phase node definitions."""

import pytest

from flows.nodes import (
    build_opening_node,
    build_reminder_node,
    build_main_node,
    build_winding_down_node,
    build_closing_node,
    build_initial_node,
    _make_transition_to_main,
    BASE_SYSTEM_PROMPT,
    _build_senior_context,
    _build_reminder_context,
    _build_tracking_context,
)
from flows.tools import make_flows_tools


def _make_session_state(**overrides):
    """Helper to create a session_state dict with defaults."""
    state = {
        "senior_id": "test-senior-1",
        "senior": {"name": "Margaret Smith", "interests": ["gardening", "reading"]},
        "memory_context": "Tier 1: Has arthritis in hands",
        "news_context": None,
        "greeting": "Good morning, Margaret!",
        "reminder_prompt": "Remind Margaret to take her blood pressure medication at 2pm.",
        "reminder_delivery": None,
        "reminders_delivered": set(),
        "conversation_id": "conv-1",
        "call_sid": "CA123",
        "call_type": "check-in",
        "is_outbound": True,
        "previous_calls_summary": "Yesterday: Discussed gardening",
        "recent_turns": None,
        "todays_context": None,
        "conversation_tracking": None,
    }
    state.update(overrides)
    return state


def _get_func_names(node):
    """Extract function names from a node's functions list."""
    names = []
    for f in node.get("functions", []):
        if hasattr(f, "name"):
            names.append(f.name)
        elif isinstance(f, dict):
            names.append(f.get("name", ""))
    return names


class TestBaseSystemPrompt:
    def test_prompt_contains_persona(self):
        assert "Donna" in BASE_SYSTEM_PROMPT
        assert "warm" in BASE_SYSTEM_PROMPT

    def test_prompt_contains_speech_awareness(self):
        assert "speech-to-text" in BASE_SYSTEM_PROMPT.lower()

    def test_prompt_limits_response_length(self):
        assert "1-2 sentences" in BASE_SYSTEM_PROMPT


class TestSeniorContext:
    def test_includes_name(self):
        state = _make_session_state()
        ctx = _build_senior_context(state)
        assert "Margaret" in ctx

    def test_includes_interests(self):
        state = _make_session_state()
        ctx = _build_senior_context(state)
        assert "gardening" in ctx

    def test_includes_previous_calls(self):
        state = _make_session_state()
        ctx = _build_senior_context(state)
        assert "Yesterday" in ctx

    def test_handles_no_senior(self):
        state = _make_session_state(senior=None)
        ctx = _build_senior_context(state)
        assert "there" in ctx  # fallback name

    def test_includes_memory_context(self):
        state = _make_session_state()
        ctx = _build_senior_context(state)
        assert "arthritis" in ctx

    def test_includes_news_context(self):
        state = _make_session_state(news_context="Here are some recent news items about gardening...")
        ctx = _build_senior_context(state)
        assert "gardening" in ctx
        assert "recent news" in ctx

    def test_no_news_context_when_none(self):
        state = _make_session_state(news_context=None)
        ctx = _build_senior_context(state)
        assert "recent news" not in ctx



class TestReminderContext:
    def test_includes_reminder_prompt(self):
        state = _make_session_state()
        ctx = _build_reminder_context(state)
        assert "blood pressure" in ctx

    def test_delivered_reminders_shown(self):
        state = _make_session_state(reminders_delivered={"Take Lisinopril"})
        ctx = _build_reminder_context(state)
        assert "ALREADY DELIVERED" in ctx
        assert "Lisinopril" in ctx

    def test_empty_when_no_reminders(self):
        state = _make_session_state(reminder_prompt=None)
        ctx = _build_reminder_context(state)
        assert ctx == ""


class TestOpeningNode:
    def test_node_has_correct_name(self):
        state = _make_session_state()
        tools = make_flows_tools(state)
        node = build_opening_node(state, tools)
        assert node["name"] == "opening"

    def test_node_has_transition_tool(self):
        state = _make_session_state()
        tools = make_flows_tools(state)
        node = build_opening_node(state, tools)
        func_names = _get_func_names(node)
        assert "transition_to_main" in func_names

    def test_respond_immediately_with_greeting(self):
        state = _make_session_state(greeting="Hello Margaret!")
        tools = make_flows_tools(state)
        node = build_opening_node(state, tools)
        assert node.get("respond_immediately") is True

    def test_always_respond_immediately(self):
        """Bot always speaks first on phone calls, even without pre-generated greeting."""
        state = _make_session_state(greeting="")
        tools = make_flows_tools(state)
        node = build_opening_node(state, tools)
        assert node.get("respond_immediately") is True

    def test_outbound_uses_opening_task(self):
        state = _make_session_state(is_outbound=True)
        tools = make_flows_tools(state)
        node = build_opening_node(state, tools)
        task_content = node["task_messages"][0]["content"]
        assert "PHASE: OPENING" in task_content
        assert "INBOUND" not in task_content

    def test_inbound_uses_inbound_opening_task(self):
        state = _make_session_state(is_outbound=False)
        tools = make_flows_tools(state)
        node = build_opening_node(state, tools)
        task_content = node["task_messages"][0]["content"]
        assert "INBOUND" in task_content
        assert "transition_to_main" in task_content


class TestMainNode:
    def test_node_has_all_tools(self):
        state = _make_session_state()
        tools = make_flows_tools(state)
        node = build_main_node(state, tools)
        func_names = _get_func_names(node)
        assert "search_memories" in func_names
        assert "web_search" in func_names
        assert "mark_reminder_acknowledged" in func_names
        assert "save_important_detail" in func_names
        assert "transition_to_winding_down" in func_names

    def test_node_does_not_have_get_news(self):
        state = _make_session_state()
        tools = make_flows_tools(state)
        node = build_main_node(state, tools)
        func_names = _get_func_names(node)
        assert "get_news" not in func_names

    def test_node_has_append_strategy(self):
        state = _make_session_state()
        tools = make_flows_tools(state)
        node = build_main_node(state, tools)
        ctx_strategy = node.get("context_strategy")
        assert ctx_strategy is not None
        from pipecat_flows import ContextStrategy
        assert ctx_strategy.strategy == ContextStrategy.APPEND


class TestWindingDownNode:
    def test_node_has_reminder_tool(self):
        state = _make_session_state()
        tools = make_flows_tools(state)
        node = build_winding_down_node(state, tools)
        func_names = _get_func_names(node)
        assert "mark_reminder_acknowledged" in func_names
        assert "transition_to_closing" in func_names


class TestClosingNode:
    def test_node_has_end_conversation(self):
        state = _make_session_state()
        node = build_closing_node(state)
        post_actions = node.get("post_actions", [])
        assert any(a["type"] == "end_conversation" for a in post_actions)

    def test_node_has_no_tools(self):
        state = _make_session_state()
        node = build_closing_node(state)
        assert len(node.get("functions", [])) == 0

    def test_uses_senior_name(self):
        state = _make_session_state()
        node = build_closing_node(state)
        task_content = node["task_messages"][0]["content"]
        assert "Margaret" in task_content


class TestReminderNode:
    def test_node_has_correct_name(self):
        state = _make_session_state()
        tools = make_flows_tools(state)
        node = build_reminder_node(state, tools)
        assert node["name"] == "reminder"

    def test_has_reminder_tools(self):
        state = _make_session_state()
        tools = make_flows_tools(state)
        node = build_reminder_node(state, tools)
        func_names = _get_func_names(node)
        assert "mark_reminder_acknowledged" in func_names
        assert "save_important_detail" in func_names
        assert "transition_to_main" in func_names

    def test_does_not_have_conversation_tools(self):
        state = _make_session_state()
        tools = make_flows_tools(state)
        node = build_reminder_node(state, tools)
        func_names = _get_func_names(node)
        assert "web_search" not in func_names
        assert "search_memories" not in func_names

    def test_includes_reminder_context(self):
        state = _make_session_state()
        tools = make_flows_tools(state)
        node = build_reminder_node(state, tools)
        task_content = node["task_messages"][0]["content"]
        assert "blood pressure" in task_content

    def test_uses_append_strategy(self):
        state = _make_session_state()
        tools = make_flows_tools(state)
        node = build_reminder_node(state, tools)
        from pipecat_flows import ContextStrategy
        assert node["context_strategy"].strategy == ContextStrategy.APPEND

    def test_no_system_prompt_override(self):
        state = _make_session_state()
        tools = make_flows_tools(state)
        node = build_reminder_node(state, tools)
        assert node["role_messages"] == []

    def test_does_not_respond_immediately(self):
        state = _make_session_state()
        tools = make_flows_tools(state)
        node = build_reminder_node(state, tools)
        assert node.get("respond_immediately") is False


class TestConditionalRouting:
    @pytest.mark.asyncio
    async def test_routes_to_reminder_when_reminders_pending(self):
        state = _make_session_state(
            reminder_prompt="Take blood pressure medication at 2pm.",
            reminders_delivered=set(),
        )
        tools = make_flows_tools(state)
        transition_fn = _make_transition_to_main(state, tools)
        result, node = await transition_fn({}, None)
        assert node["name"] == "reminder"

    @pytest.mark.asyncio
    async def test_routes_to_main_when_no_reminders(self):
        state = _make_session_state(
            reminder_prompt=None,
            reminders_delivered=set(),
        )
        tools = make_flows_tools(state)
        transition_fn = _make_transition_to_main(state, tools)
        result, node = await transition_fn({}, None)
        assert node["name"] == "main"

    @pytest.mark.asyncio
    async def test_routes_to_main_when_reminders_already_delivered(self):
        state = _make_session_state(
            reminder_prompt="Take blood pressure medication at 2pm.",
            reminders_delivered={"Take blood pressure medication"},
        )
        tools = make_flows_tools(state)
        transition_fn = _make_transition_to_main(state, tools)
        result, node = await transition_fn({}, None)
        assert node["name"] == "main"


class TestInitialNode:
    def test_returns_opening_node(self):
        state = _make_session_state()
        tools = make_flows_tools(state)
        node = build_initial_node(state, tools)
        assert node["name"] == "opening"
