"""Level 1: ConversationTrackerProcessor frame-level tests.

Tests topic extraction from TranscriptionFrames, question/advice extraction
from TextFrames, transcript building, and frame passthrough.
"""

import pytest
from unittest.mock import AsyncMock, patch

from pipecat.frames.frames import LLMFullResponseEndFrame, TextFrame

from processors.conversation_tracker import ConversationState, ConversationTrackerProcessor
from tests.conftest import make_transcription, run_processor_test


class TestTrackerUserMessage:
    """Verify topic extraction from user TranscriptionFrames."""

    @pytest.mark.asyncio
    async def test_extracts_gardening_topic(self, session_state):
        tracker = ConversationTrackerProcessor(session_state=session_state)
        await run_processor_test(
            processors=[tracker],
            frames_to_inject=[make_transcription("I was out gardening this morning")],
        )
        assert "gardening" in tracker.state.topics_discussed

    @pytest.mark.asyncio
    async def test_updates_shared_transcript(self, session_state):
        tracker = ConversationTrackerProcessor(session_state=session_state)
        await run_processor_test(
            processors=[tracker],
            frames_to_inject=[make_transcription("Hello Donna")],
        )
        transcript = session_state.get("_transcript", [])
        assert len(transcript) >= 1
        assert transcript[0]["role"] == "user"
        assert "Hello Donna" in transcript[0]["content"]

    @pytest.mark.asyncio
    async def test_keeps_full_transcript_when_director_transcript_is_capped(self, session_state):
        tracker = ConversationTrackerProcessor(session_state=session_state)
        frames = [make_transcription(f"message {i}") for i in range(45)]

        await run_processor_test(processors=[tracker], frames_to_inject=frames)

        assert len(session_state["_full_transcript"]) == 45
        assert len(session_state["_transcript"]) == 40
        assert session_state["_full_transcript"][0]["content"] == "message 0"
        assert session_state["_transcript"][0]["content"] == "message 5"

    @pytest.mark.asyncio
    async def test_persists_transcript_draft_when_enabled(self, session_state):
        session_state["call_sid"] = "CA-draft-001"
        session_state["_transcript_persistence_enabled"] = True
        tracker = ConversationTrackerProcessor(session_state=session_state)

        with patch("services.conversations.update_transcript", new_callable=AsyncMock) as mock_update:
            await run_processor_test(
                processors=[tracker],
                frames_to_inject=[make_transcription("Hello Donna")],
            )
            await tracker.flush_pending_persistence()

        assert mock_update.await_count >= 1
        call_sid, transcript = mock_update.await_args.args
        assert call_sid == "CA-draft-001"
        assert transcript[-1]["content"] == "Hello Donna"

    @pytest.mark.asyncio
    async def test_does_not_persist_transcript_draft_unless_enabled(self, session_state):
        session_state["call_sid"] = "CA-draft-002"
        tracker = ConversationTrackerProcessor(session_state=session_state)

        with patch("services.conversations.update_transcript", new_callable=AsyncMock) as mock_update:
            await run_processor_test(
                processors=[tracker],
                frames_to_inject=[make_transcription("Hello Donna")],
            )
            await tracker.flush_pending_persistence()

        mock_update.assert_not_awaited()


class TestTrackerAssistantMessage:
    """Verify question/advice extraction from LLM TextFrames."""

    @pytest.mark.asyncio
    async def test_extracts_question(self, session_state):
        tracker = ConversationTrackerProcessor(session_state=session_state)
        await run_processor_test(
            processors=[tracker],
            frames_to_inject=[TextFrame(text="How has your garden been doing lately?")],
        )
        assert len(tracker.state.questions_asked) >= 1

    @pytest.mark.asyncio
    async def test_extracts_advice(self, session_state):
        tracker = ConversationTrackerProcessor(session_state=session_state)
        await run_processor_test(
            processors=[tracker],
            frames_to_inject=[TextFrame(text="You should try to drink more water today.")],
        )
        assert len(tracker.state.advice_given) >= 1


class TestSplitPipelineTracking:
    """Verify production-style split user/assistant tracker wiring."""

    @pytest.mark.asyncio
    async def test_split_trackers_share_state_and_persist_full_transcript(self, session_state):
        session_state["call_sid"] = "CA-split-001"
        session_state["_transcript_persistence_enabled"] = True
        state = ConversationState()
        user_tracker = ConversationTrackerProcessor(
            session_state=session_state,
            state=state,
            track_assistant=False,
        )
        assistant_tracker = ConversationTrackerProcessor(
            session_state=session_state,
            state=state,
            track_user=False,
        )

        with patch("services.conversations.update_transcript", new_callable=AsyncMock) as mock_update:
            await run_processor_test(
                processors=[user_tracker, assistant_tracker],
                frames_to_inject=[
                    make_transcription("I was gardening today"),
                    TextFrame(text="How is your garden growing?"),
                    LLMFullResponseEndFrame(),
                ],
            )
            await user_tracker.flush_pending_persistence()
            await assistant_tracker.flush_pending_persistence()

        assert user_tracker.state is assistant_tracker.state
        assert "gardening" in assistant_tracker.state.topics_discussed
        assert assistant_tracker.state.questions_asked

        full_transcript = session_state["_full_transcript"]
        assert [turn["role"] for turn in full_transcript] == ["user", "assistant"]
        assert "gardening" in full_transcript[0]["content"]
        assert "garden growing" in full_transcript[1]["content"]
        assert [turn["sequence"] for turn in full_transcript] == [0, 1]
        assert all("timestamp" in turn for turn in full_transcript)

        assert mock_update.await_count >= 1
        call_sid, persisted = mock_update.await_args.args
        assert call_sid == "CA-split-001"
        assert [turn["role"] for turn in persisted] == ["user", "assistant"]

    @pytest.mark.asyncio
    async def test_split_trackers_preserve_multi_turn_order(self, session_state):
        session_state["call_sid"] = "CA-split-002"
        session_state["_transcript_persistence_enabled"] = True
        state = ConversationState()
        user_tracker = ConversationTrackerProcessor(
            session_state=session_state,
            state=state,
            track_assistant=False,
        )
        assistant_tracker = ConversationTrackerProcessor(
            session_state=session_state,
            state=state,
            track_user=False,
        )

        with patch("services.conversations.update_transcript", new_callable=AsyncMock):
            await run_processor_test(
                processors=[user_tracker, assistant_tracker],
                frames_to_inject=[
                    make_transcription("First user turn"),
                    TextFrame(text="First Donna response."),
                    LLMFullResponseEndFrame(),
                    make_transcription("Second user turn"),
                    TextFrame(text="Second Donna response."),
                    LLMFullResponseEndFrame(),
                ],
            )
            await user_tracker.flush_pending_persistence()
            await assistant_tracker.flush_pending_persistence()

        assert [turn["role"] for turn in session_state["_full_transcript"]] == [
            "user",
            "assistant",
            "user",
            "assistant",
        ]
        assert [turn["sequence"] for turn in session_state["_full_transcript"]] == [0, 1, 2, 3]


class TestTrackerPassthrough:
    """Verify all frames pass through unchanged."""

    @pytest.mark.asyncio
    async def test_transcription_passes_through(self, session_state):
        tracker = ConversationTrackerProcessor(session_state=session_state)
        capture = await run_processor_test(
            processors=[tracker],
            frames_to_inject=[make_transcription("Test message")],
        )
        assert "Test message" in capture.get_transcriptions()
