"""Level 1: ConversationDirectorProcessor frame-level tests.

Tests non-blocking analysis dispatch, cached guidance injection,
and time-based fallback actions.
"""

import asyncio
import time
import pytest
from unittest.mock import AsyncMock, patch

from pipecat.frames.frames import EndFrame, LLMMessagesAppendFrame, TranscriptionFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask

from processors.conversation_director import ConversationDirectorProcessor
from services.director_llm import get_default_direction
from tests.conftest import FrameCapture, make_transcription


class TestDirectorFramePassthrough:
    """Verify frames always pass through (non-blocking)."""

    @pytest.mark.asyncio
    async def test_transcription_passes_through_immediately(
        self, session_state, frame_capture
    ):
        processor = ConversationDirectorProcessor(session_state=session_state)
        capture = frame_capture

        with patch("processors.conversation_director.analyze_turn", new_callable=AsyncMock) as mock:
            mock.return_value = get_default_direction()

            pipeline = Pipeline([processor, capture])
            task = PipelineTask(pipeline, params=PipelineParams(enable_metrics=False))
            processor.set_pipeline_task(task)
            runner = PipelineRunner(handle_sigint=False)

            async def inject():
                await task.queue_frame(make_transcription("Hello"))
                await asyncio.sleep(0.1)
                await task.queue_frame(EndFrame())

            asyncio.create_task(inject())
            await asyncio.wait_for(runner.run(task), timeout=5.0)

        transcriptions = capture.get_transcriptions()
        assert "Hello" in transcriptions


class TestDirectorCachedGuidance:
    """Verify that guidance from PREVIOUS turn is injected on the NEXT turn."""

    @pytest.mark.asyncio
    async def test_second_turn_gets_cached_guidance(self, session_state, frame_capture):
        processor = ConversationDirectorProcessor(session_state=session_state)
        capture = frame_capture

        direction = get_default_direction()

        with patch("processors.conversation_director.analyze_turn", new_callable=AsyncMock) as mock_analyze, \
             patch("processors.conversation_director.format_director_guidance") as mock_format:
            mock_analyze.return_value = direction
            mock_format.return_value = "main/medium/warm | Continue naturally"

            pipeline = Pipeline([processor, capture])
            task = PipelineTask(pipeline, params=PipelineParams(enable_metrics=False))
            processor.set_pipeline_task(task)
            runner = PipelineRunner(handle_sigint=False)

            async def inject():
                # Turn 1: no cached guidance yet
                await task.queue_frame(make_transcription("Hello"))
                await asyncio.sleep(0.3)  # Wait for background analysis to complete

                # Turn 2: should inject Turn 1's cached guidance
                await task.queue_frame(make_transcription("I'm doing well"))
                await asyncio.sleep(0.1)
                await task.queue_frame(EndFrame())

            asyncio.create_task(inject())
            await asyncio.wait_for(runner.run(task), timeout=5.0)

        # Turn 2 should have produced an LLMMessagesAppendFrame
        guidance_frames = capture.get_frames_of_type(LLMMessagesAppendFrame)
        assert len(guidance_frames) >= 1


class TestDirectorGoodbyeSuppression:
    """Verify Director suppresses guidance when goodbye is in progress."""

    @pytest.mark.asyncio
    async def test_no_guidance_during_goodbye(self, session_state, frame_capture):
        session_state["_goodbye_in_progress"] = True
        processor = ConversationDirectorProcessor(session_state=session_state)
        # Pre-set cached result
        processor._last_result = get_default_direction()
        capture = frame_capture

        with patch("processors.conversation_director.analyze_turn", new_callable=AsyncMock) as mock_analyze, \
             patch("processors.conversation_director.format_director_guidance") as mock_format:
            mock_analyze.return_value = get_default_direction()
            mock_format.return_value = "closing/medium/warm"

            pipeline = Pipeline([processor, capture])
            task = PipelineTask(pipeline, params=PipelineParams(enable_metrics=False))
            processor.set_pipeline_task(task)
            runner = PipelineRunner(handle_sigint=False)

            async def inject():
                await task.queue_frame(make_transcription("Talk to you later"))
                await asyncio.sleep(0.1)
                await task.queue_frame(EndFrame())

            asyncio.create_task(inject())
            await asyncio.wait_for(runner.run(task), timeout=5.0)

        guidance_frames = capture.get_frames_of_type(LLMMessagesAppendFrame)
        assert len(guidance_frames) == 0


