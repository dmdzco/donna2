# Archived Twilio Voice Implementation

This directory keeps the last Twilio voice-call implementation as reference
code. It is not imported or mounted by the active application.

Archived files:

- `node_index_twilio_bootstrap.js` - Node startup that initialized a Twilio
  voice client for outbound calls.
- `node_routes_calls_twilio.js` - Node `/api/call` and call-end route with the
  Twilio outbound branch.
- `node_scheduler_twilio.js` - Node scheduler path that created reminder and
  welfare calls through Twilio.
- `pipecat_voice_twilio.py` - Pipecat `/voice/answer` and `/voice/status`
  Twilio webhook implementation.
- `pipecat_calls_twilio.py` - Pipecat REST call route that created Twilio
  outbound calls.
- `pipecat_scheduler_twilio.py` - Pipecat opt-in scheduler path that created
  Twilio reminder calls.
- `pipecat_twilio_middleware.py` - Twilio webhook signature verifier.

Use Git history as the source of truth if this reference ever needs to be
restored. The active production voice path is Telnyx.
