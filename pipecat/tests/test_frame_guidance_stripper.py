"""Level 1: GuidanceStripperProcessor frame-level tests.

Tests streaming guidance tag stripping, buffering of unclosed tags,
and frame passthrough for non-TextFrame types.
"""

import pytest

from pipecat.frames.frames import LLMMessagesAppendFrame, TextFrame

from processors.guidance_stripper import GuidanceStripperProcessor
from tests.conftest import run_processor_test


class TestStripperBasic:
    @pytest.mark.asyncio
    async def test_strips_complete_guidance_tag(self):
        stripper = GuidanceStripperProcessor()
        capture = await run_processor_test(
            processors=[stripper],
            frames_to_inject=[
                TextFrame(text="Hello! <guidance>Be warm</guidance> How are you?")
            ],
        )
        full = "".join(capture.get_text_content())
        assert "guidance" not in full.lower()
        assert "Hello!" in full
        assert "How are you?" in full

    @pytest.mark.asyncio
    async def test_strips_bracketed_directives(self):
        stripper = GuidanceStripperProcessor()
        capture = await run_processor_test(
            processors=[stripper],
            frames_to_inject=[TextFrame(text="[HEALTH] Ask about their pain.")],
        )
        full = "".join(capture.get_text_content())
        assert "[HEALTH]" not in full


class TestStripperStreaming:
    @pytest.mark.asyncio
    async def test_buffers_unclosed_tag(self):
        """An unclosed guidance tag should be buffered until the close tag arrives."""
        stripper = GuidanceStripperProcessor()
        capture = await run_processor_test(
            processors=[stripper],
            frames_to_inject=[
                TextFrame(text="Hello <guidance>internal"),
                TextFrame(text=" note</guidance> friend!"),
            ],
            inject_delay=0.05,
        )
        full = "".join(capture.get_text_content())
        assert "guidance" not in full.lower()
        assert "internal" not in full
        assert "Hello" in full
        assert "friend!" in full


class TestStripperPassthrough:
    @pytest.mark.asyncio
    async def test_non_text_frames_pass_through(self):
        """Non-TextFrame types (e.g. LLMMessagesAppendFrame) should pass through unchanged.
        Note: TranscriptionFrame IS a TextFrame subclass in Pipecat, so it gets processed."""
        stripper = GuidanceStripperProcessor()
        test_msg = [{"role": "user", "content": "test guidance"}]
        capture = await run_processor_test(
            processors=[stripper],
            frames_to_inject=[LLMMessagesAppendFrame(messages=test_msg, run_llm=False)],
        )
        llm_frames = capture.get_frames_of_type(LLMMessagesAppendFrame)
        assert len(llm_frames) >= 1
        assert llm_frames[0].messages == test_msg
