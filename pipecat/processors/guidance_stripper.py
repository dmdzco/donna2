"""Guidance stripper processor.

Strips <guidance>...</guidance> tags and [BRACKETED] directives from LLM output
before it reaches TTS. These are internal instructions that should not be spoken.

Handles streaming edge cases: partial opening tags, unclosed tags, orphaned
closing tags.

Port of stripGuidanceTags() from pipelines/v1-advanced.js.
"""

import re

from pipecat.frames.frames import TextFrame
from pipecat.processors.frame_processor import FrameProcessor


# Pre-compiled patterns
_COMPLETE_TAG = re.compile(r"<guidance>[\s\S]*?</guidance>", re.IGNORECASE)
_PARTIAL_OPEN = re.compile(r"<guidance>[\s\S]*$", re.IGNORECASE)
_ORPHAN_CLOSE = re.compile(r"</guidance>", re.IGNORECASE)
_BRACKETED = re.compile(r"\[[A-Z][A-Z _]+\]")
_MULTI_SPACE = re.compile(r"\s{2,}")


def strip_guidance(text: str) -> str:
    """Strip guidance tags, bracketed directives, and clean up whitespace."""
    cleaned = _COMPLETE_TAG.sub("", text)
    cleaned = _PARTIAL_OPEN.sub("", cleaned)
    cleaned = _ORPHAN_CLOSE.sub("", cleaned)
    cleaned = _BRACKETED.sub("", cleaned)
    cleaned = _MULTI_SPACE.sub(" ", cleaned).strip()
    return cleaned


def has_unclosed_guidance_tag(text: str) -> bool:
    """Check if text contains an unclosed <guidance> tag (still streaming)."""
    open_count = len(re.findall(r"<guidance>", text, re.IGNORECASE))
    close_count = len(re.findall(r"</guidance>", text, re.IGNORECASE))
    return open_count > close_count


class GuidanceStripperProcessor(FrameProcessor):
    """Strip <guidance> tags and [BRACKETED] directives from TextFrames.

    Placed after the LLM and before TTS in the pipeline:
        ... → llm → guidance_stripper → tts → ...

    Handles streaming: if a TextFrame contains an unclosed <guidance> tag,
    the text is buffered until the closing tag arrives.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._buffer = ""

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)

        if not isinstance(frame, TextFrame):
            await self.push_frame(frame, direction)
            return

        text = self._buffer + frame.text
        self._buffer = ""

        if has_unclosed_guidance_tag(text):
            # Buffer until the closing tag arrives
            self._buffer = text
            return

        cleaned = strip_guidance(text)
        if cleaned:
            await self.push_frame(TextFrame(text=cleaned), direction)
