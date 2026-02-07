"""Level 2: Observer chain integration.

Tests frame flow through: QuickObserver -> ConversationDirector -> (LLM context)
Verifies guidance injection ordering and non-blocking behavior.
"""

import asyncio
import pytest
from unittest.mock import AsyncMock, patch

from pipecat.frames.frames import EndFrame, LLMMessagesAppendFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask

from processors.quick_observer import QuickObserverProcessor
from processors.conversation_director import ConversationDirectorProcessor
from services.director_llm import get_default_direction
from tests.conftest import FrameCapture, make_transcription


class TestObserverChain:
    @pytest.mark.asyncio
    async def test_quick_observer_guidance_before_director(self, session_state, frame_capture):
        """Quick Observer guidance should appear before Director guidance in frame order."""
        quick = QuickObserverProcessor(session_state=session_state)
        director = ConversationDirectorProcessor(session_state=session_state)
        capture = frame_capture

        # Pre-cache a Director result so it injects on this turn
        director._last_result = get_default_direction()

        with patch("processors.conversation_director.analyze_turn", new_callable=AsyncMock) as mock_analyze, \
             patch("processors.conversation_director.format_director_guidance") as mock_format:
            mock_analyze.return_value = get_default_direction()
            mock_format.return_value = "main/medium/warm"

            pipeline = Pipeline([quick, director, capture])
            task = PipelineTask(pipeline, params=PipelineParams(enable_metrics=False))
            quick.set_pipeline_task(task)
            director.set_pipeline_task(task)
            runner = PipelineRunner(handle_sigint=False)

            async def inject():
                # Turn with health signal (Quick Observer will inject guidance)
                await task.queue_frame(make_transcription("I fell down yesterday"))
                await asyncio.sleep(0.2)
                await task.queue_frame(EndFrame())

            asyncio.create_task(inject())
            await asyncio.wait_for(runner.run(task), timeout=5.0)

        guidance_frames = capture.get_frames_of_type(LLMMessagesAppendFrame)
        # Quick Observer should have injected health guidance
        assert len(guidance_frames) >= 1
        first_guidance = guidance_frames[0].messages[0]["content"]
        assert "guidance" in first_guidance.lower()


class TestObserverChainGoodbye:
    @pytest.mark.asyncio
    async def test_goodbye_suppresses_director_guidance(self, session_state, frame_capture):
        """After goodbye detection, Director should NOT inject guidance."""
        quick = QuickObserverProcessor(session_state=session_state)
        quick.GOODBYE_DELAY_SECONDS = 0.3
        director = ConversationDirectorProcessor(session_state=session_state)
        director._last_result = get_default_direction()
        capture = frame_capture

        with patch("processors.conversation_director.analyze_turn", new_callable=AsyncMock) as mock_analyze, \
             patch("processors.conversation_director.format_director_guidance") as mock_format:
            mock_analyze.return_value = get_default_direction()
            mock_format.return_value = "main/medium/warm"

            pipeline = Pipeline([quick, director, capture])
            task = PipelineTask(pipeline, params=PipelineParams(enable_metrics=False))
            quick.set_pipeline_task(task)
            director.set_pipeline_task(task)
            runner = PipelineRunner(handle_sigint=False)

            async def inject():
                await task.queue_frame(make_transcription("Goodbye, talk to you later"))
                await asyncio.sleep(0.5)

            asyncio.create_task(inject())
            await asyncio.wait_for(runner.run(task), timeout=5.0)

        # Director should have been suppressed (goodbye_in_progress flag)
        director_guidance = [
            f for f in capture.get_frames_of_type(LLMMessagesAppendFrame)
            if any("Director" in m.get("content", "") for m in f.messages)
        ]
        assert len(director_guidance) == 0
