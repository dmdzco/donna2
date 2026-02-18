"""Guidance stripper processor.

Strips <guidance>...</guidance> tags and [BRACKETED] directives from LLM output
before it reaches TTS. These are internal instructions that should not be spoken.

Handles streaming edge cases: partial opening tags, unclosed tags, orphaned
closing tags.

Port of stripGuidanceTags() from pipelines/v1-advanced.js.
"""

import re

from loguru import logger
from pipecat.frames.frames import EndFrame, TextFrame
from pipecat.processors.frame_processor import FrameProcessor


# Pre-compiled patterns
_COMPLETE_TAG = re.compile(r"<guidance>[\s\S]*?</guidance>", re.IGNORECASE)
_PARTIAL_OPEN = re.compile(r"<guidance>[\s\S]*$", re.IGNORECASE)
_ORPHAN_CLOSE = re.compile(r"</guidance>", re.IGNORECASE)
_BRACKETED = re.compile(r"\[[A-Z][A-Z _]+\]")
_MULTI_SPACE = re.compile(r"\s{2,}")
# Quick check: does text contain anything worth stripping?
_NEEDS_STRIP = re.compile(r"</?guidance>|\[[A-Z][A-Z _]+\]", re.IGNORECASE)

# If buffer grows beyond this, the closing tag isn't coming — force flush.
_MAX_BUFFER_CHARS = 500


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
    the text is buffered until the closing tag arrives. If the buffer grows
    beyond _MAX_BUFFER_CHARS, the closing tag is assumed missing and the
    buffer is force-flushed to prevent permanent silence.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._buffer = ""

    def _flush_buffer(self) -> str | None:
        """Force-flush the buffer, stripping whatever guidance content we can."""
        if not self._buffer:
            return None
        text = self._buffer
        self._buffer = ""
        cleaned = strip_guidance(text)
        return cleaned or None

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)

        # On EndFrame, flush any remaining buffer before passing through
        if isinstance(frame, EndFrame):
            cleaned = self._flush_buffer()
            if cleaned:
                await self.push_frame(TextFrame(text=cleaned), direction)
            await self.push_frame(frame, direction)
            return

        if not isinstance(frame, TextFrame):
            await self.push_frame(frame, direction)
            return

        text = self._buffer + frame.text
        self._buffer = ""

        if has_unclosed_guidance_tag(text):
            if len(text) > _MAX_BUFFER_CHARS:
                # Closing tag isn't coming — force flush to prevent silence
                logger.warning(
                    "[GuidanceStripper] Buffer exceeded {n} chars with unclosed tag — force flushing",
                    n=_MAX_BUFFER_CHARS,
                )
                cleaned = strip_guidance(text)
                if cleaned:
                    await self.push_frame(TextFrame(text=cleaned), direction)
                return
            # Buffer until the closing tag arrives
            self._buffer = text
            return

        if not _NEEDS_STRIP.search(text):
            # No guidance content — pass through unchanged to preserve
            # inter-token whitespace (e.g. leading space in " Margaret")
            await self.push_frame(frame, direction)
            return

        cleaned = strip_guidance(text)
        if cleaned:
            await self.push_frame(TextFrame(text=cleaned), direction)
