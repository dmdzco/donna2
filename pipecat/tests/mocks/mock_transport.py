"""Mock transport for test pipelines.

Provides TestInputTransport and TestOutputTransport that replace
FastAPIWebsocketTransport. These do not require a WebSocket connection.
"""

from __future__ import annotations

from pipecat.frames.frames import EndFrame, Frame
from pipecat.processors.frame_processor import FrameProcessor


class TestInputTransport(FrameProcessor):
    """Replaces transport.input() in test pipelines.

    Passes frames through. The test injects frames by calling
    pipeline_task.queue_frame() directly.
    """

    async def process_frame(self, frame: Frame, direction):
        await super().process_frame(frame, direction)
        await self.push_frame(frame, direction)


class TestOutputTransport(FrameProcessor):
    """Replaces transport.output() in test pipelines.

    Captures all output frames. Detects EndFrame to signal pipeline shutdown.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.output_frames: list[Frame] = []
        self._ended = False

    async def process_frame(self, frame: Frame, direction):
        await super().process_frame(frame, direction)
        self.output_frames.append(frame)

        if isinstance(frame, EndFrame):
            self._ended = True

        await self.push_frame(frame, direction)

    @property
    def ended(self) -> bool:
        return self._ended
