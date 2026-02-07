"""Level 1: GoodbyeGateProcessor frame-level tests.

Tests frame-driven goodbye detection, timer lifecycle, and false-goodbye
cancellation via TranscriptionFrame. Complements test_goodbye_gate.py
which tests the state machine directly.
"""

import asyncio
import pytest

from pipecat.frames.frames import EndFrame, TextFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask

from processors.goodbye_gate import GoodbyeGateProcessor, GOODBYE_SILENCE_SECONDS
from tests.conftest import FrameCapture, make_transcription


class TestGoodbyeGateFrameFlow:
    @pytest.mark.asyncio
    async def test_senior_goodbye_then_donna_goodbye_triggers_timer(self, frame_capture):
        """When both sides say goodbye, the timer should start."""
        callback_called = asyncio.Event()

        async def on_goodbye():
            callback_called.set()

        gate = GoodbyeGateProcessor(on_goodbye=on_goodbye)
        capture = frame_capture

        pipeline = Pipeline([gate, capture])
        task = PipelineTask(pipeline, params=PipelineParams(enable_metrics=False))
        runner = PipelineRunner(handle_sigint=False)

        async def inject():
            # Senior says goodbye (notify externally, as Quick Observer would)
            gate.notify_goodbye_detected(is_strong=True)
            # Donna says goodbye (via TextFrame)
            await task.queue_frame(TextFrame(text="Goodbye Margaret, take care!"))
            await asyncio.sleep(GOODBYE_SILENCE_SECONDS + 0.5)
            await task.queue_frame(EndFrame())

        asyncio.create_task(inject())
        await asyncio.wait_for(runner.run(task), timeout=10.0)

        assert callback_called.is_set()

    @pytest.mark.asyncio
    async def test_senior_speaks_cancels_goodbye(self, frame_capture):
        """If senior speaks during goodbye timer, timer should cancel."""
        callback_called = asyncio.Event()

        async def on_goodbye():
            callback_called.set()

        gate = GoodbyeGateProcessor(on_goodbye=on_goodbye)
        capture = frame_capture

        pipeline = Pipeline([gate, capture])
        task = PipelineTask(pipeline, params=PipelineParams(enable_metrics=False))
        runner = PipelineRunner(handle_sigint=False)

        async def inject():
            gate.notify_goodbye_detected(is_strong=True)
            await task.queue_frame(TextFrame(text="Bye bye!"))
            await asyncio.sleep(0.5)
            # Senior continues talking -- should cancel
            await task.queue_frame(make_transcription("Oh wait, I forgot to tell you something"))
            await asyncio.sleep(GOODBYE_SILENCE_SECONDS + 0.5)
            await task.queue_frame(EndFrame())

        asyncio.create_task(inject())
        await asyncio.wait_for(runner.run(task), timeout=10.0)

        assert not callback_called.is_set()
