"""Unit tests for the CallerAgent simulation layer.

Tests the CallerAgent (Haiku LLM wrapper), CallerPersona, and CallerGoal
data classes.  LLM-calling tests are gated behind ``ANTHROPIC_API_KEY`` and
the ``llm_simulation`` marker.  Goal-completion keyword matching is tested
without any LLM calls.
"""

from __future__ import annotations

import os

import pytest

from tests.simulation.caller import (
    CallerAgent,
    CallerGoal,
    CallerPersona,
)


# ---------------------------------------------------------------------------
# CallerPersona dataclass tests
# ---------------------------------------------------------------------------


class TestCallerPersona:
    def test_default_values(self):
        persona = CallerPersona()
        assert persona.name == "Margaret Johnson"
        assert persona.age == 78
        assert "gardening" in persona.personality
        assert "dear" in persona.speech_style

    def test_custom_persona(self):
        persona = CallerPersona(
            name="Harold Smith",
            age=82,
            personality="Quiet, thoughtful, loves chess.",
            speech_style="Speaks slowly and deliberately.",
        )
        assert persona.name == "Harold Smith"
        assert persona.age == 82


# ---------------------------------------------------------------------------
# CallerGoal dataclass tests
# ---------------------------------------------------------------------------


class TestCallerGoal:
    def test_default_values(self):
        goal = CallerGoal(description="Ask about the weather")
        assert goal.description == "Ask about the weather"
        assert goal.trigger_phrase == ""
        assert goal.completed is False

    def test_with_trigger_phrase(self):
        goal = CallerGoal(
            description="Mention medication",
            trigger_phrase="I took my pills this morning",
        )
        assert goal.trigger_phrase == "I took my pills this morning"

    def test_mark_completed(self):
        goal = CallerGoal(description="Discuss family")
        goal.completed = True
        assert goal.completed is True


# ---------------------------------------------------------------------------
# CallerAgent — goal completion (no LLM needed)
# ---------------------------------------------------------------------------


class TestGoalCompletion:
    """Tests _check_goal_completion keyword matching without LLM calls."""

    def _make_agent(self, goals: list[CallerGoal]) -> CallerAgent:
        """Create an agent without calling the LLM.

        We set a dummy model — _check_goal_completion never touches the
        Anthropic client.
        """
        agent = CallerAgent(
            persona=CallerPersona(),
            goals=goals,
            model="claude-haiku-4-5-20251001",
        )
        return agent

    def test_marks_goal_completed_on_keyword_match(self):
        """Goal is completed when >50% of significant words appear."""
        goals = [
            CallerGoal(description="Ask about the weather forecast today"),
        ]
        agent = self._make_agent(goals)

        # "weather" and "forecast" and "today" are 3 of 3 significant words
        # (4+ chars: "about"=5, "weather"=7, "forecast"=8, "today"=5 → 4 words)
        agent._check_goal_completion(
            caller_text="What's the weather forecast like today?",
            donna_text="Let me check.",
        )
        assert goals[0].completed is True

    def test_does_not_mark_below_threshold(self):
        """Goal stays incomplete when <50% of keywords match."""
        goals = [
            CallerGoal(
                description="Discuss your grandchildren visiting this weekend"
            ),
        ]
        agent = self._make_agent(goals)

        # Only "visiting" matches out of significant words
        # (discuss, grandchildren, visiting, weekend → 4 words, 1 match = 25%)
        agent._check_goal_completion(
            caller_text="I'm visiting the store.",
            donna_text="That sounds nice.",
        )
        assert goals[0].completed is False

    def test_only_one_goal_marked_per_turn(self):
        """At most one goal is marked completed per call."""
        goals = [
            CallerGoal(description="Discuss gardening roses"),
            CallerGoal(description="Mention planting roses this spring"),
        ]
        agent = self._make_agent(goals)

        # Both goals mention "roses" and related gardening words — but
        # only the first matching incomplete goal should be marked.
        agent._check_goal_completion(
            caller_text="I've been gardening and planting roses this spring!",
            donna_text="That sounds wonderful, the roses must be beautiful.",
        )

        completed_count = sum(1 for g in goals if g.completed)
        assert completed_count == 1

    def test_skips_already_completed_goals(self):
        """Completed goals are not re-checked."""
        goals = [
            CallerGoal(description="Ask about the weather", completed=True),
            CallerGoal(description="Mention feeling lonely today"),
        ]
        agent = self._make_agent(goals)

        agent._check_goal_completion(
            caller_text="I've been feeling a bit lonely today, dear.",
            donna_text="I'm sorry to hear that.",
        )

        assert goals[0].completed is True  # was already done
        assert goals[1].completed is True  # newly completed

    def test_donna_text_also_counts(self):
        """Keywords from Donna's response also contribute to matching."""
        goals = [
            CallerGoal(description="Discuss taking medication this morning"),
        ]
        agent = self._make_agent(goals)

        # Caller doesn't mention it, but Donna does
        agent._check_goal_completion(
            caller_text="Well, let me think...",
            donna_text="Did you take your medication this morning?",
        )
        assert goals[0].completed is True

    def test_all_goals_completed_property(self):
        """all_goals_completed reflects goal state."""
        goals = [
            CallerGoal(description="Ask about weather"),
            CallerGoal(description="Mention family"),
        ]
        agent = self._make_agent(goals)

        assert agent.all_goals_completed is False

        goals[0].completed = True
        assert agent.all_goals_completed is False

        goals[1].completed = True
        assert agent.all_goals_completed is True

    def test_should_end_call_all_goals_done(self):
        """should_end_call is True when all goals are completed."""
        goals = [CallerGoal(description="Say hello", completed=True)]
        agent = self._make_agent(goals)
        assert agent.should_end_call is True

    def test_should_end_call_max_turns(self):
        """should_end_call is True when MAX_TURNS is reached."""
        goals = [CallerGoal(description="Something incomplete")]
        agent = self._make_agent(goals)
        agent._turn_count = CallerAgent.MAX_TURNS
        assert agent.should_end_call is True

    def test_should_end_call_false_when_incomplete(self):
        """should_end_call is False when goals remain and turns are low."""
        goals = [CallerGoal(description="Something to do")]
        agent = self._make_agent(goals)
        agent._turn_count = 3
        assert agent.should_end_call is False

    def test_turn_count_starts_at_zero(self):
        """turn_count is 0 before any exchanges."""
        agent = self._make_agent([])
        assert agent.turn_count == 0


