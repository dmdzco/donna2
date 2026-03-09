"""Integration tests for post-call processing pipeline.

Tests run_post_call() with mocked services to verify the complete
post-call sequence: conversation completion, analysis, memory extraction,
daily context save, reminder cleanup, cache clearing, metrics persistence,
caregiver notifications, snapshot rebuild, and error resilience.
"""

import json
import time
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call

from processors.conversation_tracker import ConversationTrackerProcessor


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_tracker(session_state, topics=None, advice=None):
    """Create a ConversationTrackerProcessor with optional state overrides."""
    tracker = ConversationTrackerProcessor(session_state=session_state)
    if topics is not None:
        tracker.state.topics_discussed = topics
    if advice is not None:
        tracker.state.advice_given = advice
    return tracker


def _base_patches():
    """Return a dict of all the common service patches needed for post-call tests.

    Usage:
        with _base_patches() as mocks:
            mocks["analyze"].return_value = {...}
            await run_post_call(...)
    """
    return _PostCallPatchContext()


class _PostCallPatchContext:
    """Context manager that applies all the standard post-call service mocks."""

    def __enter__(self):
        self.mocks = {}
        self.patchers = []

        patches = {
            "complete": ("services.conversations.complete", AsyncMock),
            "update_summary": ("services.conversations.update_summary", AsyncMock),
            "analyze": ("services.call_analysis.analyze_completed_call", AsyncMock),
            "save_analysis": ("services.call_analysis.save_call_analysis", AsyncMock),
            "extract_memory": ("services.memory.extract_from_conversation", AsyncMock),
            "discover_interests": ("services.interest_discovery.discover_new_interests", MagicMock),
            "add_interests": ("services.interest_discovery.add_interests_to_senior", AsyncMock),
            "compute_scores": ("services.interest_discovery.compute_interest_scores", AsyncMock),
            "update_scores": ("services.interest_discovery.update_interest_scores", AsyncMock),
            "save_daily": ("services.daily_context.save_call_context", AsyncMock),
            "clear_cache": ("services.context_cache.clear_cache", MagicMock),
            "clear_reminder": ("services.scheduler.clear_reminder_context", MagicMock),
            "mark_no_ack": ("services.reminder_delivery.mark_call_ended_without_acknowledgment", AsyncMock),
            "build_snapshot": ("services.call_snapshot.build_snapshot", AsyncMock),
            "save_snapshot": ("services.call_snapshot.save_snapshot", AsyncMock),
            "db_execute": ("db.client.execute", AsyncMock),
            "trigger_caregiver": ("services.post_call._trigger_caregiver_notification", AsyncMock),
            "growthbook_is_on": ("lib.growthbook.is_on", MagicMock),
            "get_breaker_states": ("lib.circuit_breaker.get_breaker_states", MagicMock),
        }

        for name, (target, mock_cls) in patches.items():
            p = patch(target, new_callable=mock_cls if mock_cls == AsyncMock else None)
            if mock_cls == MagicMock:
                p = patch(target)
            mock_obj = p.start()
            self.patchers.append(p)
            self.mocks[name] = mock_obj

        # Set sensible defaults
        self.mocks["analyze"].return_value = {
            "mood": "positive",
            "summary": "Good call with Margaret.",
            "topics_discussed": ["gardening"],
            "engagement_score": 8,
            "concerns": [],
            "positive_observations": ["Seemed cheerful"],
            "call_quality": {"rapport": "warm"},
        }
        self.mocks["discover_interests"].return_value = []
        self.mocks["compute_scores"].return_value = {"gardening": 5.0}
        self.mocks["build_snapshot"].return_value = {"snapshot": True}
        self.mocks["growthbook_is_on"].return_value = True
        self.mocks["get_breaker_states"].return_value = {}

        return self.mocks

    def __exit__(self, *args):
        for p in self.patchers:
            p.stop()


