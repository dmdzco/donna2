"""Telnyx WebSocket serializer for Donna's L16/16 kHz path.

Pipecat 0.0.101's built-in Telnyx serializer is narrowband-oriented. Donna's
Telnyx path requires L16/16 kHz so the core pipeline can stay linear PCM until
the provider edge.
"""

from __future__ import annotations

import audioop
import base64
import json
from typing import Optional

import aiohttp
from loguru import logger
from pydantic import BaseModel

from pipecat.audio.dtmf.types import KeypadEntry
from pipecat.audio.utils import (
    create_stream_resampler,
)
from pipecat.frames.frames import (
    AudioRawFrame,
    CancelFrame,
    EndFrame,
    Frame,
    InputAudioRawFrame,
    InputDTMFFrame,
    InterruptionFrame,
    StartFrame,
)
from pipecat.serializers.base_serializer import FrameSerializer


class DonnaTelnyxFrameSerializer(FrameSerializer):
    """Serialize Donna audio frames to Telnyx media-stream WebSocket messages."""

    class InputParams(BaseModel):
        telnyx_sample_rate: int = 16000
        sample_rate: Optional[int] = None
        inbound_encoding: str = "L16"
        outbound_encoding: str = "L16"
        l16_input_byte_order: str = "little"
        l16_output_byte_order: str = "little"
        auto_hang_up: bool = True

    def __init__(
        self,
        stream_id: str,
        outbound_encoding: str,
        inbound_encoding: str,
        call_control_id: Optional[str] = None,
        api_key: Optional[str] = None,
        params: Optional[InputParams] = None,
    ):
        self._stream_id = stream_id
        self._call_control_id = call_control_id
        self._api_key = api_key
        self._params = params or DonnaTelnyxFrameSerializer.InputParams()
        self._params.outbound_encoding = outbound_encoding.upper()
        self._params.inbound_encoding = inbound_encoding.upper()
        if self._params.outbound_encoding != "L16" or self._params.inbound_encoding != "L16":
            raise ValueError("Donna Telnyx serializer only supports L16/16000Hz")
        if self._params.telnyx_sample_rate != 16000:
            raise ValueError("Donna Telnyx serializer requires 16000Hz")
        if self._params.l16_input_byte_order not in {"network", "little"}:
            raise ValueError("Donna Telnyx serializer L16 input byte order must be network or little")
        if self._params.l16_output_byte_order not in {"network", "little"}:
            raise ValueError("Donna Telnyx serializer L16 output byte order must be network or little")

        self._telnyx_sample_rate = self._params.telnyx_sample_rate
        self._sample_rate = 0
        self._input_resampler = create_stream_resampler()
        self._output_resampler = create_stream_resampler()
        self._hangup_attempted = False
        self._logged_output_audio = False
        self._logged_input_audio = False

    async def setup(self, frame: StartFrame):
        self._sample_rate = self._params.sample_rate or frame.audio_in_sample_rate

    async def serialize(self, frame: Frame) -> str | bytes | None:
        if (
            self._params.auto_hang_up
            and not self._hangup_attempted
            and isinstance(frame, (EndFrame, CancelFrame))
        ):
            self._hangup_attempted = True
            await self._hang_up_call()
            return None

        if isinstance(frame, InterruptionFrame):
            return json.dumps({"event": "clear"})

        if not isinstance(frame, AudioRawFrame):
            return None

        serialized_data = await self._encode_audio(frame.audio, frame.sample_rate)
        if not serialized_data:
            return None
        if not self._logged_output_audio:
            self._logged_output_audio = True
            input_ms = round((len(frame.audio) / 2) / frame.sample_rate * 1000)
            wire_ms = round((len(serialized_data) / 2) / self._telnyx_sample_rate * 1000)
            logger.info(
                "[{cid}] Telnyx output audio frame input_rate={input_rate}Hz input_ms={input_ms} "
                "wire_rate={wire_rate}Hz wire_ms={wire_ms} wire_bytes={wire_bytes} byte_order={byte_order} "
                "rtp_header=false",
                cid=self._call_control_id or "unknown",
                input_rate=frame.sample_rate,
                input_ms=input_ms,
                wire_rate=self._telnyx_sample_rate,
                wire_ms=wire_ms,
                wire_bytes=len(serialized_data),
                byte_order=self._params.l16_output_byte_order,
            )

        return json.dumps(
            {
                "event": "media",
                "media": {
                    "payload": base64.b64encode(serialized_data).decode("utf-8"),
                },
            }
        )

    async def deserialize(self, data: str | bytes) -> Frame | None:
        message = json.loads(data)
        event = message.get("event")

        if event == "media":
            payload_base64 = (message.get("media") or {}).get("payload", "")
            payload = base64.b64decode(payload_base64)
            deserialized_data = await self._decode_audio(payload)
            if not deserialized_data:
                return None
            if not self._logged_input_audio:
                self._logged_input_audio = True
                wire_ms = round((len(payload) / 2) / self._telnyx_sample_rate * 1000)
                pipeline_ms = round((len(deserialized_data) / 2) / self._sample_rate * 1000)
                logger.info(
                    "[{cid}] Telnyx input audio frame wire_rate={wire_rate}Hz wire_ms={wire_ms} "
                    "pipeline_rate={pipeline_rate}Hz pipeline_ms={pipeline_ms} wire_bytes={wire_bytes} "
                    "byte_order={byte_order}",
                    cid=self._call_control_id or "unknown",
                    wire_rate=self._telnyx_sample_rate,
                    wire_ms=wire_ms,
                    pipeline_rate=self._sample_rate,
                    pipeline_ms=pipeline_ms,
                    wire_bytes=len(payload),
                    byte_order=self._params.l16_input_byte_order,
                )
            return InputAudioRawFrame(
                audio=deserialized_data,
                num_channels=1,
                sample_rate=self._sample_rate,
            )

        if event == "dtmf":
            digit = (message.get("dtmf") or {}).get("digit")
            try:
                return InputDTMFFrame(KeypadEntry(digit))
            except ValueError:
                return None

        return None

    async def _encode_audio(self, pcm_bytes: bytes, in_rate: int) -> bytes | None:
        encoding = self._params.inbound_encoding
        if encoding == "L16":
            resampled = await self._output_resampler.resample(
                pcm_bytes,
                in_rate,
                self._telnyx_sample_rate,
            )
            if self._params.l16_output_byte_order == "little":
                return resampled
            # Telnyx media messages carry an RTP payload, not a full RTP packet.
            # RTP L16 normally uses network byte order; Pipecat PCM frames are
            # signed 16-bit little-endian.
            return audioop.byteswap(resampled, 2)

        raise ValueError(f"Unsupported Telnyx inbound encoding: {encoding}")

    async def _decode_audio(self, payload: bytes) -> bytes | None:
        encoding = self._params.outbound_encoding
        if encoding == "L16":
            if len(payload) % 2 != 0:
                logger.warning("Dropping malformed L16 Telnyx payload with odd byte length")
                return None
            pcm = payload if self._params.l16_input_byte_order == "little" else audioop.byteswap(payload, 2)
            return await self._input_resampler.resample(
                pcm,
                self._telnyx_sample_rate,
                self._sample_rate,
            )

        raise ValueError(f"Unsupported Telnyx outbound encoding: {encoding}")

    async def _hang_up_call(self) -> None:
        if not self._call_control_id or not self._api_key:
            logger.warning("Cannot hang up Telnyx call: missing call_control_id or api_key")
            return

        endpoint = f"https://api.telnyx.com/v2/calls/{self._call_control_id}/actions/hangup"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._api_key}",
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(endpoint, headers=headers) as response:
                    if response.status == 200:
                        logger.info("Successfully terminated Telnyx call {cid}", cid=self._call_control_id)
                        return

                    if response.status == 422:
                        try:
                            error_data = await response.json()
                            if any(
                                error.get("code") == "90018"
                                for error in error_data.get("errors", [])
                            ):
                                logger.debug("Telnyx call {cid} already ended", cid=self._call_control_id)
                                return
                        except Exception:
                            pass

                    error_text = await response.text()
                    logger.error(
                        "Failed to terminate Telnyx call {cid}: status={status} response={response}",
                        cid=self._call_control_id,
                        status=response.status,
                        response=error_text[:200],
                    )
        except Exception as exc:
            logger.error("Failed to hang up Telnyx call: {err}", err=str(exc))
