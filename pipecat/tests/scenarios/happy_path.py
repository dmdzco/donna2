"""Happy path check-in call scenario."""

import re
from tests.scenarios.base import (
    CallScenario,
    ScenarioUtterance,
    ScenarioSeniorProfile,
)
from tests.mocks.mock_llm import ScriptedResponse


HAPPY_PATH_SCENARIO = CallScenario(
    name="happy_path_checkin",
    description="Normal check-in call. Margaret is in good spirits, talks about gardening.",
    senior=ScenarioSeniorProfile(
        name="Margaret Johnson",
        interests=["gardening", "cooking", "grandchildren"],
    ),
    utterances=[
        ScenarioUtterance(
            speaker="senior",
            text="Oh hello Donna! I'm doing just fine today.",
            delay_seconds=0.3,
        ),
        ScenarioUtterance(
            speaker="senior",
            text="I was out in the garden this morning, the roses are blooming beautifully.",
            delay_seconds=0.5,
            expect_guidance_keyword="ACTIVITY",
        ),
        ScenarioUtterance(
            speaker="senior",
            text="My grandson Jake is coming to visit this weekend, I'm so excited!",
            delay_seconds=0.5,
        ),
        ScenarioUtterance(
            speaker="senior",
            text="Well it was lovely talking to you Donna. Goodbye!",
            delay_seconds=0.5,
            expect_goodbye=True,
        ),
    ],
    expect_topics=["gardening", "grandchildren"],
    expect_end_frame=True,
)


HAPPY_PATH_LLM_RESPONSES = [
    ScriptedResponse(
        trigger=re.compile(r"doing.*(fine|well|good|great)", re.I),
        response="That's wonderful to hear, Margaret! What have you been up to today?",
    ),
    ScriptedResponse(
        trigger=re.compile(r"garden|roses|bloom", re.I),
        response="Oh how lovely! Your roses must be gorgeous this time of year. What colors are they?",
    ),
    ScriptedResponse(
        trigger=re.compile(r"grandson|jake|visit|weekend|excited", re.I),
        response="How exciting! It will be so nice to have Jake visit. What are you planning to do together?",
    ),
    ScriptedResponse(
        trigger=re.compile(r"goodbye|bye|lovely talking", re.I),
        response="It was wonderful talking with you too, Margaret! Enjoy the rest of your day. Goodbye!",
    ),
]