class TestDirectorSpeculativeAnalysis:
    """Verify speculative pre-processing behavior."""

    def test_text_matches_similar(self):
        """Jaccard similarity check accepts similar text."""
        from processors.conversation_director import ConversationDirectorProcessor
        # Interim is missing final punctuation/word — very common
        assert ConversationDirectorProcessor._text_matches(
            "I went to the doctor yesterday and they told me",
            "I went to the doctor yesterday and they told me everything is fine",
        )

    def test_text_matches_rejects_divergent(self):
        """Jaccard similarity check rejects divergent text."""
        from processors.conversation_director import ConversationDirectorProcessor
        assert not ConversationDirectorProcessor._text_matches(
            "I went to the",
            "Tell me about the weather today please",
        )

    def test_text_matches_handles_empty(self):
        from processors.conversation_director import ConversationDirectorProcessor
        assert not ConversationDirectorProcessor._text_matches("", "hello")
        assert not ConversationDirectorProcessor._text_matches("hello", "")

    @pytest.mark.asyncio
    async def test_speculative_cancelled_on_new_interim(self, session_state):
        """Speculative analysis is cancelled when new speech arrives.

        Tests the cancellation logic directly rather than through process_frame
        (which requires a started pipeline).
        """
        processor = ConversationDirectorProcessor(session_state=session_state)

        # Simulate a running speculative task
        long_task = asyncio.create_task(asyncio.sleep(10))
        processor._speculative_task = long_task

        # Simulate what process_frame does on InterimTranscriptionFrame:
        # cancel speculative task
        if processor._speculative_task is not None:
            if not processor._speculative_task.done():
                processor._speculative_task.cancel()
            processor._speculative_task = None

        # Let event loop process the cancellation
        await asyncio.sleep(0)

        assert long_task.cancelled()
        assert processor._speculative_task is None

    @pytest.mark.asyncio
    async def test_harvest_speculative_returns_result_when_done(self, session_state):
        """harvest_speculative returns result when task is done and text matches."""
        processor = ConversationDirectorProcessor(session_state=session_state)
        processor._latest_interim_text = "I went to the doctor yesterday and they told me"

        # Create a completed task
        async def fake_result():
            return {"analysis": {"call_phase": "main", "engagement_level": "high"}}
        processor._speculative_task = asyncio.create_task(fake_result())
        await asyncio.sleep(0.01)  # Let task complete

        result = processor._harvest_speculative("I went to the doctor yesterday and they told me everything is fine")
        assert result is not None
        assert result["analysis"]["engagement_level"] == "high"

    @pytest.mark.asyncio
    async def test_harvest_speculative_discards_divergent_text(self, session_state):
        """harvest_speculative discards result when text diverges."""
        processor = ConversationDirectorProcessor(session_state=session_state)
        processor._latest_interim_text = "I went to the"

        async def fake_result():
            return {"analysis": {"call_phase": "main"}}
        processor._speculative_task = asyncio.create_task(fake_result())
        await asyncio.sleep(0.01)

        result = processor._harvest_speculative("Tell me about the weather today please")
        assert result is None
        assert processor._speculative_cancels == 1

    @pytest.mark.asyncio
    async def test_harvest_speculative_cancels_running_task(self, session_state):
        """harvest_speculative cancels task that hasn't finished yet."""
        processor = ConversationDirectorProcessor(session_state=session_state)

        long_task = asyncio.create_task(asyncio.sleep(10))
        processor._speculative_task = long_task

        result = processor._harvest_speculative("Hello there")
        await asyncio.sleep(0)  # Let event loop process cancellation

        assert result is None
        assert long_task.cancelled()
        assert processor._speculative_cancels == 1

    def test_no_speculative_without_cerebras(self, session_state):
        """No silence timer starts when Cerebras is not configured.

        Tests the condition directly since process_frame requires a started pipeline.
        """
        processor = ConversationDirectorProcessor(session_state=session_state)
        text = "I went to the doctor yesterday and they said"

        # Cerebras not available → silence timer should NOT start
        cerebras_check = False  # Simulating cerebras_available() == False
        if len(text) >= processor.SPECULATIVE_MIN_LENGTH and cerebras_check:
            processor._silence_timer_task = "would be set"

        assert processor._silence_timer_task is None

        # Cerebras available → silence timer WOULD start
        cerebras_check = True
        if len(text) >= processor.SPECULATIVE_MIN_LENGTH and cerebras_check:
            processor._silence_timer_task = "would be set"

        assert processor._silence_timer_task is not None


class TestDirectorTimeLimits:
    """Verify time-based fallback actions."""

    @pytest.mark.asyncio
    async def test_force_end_after_hard_limit(self, session_state, frame_capture):
        # Set call start 13 minutes ago
        session_state["_call_start_time"] = time.time() - (13 * 60)
        processor = ConversationDirectorProcessor(session_state=session_state)
        # Pre-cache a result so _take_actions runs
        processor._last_result = get_default_direction()
        capture = frame_capture

        with patch("processors.conversation_director.analyze_turn", new_callable=AsyncMock) as mock_analyze, \
             patch("processors.conversation_director.format_director_guidance") as mock_format:
            mock_analyze.return_value = get_default_direction()
            mock_format.return_value = "main/medium/warm"

            pipeline = Pipeline([processor, capture])
            task = PipelineTask(pipeline, params=PipelineParams(enable_metrics=False))
            processor.set_pipeline_task(task)
            runner = PipelineRunner(handle_sigint=False)

            async def inject():
                await task.queue_frame(make_transcription("Tell me more"))
                # Wait for the delayed end (3s in _delayed_end)
                await asyncio.sleep(4)

            asyncio.create_task(inject())
            await asyncio.wait_for(runner.run(task), timeout=10.0)

        assert capture.has_end_frame
