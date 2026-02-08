"""LLM simulation tests v2 — new scenarios for untested product features.

Covers: web search, memory recall, save detail, low engagement recovery,
cognitive concerns, false goodbyes, and inbound calls.

These tests require ANTHROPIC_API_KEY and are slow (~30-90s each).
Run with: pytest tests/test_llm_simulation_v2.py -v -s
"""

import os
import warnings

import pytest

from tests.llm_simulation.conversation_runner import ConversationRunner
from tests.llm_simulation.scenarios import (
    COGNITIVE_CONCERN_SCENARIO,
    FALSE_GOODBYE_SCENARIO,
    INBOUND_CALL_SCENARIO,
    LOW_ENGAGEMENT_SCENARIO,
    MEMORY_RECALL_SCENARIO,
    SAVE_DETAIL_SCENARIO,
    WEB_SEARCH_SCENARIO,
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
        if len(content) > 200:
            content = content[:200] + "..."
        print(f"  {role}: {content}")

    print(f"\n--- Evaluation ---")
    print(f"  Scores: {result.evaluation.scores}")
    print(f"  Pass: {result.evaluation.overall_pass}")
    print(f"  Turns: {result.turn_count}")
    print(f"  Ended naturally: {result.ended_naturally}")
    print(f"  Duration: {result.duration_seconds:.1f}s")
    if result.tool_call_counts:
        print(f"  Tool calls: {result.tool_call_counts}")
    if result.evaluation.issues:
        print(f"  Issues: {result.evaluation.issues}")
    if result.error:
        print(f"  Error: {result.error}")
    print(f"  Reasoning: {result.evaluation.reasoning[:300]}...")


class TestLLMSimulationV2:
    """LLM-vs-LLM simulation tests v2 — new feature coverage."""

    @pytest.mark.asyncio
    async def test_web_search(self):
        """Web search: Margaret asks about weather, Donna uses web_search tool."""
        runner = ConversationRunner(WEB_SEARCH_SCENARIO)
        result = await runner.run()
        _print_result(result)

        assert result.transcript, "Conversation should have at least one turn"
        assert result.error is None, f"Unexpected error: {result.error}"
        assert result.evaluation.overall_pass, (
            f"Web search failed evaluation. "
            f"Scores: {result.evaluation.scores}. "
            f"Reasoning: {result.evaluation.reasoning}"
        )
        # Soft check — LLM tool usage is non-deterministic
        if result.tool_call_counts.get("web_search_query", 0) < 1:
            warnings.warn(
                f"web_search_query was not called (tool counts: {result.tool_call_counts}). "
                "Donna should use web search when asked about weather."
            )

    @pytest.mark.asyncio
    async def test_memory_recall(self):
        """Memory recall: Margaret references past calls, Donna uses search_memories."""
        runner = ConversationRunner(MEMORY_RECALL_SCENARIO)
        result = await runner.run()
        _print_result(result)

        assert result.transcript, "Conversation should have at least one turn"
        assert result.error is None, f"Unexpected error: {result.error}"
        assert result.evaluation.overall_pass, (
            f"Memory recall failed evaluation. "
            f"Scores: {result.evaluation.scores}. "
            f"Reasoning: {result.evaluation.reasoning}"
        )
        # Soft check — LLM tool usage is non-deterministic
        if result.tool_call_counts.get("memory_search", 0) < 1:
            warnings.warn(
                f"memory_search was not called (tool counts: {result.tool_call_counts}). "
                "Donna should search memories when asked about past calls."
            )

    @pytest.mark.asyncio
    async def test_save_detail(self):
        """Save detail: Margaret shares big news, Donna uses save_important_detail."""
        runner = ConversationRunner(SAVE_DETAIL_SCENARIO)
        result = await runner.run()
        _print_result(result)

        assert result.transcript, "Conversation should have at least one turn"
        assert result.error is None, f"Unexpected error: {result.error}"
        assert result.evaluation.overall_pass, (
            f"Save detail failed evaluation. "
            f"Scores: {result.evaluation.scores}. "
            f"Reasoning: {result.evaluation.reasoning}"
        )
        # Soft check — warn but don't fail if save wasn't called
        if result.tool_call_counts.get("memory_store", 0) < 1:
            warnings.warn(
                f"save_important_detail was not called (tool counts: {result.tool_call_counts}). "
                "Donna should save significant family updates."
            )

    @pytest.mark.asyncio
    async def test_low_engagement(self):
        """Low engagement: Harold gives short answers, Donna varies re-engagement strategies."""
        runner = ConversationRunner(LOW_ENGAGEMENT_SCENARIO)
        result = await runner.run()
        _print_result(result)

        assert result.transcript, "Conversation should have at least one turn"
        assert result.error is None, f"Unexpected error: {result.error}"
        assert result.evaluation.overall_pass, (
            f"Low engagement failed evaluation. "
            f"Scores: {result.evaluation.scores}. "
            f"Reasoning: {result.evaluation.reasoning}"
        )

    @pytest.mark.asyncio
    async def test_cognitive_concern(self):
        """Cognitive concern: Margaret is confused, Donna responds with patience."""
        runner = ConversationRunner(COGNITIVE_CONCERN_SCENARIO)
        result = await runner.run()
        _print_result(result)

        assert result.transcript, "Conversation should have at least one turn"
        assert result.error is None, f"Unexpected error: {result.error}"
        assert result.evaluation.overall_pass, (
            f"Cognitive concern failed evaluation. "
            f"Scores: {result.evaluation.scores}. "
            f"Reasoning: {result.evaluation.reasoning}"
        )

    @pytest.mark.asyncio
    async def test_false_goodbye(self):
        """False goodbye: Margaret says 'bye' to someone else, call should continue."""
        runner = ConversationRunner(FALSE_GOODBYE_SCENARIO)
        result = await runner.run()
        _print_result(result)

        assert result.transcript, "Conversation should have at least one turn"
        assert result.error is None, f"Unexpected error: {result.error}"
        # The key assertion: conversation should survive the interruption
        assert result.turn_count >= 2, (
            f"Expected at least 2 senior turns (conversation should survive "
            f"mid-call interruption), got {result.turn_count}"
        )
        assert result.evaluation.overall_pass, (
            f"False goodbye failed evaluation. "
            f"Scores: {result.evaluation.scores}. "
            f"Reasoning: {result.evaluation.reasoning}"
        )

    @pytest.mark.asyncio
    async def test_inbound_call(self):
        """Inbound call: Margaret calls Donna, tests inbound flow handling."""
        runner = ConversationRunner(INBOUND_CALL_SCENARIO)
        result = await runner.run()
        _print_result(result)

        assert result.transcript, "Conversation should have at least one turn"
        assert result.error is None, f"Unexpected error: {result.error}"
        assert result.evaluation.overall_pass, (
            f"Inbound call failed evaluation. "
            f"Scores: {result.evaluation.scores}. "
            f"Reasoning: {result.evaluation.reasoning}"
        )
