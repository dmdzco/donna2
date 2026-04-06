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
from tests.simulation.pipeline import (
    LiveSimComponents,
    build_live_sim_pipeline,
)
from tests.simulation.runner import run_simulated_call
from tests.simulation.transport import (
    AudioCallerTransport,
    CallerEvent,
    CallerTransport,
    CallResult,
    ResponseCollector,
    TextCallerTransport,
)

__all__ = [
    "AudioCallerTransport",
    "CallerAgent",
    "CallerGoal",
    "CallerPersona",
    "CallerEvent",
    "CallerTransport",
    "CallResult",
    "LiveSimComponents",
    "LiveSimScenario",
    "ResponseCollector",
    "TestSenior",
    "TextCallerTransport",
    "build_live_sim_pipeline",
    "build_session_state",
    "cleanup_test_senior",
    "create_test_conversation",
    "run_simulated_call",
    "seed_test_senior",
    "memory_recall_scenario",
    "memory_seed_scenario",
    "reminder_scenario",
    "web_search_scenario",
]
