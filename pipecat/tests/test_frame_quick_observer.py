"""Level 1: QuickObserverProcessor frame-level tests.

Tests the FrameProcessor wrapper (process_frame, guidance injection,
goodbye EndFrame scheduling) -- NOT the pure quick_analyze function
(already tested in test_quick_observer.py).
"""

import asyncio
import pytest

from pipecat.frames.frames import (
    EndFrame,
    LLMMessagesAppendFrame,
    TextFrame,
    TranscriptionFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask

from processors.quick_observer import QuickObserverProcessor
from tests.conftest import FrameCapture, make_transcription, run_processor_test


class TestQuickObserverFramePassthrough:
    """Verify that frames pass through the processor unchanged."""

    @pytest.mark.asyncio
    async def test_transcription_passes_through(self, session_state):
        """TranscriptionFrame should appear downstream after processing."""
        processor = QuickObserverProcessor(session_state=session_state)
        capture = await run_processor_test(
            processors=[processor],
            frames_to_inject=[make_transcription("Hello there")],
        )
        assert "Hello there" in capture.get_transcriptions()

    @pytest.mark.asyncio
    async def test_non_transcription_passes_through(self, session_state):
        """Non-TranscriptionFrames should pass through unchanged."""
        processor = QuickObserverProcessor(session_state=session_state)
        capture = await run_processor_test(
            processors=[processor],
            frames_to_inject=[TextFrame(text="some text")],
        )
        assert "some text" in capture.get_text_content()


class TestQuickObserverGuidanceInjection:
    """Verify that guidance is injected as LLMMessagesAppendFrame."""

    @pytest.mark.asyncio
    async def test_health_signal_injects_guidance(self, session_state):
        """Health-related input should produce an LLMMessagesAppendFrame."""
        processor = QuickObserverProcessor(session_state=session_state)
        capture = await run_processor_test(
            processors=[processor],
            frames_to_inject=[make_transcription("I fell in the bathroom")],
        )
        guidance_frames = capture.get_frames_of_type(LLMMessagesAppendFrame)
        assert len(guidance_frames) >= 1
        content = guidance_frames[0].messages[0]["content"]
        assert "guidance" in content.lower()

    @pytest.mark.asyncio
    async def test_neutral_input_no_guidance(self, session_state):
        """Neutral input should NOT produce guidance frames."""
        processor = QuickObserverProcessor(session_state=session_state)
        # Use a message long enough to not trigger engagement patterns
        # but neutral enough to not trigger any category
        capture = await run_processor_test(
            processors=[processor],
            frames_to_inject=[make_transcription("I thought about that for a while and it was interesting to consider")],
        )
        guidance_frames = capture.get_frames_of_type(LLMMessagesAppendFrame)
        assert len(guidance_frames) == 0


class TestQuickObserverGoodbyeEndFrame:
    """Verify programmatic call ending on strong goodbye detection."""

    @pytest.mark.asyncio
    async def test_strong_goodbye_schedules_end_frame(self, session_state, frame_capture):
        """Strong goodbye should schedule an EndFrame after GOODBYE_DELAY_SECONDS."""
        processor = QuickObserverProcessor(session_state=session_state)
        # Use a shorter delay for faster tests
        processor.GOODBYE_DELAY_SECONDS = 0.3
        capture = frame_capture

        pipeline = Pipeline([processor, capture])
        task = PipelineTask(pipeline, params=PipelineParams(enable_metrics=False))
        processor.set_pipeline_task(task)
        runner = PipelineRunner(handle_sigint=False)

        async def inject():
            await task.queue_frame(make_transcription("Goodbye, talk to you later"))
            # Wait for the goodbye delay + buffer
            await asyncio.sleep(0.5)

        asyncio.create_task(inject())
        await asyncio.wait_for(runner.run(task), timeout=5.0)

        assert capture.has_end_frame

    @pytest.mark.asyncio
    async def test_session_state_goodbye_flag(self, session_state):
        """Strong goodbye should set _goodbye_in_progress in session_state."""
        processor = QuickObserverProcessor(session_state=session_state)
        processor.GOODBYE_DELAY_SECONDS = 10  # Long delay, we just check the flag

        capture = FrameCapture()
        pipeline = Pipeline([processor, capture])
        task = PipelineTask(pipeline, params=PipelineParams(enable_metrics=False))
        processor.set_pipeline_task(task)
        runner = PipelineRunner(handle_sigint=False)

        async def inject():
            await task.queue_frame(make_transcription("Bye bye"))
            await asyncio.sleep(0.1)
            await task.queue_frame(EndFrame())

        asyncio.create_task(inject())
        await asyncio.wait_for(runner.run(task), timeout=5.0)

        assert session_state.get("_goodbye_in_progress") is True
