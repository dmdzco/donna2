"""LLM-to-LLM voice simulation test infrastructure.

This package provides a framework for end-to-end simulation testing of the
Donna voice pipeline.  A "caller" LLM plays the role of an elderly senior
while the real pipeline (Observer -> Director -> Claude -> TTS) responds.

Key components:
- CallerAgent / CallerPersona / CallerGoal: Haiku-powered caller simulation
- CallerEvent / CallResult: structured output from a simulated call
- ResponseCollector: FrameProcessor that captures pipeline output
- CallerTransport: protocol for injecting speech and receiving responses
"""

from tests.simulation.caller import (
    CallerAgent,
    CallerGoal,
    CallerPersona,
)
from tests.simulation.fixtures import TestSenior
from tests.simulation.scenarios import (
    LiveSimScenario,
    memory_recall_scenario,
    memory_seed_scenario,
    reminder_scenario,
    web_search_scenario,
)
from tests.simulation.transport import (
    CallerEvent,
    CallerTransport,
    CallResult,
    ResponseCollector,
    TextCallerTransport,
)

__all__ = [
    "CallerAgent",
    "CallerGoal",
    "CallerPersona",
    "CallerEvent",
    "CallerTransport",
    "CallResult",
    "LiveSimScenario",
    "ResponseCollector",
    "TestSenior",
    "TextCallerTransport",
    "memory_recall_scenario",
    "memory_seed_scenario",
    "reminder_scenario",
    "web_search_scenario",
]
