"""Level 2: Output chain integration.

Tests frame flow through: (LLM output) -> ConversationTracker -> GuidanceStripper -> (TTS)
Verifies that guidance tags are stripped before TTS and topics are tracked.
"""

import pytest

from pipecat.frames.frames import TextFrame

from processors.conversation_tracker import ConversationTrackerProcessor
from processors.guidance_stripper import GuidanceStripperProcessor
from tests.mocks.mock_tts import MockTTSProcessor
from tests.conftest import make_transcription, run_processor_test


class TestOutputChain:
    @pytest.mark.asyncio
    async def test_guidance_stripped_before_tts(self, session_state):
        """Guidance tags in LLM output should be removed before reaching TTS."""
        tracker = ConversationTrackerProcessor(session_state=session_state)
        stripper = GuidanceStripperProcessor()
        tts = MockTTSProcessor()

        await run_processor_test(
            processors=[tracker, stripper, tts],
            frames_to_inject=[
                TextFrame(text="<guidance>Be empathetic</guidance>I understand how you feel.")
            ],
        )

        spoken = tts.full_text
        assert "guidance" not in spoken.lower()
        assert "I understand" in spoken

    @pytest.mark.asyncio
    async def test_tracker_records_and_stripper_cleans(self, session_state):
        """Tracker should record topics, stripper should clean bracketed directives."""
        tracker = ConversationTrackerProcessor(session_state=session_state)
        stripper = GuidanceStripperProcessor()
        tts = MockTTSProcessor()

        await run_processor_test(
            processors=[tracker, stripper, tts],
            frames_to_inject=[
                make_transcription("I was gardening this morning"),
                TextFrame(text="[ACTIVITY] How is your garden growing?"),
            ],
            inject_delay=0.05,
        )

        # Tracker should have recorded topic + question
        assert "gardening" in tracker.state.topics_discussed
        assert len(tracker.state.questions_asked) >= 1

        # TTS should not see bracketed directive
        spoken = tts.full_text
        assert "[ACTIVITY]" not in spoken
