"""Tests for TTS provider selection via feature flags."""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest


@pytest.fixture
def cartesia_env():
    """Set up env vars for Cartesia."""
    with patch.dict(os.environ, {
        "CARTESIA_API_KEY": "test-cartesia-key",
        "CARTESIA_VOICE_ID": "test-voice-id",
        "ELEVENLABS_API_KEY": "test-elevenlabs-key",
        "ELEVENLABS_VOICE_ID": "test-elevenlabs-voice",
    }):
        yield


def test_returns_elevenlabs_when_flag_is_elevenlabs(cartesia_env):
    """Flag set to elevenlabs selects ElevenLabs."""
    from bot import create_tts_service
    from pipecat.services.elevenlabs.tts import ElevenLabsTTSService

    session_state = {"_flags": {"tts_provider": "elevenlabs"}}
    tts = create_tts_service(session_state)
    assert isinstance(tts, ElevenLabsTTSService)


def test_returns_cartesia_when_flag_is_cartesia(cartesia_env):
    """Flag set to cartesia selects Cartesia."""
    from bot import create_tts_service
    from pipecat.services.cartesia.tts import CartesiaTTSService

    session_state = {"_flags": {"tts_provider": "cartesia"}}
    tts = create_tts_service(session_state)
    assert isinstance(tts, CartesiaTTSService)


def test_falls_back_to_elevenlabs_when_no_cartesia_key(cartesia_env):
    """Missing Cartesia API key falls back to ElevenLabs."""
    from bot import create_tts_service
    from pipecat.services.elevenlabs.tts import ElevenLabsTTSService

    with patch.dict(os.environ, {"CARTESIA_API_KEY": ""}):
        session_state = {"_flags": {"tts_provider": "cartesia"}}
        tts = create_tts_service(session_state)
        assert isinstance(tts, ElevenLabsTTSService)


def test_defaults_to_cartesia_when_no_flags(cartesia_env):
    """No flags resolved defaults to Cartesia (default provider)."""
    from bot import create_tts_service
    from pipecat.services.cartesia.tts import CartesiaTTSService

    session_state = {}  # No _flags key
    tts = create_tts_service(session_state)
    assert isinstance(tts, CartesiaTTSService)


def test_cartesia_uses_pcm_s16le_8khz(cartesia_env):
    """Cartesia outputs PCM so Pipecat's serializer handles mulaw conversion."""
    from bot import create_tts_service
    from pipecat.services.cartesia.tts import CartesiaTTSService

    session_state = {"_flags": {"tts_provider": "cartesia"}}
    tts = create_tts_service(session_state)
    assert isinstance(tts, CartesiaTTSService)
    assert tts._settings["output_format"]["encoding"] == "pcm_s16le"
    assert tts._settings["output_format"]["container"] == "raw"


def test_cartesia_uses_sonic3_model(cartesia_env):
    """Cartesia uses sonic-3 model."""
    from bot import create_tts_service

    session_state = {"_flags": {"tts_provider": "cartesia"}}
    tts = create_tts_service(session_state)
    assert tts.model_name == "sonic-3"


def test_cartesia_speed_configured(cartesia_env):
    """Cartesia generation config has speed=0.9 for elderly pacing."""
    from bot import create_tts_service

    session_state = {"_flags": {"tts_provider": "cartesia"}}
    tts = create_tts_service(session_state)
    gen_config = tts._settings.get("generation_config")
    assert gen_config is not None
    assert gen_config.speed == 0.9
