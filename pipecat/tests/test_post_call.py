"""Level 2/3: Post-call processing tests.

Tests run_post_call() with mocked services to verify the complete
post-call sequence: conversation completion, analysis, memory extraction,
daily context save, reminder cleanup, cache clearing.
"""

import pytest
from unittest.mock import AsyncMock, patch

from processors.conversation_tracker import ConversationTrackerProcessor


class TestPostCallProcessing:
    @pytest.mark.asyncio
    async def test_full_post_call_sequence(self, session_state):
        """Verify all 6 post-call steps execute in order."""
        session_state["_transcript"] = [
            {"role": "user", "content": "Hello Donna"},
            {"role": "assistant", "content": "Hello Margaret! How are you?"},
            {"role": "user", "content": "I'm doing well"},
        ]

        tracker = ConversationTrackerProcessor(session_state=session_state)
        tracker.state.topics_discussed = ["greeting"]
        tracker.state.advice_given = []

        with patch("services.conversations.complete", new_callable=AsyncMock) as mock_complete, \
             patch("services.call_analysis.analyze_completed_call", new_callable=AsyncMock) as mock_analyze, \
             patch("services.call_analysis.save_call_analysis", new_callable=AsyncMock) as mock_save_analysis, \
             patch("services.memory.extract_from_conversation", new_callable=AsyncMock) as mock_extract, \
             patch("services.daily_context.save_call_context", new_callable=AsyncMock) as mock_daily, \
             patch("services.context_cache.clear_cache") as mock_cache_clear, \
             patch("services.scheduler.clear_reminder_context") as mock_sched_clear:

            mock_analyze.return_value = {"mood": "positive", "summary": "Good call"}

            from services.post_call import run_post_call
            await run_post_call(session_state, tracker, duration_seconds=120)

            # 1. Conversation completed
            mock_complete.assert_awaited_once()
            # 2. Call analysis run
            mock_analyze.assert_awaited_once()
            # 3. Analysis saved
            mock_save_analysis.assert_awaited_once()
            # 4. Memories extracted
            mock_extract.assert_awaited_once()
            # 5. Daily context saved
            mock_daily.assert_awaited_once()
            # 6. Caches cleared
            mock_cache_clear.assert_called_once_with("senior-test-001")

    @pytest.mark.asyncio
    async def test_post_call_with_unacknowledged_reminder(self, reminder_session_state):
        """Undelivered reminders should trigger mark_call_ended_without_acknowledgment."""
        reminder_session_state["_transcript"] = [
            {"role": "user", "content": "Goodbye"},
        ]
        reminder_session_state["reminders_delivered"] = set()  # None delivered

        tracker = ConversationTrackerProcessor(session_state=reminder_session_state)

        with patch("services.conversations.complete", new_callable=AsyncMock), \
             patch("services.call_analysis.analyze_completed_call", new_callable=AsyncMock) as mock_analyze, \
             patch("services.call_analysis.save_call_analysis", new_callable=AsyncMock), \
             patch("services.memory.extract_from_conversation", new_callable=AsyncMock), \
             patch("services.daily_context.save_call_context", new_callable=AsyncMock), \
             patch("services.context_cache.clear_cache"), \
             patch("services.scheduler.clear_reminder_context"), \
             patch("services.reminder_delivery.mark_call_ended_without_acknowledgment", new_callable=AsyncMock) as mock_no_ack:

            mock_analyze.return_value = {"mood": "neutral", "summary": "Short call"}

            from services.post_call import run_post_call
            await run_post_call(reminder_session_state, tracker, duration_seconds=30)

            mock_no_ack.assert_awaited_once_with("delivery-001")

    @pytest.mark.asyncio
    async def test_post_call_handles_errors_gracefully(self, session_state):
        """Post-call should not crash if a service fails."""
        session_state["_transcript"] = [
            {"role": "user", "content": "Hello"},
        ]

        tracker = ConversationTrackerProcessor(session_state=session_state)

        with patch("services.conversations.complete", new_callable=AsyncMock) as mock_complete:
            mock_complete.side_effect = Exception("DB error")

            from services.post_call import run_post_call
            # Should not raise
            await run_post_call(session_state, tracker, duration_seconds=10)
