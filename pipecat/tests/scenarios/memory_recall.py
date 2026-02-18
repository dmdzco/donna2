"""Memory recall scenario.

Senior references a past conversation topic, discusses grandchildren.
Tests HEALTH (memory_mention) and FAMILY pattern detection.
"""

import re
from tests.scenarios.base import (
    CallScenario,
    ScenarioUtterance,
    ScenarioSeniorProfile,
)
from tests.mocks.mock_llm import ScriptedResponse


MEMORY_RECALL_SCENARIO = CallScenario(
    name="memory_recall",
    description="Senior references past conversation, discusses grandchildren.",
    senior=ScenarioSeniorProfile(
        name="Margaret Johnson",
        interests=["gardening", "cooking", "grandchildren"],
    ),
    utterances=[
        ScenarioUtterance(
            speaker="senior",
            text="Hello Donna! Do you remember what we talked about last time?",
            delay_seconds=0.3,
        ),
        ScenarioUtterance(
            speaker="senior",
            text="I told you about my grandson Jake's soccer game. Well, his team won the championship!",
            delay_seconds=0.5,
        ),
        ScenarioUtterance(
            speaker="senior",
            text="My granddaughter Emma also started piano lessons. She's only six but she's doing so well.",
            delay_seconds=0.5,
        ),
        ScenarioUtterance(
            speaker="senior",
            text="Oh and I've been having some trouble with my knee again. The doctor said it's just arthritis.",
            delay_seconds=0.5,
            expect_guidance_keyword="HEALTH",
        ),
        ScenarioUtterance(
            speaker="senior",
            text="Well, I should go. Goodbye Donna!",
            delay_seconds=0.5,
            expect_goodbye=True,
        ),
    ],
    expect_topics=["grandchildren", "health"],
    expect_end_frame=True,
)


MEMORY_RECALL_LLM_RESPONSES = [
    ScriptedResponse(
        trigger=re.compile(r"remember|last time|talked about", re.I),
        response="Of course! You were telling me about Jake's soccer. How did it go?",
    ),
    ScriptedResponse(
        trigger=re.compile(r"jake|soccer|championship|won", re.I),
        response="How wonderful! You must be so proud of Jake! A championship win is amazing!",
    ),
    ScriptedResponse(
        trigger=re.compile(r"emma|piano|lessons|six", re.I),
        response="Oh how exciting! Piano is a wonderful instrument. Emma sounds like a bright young girl!",
    ),
    ScriptedResponse(
        trigger=re.compile(r"knee|arthritis|doctor|trouble", re.I),
        response="I'm sorry to hear about your knee. Arthritis can be uncomfortable. Are you managing the pain okay?",
    ),
    ScriptedResponse(
        trigger=re.compile(r"goodbye|bye|should go", re.I),
        response="Take care Margaret! Give my best to Jake and Emma. Goodbye!",
    ),
]
