"""LLM-to-LLM voice simulation test infrastructure.

This package provides a framework for end-to-end simulation testing of the
Donna voice pipeline.  A "caller" LLM plays the role of an elderly senior
while the real pipeline (Observer -> Director -> Claude -> TTS) responds.

Key components:
- CallerEvent / CallResult: structured output from a simulated call
- ResponseCollector: FrameProcessor that captures pipeline output
- CallerTransport: protocol for injecting speech and receiving responses
"""

from tests.simulation.transport import (
    CallerEvent,
    CallerTransport,
    CallResult,
    ResponseCollector,
)

__all__ = [
    "CallerEvent",
    "CallerTransport",
    "CallResult",
    "ResponseCollector",
]
