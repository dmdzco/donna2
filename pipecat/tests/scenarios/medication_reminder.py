"""Medication reminder call scenario.

Senior receives a reminder call, acknowledges medication,
discusses health briefly, then says goodbye.
"""

import re
from tests.scenarios.base import (
    CallScenario,
    ScenarioUtterance,
    ScenarioSeniorProfile,
    ScenarioReminder,
)
from tests.mocks.mock_llm import ScriptedResponse


MEDICATION_REMINDER_SCENARIO = CallScenario(
    name="medication_reminder",
    description="Reminder call: senior acknowledges medication, health discussion, goodbye.",
    senior=ScenarioSeniorProfile(
        name="Margaret Johnson",
        interests=["gardening", "cooking", "grandchildren"],
        medical_notes="Type 2 diabetes, metformin 500mg with dinner",
    ),
    call_type="reminder",
    greeting="Good evening, Margaret! I just wanted to check in with you.",
    reminders=[
        ScenarioReminder(
            id="rem-metformin",
            title="Take metformin",
            description="500mg with dinner",
        ),
    ],
    utterances=[
        ScenarioUtterance(
            speaker="senior",
            text="Hello Donna! Yes I'm just having dinner now.",
            delay_seconds=0.3,
        ),
        ScenarioUtterance(
            speaker="senior",
            text="Oh yes, I already took my metformin, thank you for reminding me.",
            delay_seconds=0.5,
            expect_guidance_keyword="HEALTH",
        ),
        ScenarioUtterance(
            speaker="senior",
            text="My blood sugar has been pretty good this week actually.",
            delay_seconds=0.5,
            expect_guidance_keyword="HEALTH",
        ),
        ScenarioUtterance(
            speaker="senior",
            text="Alright dear, I'll let you go. Goodbye!",
            delay_seconds=0.5,
            expect_goodbye=True,
        ),
    ],
    expect_topics=["cooking"],
    expect_end_frame=True,
)


MEDICATION_REMINDER_LLM_RESPONSES = [
    ScriptedResponse(
        trigger=re.compile(r"dinner|eating", re.I),
        response="Oh good, I hope you're enjoying your meal! By the way, have you had a chance to take your metformin with dinner?",
    ),
    ScriptedResponse(
        trigger=re.compile(r"metformin|took.*medication|already took", re.I),
        response="Wonderful, Margaret! I'm glad you're staying on top of it.",
    ),
    ScriptedResponse(
        trigger=re.compile(r"blood sugar|good this week", re.I),
        response="That's great news! Sounds like you're doing a wonderful job managing things.",
    ),
    ScriptedResponse(
        trigger=re.compile(r"goodbye|bye|let you go", re.I),
        response="Goodbye Margaret! Enjoy the rest of your evening!",
    ),
]
