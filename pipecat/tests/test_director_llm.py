"""Tests for services/director_llm.py — Gemini Flash conversation direction."""

import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock


class TestRepairJson:
    def test_removes_trailing_commas(self):
        from services.director_llm import _repair_json
        assert json.loads(_repair_json('{"a": 1,}')) == {"a": 1}

    def test_closes_unclosed_braces(self):
        from services.director_llm import _repair_json
        result = _repair_json('{"a": {"b": 1}')
        assert json.loads(result) == {"a": {"b": 1}}

    def test_closes_unclosed_brackets(self):
        from services.director_llm import _repair_json
        result = _repair_json('[1, 2, 3')
        assert json.loads(result) == [1, 2, 3]

    def test_valid_json_passthrough(self):
        from services.director_llm import _repair_json
        valid = '{"key": "value"}'
        assert _repair_json(valid) == valid


class TestFormatHistory:
    def test_empty_returns_call_just_started(self):
        from services.director_llm import _format_history
        assert _format_history([]) == "Call just started"

    def test_role_mapping(self):
        from services.director_llm import _format_history
        history = [
            {"role": "assistant", "content": "Hello!"},
            {"role": "user", "content": "Hi there"},
        ]
        result = _format_history(history)
        assert "DONNA: Hello!" in result
        assert "SENIOR: Hi there" in result

    def test_limits_to_4_messages(self):
        from services.director_llm import _format_history
        history = [{"role": "user", "content": f"msg {i}"} for i in range(15)]
        result = _format_history(history)
        lines = result.strip().split("\n")
        assert len(lines) == 4


class TestFormatReminders:
    def test_filters_delivered_by_title(self):
        from services.director_llm import _format_reminders
        reminders = [{"title": "Take pills", "description": "morning"}, {"title": "Dr visit", "description": "3pm"}]
        result = _format_reminders(reminders, {"Take pills"})
        assert "Take pills" not in result
        assert "Dr visit" in result

    def test_filters_delivered_by_id(self):
        from services.director_llm import _format_reminders
        reminders = [{"id": "r1", "title": "Take pills", "description": "morning"}]
        result = _format_reminders(reminders, {"r1"})
        assert result == "None"

    def test_none_when_all_delivered(self):
        from services.director_llm import _format_reminders
        reminders = [{"title": "Take pills", "description": "d"}]
        assert _format_reminders(reminders, {"Take pills"}) == "None"

    def test_shows_remaining(self):
        from services.director_llm import _format_reminders
        reminders = [{"title": "Walk", "description": "evening"}]
        result = _format_reminders(reminders, set())
        assert "Walk" in result


class TestGetDefaultDirection:
    def test_has_all_required_keys(self):
        from services.director_llm import get_default_direction
        d = get_default_direction()
        assert "analysis" in d
        assert "direction" in d
        assert "reminder" in d
        assert "guidance" in d

    def test_analysis_has_required_fields(self):
        from services.director_llm import get_default_direction
        a = get_default_direction()["analysis"]
        for key in ["call_phase", "engagement_level", "current_topic", "emotional_tone", "turns_on_current_topic"]:
            assert key in a


