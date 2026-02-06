"""Run this to verify all Pipecat APIs the migration depends on exist."""

checks = []

# Transport
try:
    from pipecat.transports.websocket.fastapi import FastAPIWebsocketTransport, FastAPIWebsocketParams
    checks.append(("FastAPIWebsocketTransport", "OK"))
except ImportError as e:
    checks.append(("FastAPIWebsocketTransport", f"FAIL: {e}"))

# Serializer
try:
    from pipecat.serializers.twilio import TwilioFrameSerializer
    checks.append(("TwilioFrameSerializer", "OK"))
except ImportError as e:
    checks.append(("TwilioFrameSerializer", f"FAIL: {e}"))

# Services
try:
    from pipecat.services.anthropic.llm import AnthropicLLMService
    checks.append(("AnthropicLLMService", "OK"))
except ImportError as e:
    checks.append(("AnthropicLLMService", f"FAIL: {e}"))

try:
    from pipecat.services.deepgram.stt import DeepgramSTTService
    checks.append(("DeepgramSTTService", "OK"))
except ImportError as e:
    checks.append(("DeepgramSTTService", f"FAIL: {e}"))

try:
    from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
    checks.append(("ElevenLabsTTSService", "OK"))
except ImportError as e:
    checks.append(("ElevenLabsTTSService", f"FAIL: {e}"))

# VAD
try:
    from pipecat.audio.vad.silero import SileroVADAnalyzer
    from pipecat.audio.vad.vad_analyzer import VADParams
    checks.append(("SileroVADAnalyzer + VADParams", "OK"))
except ImportError as e:
    checks.append(("SileroVADAnalyzer + VADParams", f"FAIL: {e}"))

# Frames
try:
    from pipecat.frames.frames import TranscriptionFrame, TextFrame
    checks.append(("TranscriptionFrame + TextFrame", "OK"))
except ImportError as e:
    checks.append(("TranscriptionFrame + TextFrame", f"FAIL: {e}"))

# Check if LLMMessagesAppendFrame exists
try:
    from pipecat.frames.frames import LLMMessagesAppendFrame
    checks.append(("LLMMessagesAppendFrame", "OK"))
except ImportError:
    try:
        from pipecat.frames.frames import LLMMessagesUpdateFrame
        checks.append(("LLMMessagesAppendFrame", "FAIL - use LLMMessagesUpdateFrame instead"))
    except ImportError:
        checks.append(("LLMMessagesAppendFrame", "FAIL - neither AppendFrame nor UpdateFrame found"))

# Pipeline
try:
    from pipecat.pipeline.pipeline import Pipeline
    from pipecat.pipeline.runner import PipelineRunner
    from pipecat.pipeline.task import PipelineParams, PipelineTask
    checks.append(("Pipeline + Runner + Task", "OK"))
except ImportError as e:
    checks.append(("Pipeline + Runner + Task", f"FAIL: {e}"))

# Runner utils
try:
    from pipecat.runner.utils import parse_telephony_websocket
    checks.append(("parse_telephony_websocket", "OK"))
except ImportError as e:
    checks.append(("parse_telephony_websocket", f"FAIL: {e}"))

# Context aggregators
try:
    from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
    checks.append(("LLMContextAggregatorPair", "OK"))
except ImportError as e:
    checks.append(("LLMContextAggregatorPair", f"FAIL: {e}"))

# Function schema
try:
    from pipecat.adapters.schemas.function_schema import FunctionSchema
    checks.append(("FunctionSchema", "OK"))
except ImportError as e:
    checks.append(("FunctionSchema", f"FAIL: {e}"))

# Flows
try:
    from pipecat_flows import FlowManager, NodeConfig, FlowsFunctionSchema
    checks.append(("FlowManager + NodeConfig + FlowsFunctionSchema", "OK"))
except ImportError as e:
    checks.append(("FlowManager + NodeConfig + FlowsFunctionSchema", f"FAIL: {e}"))

try:
    from pipecat_flows import ContextStrategy, ContextStrategyConfig
    checks.append(("ContextStrategy + ContextStrategyConfig", "OK"))
except ImportError as e:
    checks.append(("ContextStrategy + ContextStrategyConfig", f"FAIL: {e}"))

# LLM tool registration
try:
    llm = AnthropicLLMService.__new__(AnthropicLLMService)
    has_register = hasattr(llm, 'register_function')
    has_context = hasattr(llm, 'set_function_call_context')
    checks.append(("register_function", "OK" if has_register else "FAIL - method not found"))
    checks.append(("set_function_call_context", "OK" if has_context else "FAIL - method not found (expected, use closures)"))
except Exception as e:
    checks.append(("LLM tool registration", f"FAIL: {e}"))

# Deepgram LiveOptions
try:
    from deepgram import LiveOptions
    checks.append(("Deepgram LiveOptions", "OK"))
except ImportError:
    try:
        from deepgram import DeepgramClientOptions
        checks.append(("Deepgram LiveOptions", "FAIL - use DeepgramClientOptions instead"))
    except ImportError:
        checks.append(("Deepgram LiveOptions", "FAIL - no options class found"))

# FrameProcessor (base class for custom processors)
try:
    from pipecat.processors.frame_processor import FrameProcessor
    checks.append(("FrameProcessor (base class)", "OK"))
except ImportError as e:
    checks.append(("FrameProcessor (base class)", f"FAIL: {e}"))

# Additional frame types we'll need
try:
    from pipecat.frames.frames import Frame, SystemFrame, InterimTranscriptionFrame
    checks.append(("Frame + SystemFrame + InterimTranscriptionFrame", "OK"))
except ImportError as e:
    checks.append(("Frame + SystemFrame + InterimTranscriptionFrame", f"FAIL: {e}"))

print("\n=== Pipecat API Compatibility Check ===\n")
for name, status in checks:
    icon = "OK" if status == "OK" else "!!"
    print(f"  [{icon}] {name}: {status}")

fails = [c for c in checks if c[1] != "OK"]
expected_fails = [c for c in fails if "expected" in c[1].lower()]
real_fails = [c for c in fails if "expected" not in c[1].lower()]
print(f"\nTotal checks: {len(checks)}")
print(f"Passed: {len(checks) - len(fails)}")
print(f"Expected failures: {len(expected_fails)}")
print(f"Unexpected failures: {len(real_fails)}")
if real_fails:
    print(f"\nUNEXPECTED FAILURES - update plan before proceeding:")
    for name, status in real_fails:
        print(f"  - {name}: {status}")
else:
    print("\nALL CRITICAL CHECKS PASSED - safe to proceed with migration")
