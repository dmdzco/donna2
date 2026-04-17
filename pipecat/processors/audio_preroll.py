"""Small audio pre-roll helpers for telephony output."""

from __future__ import annotations

from pipecat.frames.frames import AudioRawFrame, Frame
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor


class InitialAudioPrerollProcessor(FrameProcessor):
    """Insert a short silence frame before the first outbound audio frame."""

    def __init__(self, *, preroll_ms: int = 0, **kwargs):
        super().__init__(**kwargs)
        self._preroll_ms = max(0, preroll_ms)
        self._emitted_preroll = False

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if (
            self._preroll_ms > 0
            and not self._emitted_preroll
            and isinstance(frame, AudioRawFrame)
        ):
            self._emitted_preroll = True
            remaining_ms = self._preroll_ms
            while remaining_ms > 0:
                chunk_ms = min(20, remaining_ms)
                samples = round(frame.sample_rate * chunk_ms / 1000)
                silence = bytes(samples * frame.num_channels * 2)
                await self.push_frame(
                    type(frame)(
                        audio=silence,
                        sample_rate=frame.sample_rate,
                        num_channels=frame.num_channels,
                    ),
                    direction,
                )
                remaining_ms -= chunk_ms

        await self.push_frame(frame, direction)
