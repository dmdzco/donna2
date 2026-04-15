from unittest.mock import AsyncMock

import pytest

from pipecat.frames.frames import AudioRawFrame, OutputAudioRawFrame, TextFrame
from pipecat.processors.frame_processor import FrameDirection
from processors.audio_preroll import InitialAudioPrerollProcessor


@pytest.mark.asyncio
async def test_initial_audio_preroll_inserts_silence_before_first_audio():
    processor = InitialAudioPrerollProcessor(preroll_ms=120)
    pushed = []
    processor.push_frame = AsyncMock(side_effect=lambda frame, direction: pushed.append((frame, direction)))

    frame = OutputAudioRawFrame(audio=b"\x01\x02" * 320, sample_rate=16000, num_channels=1)

    await processor.process_frame(frame, FrameDirection.DOWNSTREAM)

    assert len(pushed) == 7
    silence, original = pushed[0][0], pushed[-1][0]
    assert isinstance(silence, AudioRawFrame)
    assert isinstance(silence, OutputAudioRawFrame)
    assert silence.audio == bytes(640)
    assert silence.sample_rate == 16000
    assert original is frame


@pytest.mark.asyncio
async def test_initial_audio_preroll_only_runs_once():
    processor = InitialAudioPrerollProcessor(preroll_ms=120)
    pushed = []
    processor.push_frame = AsyncMock(side_effect=lambda frame, direction: pushed.append(frame))

    first = OutputAudioRawFrame(audio=b"\x01\x02" * 320, sample_rate=16000, num_channels=1)
    second = OutputAudioRawFrame(audio=b"\x03\x04" * 320, sample_rate=16000, num_channels=1)

    await processor.process_frame(first, FrameDirection.DOWNSTREAM)
    await processor.process_frame(second, FrameDirection.DOWNSTREAM)

    assert len(pushed) == 8
    assert pushed[0].audio == bytes(640)
    assert pushed[6] is first
    assert pushed[7] is second


@pytest.mark.asyncio
async def test_initial_audio_preroll_passes_non_audio_without_silence():
    processor = InitialAudioPrerollProcessor(preroll_ms=120)
    pushed = []
    processor.push_frame = AsyncMock(side_effect=lambda frame, direction: pushed.append(frame))

    frame = TextFrame("hello")

    await processor.process_frame(frame, FrameDirection.DOWNSTREAM)

    assert pushed == [frame]