class TestFormatDirectorGuidance:
    def test_returns_none_for_empty(self):
        from services.director_llm import format_director_guidance
        assert format_director_guidance(None) is None
        assert format_director_guidance({}) is None

    def test_closing_phase(self):
        from services.director_llm import format_director_guidance
        d = {"analysis": {"call_phase": "closing", "engagement_level": "medium", "emotional_tone": "neutral"}, "guidance": {"tone": "warm"}}
        result = format_director_guidance(d)
        assert "CLOSING" in result

    def test_winding_down_phase(self):
        from services.director_llm import format_director_guidance
        d = {"analysis": {"call_phase": "winding_down", "engagement_level": "medium", "emotional_tone": "neutral"}, "guidance": {"tone": "warm"}}
        result = format_director_guidance(d)
        assert "WINDING DOWN" in result

    def test_reminder_delivery(self):
        from services.director_llm import format_director_guidance
        d = {
            "analysis": {"call_phase": "main", "engagement_level": "high", "emotional_tone": "positive"},
            "guidance": {"tone": "warm"},
            "reminder": {"should_deliver": True, "which_reminder": "Take medication", "delivery_approach": "after positive moment"},
        }
        result = format_director_guidance(d)
        assert "REMIND" in result
        assert "Take medication" in result

    def test_low_engagement(self):
        from services.director_llm import format_director_guidance
        d = {"analysis": {"call_phase": "main", "engagement_level": "low", "emotional_tone": "neutral"}, "guidance": {"tone": "warm"}, "reminder": {"should_deliver": False}}
        result = format_director_guidance(d)
        assert "RE-ENGAGE" in result

    def test_topic_shift(self):
        from services.director_llm import format_director_guidance
        d = {
            "analysis": {"call_phase": "main", "engagement_level": "medium", "emotional_tone": "neutral"},
            "guidance": {"tone": "warm", "specific_instruction": ""},
            "reminder": {"should_deliver": False},
            "direction": {"stay_or_shift": "transition", "next_topic": "grandchildren"},
        }
        result = format_director_guidance(d)
        assert "SHIFT to grandchildren" in result

    def test_emotional_tone_markers(self):
        from services.director_llm import format_director_guidance
        d = {"analysis": {"call_phase": "main", "engagement_level": "medium", "emotional_tone": "sad"}, "guidance": {"tone": "empathetic"}, "reminder": {"should_deliver": False}}
        result = format_director_guidance(d)
        assert "(sad)" in result

    def test_instruction_truncation(self):
        from services.director_llm import format_director_guidance
        long_instr = "A" * 100
        d = {
            "analysis": {"call_phase": "main", "engagement_level": "medium", "emotional_tone": "neutral"},
            "guidance": {"tone": "warm", "specific_instruction": long_instr},
            "reminder": {"should_deliver": False},
            "direction": {"stay_or_shift": "stay"},
        }
        result = format_director_guidance(d)
        parts = result.split(" | ")
        assert len(parts[-1]) <= 60

    def test_filters_stage_directions(self):
        from services.director_llm import format_director_guidance
        d = {
            "analysis": {"call_phase": "main", "engagement_level": "medium", "emotional_tone": "neutral"},
            "guidance": {"tone": "warm", "specific_instruction": "Laugh warmly and show empathy"},
            "reminder": {"should_deliver": False},
            "direction": {"stay_or_shift": "stay"},
        }
        result = format_director_guidance(d)
        assert "Laugh" not in (result or "")


class TestAnalyzeTurn:
    @pytest.mark.asyncio
    async def test_returns_default_without_api_key(self):
        from services.director_llm import analyze_turn, get_default_direction
        with patch("services.director_llm._get_client", return_value=None):
            result = await analyze_turn("hello", {"senior": {"name": "Test"}})
            assert result == get_default_direction()

    @pytest.mark.asyncio
    async def test_returns_default_on_empty_response(self):
        from services.director_llm import analyze_turn
        mock_response = MagicMock()
        mock_response.text = ""
        mock_client = MagicMock()
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)
        with patch("services.director_llm._get_client", return_value=mock_client):
            result = await analyze_turn("hello", {"senior": {"name": "Test"}})
            assert result["analysis"]["call_phase"] == "main"

    @pytest.mark.asyncio
    async def test_parses_valid_json(self):
        from services.director_llm import analyze_turn
        direction = {
            "analysis": {"call_phase": "main", "engagement_level": "high", "emotional_tone": "positive", "current_topic": "garden", "turns_on_current_topic": 3},
            "direction": {"stay_or_shift": "stay", "next_topic": None, "pacing_note": "good"},
            "reminder": {"should_deliver": False, "which_reminder": None, "delivery_approach": None},
            "guidance": {"tone": "warm", "priority_action": "Continue", "specific_instruction": "Ask about roses"},
        }
        mock_response = MagicMock()
        mock_response.text = json.dumps(direction)
        mock_client = MagicMock()
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)
        with patch("services.director_llm._get_client", return_value=mock_client):
            result = await analyze_turn("tell me about roses", {"senior": {"name": "Margaret"}, "_call_start_time": 1000000})
            assert result["analysis"]["call_phase"] == "main"
            assert result["analysis"]["engagement_level"] == "high"

    @pytest.mark.asyncio
    async def test_returns_default_on_exception(self):
        from services.director_llm import analyze_turn, get_default_direction
        mock_client = MagicMock()
        mock_client.aio.models.generate_content = AsyncMock(side_effect=Exception("API error"))
        with patch("services.director_llm._get_client", return_value=mock_client):
            result = await analyze_turn("hello", {"senior": {"name": "Test"}})
            assert result == get_default_direction()
