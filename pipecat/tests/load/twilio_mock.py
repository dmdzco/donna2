"""Mock Twilio Media Stream WebSocket protocol.

Generates the JSON messages Twilio sends over its Media Stream WebSocket:
1. connected — WebSocket connected
2. start    — stream begins (includes streamSid, callSid, tracks, mediaFormat)
3. media    — base64-encoded 8kHz mulaw audio frames (~20ms each)
4. stop     — stream ends

Usage:
    mock = TwilioStreamMock(call_sid="CA123", duration_seconds=30)
    async for msg in mock.messages():
        await ws.send(msg)
"""

from __future__ import annotations

import asyncio
import base64
import json
import uuid


# 20ms of silence at 8kHz mulaw = 160 bytes of 0xFF
SILENCE_FRAME = base64.b64encode(b"\xff" * 160).decode("ascii")


class TwilioStreamMock:
    """Generate a realistic Twilio Media Stream message sequence."""

    def __init__(
        self,
        call_sid: str | None = None,
        duration_seconds: float = 30.0,
        frame_interval: float = 0.02,  # 20ms
        ws_token: str = "",
    ):
        self.call_sid = call_sid or f"CA{uuid.uuid4().hex[:32]}"
        self.stream_sid = f"MZ{uuid.uuid4().hex[:32]}"
        self.duration_seconds = duration_seconds
        self.frame_interval = frame_interval
        self.ws_token = ws_token
        self._sequence_number = 0

    def _connected_msg(self) -> str:
        return json.dumps({
            "event": "connected",
            "protocol": "Call",
            "version": "1.0.0",
        })

    def _start_msg(self) -> str:
        return json.dumps({
            "event": "start",
            "sequenceNumber": "1",
            "start": {
                "streamSid": self.stream_sid,
                "accountSid": "ACtest",
                "callSid": self.call_sid,
                "tracks": ["inbound"],
                "mediaFormat": {
                    "encoding": "audio/x-mulaw",
                    "sampleRate": 8000,
                    "channels": 1,
                },
                "customParameters": {
                    "senior_id": "load-test-senior",
                    "call_sid": self.call_sid,
                    "conversation_id": "",
                    "call_type": "check-in",
                    "ws_token": self.ws_token,
                },
            },
            "streamSid": self.stream_sid,
        })

    def _media_msg(self) -> str:
        self._sequence_number += 1
        return json.dumps({
            "event": "media",
            "sequenceNumber": str(self._sequence_number),
            "media": {
                "track": "inbound",
                "chunk": str(self._sequence_number),
                "timestamp": str(int(self._sequence_number * self.frame_interval * 1000)),
                "payload": SILENCE_FRAME,
            },
            "streamSid": self.stream_sid,
        })

    def _stop_msg(self) -> str:
        return json.dumps({
            "event": "stop",
            "sequenceNumber": str(self._sequence_number + 1),
            "stop": {
                "accountSid": "ACtest",
                "callSid": self.call_sid,
            },
            "streamSid": self.stream_sid,
        })

    async def messages(self):
        """Async generator yielding Twilio Media Stream messages."""
        yield self._connected_msg()
        yield self._start_msg()

        num_frames = int(self.duration_seconds / self.frame_interval)
        for _ in range(num_frames):
            yield self._media_msg()
            await asyncio.sleep(self.frame_interval)

        yield self._stop_msg()
