"""WebSocket pipeline load test.

Simulates concurrent Twilio Media Stream WebSocket connections.
Each user:
1. POSTs /voice/answer to get TwiML
2. Connects to /ws
3. Sends Twilio connected + start + media frames
4. Holds connection for configurable duration
5. Sends stop

Requires LOAD_TEST_MODE=true on the target server to swap real
STT/LLM/TTS for mock processors.

Run:
    cd pipecat
    uv run locust -f tests/load/locustfile_ws.py \
        --host=https://donna-pipecat-staging.up.railway.app \
        --headless -u 50 -r 5 -t 120s
"""

import os
import time
import uuid

from locust import HttpUser, task, between, events

import websocket  # websocket-client (sync)

from tests.load.conftest import DEFAULT_CALL_DURATION_S


class TwilioCallUser(HttpUser):
    """Simulates a single Twilio call: POST /voice/answer then WebSocket."""

    wait_time = between(5, 15)  # seconds between calls

    @task
    def make_call(self):
        call_sid = f"CA{uuid.uuid4().hex[:32]}"
        start = time.time()

        # Step 1: POST /voice/answer
        try:
            resp = self.client.post(
                "/voice/answer",
                data={
                    "CallSid": call_sid,
                    "From": "+15551234567",
                    "To": "+15559876543",
                    "Direction": "inbound",
                },
            )
            if resp.status_code != 200:
                events.request.fire(
                    request_type="WS", name="voice_answer",
                    response_time=(time.time() - start) * 1000,
                    response_length=0,
                    exception=Exception(f"HTTP {resp.status_code}"),
                )
                return
        except Exception as e:
            events.request.fire(
                request_type="WS", name="voice_answer",
                response_time=(time.time() - start) * 1000,
                response_length=0, exception=e,
            )
            return

        # Step 2: Connect WebSocket
        ws_url = self.host.replace("https://", "wss://").replace("http://", "ws://") + "/ws"
        ws_start = time.time()

        try:
            ws = websocket.create_connection(ws_url, timeout=10)
        except Exception as e:
            events.request.fire(
                request_type="WS", name="ws_connect",
                response_time=(time.time() - ws_start) * 1000,
                response_length=0, exception=e,
            )
            return

        events.request.fire(
            request_type="WS", name="ws_connect",
            response_time=(time.time() - ws_start) * 1000,
            response_length=0, exception=None,
        )

        # Step 3: Send Twilio protocol messages
        import json
        import base64

        stream_sid = f"MZ{uuid.uuid4().hex[:32]}"
        silence = base64.b64encode(b"\xff" * 160).decode("ascii")

        try:
            # connected
            ws.send(json.dumps({"event": "connected", "protocol": "Call", "version": "1.0.0"}))

            # start
            ws.send(json.dumps({
                "event": "start",
                "sequenceNumber": "1",
                "start": {
                    "streamSid": stream_sid,
                    "accountSid": "ACtest",
                    "callSid": call_sid,
                    "tracks": ["inbound"],
                    "mediaFormat": {"encoding": "audio/x-mulaw", "sampleRate": 8000, "channels": 1},
                    "customParameters": {
                        "senior_id": "load-test",
                        "call_sid": call_sid,
                        "conversation_id": "",
                        "call_type": "check-in",
                    },
                },
                "streamSid": stream_sid,
            }))

            # media frames (20ms interval, configurable duration)
            duration = int(os.getenv("LOAD_TEST_CALL_DURATION", str(DEFAULT_CALL_DURATION_S)))
            num_frames = duration * 50  # 50 frames per second at 20ms
            for seq in range(2, num_frames + 2):
                ws.send(json.dumps({
                    "event": "media",
                    "sequenceNumber": str(seq),
                    "media": {
                        "track": "inbound",
                        "chunk": str(seq),
                        "timestamp": str(seq * 20),
                        "payload": silence,
                    },
                    "streamSid": stream_sid,
                }))
                # Don't sleep per frame in load test — blast them
                if seq % 500 == 0:
                    time.sleep(0.01)  # Tiny yield to avoid CPU spin

            # stop
            ws.send(json.dumps({
                "event": "stop",
                "sequenceNumber": str(num_frames + 2),
                "stop": {"accountSid": "ACtest", "callSid": call_sid},
                "streamSid": stream_sid,
            }))

            elapsed = (time.time() - ws_start) * 1000
            events.request.fire(
                request_type="WS", name="full_call",
                response_time=elapsed, response_length=0, exception=None,
            )

        except Exception as e:
            elapsed = (time.time() - ws_start) * 1000
            events.request.fire(
                request_type="WS", name="full_call",
                response_time=elapsed, response_length=0, exception=e,
            )
        finally:
            try:
                ws.close()
            except Exception:
                pass
