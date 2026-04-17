import os
from unittest.mock import patch

import pytest

from api.routes.telnyx import _telnyx_stream_options
from bot import (
    TelnyxAudioConfigError,
    _create_telephony_serializer,
)
from config import Settings
from lib.telnyx_audio import resolve_telnyx_audio_profile
from serializers.telnyx import DonnaTelnyxFrameSerializer


def test_telnyx_stream_options_default_to_l16_16k():
    with patch.dict(
        os.environ,
        {
            "PIPECAT_PUBLIC_URL": "https://pipecat.example.test",
            "TELNYX_STREAM_CODEC": "L16",
            "TELNYX_STREAM_SAMPLE_RATE": "16000",
        },
    ):
        options = _telnyx_stream_options("test-token")

    assert options["stream_codec"] == "L16"
    assert options["stream_track"] == "inbound_track"
    assert options["stream_bidirectional_mode"] == "rtp"
    assert options["stream_bidirectional_codec"] == "L16"
    assert options["stream_bidirectional_sampling_rate"] == 16000
    assert options["stream_bidirectional_target_legs"] == "both"
    assert options["stream_auth_token"] == "test-token"
    assert options["stream_url"].startswith("wss://pipecat.example.test/ws?")


def test_telnyx_stream_options_support_target_leg_override():
    with patch.dict(
        os.environ,
        {
            "PIPECAT_PUBLIC_URL": "https://pipecat.example.test",
            "TELNYX_STREAM_CODEC": "L16",
            "TELNYX_STREAM_SAMPLE_RATE": "16000",
            "TELNYX_BIDIRECTIONAL_TARGET_LEGS": "self",
        },
    ):
        options = _telnyx_stream_options("test-token")

    assert options["stream_bidirectional_target_legs"] == "self"


def test_telnyx_serializer_is_l16_16k_for_matching_start_frame():
    serializer = _create_telephony_serializer(
        transport_type="telnyx",
        call_data={"outbound_encoding": "L16"},
        stream_sid="stream-1",
        call_sid="v3:call-control",
        cfg=Settings(telnyx_api_key="test-key", telnyx_stream_codec="L16", telnyx_stream_sample_rate=16000),
    )

    assert isinstance(serializer, DonnaTelnyxFrameSerializer)
    assert serializer._params.inbound_encoding == "L16"
    assert serializer._params.outbound_encoding == "L16"
    assert serializer._params.telnyx_sample_rate == 16000


def test_telnyx_serializer_refuses_mismatched_start_frame():
    with pytest.raises(TelnyxAudioConfigError, match="configured for L16/16000"):
        _create_telephony_serializer(
            transport_type="telnyx",
            call_data={"outbound_encoding": "PCMU"},
            stream_sid="stream-1",
            call_sid="v3:call-control",
            cfg=Settings(telnyx_api_key="test-key", telnyx_stream_codec="L16", telnyx_stream_sample_rate=16000),
        )


def test_telnyx_profile_rejects_unsupported_codec_rate_pair():
    with pytest.raises(ValueError, match="Unsupported Telnyx audio profile"):
        resolve_telnyx_audio_profile(
            Settings(telnyx_api_key="test-key", telnyx_stream_codec="L16", telnyx_stream_sample_rate=8000)
        )


def test_telnyx_profile_rejects_unsupported_target_legs():
    with pytest.raises(ValueError, match="Unsupported Telnyx bidirectional target legs"):
        resolve_telnyx_audio_profile(
            Settings(
                telnyx_api_key="test-key",
                telnyx_stream_codec="L16",
                telnyx_stream_sample_rate=16000,
                telnyx_bidirectional_target_legs="caller",
            )
        )


def test_telnyx_profile_accepts_little_endian_l16_output():
    profile = resolve_telnyx_audio_profile(
        Settings(
            telnyx_api_key="test-key",
            telnyx_stream_codec="L16",
            telnyx_stream_sample_rate=16000,
            telnyx_l16_output_byte_order="little",
        )
    )

    assert profile.l16_output_byte_order == "little"


def test_telnyx_profile_accepts_little_endian_l16_input():
    profile = resolve_telnyx_audio_profile(
        Settings(
            telnyx_api_key="test-key",
            telnyx_stream_codec="L16",
            telnyx_stream_sample_rate=16000,
            telnyx_l16_input_byte_order="little",
        )
    )

    assert profile.l16_input_byte_order == "little"
