"""Goodbye detection scenarios -- strong, false, and delayed goodbye."""

from tests.scenarios.base import CallScenario, ScenarioUtterance, ScenarioSeniorProfile


FALSE_GOODBYE_SCENARIO = CallScenario(
    name="false_goodbye",
    description="Senior says goodbye but then continues talking (false goodbye).",
    utterances=[
        ScenarioUtterance(
            speaker="senior",
            text="Hello Donna!",
            delay_seconds=0.3,
        ),
        ScenarioUtterance(
            speaker="senior",
            text="Alright, goodbye... Oh wait, I forgot to tell you something!",
            delay_seconds=0.3,
            expect_goodbye=True,
        ),
        ScenarioUtterance(
            speaker="senior",
            text="My doctor's appointment went well yesterday.",
            delay_seconds=0.3,
            expect_guidance_keyword="HEALTH",
        ),
        ScenarioUtterance(
            speaker="senior",
            text="Okay now I really have to go. Bye bye, take care!",
            delay_seconds=0.5,
            expect_goodbye=True,
        ),
    ],
    expect_end_frame=True,
)


STRONG_GOODBYE_SCENARIO = CallScenario(
    name="strong_goodbye",
    description="Senior says a clear strong goodbye -- call should end quickly.",
    utterances=[
        ScenarioUtterance(
            speaker="senior",
            text="Hello!",
            delay_seconds=0.3,
        ),
        ScenarioUtterance(
            speaker="senior",
            text="Goodbye Donna, talk to you tomorrow!",
            delay_seconds=0.3,
            expect_goodbye=True,
        ),
    ],
    expect_end_frame=True,
)
