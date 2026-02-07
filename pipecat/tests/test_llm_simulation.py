"""LLM simulation tests — reactive conversation testing with real Anthropic LLM.

Runs full conversations between Donna (real Claude) and a simulated senior
(Claude Haiku), then evaluates quality with an observer LLM.

These tests require ANTHROPIC_API_KEY and are slow (~30-60s each).
Run with: pytest tests/test_llm_simulation.py -v -s --timeout=180
"""

import os

import pytest

from tests.llm_simulation.conversation_runner import ConversationRunner
from tests.llm_simulation.scenarios import (
    CHECKIN_SCENARIO,
    HEALTH_CONCERN_SCENARIO,
    LONELY_SENIOR_SCENARIO,
    MEDICATION_REMINDER_SCENARIO,
)


pytestmark = [
    pytest.mark.llm_simulation,
    pytest.mark.skipif(
        not os.getenv("ANTHROPIC_API_KEY"),
        reason="ANTHROPIC_API_KEY not set",
    ),
]


def _print_result(result):
    """Print conversation transcript and evaluation for debugging."""
    print("\n--- Transcript ---")
    for turn in result.transcript:
        role = turn["role"].upper()
        content = turn["content"]
        # Truncate long responses for readability
        if len(content) > 200:
            content = content[:200] + "..."
        print(f"  {role}: {content}")

    print(f"\n--- Evaluation ---")
    print(f"  Scores: {result.evaluation.scores}")
    print(f"  Pass: {result.evaluation.overall_pass}")
    print(f"  Turns: {result.turn_count}")
    print(f"  Ended naturally: {result.ended_naturally}")
    print(f"  Duration: {result.duration_seconds:.1f}s")
    if result.evaluation.issues:
        print(f"  Issues: {result.evaluation.issues}")
    if result.error:
        print(f"  Error: {result.error}")
    print(f"  Reasoning: {result.evaluation.reasoning[:300]}...")


class TestLLMSimulation:
    """LLM-vs-LLM simulation tests for Donna voice pipeline."""

    @pytest.mark.asyncio
    async def test_checkin_conversation(self):
        """Normal check-in: Margaret in good spirits, natural goodbye."""
        runner = ConversationRunner(CHECKIN_SCENARIO)
        result = await runner.run()
        _print_result(result)

        assert result.transcript, "Conversation should have at least one turn"
        assert result.error is None, f"Unexpected error: {result.error}"
        assert result.evaluation.overall_pass, (
            f"Check-in failed evaluation. "
            f"Scores: {result.evaluation.scores}. "
            f"Reasoning: {result.evaluation.reasoning}"
        )

    @pytest.mark.asyncio
    async def test_health_concern_conversation(self):
        """Health concern: Margaret mentions fall/dizziness, Donna responds safely."""
        runner = ConversationRunner(HEALTH_CONCERN_SCENARIO)
        result = await runner.run()
        _print_result(result)

        assert result.transcript, "Conversation should have at least one turn"
        assert result.error is None, f"Unexpected error: {result.error}"
        assert result.evaluation.overall_pass, (
            f"Health concern failed evaluation. "
            f"Scores: {result.evaluation.scores}. "
            f"Reasoning: {result.evaluation.reasoning}"
        )

    @pytest.mark.asyncio
    async def test_medication_reminder_conversation(self):
        """Medication reminder: Donna delivers reminder, Margaret acknowledges."""
        runner = ConversationRunner(MEDICATION_REMINDER_SCENARIO)
        result = await runner.run()
        _print_result(result)

        assert result.transcript, "Conversation should have at least one turn"
        assert result.error is None, f"Unexpected error: {result.error}"
        assert result.evaluation.overall_pass, (
            f"Medication reminder failed evaluation. "
            f"Scores: {result.evaluation.scores}. "
            f"Reasoning: {result.evaluation.reasoning}"
        )

    @pytest.mark.asyncio
    async def test_lonely_senior_conversation(self):
        """Emotional support: Margaret is sad and lonely, Donna provides comfort."""
        runner = ConversationRunner(LONELY_SENIOR_SCENARIO)
        result = await runner.run()
        _print_result(result)

        assert result.transcript, "Conversation should have at least one turn"
        assert result.error is None, f"Unexpected error: {result.error}"
        assert result.evaluation.overall_pass, (
            f"Lonely senior failed evaluation. "
            f"Scores: {result.evaluation.scores}. "
            f"Reasoning: {result.evaluation.reasoning}"
        )
