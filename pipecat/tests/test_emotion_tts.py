"""Tests for EmotionTTSProcessor — Cartesia voice emotion mapping."""

import pytest
from unittest.mock import MagicMock
from dataclasses import dataclass, field
from processors.emotion_tts import (
    EmotionTTSProcessor,
    SIGNAL_TO_CARTESIA,
    DIRECTOR_TO_CARTESIA,
    DEFAULT_EMOTION,
    _is_cartesia_tts,
    _set_cartesia_emotion,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@dataclass
class FakeAnalysis:
    emotion_signals: list = field(default_factory=list)


def _make_cartesia_tts(emotion=None):
    """Create a mock Cartesia TTS service."""
    tts = MagicMock()
    tts.__class__.__name__ = "CartesiaTTSService"
    gen_config = MagicMock()
    gen_config.emotion = emotion or "content"
    tts._settings = {"generation_config": gen_config}
    return tts


def _make_elevenlabs_tts():
    """Create a mock ElevenLabs TTS service."""
    tts = MagicMock()
    tts.__class__.__name__ = "ElevenLabsTTSService"
    return tts


# ---------------------------------------------------------------------------
# Mapping tests
# ---------------------------------------------------------------------------

class TestSignalMapping:
    """Verify all Quick Observer emotion signals map to Cartesia emotions."""

    def test_negative_emotions_map_to_empathetic_response(self):
        assert SIGNAL_TO_CARTESIA["sad"] == "sympathetic"
        assert SIGNAL_TO_CARTESIA["crying"] == "sympathetic"
        assert SIGNAL_TO_CARTESIA["grief"] == "sympathetic"
        assert SIGNAL_TO_CARTESIA["lonely"] == "affectionate"
        assert SIGNAL_TO_CARTESIA["missing"] == "affectionate"
        assert SIGNAL_TO_CARTESIA["abandoned"] == "affectionate"

    def test_anxious_emotions_map_to_calm(self):
        for signal in ("worried", "anxious", "scared", "overwhelmed", "frustrated", "angry", "resentful"):
            assert SIGNAL_TO_CARTESIA[signal] == "calm", f"{signal} should map to calm"

    def test_bored_maps_to_curious(self):
        assert SIGNAL_TO_CARTESIA["bored"] == "curious"
        assert SIGNAL_TO_CARTESIA["apathetic"] == "curious"

    def test_positive_emotions_mirror(self):
        assert SIGNAL_TO_CARTESIA["happy"] == "happy"
        assert SIGNAL_TO_CARTESIA["excited"] == "excited"
        assert SIGNAL_TO_CARTESIA["proud"] == "proud"
        assert SIGNAL_TO_CARTESIA["content"] == "content"

    def test_love_and_gratitude_map_to_affectionate(self):
        for signal in ("love", "grateful", "fortunate"):
            assert SIGNAL_TO_CARTESIA[signal] == "affectionate"

    def test_director_fallback_mapping(self):
        assert DIRECTOR_TO_CARTESIA["positive"] == "happy"
        assert DIRECTOR_TO_CARTESIA["neutral"] == "happy"
        assert DIRECTOR_TO_CARTESIA["concerned"] == "sympathetic"
        assert DIRECTOR_TO_CARTESIA["sad"] == "sympathetic"


# ---------------------------------------------------------------------------
# TTS detection
# ---------------------------------------------------------------------------

class TestTTSDetection:
    def test_detects_cartesia(self):
        assert _is_cartesia_tts(_make_cartesia_tts()) is True

    def test_detects_elevenlabs(self):
        assert _is_cartesia_tts(_make_elevenlabs_tts()) is False


# ---------------------------------------------------------------------------
# Emotion setting
# ---------------------------------------------------------------------------

class TestSetEmotion:
    def test_sets_emotion_on_generation_config(self):
        tts = _make_cartesia_tts(emotion="content")
        _set_cartesia_emotion(tts, "sympathetic")
        assert tts._settings["generation_config"].emotion == "sympathetic"

    def test_noop_when_no_generation_config(self):
        tts = _make_cartesia_tts()
        tts._settings["generation_config"] = None
        _set_cartesia_emotion(tts, "happy")  # Should not raise


# ---------------------------------------------------------------------------
# Emotion resolution
# ---------------------------------------------------------------------------

class TestEmotionResolution:
    def test_quick_observer_high_negative_takes_priority(self):
        session = {
            "_last_quick_analysis": FakeAnalysis(emotion_signals=[
                {"signal": "grief", "valence": "negative", "intensity": "high"},
                {"signal": "happy", "valence": "positive", "intensity": "medium"},
            ]),
            "_director_emotional_tone": "positive",
        }
        tts = _make_cartesia_tts()
        proc = EmotionTTSProcessor(session_state=session, tts=tts)
        assert proc._resolve_emotion() == "sympathetic"

    def test_quick_observer_high_positive_over_medium_negative(self):
        session = {
            "_last_quick_analysis": FakeAnalysis(emotion_signals=[
                {"signal": "worried", "valence": "negative", "intensity": "medium"},
                {"signal": "excited", "valence": "positive", "intensity": "high"},
            ]),
        }
        tts = _make_cartesia_tts()
        proc = EmotionTTSProcessor(session_state=session, tts=tts)
        assert proc._resolve_emotion() == "excited"

    def test_director_fallback_when_no_regex(self):
        session = {
            "_last_quick_analysis": FakeAnalysis(emotion_signals=[]),
            "_director_emotional_tone": "concerned",
        }
        tts = _make_cartesia_tts()
        proc = EmotionTTSProcessor(session_state=session, tts=tts)
        assert proc._resolve_emotion() == "sympathetic"

    def test_default_when_no_signals(self):
        session = {}
        tts = _make_cartesia_tts()
        proc = EmotionTTSProcessor(session_state=session, tts=tts)
        assert proc._resolve_emotion() == DEFAULT_EMOTION

    def test_medium_negative_over_medium_positive(self):
        session = {
            "_last_quick_analysis": FakeAnalysis(emotion_signals=[
                {"signal": "anxious", "valence": "negative", "intensity": "medium"},
                {"signal": "content", "valence": "positive", "intensity": "low"},
            ]),
        }
        tts = _make_cartesia_tts()
        proc = EmotionTTSProcessor(session_state=session, tts=tts)
        assert proc._resolve_emotion() == "calm"

    def test_lonely_maps_to_affectionate(self):
        session = {
            "_last_quick_analysis": FakeAnalysis(emotion_signals=[
                {"signal": "lonely", "valence": "negative", "intensity": "high"},
            ]),
        }
        tts = _make_cartesia_tts()
        proc = EmotionTTSProcessor(session_state=session, tts=tts)
        assert proc._resolve_emotion() == "affectionate"

    def test_director_positive_maps_to_happy(self):
        session = {
            "_director_emotional_tone": "positive",
        }
        tts = _make_cartesia_tts()
        proc = EmotionTTSProcessor(session_state=session, tts=tts)
        assert proc._resolve_emotion() == "happy"

    def test_disabled_for_elevenlabs(self):
        tts = _make_elevenlabs_tts()
        proc = EmotionTTSProcessor(session_state={}, tts=tts)
        assert proc._is_cartesia is False
