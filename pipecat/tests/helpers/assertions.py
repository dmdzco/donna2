"""Custom assertion helpers for voice pipeline tests."""

from __future__ import annotations

import re

from pipecat.frames.frames import (
    EndFrame,
    Frame,
    LLMMessagesAppendFrame,
    TextFrame,
    TranscriptionFrame,
)


def assert_frame_order(frames: list[Frame], expected_types: list[type]) -> None:
    """Assert that frames appear in the given type order (allowing extras between).

    Example:
        assert_frame_order(frames, [TranscriptionFrame, LLMMessagesAppendFrame, TextFrame])
    """
    type_iter = iter(expected_types)
    current = next(type_iter, None)

    for frame in frames:
        if current is None:
            break
        if isinstance(frame, current):
            current = next(type_iter, None)

    remaining = [current] + list(type_iter) if current else []
    assert not remaining, (
        f"Expected frame types not found in order. Missing: {[t.__name__ for t in remaining]}"
    )


def assert_guidance_injected(frames: list[Frame], keyword: str) -> None:
    """Assert that an LLMMessagesAppendFrame containing `keyword` exists."""
    for frame in frames:
        if isinstance(frame, LLMMessagesAppendFrame):
            for msg in frame.messages:
                if keyword.lower() in msg.get("content", "").lower():
                    return
    raise AssertionError(f"No guidance frame containing '{keyword}' found")


def assert_no_guidance_spoken(tts_text: str) -> None:
    """Assert that no guidance tags or bracketed directives appear in spoken text."""
    assert "<guidance>" not in tts_text.lower(), "Guidance tags leaked to TTS"
    assert "</guidance>" not in tts_text.lower(), "Guidance close tags leaked to TTS"
    bracketed = re.findall(r"\[[A-Z][A-Z _]+\]", tts_text)
    assert not bracketed, f"Bracketed directives leaked to TTS: {bracketed}"


def assert_transcription_passthrough(frames: list[Frame], text: str) -> None:
    """Assert that a TranscriptionFrame with the given text passed through."""
    for frame in frames:
        if isinstance(frame, TranscriptionFrame) and frame.text == text:
            return
    raise AssertionError(f"TranscriptionFrame with text '{text}' not found in frames")


def assert_end_frame_present(frames: list[Frame]) -> None:
    """Assert that an EndFrame was emitted."""
    assert any(isinstance(f, EndFrame) for f in frames), "No EndFrame found in frames"


def assert_topics_tracked(tracker, expected_topics: list[str]) -> None:
    """Assert that the ConversationTracker recorded the expected topics."""
    tracked = tracker.state.topics_discussed
    for topic in expected_topics:
        assert topic in tracked, (
            f"Topic '{topic}' not tracked. Tracked: {tracked}"
        )


def assert_transcript_contains(session_state: dict, role: str, keyword: str) -> None:
    """Assert that the shared _transcript contains a message matching role+keyword."""
    transcript = session_state.get("_transcript", [])
    for entry in transcript:
        if entry.get("role") == role and keyword.lower() in entry.get("content", "").lower():
            return
    raise AssertionError(
        f"No {role} message containing '{keyword}' in transcript. "
        f"Transcript has {len(transcript)} entries."
    )
