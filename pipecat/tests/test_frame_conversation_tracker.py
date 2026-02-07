"""Level 1: ConversationTrackerProcessor frame-level tests.

Tests topic extraction from TranscriptionFrames, question/advice extraction
from TextFrames, transcript building, and frame passthrough.
"""

import pytest

from pipecat.frames.frames import TextFrame

from processors.conversation_tracker import ConversationTrackerProcessor
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
