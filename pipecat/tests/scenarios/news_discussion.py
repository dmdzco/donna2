"""News discussion scenario.

Senior asks about current events, discusses news, then says goodbye.
Tests NEWS pattern detection and needs_web_search flag.
"""

import re
from tests.scenarios.base import (
    CallScenario,
    ScenarioUtterance,
    ScenarioSeniorProfile,
)
from tests.mocks.mock_llm import ScriptedResponse


NEWS_DISCUSSION_SCENARIO = CallScenario(
    name="news_discussion",
    description="Senior asks about news, discusses current events, goodbye.",
    senior=ScenarioSeniorProfile(
        name="Margaret Johnson",
        interests=["gardening", "cooking", "current events"],
    ),
    utterances=[
        ScenarioUtterance(
            speaker="senior",
            text="Good morning Donna! I'm doing well.",
            delay_seconds=0.3,
        ),
        ScenarioUtterance(
            speaker="senior",
            text="Have you heard what's in the news today? Anything interesting going on?",
            delay_seconds=0.5,
            expect_guidance_keyword="NEWS",
        ),
        ScenarioUtterance(
            speaker="senior",
            text="Oh that's interesting! I always like to keep up with what's happening in the world.",
            delay_seconds=0.5,
        ),
        ScenarioUtterance(
            speaker="senior",
            text="Well thank you Donna. Bye bye!",
            delay_seconds=0.5,
            expect_goodbye=True,
        ),
    ],
    expect_topics=["news"],
    expect_end_frame=True,
)


NEWS_DISCUSSION_LLM_RESPONSES = [
    ScriptedResponse(
        trigger=re.compile(r"doing.*(well|fine|good)", re.I),
        response="Glad to hear it, Margaret! What's on your mind today?",
    ),
    ScriptedResponse(
        trigger=re.compile(r"news|happening|world|current events", re.I),
        response="Let me check the latest news for you! There's been some interesting developments today.",
    ),
    ScriptedResponse(
        trigger=re.compile(r"interesting|keep up", re.I),
        response="It's great that you stay informed! Is there anything else you'd like to chat about?",
    ),
    ScriptedResponse(
        trigger=re.compile(r"goodbye|bye|thank you", re.I),
        response="Bye bye, Margaret! Have a wonderful day!",
    ),
]
