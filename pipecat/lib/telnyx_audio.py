"""Telnyx media-stream audio profile selection.

Donna's active Telnyx path is L16/16 kHz end-to-end at the telephony edge.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class TelnyxAudioProfile:
    codec: str
    sample_rate: int
    stream_track: str = "inbound_track"
    bidirectional_mode: str = "rtp"
    bidirectional_target_legs: str = "both"
    l16_input_byte_order: str = "little"
    l16_output_byte_order: str = "little"

    @property
    def uses_l16_serializer(self) -> bool:
        return self.codec == "L16" and self.sample_rate == 16000

    @property
    def label(self) -> str:
        return f"{self.codec}/{self.sample_rate}"


class TelnyxAudioProfileError(ValueError):
    """Raised for unsupported Telnyx media-stream audio profiles."""


DEFAULT_TELNYX_AUDIO_PROFILE = TelnyxAudioProfile(codec="L16", sample_rate=16000)

SUPPORTED_TELNYX_AUDIO_PROFILES = {
    ("L16", 16000),
}

SUPPORTED_TELNYX_STREAM_TRACKS = {"inbound_track", "outbound_track", "both_tracks"}
SUPPORTED_TELNYX_TARGET_LEGS = {"self", "opposite", "both"}
SUPPORTED_L16_BYTE_ORDERS = {"network", "little"}


def resolve_telnyx_audio_profile(cfg: Any) -> TelnyxAudioProfile:
    codec = str(getattr(cfg, "telnyx_stream_codec", "") or DEFAULT_TELNYX_AUDIO_PROFILE.codec).upper()
    sample_rate = int(getattr(cfg, "telnyx_stream_sample_rate", 0) or DEFAULT_TELNYX_AUDIO_PROFILE.sample_rate)
    stream_track = str(getattr(cfg, "telnyx_stream_track", "") or DEFAULT_TELNYX_AUDIO_PROFILE.stream_track)
    target_legs = str(
        getattr(cfg, "telnyx_bidirectional_target_legs", "")
        or DEFAULT_TELNYX_AUDIO_PROFILE.bidirectional_target_legs
    )
    l16_input_byte_order = str(
        getattr(cfg, "telnyx_l16_input_byte_order", "")
        or DEFAULT_TELNYX_AUDIO_PROFILE.l16_input_byte_order
    ).lower()
    l16_output_byte_order = str(
        getattr(cfg, "telnyx_l16_output_byte_order", "")
        or DEFAULT_TELNYX_AUDIO_PROFILE.l16_output_byte_order
    ).lower()

    if (codec, sample_rate) not in SUPPORTED_TELNYX_AUDIO_PROFILES:
        supported = ", ".join(f"{item[0]}/{item[1]}" for item in sorted(SUPPORTED_TELNYX_AUDIO_PROFILES))
        raise TelnyxAudioProfileError(
            f"Unsupported Telnyx audio profile {codec}/{sample_rate}. Supported profiles: {supported}"
        )
    if stream_track not in SUPPORTED_TELNYX_STREAM_TRACKS:
        raise TelnyxAudioProfileError(f"Unsupported Telnyx stream track {stream_track}")
    if target_legs not in SUPPORTED_TELNYX_TARGET_LEGS:
        raise TelnyxAudioProfileError(f"Unsupported Telnyx bidirectional target legs {target_legs}")
    if l16_input_byte_order not in SUPPORTED_L16_BYTE_ORDERS:
        raise TelnyxAudioProfileError(f"Unsupported Telnyx L16 input byte order {l16_input_byte_order}")
    if l16_output_byte_order not in SUPPORTED_L16_BYTE_ORDERS:
        raise TelnyxAudioProfileError(f"Unsupported Telnyx L16 output byte order {l16_output_byte_order}")

    return TelnyxAudioProfile(
        codec=codec,
        sample_rate=sample_rate,
        stream_track=stream_track,
        bidirectional_target_legs=target_legs,
        l16_input_byte_order=l16_input_byte_order,
        l16_output_byte_order=l16_output_byte_order,
    )
