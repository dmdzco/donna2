"""Emotional support scenario.

Senior expresses loneliness and grief, receives empathetic responses,
then transitions to a positive memory. Tests EMOTION pattern detection.
"""

import re
from tests.scenarios.base import (
    CallScenario,
    ScenarioUtterance,
    ScenarioSeniorProfile,
)
from tests.mocks.mock_llm import ScriptedResponse


EMOTIONAL_SUPPORT_SCENARIO = CallScenario(
    name="emotional_support",
    description="Senior expresses loneliness and grief, receives empathetic responses.",
    senior=ScenarioSeniorProfile(
        name="Margaret Johnson",
        interests=["gardening", "cooking", "grandchildren"],
        medical_notes="Type 2 diabetes. Husband Harold passed 2023.",
    ),
    utterances=[
        ScenarioUtterance(
            speaker="senior",
            text="Hi Donna. I'm okay I suppose.",
            delay_seconds=0.3,
        ),
        ScenarioUtterance(
            speaker="senior",
            text="I've been feeling quite lonely lately. The house is so quiet without Harold.",
            delay_seconds=0.5,
            expect_guidance_keyword="EMOTION",
        ),
        ScenarioUtterance(
            speaker="senior",
            text="I miss him so much. We used to sit on the porch together every evening.",
            delay_seconds=0.5,
            expect_guidance_keyword="EMOTION",
        ),
        ScenarioUtterance(
            speaker="senior",
            text="But you know, my daughter Sarah called yesterday and that cheered me up.",
            delay_seconds=0.5,
        ),
        ScenarioUtterance(
            speaker="senior",
            text="Alright Donna, thank you for listening. Goodbye dear.",
            delay_seconds=0.5,
            expect_goodbye=True,
        ),
    ],
    expect_topics=["family", "emotions"],
    expect_end_frame=True,
)


EMOTIONAL_SUPPORT_LLM_RESPONSES = [
    ScriptedResponse(
        trigger=re.compile(r"okay.*suppose|not.*great", re.I),
        response="I'm here for you, Margaret. Would you like to talk about what's on your mind?",
    ),
    ScriptedResponse(
        trigger=re.compile(r"lonely|quiet|without.*harold", re.I),
        response="I'm so sorry you're feeling that way, Margaret. It's completely natural to miss Harold.",
    ),
    ScriptedResponse(
        trigger=re.compile(r"miss.*him|porch|together", re.I),
        response="That sounds like such a beautiful memory. Those quiet moments together are so precious.",
    ),
    ScriptedResponse(
        trigger=re.compile(r"daughter|sarah|called|cheered", re.I),
        response="Oh how wonderful that Sarah called! It's so nice to have family who cares.",
    ),
    ScriptedResponse(
        trigger=re.compile(r"goodbye|bye|thank you.*listening", re.I),
        response="It was lovely talking with you, Margaret. Remember, I'm always here. Goodbye!",
    ),
]
