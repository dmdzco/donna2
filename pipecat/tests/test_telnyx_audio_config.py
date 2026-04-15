import os
from unittest.mock import patch

import pytest

from api.routes.telnyx import (
    TELNYX_STREAM_CODEC,
    TELNYX_STREAM_SAMPLE_RATE,
    _telnyx_stream_options,
)
from bot import (
    TELNYX_REQUIRED_CODEC,
    TELNYX_REQUIRED_SAMPLE_RATE,
    TelnyxAudioConfigError,
    _create_telephony_serializer,
)
from config import Settings
from serializers.telnyx import DonnaTelnyxFrameSerializer


def test_telnyx_stream_options_are_always_l16_16k():
    with patch.dict(
        os.environ,
        {
            "PIPECAT_PUBLIC_URL": "https://pipecat.example.test",
            "TELNYX_STREAM_CODEC": "PCMU",
            "TELNYX_STREAM_SAMPLE_RATE": "8000",
        },
    ):
        options = _telnyx_stream_options("test-token")

    assert TELNYX_STREAM_CODEC == "L16"
    assert TELNYX_STREAM_SAMPLE_RATE == 16000
    assert options["stream_codec"] == "L16"
    assert options["stream_bidirectional_mode"] == "rtp"
    assert options["stream_bidirectional_codec"] == "L16"
    assert options["stream_bidirectional_sampling_rate"] == 16000
    assert options["stream_url"].startswith("wss://pipecat.example.test/ws?")


def test_telnyx_serializer_is_l16_16k_for_matching_start_frame():
    serializer = _create_telephony_serializer(
        transport_type="telnyx",
        call_data={"outbound_encoding": "L16"},
        stream_sid="stream-1",
        call_sid="v3:call-control",
        cfg=Settings(telnyx_api_key="test-key"),
    )

    assert TELNYX_REQUIRED_CODEC == "L16"
    assert TELNYX_REQUIRED_SAMPLE_RATE == 16000
    assert isinstance(serializer, DonnaTelnyxFrameSerializer)
    assert serializer._params.inbound_encoding == "L16"
    assert serializer._params.outbound_encoding == "L16"
    assert serializer._params.telnyx_sample_rate == 16000


def test_telnyx_serializer_refuses_pcmu_start_frame():
    with pytest.raises(TelnyxAudioConfigError, match="requires L16/16000Hz"):
        _create_telephony_serializer(
            transport_type="telnyx",
            call_data={"outbound_encoding": "PCMU"},
            stream_sid="stream-1",
            call_sid="v3:call-control",
            cfg=Settings(telnyx_api_key="test-key"),
        )
