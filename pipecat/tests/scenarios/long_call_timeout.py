"""Long call timeout scenario.

Normal conversation that simulates exceeding the time limit.
Tests Director's FORCE_END_MINUTES triggering _delayed_end() → EndFrame.
"""

import re
from tests.scenarios.base import (
    CallScenario,
    ScenarioUtterance,
    ScenarioSeniorProfile,
)
from tests.mocks.mock_llm import ScriptedResponse


LONG_CALL_TIMEOUT_SCENARIO = CallScenario(
    name="long_call_timeout",
    description="Conversation exceeds time limit, Director forces end.",
    senior=ScenarioSeniorProfile(
        name="Margaret Johnson",
        interests=["gardening", "cooking", "grandchildren"],
    ),
    utterances=[
        ScenarioUtterance(
            speaker="senior",
            text="Hello Donna! I'm doing great today.",
            delay_seconds=0.3,
        ),
        ScenarioUtterance(
            speaker="senior",
            text="I've been so busy today with the garden and cooking.",
            delay_seconds=0.3,
        ),
        ScenarioUtterance(
            speaker="senior",
            text="Let me tell you about the new recipe I tried.",
            delay_seconds=0.3,
        ),
    ],
    # No goodbye utterance — Director forces end via timeout
    expect_topics=["cooking"],
    expect_end_frame=True,
    max_duration_seconds=15.0,
)


LONG_CALL_TIMEOUT_LLM_RESPONSES = [
    ScriptedResponse(
        trigger=re.compile(r"doing.*(great|well|fine|good)", re.I),
        response="That's wonderful, Margaret! What have you been up to?",
    ),
    ScriptedResponse(
        trigger=re.compile(r"busy|garden|cooking", re.I),
        response="Sounds like a productive day! Tell me more!",
    ),
    ScriptedResponse(
        trigger=re.compile(r"recipe|tried", re.I),
        response="Oh I'd love to hear about it! What did you make?",
    ),
]