class TestPostCallProcessing:
    """Tests for the main (subscriber) post-call processing flow."""

    # ------------------------------------------------------------------
    # Existing tests (updated for current code structure)
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_full_post_call_sequence(self, session_state):
        """Verify all post-call steps execute: conversation completion,
        parallel group (analysis, memory, reminders, cache, metrics),
        and sequential group (caregiver, interests, daily context, snapshot)."""
        session_state["_transcript"] = [
            {"role": "user", "content": "Hello Donna"},
            {"role": "assistant", "content": "Hello Margaret! How are you?"},
            {"role": "user", "content": "I'm doing well"},
        ]

        tracker = _make_tracker(session_state, topics=["greeting"], advice=[])

        with _base_patches() as mocks:
            from services.post_call import run_post_call
            await run_post_call(session_state, tracker, duration_seconds=120)

            # Step 1: Conversation completed
            mocks["complete"].assert_awaited_once()
            # Step 2: Analysis
            mocks["analyze"].assert_awaited_once()
            mocks["save_analysis"].assert_awaited_once()
            # Step 3: Memory extraction
            mocks["extract_memory"].assert_awaited_once()
            # Step 3.5: Interest discovery
            mocks["discover_interests"].assert_called_once()
            # Step 3.6: Interest scores
            mocks["compute_scores"].assert_awaited_once()
            mocks["update_scores"].assert_awaited_once()
            # Step 4: Daily context
            mocks["save_daily"].assert_awaited_once()
            # Step 6: Cache clearing
            mocks["clear_cache"].assert_called_once_with("senior-test-001")
            # Step 7: Snapshot rebuild
            mocks["build_snapshot"].assert_awaited_once()
            mocks["save_snapshot"].assert_awaited_once()

    @pytest.mark.asyncio
    async def test_post_call_with_unacknowledged_reminder(self, reminder_session_state):
        """Undelivered reminders should trigger mark_call_ended_without_acknowledgment."""
        reminder_session_state["_transcript"] = [
            {"role": "user", "content": "Goodbye"},
        ]
        reminder_session_state["reminders_delivered"] = set()  # None delivered

        tracker = _make_tracker(reminder_session_state)

        with _base_patches() as mocks:
            mocks["analyze"].return_value = {"mood": "neutral", "summary": "Short call"}

            from services.post_call import run_post_call
            await run_post_call(reminder_session_state, tracker, duration_seconds=30)

            mocks["mark_no_ack"].assert_awaited_once_with("delivery-001")

    @pytest.mark.asyncio
    async def test_post_call_discovers_new_interests(self, session_state):
        """Steps 3.5 + 3.6: new interests are discovered and scores computed."""
        session_state["_transcript"] = [
            {"role": "user", "content": "I love painting"},
            {"role": "assistant", "content": "That sounds wonderful!"},
        ]

        tracker = _make_tracker(session_state, topics=["painting"], advice=[])

        with _base_patches() as mocks:
            mocks["analyze"].return_value = {
                "topics_discussed": ["painting"],
                "engagement_score": 9,
                "positive_observations": ["Loved discussing painting"],
                "summary": "Great call about painting",
            }
            mocks["discover_interests"].return_value = ["painting"]
            mocks["add_interests"].return_value = [
                "gardening", "cooking", "grandchildren", "painting"
            ]
            mocks["compute_scores"].return_value = {"gardening": 5.0, "painting": 8.0}

            from services.post_call import run_post_call
            await run_post_call(session_state, tracker, duration_seconds=120)

            # 3.5: Interest discovery called and new interests added
            mocks["discover_interests"].assert_called_once()
            mocks["add_interests"].assert_awaited_once()
            # 3.6: Scores computed with updated interests
            mocks["compute_scores"].assert_awaited_once()
            mocks["update_scores"].assert_awaited_once()

    @pytest.mark.asyncio
    async def test_post_call_handles_errors_gracefully(self, session_state):
        """Post-call should not crash if a service fails."""
        session_state["_transcript"] = [
            {"role": "user", "content": "Hello"},
        ]

        tracker = _make_tracker(session_state)

        with _base_patches() as mocks:
            # Make Step 1 (conversation complete) blow up
            mocks["complete"].side_effect = Exception("DB error")

            from services.post_call import run_post_call
            # Should not raise
            await run_post_call(session_state, tracker, duration_seconds=10)

    # ------------------------------------------------------------------
    # NEW: test_metrics_persisted_in_parallel_group
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_metrics_persisted_in_parallel_group(self, session_state):
        """Verify _persist_call_metrics runs in the parallel asyncio.gather group.

        Metrics persistence (step 8) was moved into the gather() alongside
        analysis (step 2), memory (step 3), reminders (step 5), and cache (step 6).
        This test confirms metrics are persisted even when analysis is slow.
        """
        import asyncio

        session_state["_transcript"] = [
            {"role": "user", "content": "Hello Donna"},
            {"role": "assistant", "content": "Hi Margaret!"},
        ]
        session_state["_call_metrics"] = {
            "llm_ttfb_values": [200, 250],
            "tts_ttfb_values": [100, 120],
            "turn_latency_values": [500, 600],
            "token_usage": {"input": 100, "output": 50},
            "tts_characters": 500,
            "turn_count": 2,
        }
        session_state["_phase_durations"] = {"opening": 15, "main": 90}
        session_state["_current_phase"] = "closing"
        session_state["_phase_start_time"] = time.time() - 10
        session_state["_tools_used"] = ["search_memories"]
        session_state["_end_reason"] = "goodbye_detected"

        tracker = _make_tracker(session_state, topics=["greeting"])

        # Track the order of execution
        execution_log = []

        with _base_patches() as mocks:

            async def slow_analysis(*args, **kwargs):
                execution_log.append("analysis_start")
                await asyncio.sleep(0.2)
                execution_log.append("analysis_end")
                return {"mood": "positive", "summary": "Good call"}

            mocks["analyze"].side_effect = slow_analysis

            original_db_execute = mocks["db_execute"]

            async def track_db_execute(*args, **kwargs):
                # Only log for call_metrics INSERT
                if args and isinstance(args[0], str) and "call_metrics" in args[0]:
                    execution_log.append("metrics_persisted")
                return None

            mocks["db_execute"].side_effect = track_db_execute

            from services.post_call import run_post_call
            await run_post_call(session_state, tracker, duration_seconds=120)

            # Metrics should be persisted (db_execute was called with call_metrics INSERT)
            assert "metrics_persisted" in execution_log, (
                "Metrics were not persisted via db_execute"
            )

            # Metrics should complete while analysis is still running (parallel)
            # Since they're in the same gather(), metrics_persisted should appear
            # before analysis_end (or at worst, concurrently)
            if "analysis_start" in execution_log and "analysis_end" in execution_log:
                metrics_idx = execution_log.index("metrics_persisted")
                analysis_end_idx = execution_log.index("analysis_end")
                assert metrics_idx < analysis_end_idx, (
                    f"Metrics should complete before slow analysis finishes. "
                    f"Log: {execution_log}"
                )

    # ------------------------------------------------------------------
    # NEW: test_sentiment_update_failure_doesnt_kill_analysis
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_sentiment_update_failure_doesnt_kill_analysis(self, session_state):
        """The try/except around the sentiment UPDATE in _step2_analysis protects
        the analysis return value. If the DB UPDATE fails, the analysis dict
        should still be returned and used by downstream steps."""
        session_state["_transcript"] = [
            {"role": "user", "content": "I'm feeling a bit down today"},
            {"role": "assistant", "content": "I'm sorry to hear that, Margaret."},
        ]

        tracker = _make_tracker(session_state, topics=["health"])

        analysis_result = {
            "mood": "concerned",
            "summary": "Margaret seemed a bit down.",
            "topics_discussed": ["health"],
            "engagement_score": 5,
            "concerns": [{"type": "mood", "description": "Seemed down", "severity": "low"}],
            "positive_observations": [],
            "call_quality": {"rapport": "empathetic"},
        }

        with _base_patches() as mocks:
            mocks["analyze"].return_value = analysis_result

            # Make the sentiment UPDATE query fail
            call_count = {"n": 0}

            async def selective_db_execute(query, *args, **kwargs):
                call_count["n"] += 1
                if isinstance(query, str) and "UPDATE conversations" in query:
                    raise Exception("Connection reset by peer")
                return None

            mocks["db_execute"].side_effect = selective_db_execute

            from services.post_call import run_post_call
            await run_post_call(session_state, tracker, duration_seconds=120)

            # Analysis should still have been called
            mocks["analyze"].assert_awaited_once()
            mocks["save_analysis"].assert_awaited_once()

            # Downstream steps that depend on analysis should still run:
            # - Caregiver notification (requires analysis)
            mocks["trigger_caregiver"].assert_awaited_once()
            caregiver_args = mocks["trigger_caregiver"].call_args
            assert caregiver_args[0][2] == analysis_result, (
                "Caregiver notification should receive the full analysis dict"
            )

            # - Interest discovery (requires analysis)
            mocks["discover_interests"].assert_called_once()

            # - Daily context (receives analysis summary)
            mocks["save_daily"].assert_awaited_once()

            # - Snapshot rebuild (receives analysis)
            mocks["build_snapshot"].assert_awaited_once()
            snapshot_args = mocks["build_snapshot"].call_args
            assert snapshot_args[0][2] == analysis_result, (
                "Snapshot build should receive the full analysis dict"
            )

    # ------------------------------------------------------------------
    # NEW: test_onboarding_post_call_flow
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_onboarding_post_call_flow(self, session_state):
        """Onboarding calls route to _run_onboarding_post_call which runs a
        lighter flow: conversation complete, memory extraction with prospect_id,
        and prospect update — but NOT analysis, interest discovery, daily context,
        or snapshot rebuild."""
        session_state["call_type"] = "onboarding"
        session_state["prospect_id"] = "prospect-001"
        session_state["senior_id"] = None
        session_state["senior"] = None
        session_state["_transcript"] = [
            {"role": "user", "content": "Hi, I'm calling about my mom"},
            {"role": "assistant", "content": "I'd love to help!"},
        ]

        tracker = _make_tracker(session_state)

        with _base_patches() as mocks, \
             patch("services.prospects.update_after_call", new_callable=AsyncMock) as mock_update_prospect:

            from services.post_call import run_post_call
            await run_post_call(session_state, tracker, duration_seconds=60)

            # Should complete conversation
            mocks["complete"].assert_awaited_once()

            # Should extract memories with prospect_id (senior_id=None)
            mocks["extract_memory"].assert_awaited_once()
            extract_args = mocks["extract_memory"].call_args
            # First arg is senior_id (None for onboarding)
            assert extract_args[0][0] is None
            # Should pass prospect_id as keyword arg
            assert extract_args[1].get("prospect_id") == "prospect-001"

            # Should update prospect record
            mock_update_prospect.assert_awaited_once_with("prospect-001", {})

            # Should NOT run subscriber-only steps
            mocks["analyze"].assert_not_awaited()
            mocks["save_analysis"].assert_not_awaited()
            mocks["discover_interests"].assert_not_called()
            mocks["save_daily"].assert_not_awaited()
            mocks["build_snapshot"].assert_not_awaited()
            mocks["save_snapshot"].assert_not_awaited()

    # ------------------------------------------------------------------
    # NEW: test_post_call_with_no_transcript
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_post_call_with_no_transcript(self, session_state):
        """When _transcript is empty, post-call should still complete the
        conversation and clear caches, but skip analysis and memory extraction."""
        session_state["_transcript"] = []

        tracker = _make_tracker(session_state, topics=[], advice=[])

        with _base_patches() as mocks:
            from services.post_call import run_post_call
            await run_post_call(session_state, tracker, duration_seconds=5)

            # Step 1: conversation should still be completed
            mocks["complete"].assert_awaited_once()

            # Step 2: analysis should NOT run (requires transcript + senior)
            # The is_on check with empty transcript should short-circuit
            mocks["analyze"].assert_not_awaited()

            # Step 3: memory extraction should NOT run (requires transcript + senior_id)
            mocks["extract_memory"].assert_not_awaited()

            # Step 6: caches should still be cleared
            mocks["clear_cache"].assert_called_once_with("senior-test-001")
            mocks["clear_reminder"].assert_called_once()

    # ------------------------------------------------------------------
    # NEW: test_post_call_with_no_senior_id
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_post_call_with_no_senior_id(self, session_state):
        """When senior_id is None, senior-dependent steps should be skipped
        but the pipeline should not crash."""
        session_state["senior_id"] = None
        session_state["senior"] = None
        session_state["_transcript"] = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"},
        ]

        tracker = _make_tracker(session_state)

        with _base_patches() as mocks:
            from services.post_call import run_post_call
            # Should not raise
            await run_post_call(session_state, tracker, duration_seconds=15)

            # Step 1: conversation complete should still work (has conversation_id)
            mocks["complete"].assert_awaited_once()

            # Step 2: analysis skipped (senior is None, is_on guard)
            # The _step2_analysis checks `transcript and senior and is_on(...)`
            mocks["analyze"].assert_not_awaited()

            # Step 3: memory extraction skipped (senior_id is None)
            mocks["extract_memory"].assert_not_awaited()

            # Step 3.5/3.6: interest discovery skipped (senior_id is None)
            mocks["discover_interests"].assert_not_called()
            mocks["compute_scores"].assert_not_awaited()

            # Step 4: daily context skipped (senior_id is None)
            mocks["save_daily"].assert_not_awaited()

            # Step 6: cache clearing skipped for senior_id=None
            mocks["clear_cache"].assert_not_called()

            # Step 7: snapshot skipped (senior_id is None)
            mocks["build_snapshot"].assert_not_awaited()
            mocks["save_snapshot"].assert_not_awaited()

    # ------------------------------------------------------------------
    # NEW: test_caregiver_notification_triggered_on_analysis
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_caregiver_notification_triggered_on_analysis(self, session_state):
        """When analysis completes with a summary and concerns, the caregiver
        notification should be triggered with the correct arguments."""
        session_state["_transcript"] = [
            {"role": "user", "content": "I fell yesterday"},
            {"role": "assistant", "content": "Oh no, are you alright?"},
            {"role": "user", "content": "I'm okay now"},
        ]

        tracker = _make_tracker(session_state, topics=["health concerns"])

        analysis_with_concerns = {
            "mood": "concerned",
            "summary": "Margaret mentioned a fall yesterday.",
            "topics_discussed": ["health concerns"],
            "engagement_score": 6,
            "concerns": [
                {"type": "fall", "description": "Mentioned falling yesterday", "severity": "high"}
            ],
            "positive_observations": ["She says she is okay now"],
            "call_quality": {"rapport": "empathetic"},
        }

        with _base_patches() as mocks:
            mocks["analyze"].return_value = analysis_with_concerns

            from services.post_call import run_post_call
            await run_post_call(session_state, tracker, duration_seconds=90)

            # Caregiver notification should be called
            mocks["trigger_caregiver"].assert_awaited_once()

            # Verify arguments: (senior_id, call_sid, analysis, duration)
            args = mocks["trigger_caregiver"].call_args[0]
            assert args[0] == "senior-test-001"
            assert args[1] == "CA-test-001"
            assert args[2] == analysis_with_concerns
            assert args[3] == 90

    @pytest.mark.asyncio
    async def test_caregiver_notification_skipped_without_analysis(self, session_state):
        """When analysis returns None (e.g., feature flag off), caregiver
        notification should not be triggered."""
        session_state["_transcript"] = [
            {"role": "user", "content": "Hello"},
        ]

        tracker = _make_tracker(session_state)

        with _base_patches() as mocks:
            # Disable analysis via feature flag
            mocks["growthbook_is_on"].return_value = False

            from services.post_call import run_post_call
            await run_post_call(session_state, tracker, duration_seconds=30)

            # Analysis should not have run
            mocks["analyze"].assert_not_awaited()
            # Caregiver notification should be skipped (analysis is None)
            mocks["trigger_caregiver"].assert_not_awaited()

    # ------------------------------------------------------------------
    # NEW: test_snapshot_rebuild_after_analysis
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_snapshot_rebuild_after_analysis(self, session_state):
        """Verify call_snapshot.build_snapshot and save_snapshot are called
        after analysis completes, with the correct arguments."""
        session_state["_transcript"] = [
            {"role": "user", "content": "I had a great day gardening"},
            {"role": "assistant", "content": "That sounds lovely!"},
        ]

        tracker = _make_tracker(session_state, topics=["gardening"])

        expected_analysis = {
            "mood": "positive",
            "summary": "Margaret enjoyed gardening today.",
            "topics_discussed": ["gardening"],
            "engagement_score": 9,
            "concerns": [],
            "positive_observations": ["Very enthusiastic about gardening"],
            "call_quality": {"rapport": "warm"},
        }

        with _base_patches() as mocks:
            mocks["analyze"].return_value = expected_analysis
            mocks["build_snapshot"].return_value = {
                "last_call_analysis": expected_analysis,
                "recent_summaries": [],
                "recent_turns": [],
                "todays_context": None,
            }

            from services.post_call import run_post_call
            await run_post_call(session_state, tracker, duration_seconds=180)

            # build_snapshot called with (senior_id, timezone, analysis)
            mocks["build_snapshot"].assert_awaited_once()
            build_args = mocks["build_snapshot"].call_args[0]
            assert build_args[0] == "senior-test-001"
            assert build_args[1] == "America/New_York"
            assert build_args[2] == expected_analysis

            # save_snapshot called with (senior_id, snapshot_dict)
            mocks["save_snapshot"].assert_awaited_once()
            save_args = mocks["save_snapshot"].call_args[0]
            assert save_args[0] == "senior-test-001"
            assert save_args[1]["last_call_analysis"] == expected_analysis

    # ------------------------------------------------------------------
    # NEW: test_call_metrics_data_structure
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_call_metrics_data_structure(self, session_state):
        """Verify _persist_call_metrics formats session_state metrics into
        the correct SQL args for the call_metrics INSERT."""
        session_state["_transcript"] = [
            {"role": "user", "content": "Hello"},
        ]
        session_state["_call_metrics"] = {
            "llm_ttfb_values": [200, 300, 250],
            "tts_ttfb_values": [100, 150],
            "turn_latency_values": [500, 700, 600],
            "token_usage": {"input": 1500, "output": 800},
            "tts_characters": 2000,
            "turn_count": 3,
        }
        session_state["_phase_durations"] = {"opening": 10, "main": 100}
        session_state["_current_phase"] = "winding_down"
        session_state["_phase_start_time"] = time.time() - 20
        session_state["_tools_used"] = ["search_memories", "get_news"]
        session_state["_end_reason"] = "time_limit"

        tracker = _make_tracker(session_state, topics=["greeting"])

        captured_args = {}

        with _base_patches() as mocks:

            async def capture_db_execute(query, *args, **kwargs):
                if isinstance(query, str) and "call_metrics" in query:
                    captured_args["query"] = query
                    captured_args["args"] = args
                return None

            mocks["db_execute"].side_effect = capture_db_execute

            from services.post_call import run_post_call
            await run_post_call(session_state, tracker, duration_seconds=130)

        # Verify the INSERT was called with correct structure
        assert "query" in captured_args, "call_metrics INSERT was not executed"
        args = captured_args["args"]

        # $1 = call_sid
        assert args[0] == "CA-test-001"
        # $2 = senior_id
        assert args[1] == "senior-test-001"
        # $3 = call_type
        assert args[2] == "check-in"
        # $4 = duration_seconds
        assert args[3] == 130
        # $5 = end_reason
        assert args[4] == "time_limit"
        # $6 = turn_count
        assert args[5] == 3
        # $7 = phase_durations (JSON string)
        phase_durations = json.loads(args[6])
        assert phase_durations["opening"] == 10
        assert phase_durations["main"] == 100
        # winding_down should be ~20s (finalized from _current_phase + _phase_start_time)
        assert "winding_down" in phase_durations
        assert phase_durations["winding_down"] >= 19  # allow 1s tolerance

        # $8 = latency (JSON string)
        latency = json.loads(args[7])
        assert latency["llm_ttfb_avg_ms"] == 250  # round(750/3)
        assert latency["tts_ttfb_avg_ms"] == 125  # round(250/2)
        assert latency["turn_avg_ms"] == 600  # round(1800/3)

        # $9 = breaker_states (JSON or None)
        # Our mock returns {} so json.dumps({}) = "{}" or None depending on truthiness
        # get_breaker_states returns {} which is falsy, so args[9] should be None
        assert args[8] is None

        # $10 = tools_used
        assert args[9] == ["search_memories", "get_news"]

        # $11 = token_usage (JSON string with tts_characters merged in)
        token_usage = json.loads(args[10])
        assert token_usage["input"] == 1500
        assert token_usage["output"] == 800
        assert token_usage["tts_characters"] == 2000

        # $12 = error_count
        assert args[11] == 0

    # ------------------------------------------------------------------
    # Additional edge case tests
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_analysis_exception_doesnt_crash_sequential_steps(self, session_state):
        """If the entire analysis step throws (not just the sentiment UPDATE),
        downstream sequential steps should still execute without the analysis dict."""
        session_state["_transcript"] = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi Margaret!"},
        ]

        tracker = _make_tracker(session_state, topics=["greeting"])

        with _base_patches() as mocks:
            mocks["analyze"].side_effect = Exception("Gemini API timeout")

            from services.post_call import run_post_call
            await run_post_call(session_state, tracker, duration_seconds=60)

            # Analysis failed, so analysis-dependent steps should be skipped gracefully:
            # - Caregiver notification requires `analysis and senior_id`
            mocks["trigger_caregiver"].assert_not_awaited()
            # - Interest discovery requires `senior_id and senior and analysis`
            mocks["discover_interests"].assert_not_called()

            # But non-analysis-dependent steps should still run:
            # - Interest scores (only requires senior_id and senior)
            mocks["compute_scores"].assert_awaited_once()
            # - Daily context (senior_id and conversation_tracker)
            mocks["save_daily"].assert_awaited_once()
            # - Snapshot still runs (senior_id check passes, analysis will be None)
            mocks["build_snapshot"].assert_awaited_once()
            build_args = mocks["build_snapshot"].call_args[0]
            assert build_args[2] is None  # analysis is None due to exception

    @pytest.mark.asyncio
    async def test_multiple_parallel_step_failures(self, session_state):
        """If multiple parallel steps fail, the pipeline should still complete
        and log all errors without crashing."""
        session_state["_transcript"] = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi!"},
        ]

        tracker = _make_tracker(session_state, topics=["greeting"])

        with _base_patches() as mocks:
            mocks["analyze"].side_effect = Exception("Analysis failed")
            mocks["extract_memory"].side_effect = Exception("Memory failed")

            from services.post_call import run_post_call
            # Should not raise despite multiple failures
            await run_post_call(session_state, tracker, duration_seconds=30)

            # Cache clearing should still work (independent step)
            mocks["clear_cache"].assert_called_once_with("senior-test-001")
            mocks["clear_reminder"].assert_called_once()

    @pytest.mark.asyncio
    async def test_summary_update_on_valid_analysis(self, session_state):
        """When analysis returns a valid summary (not 'Analysis unavailable'),
        update_summary should be called to persist it to the conversation."""
        session_state["_transcript"] = [
            {"role": "user", "content": "I had a wonderful day"},
            {"role": "assistant", "content": "Tell me about it!"},
        ]

        tracker = _make_tracker(session_state, topics=["daily"])

        with _base_patches() as mocks:
            mocks["analyze"].return_value = {
                "summary": "Margaret had a wonderful day.",
                "mood": "positive",
                "concerns": [],
                "call_quality": {},
            }

            from services.post_call import run_post_call
            await run_post_call(session_state, tracker, duration_seconds=60)

            mocks["update_summary"].assert_awaited_once_with(
                "CA-test-001", "Margaret had a wonderful day."
            )

    @pytest.mark.asyncio
    async def test_summary_not_updated_when_unavailable(self, session_state):
        """When analysis returns 'Analysis unavailable', update_summary
        should NOT be called."""
        session_state["_transcript"] = [
            {"role": "user", "content": "Hello"},
        ]

        tracker = _make_tracker(session_state)

        with _base_patches() as mocks:
            mocks["analyze"].return_value = {
                "summary": "Analysis unavailable",
                "mood": "unknown",
                "concerns": [],
                "call_quality": {},
            }

            from services.post_call import run_post_call
            await run_post_call(session_state, tracker, duration_seconds=10)

            mocks["update_summary"].assert_not_awaited()
