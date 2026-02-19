"""Level 2: Flow phase transition tests.

Tests that node builders produce correct NodeConfig structures for each phase,
and that transition functions return valid next-phase configs.
"""

import pytest

from flows.nodes import (
    build_initial_node,
    build_main_node,
    build_reminder_node,
    build_winding_down_node,
    build_closing_node,
    _make_transition_reminder_to_main,
    _make_transition_to_winding_down,
    _make_transition_to_closing,
)
from flows.tools import make_flows_tools


class TestPhaseNodeConfigs:
    def test_initial_node_is_main_without_reminders(self, session_state):
        session_state["reminder_prompt"] = None
        flows_tools = make_flows_tools(session_state)
        node = build_initial_node(session_state, flows_tools)

        assert node["name"] == "main"
        func_names = [f.name for f in node["functions"]]
        assert "search_memories" in func_names
        assert "save_important_detail" in func_names
        assert "transition_to_winding_down" in func_names
        assert node.get("respond_immediately") is True

    def test_initial_node_is_reminder_with_pending(self, session_state):
        session_state["reminder_prompt"] = "Take medication at 2pm"
        session_state["reminders_delivered"] = set()
        flows_tools = make_flows_tools(session_state)
        node = build_initial_node(session_state, flows_tools)

        assert node["name"] == "reminder"
        func_names = [f.name for f in node["functions"]]
        assert "mark_reminder_acknowledged" in func_names
        assert "transition_to_main" in func_names
        assert node.get("respond_immediately") is True

    def test_main_node_has_all_tools(self, session_state):
        flows_tools = make_flows_tools(session_state)
        node = build_main_node(session_state, flows_tools)

        assert node["name"] == "main"
        func_names = [f.name for f in node["functions"]]
        assert "search_memories" in func_names
        assert "web_search" in func_names
        assert "save_important_detail" in func_names
        assert "mark_reminder_acknowledged" in func_names
        assert "transition_to_winding_down" in func_names

    def test_winding_down_node_limited_tools(self, session_state):
        flows_tools = make_flows_tools(session_state)
        node = build_winding_down_node(session_state, flows_tools)

        assert node["name"] == "winding_down"
        func_names = [f.name for f in node["functions"]]
        assert "mark_reminder_acknowledged" in func_names
        assert "transition_to_closing" in func_names
        assert "get_news" not in func_names

    def test_closing_node_no_tools(self, session_state):
        node = build_closing_node(session_state)

        assert node["name"] == "closing"
        assert len(node["functions"]) == 0
        assert any(a.get("type") == "end_conversation" for a in node["post_actions"])


class TestPhaseTransitions:
    @pytest.mark.asyncio
    async def test_transition_reminder_to_main(self, session_state):
        flows_tools = make_flows_tools(session_state)
        transition = _make_transition_reminder_to_main(session_state, flows_tools)

        result, node = await transition({}, None)
        assert result["status"] == "success"
        assert node["name"] == "main"

    @pytest.mark.asyncio
    async def test_transition_main_to_winding_down(self, session_state):
        flows_tools = make_flows_tools(session_state)
        transition = _make_transition_to_winding_down(session_state, flows_tools)

        result, node = await transition({}, None)
        assert result["status"] == "success"
        assert node["name"] == "winding_down"

    @pytest.mark.asyncio
    async def test_transition_to_closing(self, session_state):
        transition = _make_transition_to_closing(session_state)

        result, node = await transition({}, None)
        assert result["status"] == "success"
        assert node["name"] == "closing"

    def test_initial_node_routes_correctly(self, session_state):
        session_state["reminder_prompt"] = None
        flows_tools = make_flows_tools(session_state)
        node = build_initial_node(session_state, flows_tools)
        assert node["name"] == "main"
