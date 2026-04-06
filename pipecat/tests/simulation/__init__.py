"""LLM-to-LLM voice simulation test infrastructure.

This package provides a framework for end-to-end simulation testing of the
Donna voice pipeline.  A "caller" LLM plays the role of an elderly senior
while the real pipeline (Observer -> Director -> Claude -> TTS) responds.

Key components:
- CallerAgent / CallerPersona / CallerGoal: Haiku-powered caller simulation
- CallerEvent / CallResult: structured output from a simulated call
- ResponseCollector: FrameProcessor that captures pipeline output
- CallerTransport: protocol for injecting speech and receiving responses
- TestSenior / seed_test_senior / cleanup_test_senior: DB fixtures for integration tests
"""

from tests.simulation.caller import (
    CallerAgent,
    CallerGoal,
    CallerPersona,
)
from tests.simulation.fixtures import (
    TestSenior,
    build_session_state,
    cleanup_test_senior,
    create_test_conversation,
    seed_test_senior,
)
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
    "build_session_state",
    "cleanup_test_senior",
    "create_test_conversation",
    "seed_test_senior",
    "memory_recall_scenario",
    "memory_seed_scenario",
    "reminder_scenario",
    "web_search_scenario",
]
