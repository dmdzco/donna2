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
