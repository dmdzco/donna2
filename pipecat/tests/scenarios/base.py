"""Call scenario definitions for Level 3 tests."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ScenarioUtterance:
    """A single utterance in a call scenario."""
    speaker: str                          # "senior" or "donna"
    text: str
    delay_seconds: float = 0.5           # Pause before this utterance
    expect_phase: str | None = None       # Expected call phase after this utterance
    expect_tool_call: str | None = None   # Expected tool call name
    expect_goodbye: bool = False          # Should trigger goodbye detection
    expect_guidance_keyword: str | None = None  # Keyword in Quick Observer guidance


@dataclass
class ScenarioSeniorProfile:
    """Senior profile for a test scenario."""
    id: str = "senior-test-001"
    name: str = "Margaret Johnson"
    interests: list[str] = field(default_factory=lambda: ["gardening", "cooking"])
    medical_notes: str = "Type 2 diabetes"
    timezone: str = "America/New_York"


@dataclass
class ScenarioReminder:
    """A medication reminder for a test scenario."""
    id: str = "rem-001"
    title: str = "Take metformin"
    description: str = "500mg with dinner"


@dataclass
class CallScenario:
    """Complete definition of a call test scenario."""
    name: str
    description: str
    senior: ScenarioSeniorProfile = field(default_factory=ScenarioSeniorProfile)
    call_type: str = "check-in"
    greeting: str = "Good morning, Margaret! How are you today?"
    reminders: list[ScenarioReminder] = field(default_factory=list)
    utterances: list[ScenarioUtterance] = field(default_factory=list)
    expect_end_frame: bool = True
    expect_topics: list[str] = field(default_factory=list)
    max_duration_seconds: float = 10.0

    def to_session_state(self) -> dict:
        """Convert scenario into a session_state dict."""
        state = {
            "senior_id": self.senior.id,
            "senior": {
                "id": self.senior.id,
                "name": self.senior.name,
                "interests": self.senior.interests,
                "medical_notes": self.senior.medical_notes,
                "timezone": self.senior.timezone,
            },
            "memory_context": None,
            "greeting": self.greeting,
            "reminder_prompt": None,
            "reminder_delivery": None,
            "reminders_delivered": set(),
            "conversation_id": "conv-test-001",
            "call_sid": "CA-test-001",
            "call_type": self.call_type,
            "previous_calls_summary": None,
            "todays_context": None,
            "_transcript": [],
        }

        if self.reminders:
            r = self.reminders[0]
            state["call_type"] = "reminder"
            state["reminder_prompt"] = (
                f"MEDICATION REMINDER: {self.senior.name} needs to {r.title}. "
                f"{r.description}. Deliver naturally."
            )
            state["reminder_delivery"] = {
                "id": f"delivery-{r.id}",
                "reminder_id": r.id,
                "title": r.title,
                "description": r.description,
            }
            state["_pending_reminders"] = [
                {"id": rem.id, "title": rem.title, "description": rem.description}
                for rem in self.reminders
            ]

        return state
