"""CallerAgent — Haiku LLM wrapper that role-plays an elderly caller.

The CallerAgent uses Claude Haiku (fast, cheap) to simulate an elderly person
on a phone call with Donna.  It maintains conversation history, tracks goal
completion, and knows when to end the call.

The agent is deliberately simple: it takes Donna's text output, feeds it to
Haiku with a persona-aware system prompt, and returns the caller's next
spoken utterance.  It does not know about the pipeline — higher-level
orchestration (``CallSimRunner``) wires it to the transport layer.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import anthropic
from loguru import logger


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class CallerPersona:
    """Identity and speaking style for the simulated caller.

    Attributes:
        name: Full name used in conversation.
        age: Approximate age (affects speech patterns).
        personality: Character traits and interests.
        speech_style: How the persona talks — cadence, vocabulary, quirks.
    """

    name: str = "Margaret Johnson"
    age: int = 78
    personality: str = (
        "Warm, chatty, occasionally forgetful. Loves gardening and family."
    )
    speech_style: str = (
        "Natural elderly speech — uses 'dear', pauses with 'well...', "
        "short sentences."
    )


@dataclass
class CallerGoal:
    """A single conversational objective for the caller to accomplish.

    Attributes:
        description: What to do (e.g. "Ask about the weather").
        trigger_phrase: Optional specific phrase to use verbatim.
        completed: Whether this goal has been accomplished.
    """

    description: str
    trigger_phrase: str = ""
    completed: bool = False


# ---------------------------------------------------------------------------
# CallerAgent
# ---------------------------------------------------------------------------


class CallerAgent:
    """Haiku-powered agent that plays the role of an elderly caller.

    Constructor args:
        persona: The caller's identity and speaking style.
        goals: Ordered list of conversational objectives.
        model: Anthropic model to use (default: Haiku for speed/cost).

    Usage::

        agent = CallerAgent(
            persona=CallerPersona(),
            goals=[CallerGoal(description="Ask about the weather")],
        )
        response = agent.generate_response("Good morning Margaret!")
    """

    MAX_TURNS = 20

    def __init__(
        self,
        persona: CallerPersona,
        goals: list[CallerGoal],
        model: str = "claude-haiku-4-5-20251001",
    ):
        self.persona = persona
        self.goals = goals
        self.model = model
        self._client = anthropic.Anthropic()
        self._history: list[dict[str, str]] = []
        self._turn_count = 0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate_response(self, donna_text: str) -> str:
        """Generate the caller's next utterance in response to Donna.

        Appends Donna's text to the conversation history, calls Haiku with
        the persona system prompt, and returns the caller's spoken words.

        If ``MAX_TURNS`` has been reached, the agent generates a goodbye
        regardless of remaining goals.

        Args:
            donna_text: What Donna just said.

        Returns:
            The caller's next spoken utterance (plain text, no stage
            directions).
        """
        self._turn_count += 1

        # Add Donna's line to history
        self._history.append({"role": "user", "content": f"Donna: {donna_text}"})

        system_prompt = self._build_system_prompt()

        logger.debug(
            "CallerAgent turn {}: sending {} history messages to {}",
            self._turn_count,
            len(self._history),
            self.model,
        )

        response = self._client.messages.create(
            model=self.model,
            max_tokens=150,
            system=system_prompt,
            messages=self._history,
        )

        caller_text = response.content[0].text.strip()

        # Add caller's response to history
        self._history.append({"role": "assistant", "content": caller_text})

        # Check if any goal was completed this turn
        self._check_goal_completion(caller_text, donna_text)

        logger.debug(
            "CallerAgent turn {}: goals {}/{} completed | response: {}",
            self._turn_count,
            sum(1 for g in self.goals if g.completed),
            len(self.goals),
            caller_text[:80],
        )

        return caller_text

    # ------------------------------------------------------------------
    # System prompt
    # ------------------------------------------------------------------

    def _build_system_prompt(self) -> str:
        """Build the system prompt with persona details and goal tracking.

        The prompt instructs Haiku to stay in character, pursue goals
        naturally, and keep responses short.  Completed goals are marked
        so the LLM knows to move on.
        """
        # Format goals with numbering and completion status
        goal_lines: list[str] = []
        for i, goal in enumerate(self.goals, 1):
            status = "[DONE]" if goal.completed else "[TODO]"
            line = f"  {i}. {status} {goal.description}"
            if goal.trigger_phrase and not goal.completed:
                line += f' (try to say: "{goal.trigger_phrase}")'
            goal_lines.append(line)
        goals_block = "\n".join(goal_lines)

        # Safety valve: force goodbye when MAX_TURNS reached
        turn_warning = ""
        if self._turn_count >= self.MAX_TURNS:
            turn_warning = (
                "\n\nIMPORTANT: You have reached the maximum number of "
                "exchanges. You MUST say goodbye NOW — wrap up immediately "
                "with a warm farewell."
            )

        return (
            f"You are {self.persona.name}, a {self.persona.age}-year-old.\n"
            f"Personality: {self.persona.personality}\n"
            f"Speech style: {self.persona.speech_style}\n"
            f"\n"
            f"You are on a phone call with Donna, an AI companion who calls "
            f"you regularly. You are the CALLER (the senior being called).\n"
            f"\n"
            f"Your goals for this call (complete them naturally, one per "
            f"1-2 exchanges):\n"
            f"{goals_block}\n"
            f"\n"
            f"Rules:\n"
            f"- Stay in character at all times\n"
            f"- Keep responses SHORT (1-3 sentences)\n"
            f"- Complete goals naturally through conversation, not abruptly\n"
            f"- When all goals are [DONE], say goodbye within 1-2 more "
            f"exchanges\n"
            f"- Never mention 'goals' or 'testing' — this is a real call\n"
            f"- Output ONLY your spoken words — no stage directions, no "
            f"parentheticals, no quotation marks\n"
            f"- Do not start your response with your name"
            f"{turn_warning}"
        )

    # ------------------------------------------------------------------
    # Goal completion tracking
    # ------------------------------------------------------------------

    def _check_goal_completion(
        self, caller_text: str, donna_text: str
    ) -> None:
        """Mark at most one goal as completed per turn via keyword matching.

        Extracts significant words (4+ chars) from the goal description,
        checks what fraction appear in the combined caller + donna text,
        and marks the goal completed if >50% match.  Only the first
        matching incomplete goal is marked per call to avoid rushing.

        Args:
            caller_text: What the caller just said.
            donna_text: What Donna said this turn (triggers may appear in
                either side of the conversation).
        """
        combined = (caller_text + " " + donna_text).lower()

        for goal in self.goals:
            if goal.completed:
                continue

            # Extract significant words from the goal description
            words = re.findall(r"[a-z]{4,}", goal.description.lower())
            if not words:
                continue

            matches = sum(1 for w in words if w in combined)
            ratio = matches / len(words)

            if ratio > 0.5:
                goal.completed = True
                logger.debug(
                    "CallerAgent: goal completed ({:.0%} match): {}",
                    ratio,
                    goal.description,
                )
                # Only mark one goal per turn
                return

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def all_goals_completed(self) -> bool:
        """Whether every goal has been marked as completed."""
        return all(g.completed for g in self.goals)

    @property
    def should_end_call(self) -> bool:
        """Whether the caller should wrap up the conversation.

        True when all goals are completed OR the safety turn limit has
        been reached.
        """
        return self.all_goals_completed or self._turn_count >= self.MAX_TURNS

    @property
    def turn_count(self) -> int:
        """Number of exchanges completed so far."""
        return self._turn_count
