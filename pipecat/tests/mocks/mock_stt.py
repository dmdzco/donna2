"""Mock STT processor that converts scripted utterances to TranscriptionFrames.

Replaces DeepgramSTTService in test pipelines. Instead of processing audio,
it reads from a queue of pre-scripted utterances and emits them as finalized
TranscriptionFrames.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from pipecat.frames.frames import Frame, TranscriptionFrame
from pipecat.processors.frame_processor import FrameProcessor


@dataclass
class Utterance:
    """A scripted user utterance with optional delay."""
    text: str
    delay_seconds: float = 0.5   # Delay before emitting (simulates speaking time)
    user_id: str = "senior-test-001"


class MockSTTProcessor(FrameProcessor):
    """Emits scripted TranscriptionFrames on demand.

    Does NOT auto-emit; call `emit_next()` or `emit_all()` to feed
    utterances into the pipeline. This gives tests precise control
    over timing.

    Usage:
        stt = MockSTTProcessor(utterances=[
            Utterance("Hello Donna", delay_seconds=0.0),
            Utterance("I'm doing well, thanks for asking"),
            Utterance("Goodbye, talk to you later"),
        ])

        # In test:
        await stt.emit_next()     # Emits "Hello Donna"
        await asyncio.sleep(1)    # Wait for pipeline to process
        await stt.emit_next()     # Emits "I'm doing well..."
    """

    def __init__(self, utterances: list[Utterance] | None = None, **kwargs):
        super().__init__(**kwargs)
        self._utterances = list(utterances or [])
        self._index = 0
        self._emitted: list[TranscriptionFrame] = []

    async def process_frame(self, frame: Frame, direction):
        """Pass all non-audio frames through unchanged."""
        await super().process_frame(frame, direction)
        # In a real pipeline, audio frames would be consumed here.
        # In tests, we ignore them and emit scripted transcriptions instead.
        await self.push_frame(frame, direction)

    async def emit_next(self) -> TranscriptionFrame | None:
        """Emit the next scripted utterance as a TranscriptionFrame.

        Returns the emitted frame, or None if all utterances consumed.
        """
        if self._index >= len(self._utterances):
            return None

        utterance = self._utterances[self._index]
        self._index += 1

        if utterance.delay_seconds > 0:
            await asyncio.sleep(utterance.delay_seconds)

        frame = TranscriptionFrame(
            text=utterance.text,
            user_id=utterance.user_id,
            timestamp="",
            language="en",
        )
        self._emitted.append(frame)
        await self.push_frame(frame)
        return frame

    async def emit_all(self) -> list[TranscriptionFrame]:
        """Emit all remaining utterances sequentially."""
        emitted = []
        while self._index < len(self._utterances):
            frame = await self.emit_next()
            if frame:
                emitted.append(frame)
        return emitted

    @property
    def remaining(self) -> int:
        return len(self._utterances) - self._index

    @property
    def emitted_count(self) -> int:
        return self._index
