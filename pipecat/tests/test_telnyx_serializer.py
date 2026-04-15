import base64
import json
import struct

import pytest

from pipecat.frames.frames import OutputAudioRawFrame, StartFrame
from serializers.telnyx import DonnaTelnyxFrameSerializer


def test_telnyx_serializer_rejects_narrowband_codecs():
    with pytest.raises(ValueError, match="only supports L16"):
        DonnaTelnyxFrameSerializer(
            stream_id="stream-1",
            call_control_id="v2:test",
            outbound_encoding="PCMU",
            inbound_encoding="PCMU",
            api_key="test-key",
        )


@pytest.mark.asyncio
async def test_telnyx_l16_serializer_keeps_pcm_until_wire_boundary():
    serializer = DonnaTelnyxFrameSerializer(
        stream_id="stream-1",
        call_control_id="v2:test",
        outbound_encoding="L16",
        inbound_encoding="L16",
        api_key="test-key",
        params=DonnaTelnyxFrameSerializer.InputParams(telnyx_sample_rate=16000),
    )
    await serializer.setup(StartFrame(audio_in_sample_rate=16000, audio_out_sample_rate=48000))

    frame = OutputAudioRawFrame(
        audio=b"\x01\x02\x03\x04",
        sample_rate=16000,
        num_channels=1,
    )

    serialized = await serializer.serialize(frame)
    payload = base64.b64decode(json.loads(serialized)["media"]["payload"])

    assert len(payload) == 16
    version_payload_type, payload_type, sequence, timestamp, ssrc = struct.unpack("!BBHII", payload[:12])
    assert version_payload_type == 0x80
    assert payload_type == 96
    assert sequence >= 0
    assert timestamp >= 0
    assert ssrc > 0
    assert payload[12:] == b"\x02\x01\x04\x03"


@pytest.mark.asyncio
async def test_telnyx_l16_deserializer_restores_pipeline_pcm_endianness():
    serializer = DonnaTelnyxFrameSerializer(
        stream_id="stream-1",
        call_control_id="v2:test",
        outbound_encoding="L16",
        inbound_encoding="L16",
        api_key="test-key",
        params=DonnaTelnyxFrameSerializer.InputParams(telnyx_sample_rate=16000),
    )
    await serializer.setup(StartFrame(audio_in_sample_rate=16000, audio_out_sample_rate=48000))

    frame = await serializer.deserialize(
        json.dumps(
            {
                "event": "media",
                "media": {"payload": base64.b64encode(b"\x02\x01\x04\x03").decode()},
            }
        )
    )

    assert frame.audio == b"\x01\x02\x03\x04"
    assert frame.sample_rate == 16000
