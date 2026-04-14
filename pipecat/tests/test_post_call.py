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
             patch("services.interest_discovery.discover_new_interests", return_value=[]) as mock_discover, \
             patch("services.interest_discovery.compute_interest_scores", new_callable=AsyncMock, return_value={"gardening": 5.0}) as mock_scores, \
             patch("services.interest_discovery.update_interest_scores", new_callable=AsyncMock) as mock_update_scores, \
             patch("services.daily_context.save_call_context", new_callable=AsyncMock) as mock_daily, \
             patch("services.context_cache.clear_cache") as mock_cache_clear, \
             patch("services.scheduler.clear_reminder_context_async", new_callable=AsyncMock) as mock_sched_clear:

            mock_analyze.return_value = {
                    "mood": "positive",
                    "caregiver_sms": "Donna just chatted with Margaret for 2 minutes. She was in great spirits today!",
                    "summary": "Good call",
                }

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
            # 3.5. Interest discovery checked
            mock_discover.assert_called_once()
            # 3.6. Interest scores computed
            mock_scores.assert_awaited_once()
            mock_update_scores.assert_awaited_once()
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
             patch("services.interest_discovery.discover_new_interests", return_value=[]), \
             patch("services.interest_discovery.compute_interest_scores", new_callable=AsyncMock, return_value={}), \
             patch("services.interest_discovery.update_interest_scores", new_callable=AsyncMock), \
             patch("services.daily_context.save_call_context", new_callable=AsyncMock), \
             patch("services.context_cache.clear_cache"), \
             patch("services.scheduler.clear_reminder_context_async", new_callable=AsyncMock), \
             patch("services.reminder_delivery.mark_call_ended_without_acknowledgment", new_callable=AsyncMock) as mock_no_ack:

            mock_analyze.return_value = {
                    "mood": "neutral",
                    "caregiver_sms": "Donna spoke with Margaret briefly today.",
                    "summary": "Short call",
                }

            from services.post_call import run_post_call
            await run_post_call(reminder_session_state, tracker, duration_seconds=30)

            mock_no_ack.assert_awaited_once_with("delivery-001")

    @pytest.mark.asyncio
    async def test_post_call_discovers_new_interests(self, session_state):
        """Steps 3.5 + 3.6: new interests are discovered and scores computed."""
        session_state["_transcript"] = [
            {"role": "user", "content": "I love painting"},
            {"role": "assistant", "content": "That sounds wonderful!"},
        ]

        tracker = ConversationTrackerProcessor(session_state=session_state)
        tracker.state.topics_discussed = ["painting"]
        tracker.state.advice_given = []

        with patch("services.conversations.complete", new_callable=AsyncMock), \
             patch("services.call_analysis.analyze_completed_call", new_callable=AsyncMock) as mock_analyze, \
             patch("services.call_analysis.save_call_analysis", new_callable=AsyncMock), \
             patch("services.conversations.update_summary", new_callable=AsyncMock), \
             patch("services.memory.extract_from_conversation", new_callable=AsyncMock), \
             patch("services.interest_discovery.discover_new_interests", return_value=["painting"]) as mock_discover, \
             patch("services.interest_discovery.add_interests_to_senior", new_callable=AsyncMock) as mock_add, \
             patch("services.interest_discovery.compute_interest_scores", new_callable=AsyncMock, return_value={"gardening": 5.0, "painting": 8.0}) as mock_scores, \
             patch("services.interest_discovery.update_interest_scores", new_callable=AsyncMock) as mock_update_scores, \
             patch("services.daily_context.save_call_context", new_callable=AsyncMock), \
             patch("services.context_cache.clear_cache"), \
             patch("services.scheduler.clear_reminder_context_async", new_callable=AsyncMock):

            mock_analyze.return_value = {
                "topics_discussed": ["painting"],
                "engagement_score": 9,
                "positive_observations": ["Loved discussing painting"],
                "summary": "Great call about painting",
            }
            mock_add.return_value = ["gardening", "cooking", "grandchildren", "painting"]

            from services.post_call import run_post_call
            await run_post_call(session_state, tracker, duration_seconds=120)

            # 3.5: Interest discovery called
            mock_discover.assert_called_once()
            mock_add.assert_awaited_once()
            # 3.6: Scores computed with updated interests
            mock_scores.assert_awaited_once()
            mock_update_scores.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_post_call_uses_full_transcript_not_bounded_director_transcript(self, session_state):
        """Post-call analysis and completion should receive the complete call."""
        full_transcript = [
            {"role": "user", "content": "early turn"},
            {"role": "assistant", "content": "early response"},
            {"role": "user", "content": "latest turn"},
        ]
        session_state["_full_transcript"] = full_transcript
        session_state["_transcript"] = full_transcript[-1:]

        tracker = ConversationTrackerProcessor(session_state=session_state)

        with patch("services.conversations.complete", new_callable=AsyncMock) as mock_complete, \
             patch("services.call_analysis.analyze_completed_call", new_callable=AsyncMock) as mock_analyze, \
             patch("services.call_analysis.save_call_analysis", new_callable=AsyncMock), \
             patch("services.conversations.update_summary", new_callable=AsyncMock), \
             patch("services.memory.extract_from_conversation", new_callable=AsyncMock), \
             patch("services.interest_discovery.discover_new_interests", return_value=[]), \
             patch("services.interest_discovery.compute_interest_scores", new_callable=AsyncMock, return_value={}), \
             patch("services.interest_discovery.update_interest_scores", new_callable=AsyncMock), \
             patch("services.daily_context.save_call_context", new_callable=AsyncMock), \
             patch("services.context_cache.clear_cache"), \
             patch("services.scheduler.clear_reminder_context_async", new_callable=AsyncMock), \
             patch("services.post_call._trigger_caregiver_notification", new_callable=AsyncMock), \
             patch("lib.growthbook.is_on", return_value=True):

            mock_analyze.return_value = {"summary": "Full call summary"}

            from services.post_call import run_post_call
            await run_post_call(session_state, tracker, duration_seconds=120)

            complete_payload = mock_complete.await_args.args[1]
            assert complete_payload["transcript"] == full_transcript
            assert mock_analyze.await_args.args[0] == full_transcript

    @pytest.mark.asyncio
    async def test_post_call_falls_back_to_persisted_transcript(self, session_state):
        """If in-memory transcript is missing, load the Neon draft by call SID."""
        persisted_transcript = [
            {"role": "user", "content": "persisted hello"},
            {"role": "assistant", "content": "persisted response"},
        ]
        session_state["_transcript"] = []
        session_state["_full_transcript"] = []

        with patch("services.conversations.get_transcript_by_call_sid", new_callable=AsyncMock, return_value=persisted_transcript) as mock_get, \
             patch("services.conversations.complete", new_callable=AsyncMock) as mock_complete, \
             patch("services.call_analysis.analyze_completed_call", new_callable=AsyncMock) as mock_analyze, \
             patch("services.call_analysis.save_call_analysis", new_callable=AsyncMock), \
             patch("services.conversations.update_summary", new_callable=AsyncMock), \
             patch("services.memory.extract_from_conversation", new_callable=AsyncMock), \
             patch("services.interest_discovery.discover_new_interests", return_value=[]), \
             patch("services.interest_discovery.compute_interest_scores", new_callable=AsyncMock, return_value={}), \
             patch("services.interest_discovery.update_interest_scores", new_callable=AsyncMock), \
             patch("services.daily_context.save_call_context", new_callable=AsyncMock), \
             patch("services.context_cache.clear_cache"), \
             patch("services.scheduler.clear_reminder_context_async", new_callable=AsyncMock), \
             patch("services.post_call._trigger_caregiver_notification", new_callable=AsyncMock), \
             patch("lib.growthbook.is_on", return_value=True):

            mock_analyze.return_value = {"summary": "Recovered call"}

            from services.post_call import run_post_call
            await run_post_call(session_state, None, duration_seconds=90)

            mock_get.assert_awaited_once_with("CA-test-001")
            complete_payload = mock_complete.await_args.args[1]
            assert complete_payload["transcript"] == persisted_transcript
            assert mock_analyze.await_args.args[0] == persisted_transcript

    @pytest.mark.asyncio
    async def test_onboarding_post_call_falls_back_to_persisted_transcript(self, session_state):
        """Onboarding post-call should also recover from the durable transcript."""
        persisted_transcript = [
            {"role": "user", "content": "Hi, I'm Lisa calling about my mom."},
            {"role": "assistant", "content": "Nice to meet you, Lisa."},
        ]
        session_state.update({
            "call_type": "onboarding",
            "senior_id": None,
            "senior": None,
            "prospect_id": "prospect-001",
            "_transcript": [],
            "_full_transcript": [],
        })

        with patch("services.conversations.get_transcript_by_call_sid", new_callable=AsyncMock, return_value=persisted_transcript) as mock_get, \
             patch("services.conversations.complete", new_callable=AsyncMock) as mock_complete, \
             patch("services.memory.extract_from_conversation", new_callable=AsyncMock) as mock_memory, \
             patch("services.post_call._summarize_onboarding_call", new_callable=AsyncMock, return_value="Lisa called about her mom."), \
             patch("services.prospects.extract_prospect_details", new_callable=AsyncMock, return_value={}), \
             patch("services.prospects.update_after_call", new_callable=AsyncMock):

            from services.post_call import run_post_call
            await run_post_call(session_state, None, duration_seconds=90)

            mock_get.assert_awaited_once_with("CA-test-001")
            assert mock_complete.await_args.args[1]["transcript"] == persisted_transcript
            mock_memory.assert_awaited_once()

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

    @pytest.mark.asyncio
    async def test_onboarding_post_call_extracts_prospect_details_once(self, session_state):
        """Onboarding calls extract prospect details post-call and update once."""
        session_state.update({
            "call_type": "onboarding",
            "senior_id": None,
            "senior": None,
            "prospect_id": "prospect-001",
            "_transcript": [
                {"role": "user", "content": "Hi, I'm Lisa. I'm calling about my mom, Maria."},
                {"role": "assistant", "content": "Nice to meet you, Lisa. What is Maria like?"},
                {"role": "user", "content": "She loves gardening, and I worry she gets lonely."},
            ],
        })

        tracker = ConversationTrackerProcessor(session_state=session_state)

        with patch("services.conversations.complete", new_callable=AsyncMock) as mock_complete, \
             patch("services.memory.extract_from_conversation", new_callable=AsyncMock) as mock_memory, \
             patch("services.post_call._summarize_onboarding_call", new_callable=AsyncMock) as mock_summary, \
             patch("services.prospects.extract_prospect_details", new_callable=AsyncMock) as mock_details, \
             patch("services.prospects.update_after_call", new_callable=AsyncMock) as mock_update:

            mock_summary.return_value = "Lisa called about her mom Maria, who loves gardening."
            mock_details.return_value = {
                "learned_name": "Lisa",
                "relationship": "daughter",
                "loved_one_name": "Maria",
                "caller_context": {
                    "interests": ["gardening"],
                    "concerns": ["loneliness"],
                },
            }

            from services.post_call import run_post_call
            await run_post_call(session_state, tracker, duration_seconds=90)

            mock_complete.assert_awaited_once()
            mock_memory.assert_awaited_once()
            mock_details.assert_awaited_once()
            mock_update.assert_awaited_once()

            prospect_id, update_data = mock_update.await_args.args
            assert prospect_id == "prospect-001"
            assert update_data["learned_name"] == "Lisa"
            assert update_data["relationship"] == "daughter"
            assert update_data["loved_one_name"] == "Maria"
            assert update_data["caller_context"]["call_summary"].startswith("Lisa called")
            assert update_data["caller_context"]["interests"] == ["gardening"]
            assert update_data["caller_context"]["concerns"] == ["loneliness"]
