"""Mock LLM service that returns scripted responses.

Replaces AnthropicLLMService in test pipelines. Emits TextFrame sequences
based on pattern matching against accumulated user context, or returns a
default response.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from pipecat.frames.frames import (
    Frame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMMessagesAppendFrame,
    TextFrame,
)
from pipecat.processors.frame_processor import FrameProcessor


@dataclass
class ScriptedResponse:
    """A pattern-matched response for the MockLLMProcessor."""
    trigger: re.Pattern                    # Regex matched against user message
    response: str                          # Full text response to emit
    tool_calls: list[dict] | None = None   # Optional tool calls to simulate
    once: bool = False                     # If True, only fire once


class MockLLMProcessor(FrameProcessor):
    """Mock LLM that emits scripted TextFrame responses.

    Accumulates context from LLMMessagesAppendFrame and responds to
    TranscriptionFrames that pass through via the context aggregator.

    Usage:
        llm = MockLLMProcessor(responses=[
            ScriptedResponse(
                trigger=re.compile(r"how are you", re.I),
                response="I'm doing well, Margaret! How are you feeling today?",
            ),
            ScriptedResponse(
                trigger=re.compile(r"goodbye|bye", re.I),
                response="It was lovely talking with you! Take care, Margaret.",
            ),
        ])

    The default_response is used when no pattern matches.
    """

    def __init__(
        self,
        responses: list[ScriptedResponse] | None = None,
        default_response: str = "That's wonderful to hear! Tell me more about that.",
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.responses = responses or []
        self.default_response = default_response
        self._context_messages: list[dict] = []
        self._used_once: set = set()
        self._response_log: list[dict] = []

    async def process_frame(self, frame: Frame, direction):
        await super().process_frame(frame, direction)

        if isinstance(frame, LLMMessagesAppendFrame):
            # Accumulate context (guidance, user messages, etc.)
            self._context_messages.extend(frame.messages)

            if frame.run_llm:
                # Context aggregator is asking us to generate
                await self._generate_response()
            else:
                # Just context injection (guidance), pass through
                await self.push_frame(frame, direction)
            return

        # Pass everything else through
        await self.push_frame(frame, direction)

    async def _generate_response(self):
        """Generate a scripted response based on accumulated context."""
        # Find the last user message in context
        last_user_msg = ""
        for msg in reversed(self._context_messages):
            if msg.get("role") == "user" and "guidance" not in msg.get("content", "").lower():
                last_user_msg = msg.get("content", "")
                break

        # Match against scripted responses
        response_text = self.default_response
        for i, scripted in enumerate(self.responses):
            if i in self._used_once:
                continue
            if scripted.trigger.search(last_user_msg):
                response_text = scripted.response
                if scripted.once:
                    self._used_once.add(i)
                break

        # Log for assertions
        self._response_log.append({
            "trigger": last_user_msg,
            "response": response_text,
        })

        # Emit framing similar to real LLM output
        await self.push_frame(LLMFullResponseStartFrame())

        # Emit response as a sequence of TextFrames (simulating streaming)
        # Split into word-level chunks for realism
        words = response_text.split()
        for i, word in enumerate(words):
            chunk = word if i == 0 else " " + word
            await self.push_frame(TextFrame(text=chunk))

        await self.push_frame(LLMFullResponseEndFrame())

    def get_response_log(self) -> list[dict]:
        """Return log of all trigger->response pairs for assertions."""
        return self._response_log