# ---------------------------------------------------------------------------
# CallerAgent — system prompt construction (no LLM needed)
# ---------------------------------------------------------------------------


class TestSystemPrompt:
    """Tests _build_system_prompt formatting without LLM calls."""

    def test_includes_persona_details(self):
        persona = CallerPersona(name="Harold", age=85, personality="Gruff")
        agent = CallerAgent(persona=persona, goals=[])
        prompt = agent._build_system_prompt()

        assert "Harold" in prompt
        assert "85" in prompt
        assert "Gruff" in prompt

    def test_includes_goals_with_status(self):
        goals = [
            CallerGoal(description="Ask about weather"),
            CallerGoal(description="Mention family", completed=True),
        ]
        agent = CallerAgent(persona=CallerPersona(), goals=goals)
        prompt = agent._build_system_prompt()

        assert "[TODO] Ask about weather" in prompt
        assert "[DONE] Mention family" in prompt

    def test_includes_trigger_phrase(self):
        goals = [
            CallerGoal(
                description="Ask about medication",
                trigger_phrase="Did I take my pills?",
            ),
        ]
        agent = CallerAgent(persona=CallerPersona(), goals=goals)
        prompt = agent._build_system_prompt()

        assert 'try to say: "Did I take my pills?"' in prompt

    def test_max_turns_warning(self):
        agent = CallerAgent(persona=CallerPersona(), goals=[])
        agent._turn_count = CallerAgent.MAX_TURNS
        prompt = agent._build_system_prompt()

        assert "MUST say goodbye NOW" in prompt

    def test_no_max_turns_warning_normally(self):
        agent = CallerAgent(persona=CallerPersona(), goals=[])
        agent._turn_count = 5
        prompt = agent._build_system_prompt()

        assert "MUST say goodbye NOW" not in prompt


# ---------------------------------------------------------------------------
# CallerAgent — LLM integration tests (require ANTHROPIC_API_KEY)
# ---------------------------------------------------------------------------


@pytest.mark.llm_simulation
@pytest.mark.skipif(
    not os.environ.get("ANTHROPIC_API_KEY"),
    reason="Requires ANTHROPIC_API_KEY",
)
class TestCallerAgentLLM:
    """Tests that exercise the real Haiku LLM. Slow, costs money."""

    def test_caller_agent_generates_response(self):
        """Agent generates a non-empty, reasonably short response."""
        agent = CallerAgent(
            persona=CallerPersona(),
            goals=[CallerGoal(description="Respond warmly to a greeting")],
        )

        response = agent.generate_response(
            "Good morning, Margaret! How are you doing today?"
        )

        assert isinstance(response, str)
        assert len(response) > 0
        # Should be reasonably short (1-3 sentences, not a novel)
        assert len(response) < 500

    def test_caller_agent_tracks_turns(self):
        """turn_count increments with each generate_response call."""
        agent = CallerAgent(
            persona=CallerPersona(),
            goals=[
                CallerGoal(description="Chat about the garden"),
                CallerGoal(description="Mention feeling well"),
            ],
        )

        assert agent.turn_count == 0

        agent.generate_response("Hello Margaret, how's your garden?")
        assert agent.turn_count == 1

        agent.generate_response("That sounds lovely! And how are you feeling?")
        assert agent.turn_count == 2

    def test_caller_agent_max_turns_safety(self):
        """After MAX_TURNS, the agent generates a goodbye."""
        agent = CallerAgent(
            persona=CallerPersona(),
            goals=[CallerGoal(description="This goal will never complete")],
        )

        # Fast-forward to MAX_TURNS - 1 (next generate_response will be MAX_TURNS)
        agent._turn_count = CallerAgent.MAX_TURNS - 1

        response = agent.generate_response(
            "So Margaret, what else is new?"
        )

        assert isinstance(response, str)
        assert len(response) > 0
        # The system prompt demands a goodbye — check for farewell signals
        response_lower = response.lower()
        goodbye_indicators = [
            "bye", "goodbye", "talk", "later", "nice", "take care",
            "wonderful", "lovely", "thank", "good", "see you",
        ]
        has_farewell = any(word in response_lower for word in goodbye_indicators)
        assert has_farewell, (
            f"Expected a goodbye after MAX_TURNS, got: {response}"
        )
