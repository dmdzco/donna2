"""Emotion TTS Processor — maps detected emotions to Cartesia voice tone.

Sits between GuidanceStripper and TTS in the pipeline. On each TextFrame,
reads the current emotion state from session_state (set by Quick Observer
and Conversation Director) and updates Cartesia's generation_config.emotion.

Principle: empathetic response for negative emotions, mirror for positive.
"""

from __future__ import annotations

from loguru import logger
from pipecat.frames.frames import Frame, TextFrame
from pipecat.processors.frame_processor import FrameProcessor

# ---------------------------------------------------------------------------
# Quick Observer signal → Cartesia emotion
# Negative: empathetic response (senior sad → Donna sympathetic)
# Positive: mirror energy (senior excited → Donna excited)
# ---------------------------------------------------------------------------

SIGNAL_TO_CARTESIA: dict[str, str] = {
    # Negative → Empathetic
    "sad": "sympathetic",
    "crying": "sympathetic",
    "grief": "sympathetic",
    "lonely": "affectionate",
    "missing": "affectionate",
    "abandoned": "affectionate",
    "worried": "calm",
    "anxious": "calm",
    "scared": "calm",
    "overwhelmed": "calm",
    "frustrated": "calm",
    "angry": "calm",
    "resentful": "calm",
    "bored": "curious",
    "apathetic": "curious",
    # Positive → Mirror
    "happy": "happy",
    "positive": "happy",
    "enjoying": "happy",
    "excited": "excited",
    "love": "affectionate",
    "grateful": "affectionate",
    "fortunate": "affectionate",
    "proud": "proud",
    "content": "content",
    # Neutral
    "neutral_positive": "content",
}

# Director emotional_tone → Cartesia emotion (fallback when no regex match)
DIRECTOR_TO_CARTESIA: dict[str, str] = {
    "positive": "happy",
    "neutral": "happy",
    "concerned": "sympathetic",
    "sad": "sympathetic",
}

DEFAULT_EMOTION = "happy"


class EmotionTTSProcessor(FrameProcessor):
    """Updates Cartesia TTS emotion based on detected senior emotions.

    Reads from:
    - session_state["_last_quick_analysis"].emotion_signals (Quick Observer, priority)
    - session_state["_director_emotional_tone"] (Director, fallback)

    Only acts when TTS is CartesiaTTSService. No-op for ElevenLabs.
    """

    def __init__(self, session_state: dict, tts, **kwargs):
        super().__init__(**kwargs)
        self._session_state = session_state
        self._tts = tts
        self._current_emotion: str = DEFAULT_EMOTION
        self._is_cartesia = _is_cartesia_tts(tts)

        if not self._is_cartesia:
            logger.info("[EmotionTTS] TTS is not Cartesia — processor disabled")

    async def process_frame(self, frame: Frame, direction):
        await super().process_frame(frame, direction)

        if self._is_cartesia and isinstance(frame, TextFrame):
            emotion = self._resolve_emotion()
            if emotion != self._current_emotion:
                self._current_emotion = emotion
                _set_cartesia_emotion(self._tts, emotion)
                logger.info("[EmotionTTS] Voice emotion → {e}", e=emotion)

        await self.push_frame(frame, direction)

    def _resolve_emotion(self) -> str:
        """Pick the best Cartesia emotion from available signals."""

        # Priority 1: Quick Observer emotion signals (instant, specific)
        analysis = self._session_state.get("_last_quick_analysis")
        if analysis and hasattr(analysis, "emotion_signals") and analysis.emotion_signals:
            # Sort: high-intensity negative first, then high positive, then rest
            neg = [e for e in analysis.emotion_signals if e["valence"] == "negative"]
            pos = [e for e in analysis.emotion_signals if e["valence"] == "positive"]

            high_neg = [e for e in neg if e["intensity"] == "high"]
            high_pos = [e for e in pos if e["intensity"] == "high"]

            if high_neg:
                signal = high_neg[0]["signal"]
            elif high_pos:
                signal = high_pos[0]["signal"]
            elif neg:
                signal = neg[0]["signal"]
            elif pos:
                signal = pos[0]["signal"]
            else:
                signal = analysis.emotion_signals[0]["signal"]

            cartesia_emotion = SIGNAL_TO_CARTESIA.get(signal)
            if cartesia_emotion:
                return cartesia_emotion

        # Priority 2: Director emotional_tone (LLM-based, broader context)
        director_tone = self._session_state.get("_director_emotional_tone")
        if director_tone:
            cartesia_emotion = DIRECTOR_TO_CARTESIA.get(director_tone)
            if cartesia_emotion:
                return cartesia_emotion

        return DEFAULT_EMOTION


def _is_cartesia_tts(tts) -> bool:
    """Check if TTS service is Cartesia (avoid import dependency)."""
    return type(tts).__name__ == "CartesiaTTSService"


def _set_cartesia_emotion(tts, emotion: str) -> None:
    """Mutate Cartesia TTS generation_config.emotion."""
    gen_config = tts._settings.get("generation_config")
    if gen_config is not None:
        gen_config.emotion = emotion
