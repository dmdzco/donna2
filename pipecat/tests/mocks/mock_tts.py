"""Mock TTS processor that captures TextFrames without producing audio.

Replaces ElevenLabsTTSService in test pipelines. Captures all text that
would be spoken, making it available for assertions.
"""

from __future__ import annotations

import re

from pipecat.frames.frames import Frame, TextFrame
from pipecat.processors.frame_processor import FrameProcessor


class MockTTSProcessor(FrameProcessor):
    """Captures TextFrames (what would be spoken) and passes them through.

    Does NOT produce audio frames -- just records the text content for
    assertion purposes.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.spoken_chunks: list[str] = []

    async def process_frame(self, frame: Frame, direction):
        await super().process_frame(frame, direction)

        if isinstance(frame, TextFrame):
            self.spoken_chunks.append(frame.text)

        await self.push_frame(frame, direction)

    @property
    def full_text(self) -> str:
        """All spoken text concatenated."""
        return "".join(self.spoken_chunks)

    @property
    def utterances(self) -> list[str]:
        """Spoken text split into approximate utterances (by sentence)."""
        full = self.full_text
        if not full:
            return []
        # Split on sentence boundaries
        return [s.strip() for s in re.split(r'(?<=[.!?])\s+', full) if s.strip()]

    def reset(self):
        self.spoken_chunks.clear()
