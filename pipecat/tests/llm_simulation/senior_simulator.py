"""
Senior Simulator — LLM-powered elderly person for reactive conversation testing.

Uses Claude Haiku 4.5 to role-play as an elderly person during test calls with Donna.
Receives Donna's responses and generates natural elderly-person replies.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field

import anthropic


@dataclass
class SeniorPersona:
    """Profile of the simulated elderly person."""

    name: str = "Margaret Johnson"
    age: int = 78
    interests: list[str] = field(
        default_factory=lambda: ["gardening", "cooking", "grandchildren"]
    )
    medical_notes: str = "Type 2 diabetes, mild arthritis"
    personality: str = "Warm, chatty, occasionally forgetful"
    living_situation: str = "Lives alone in a house"
    family: str = "Grandson Jake, daughter Susan"


# Patterns that indicate the senior has said goodbye and the conversation is over.
_GOODBYE_PATTERNS = re.compile(
    r"\b("
    r"goodbye|bye[\s\-]?bye|take care|talk (?:to you |)(?:later|soon|next time)"
    r"|have a (?:good|nice|wonderful) (?:day|evening|night|one)"
    r"|i(?:'ll| will) let you go"
    r"|it was (?:nice|good|lovely) (?:talking|chatting)"
    r")\b",
    re.IGNORECASE,
)


def _build_system_prompt(persona: SeniorPersona, scenario_instructions: str) -> str:
    """Build the system prompt that makes the LLM behave like an elderly person."""
    interests_str = ", ".join(persona.interests)

    prompt = f"""\
You are role-playing as {persona.name}, a {persona.age}-year-old person receiving a phone call from Donna, an AI companion.

ABOUT YOU:
- Name: {persona.name}, age {persona.age}
- Interests: {interests_str}
- Health: {persona.medical_notes}
- Personality: {persona.personality}
- Living situation: {persona.living_situation}
- Family: {persona.family}

HOW TO SPEAK:
- Talk like a real elderly person on the phone — natural, unpolished, conversational.
- Keep responses SHORT: 1-3 sentences max. This is a phone call, not an essay.
- Use simple vocabulary and short sentences.
- Reference your interests and family naturally when relevant.
- Sometimes ramble a little or go slightly off-topic, like a real person.
- Occasionally repeat yourself, pause ("well..."), or say "hmm" / "oh" / "let me think".
- You can mishear things once in a while ("Did you say Tuesday? Oh, Thursday.").
- Don't be too perfect or too articulate. Real people um and ah.
- React genuinely to what Donna says — laugh, express surprise, share feelings.
- Do NOT narrate actions or use asterisks. Only produce spoken dialogue.

IMPORTANT RULES:
- Never break character. You ARE {persona.name}.
- Never mention that you are an AI, a simulator, or playing a role.
- Only output what you would actually SAY on the phone. No stage directions."""

    if scenario_instructions:
        prompt += f"""

SCENARIO INSTRUCTIONS (follow these for this particular call):
{scenario_instructions}"""

    return prompt


class SeniorSimulator:
    """LLM-powered elderly person simulator for reactive conversation testing."""

    def __init__(
        self,
        persona: SeniorPersona | None = None,
        scenario_instructions: str = "",
        max_turns: int = 10,
        model: str = "claude-haiku-4-5-20251001",
    ):
        self._persona = persona or SeniorPersona()
        self._scenario_instructions = scenario_instructions
        self._max_turns = max_turns
        self._model = model
        self._messages: list[dict[str, str]] = []
        self._system_prompt = _build_system_prompt(
            self._persona, self._scenario_instructions
        )
        self._ended = False

        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY environment variable is required for SeniorSimulator"
            )
        self._client = anthropic.AsyncAnthropic(api_key=api_key)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def opening_line(self) -> str:
        """Generate the senior's first utterance (e.g. picking up the phone)."""
        # The senior picks up and says hello — there's no prior Donna message.
        self._messages.append(
            {
                "role": "user",
                "content": (
                    "[The phone rings and you pick up. "
                    "Say hello like you normally would when answering.]"
                ),
            }
        )

        reply = await self._call_llm()
        self._messages.append({"role": "assistant", "content": reply})
        return reply

    async def respond(self, donna_said: str) -> str | None:
        """Generate the senior's next reply based on what Donna said.

        Returns:
            The senior's spoken response, or None if the conversation has ended
            (the senior said goodbye or max turns reached).
        """
        if self._ended:
            return None

        # Check if we've hit the turn limit.
        if self.turn_count >= self._max_turns:
            self._ended = True
            return None

        self._messages.append({"role": "user", "content": donna_said})

        reply = await self._call_llm()
        self._messages.append({"role": "assistant", "content": reply})

        # Detect if the senior just said goodbye.
        if _GOODBYE_PATTERNS.search(reply):
            self._ended = True

        return reply

    @property
    def conversation_history(self) -> list[dict[str, str]]:
        """Full conversation history for observer evaluation.

        Returns list of dicts with "role" (user=donna, assistant=senior)
        and "content" keys.
        """
        return list(self._messages)

    @property
    def turn_count(self) -> int:
        """Number of completed senior turns (assistant messages)."""
        return sum(1 for m in self._messages if m["role"] == "assistant")

    @property
    def persona(self) -> SeniorPersona:
        return self._persona

    @property
    def ended(self) -> bool:
        return self._ended

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _call_llm(self) -> str:
        """Send messages to Claude Haiku and return the text response."""
        try:
            response = await self._client.messages.create(
                model=self._model,
                max_tokens=200,
                system=self._system_prompt,
                messages=self._messages,
            )
            text = response.content[0].text.strip()
            # Strip any accidental quotation marks wrapping the entire response.
            if text.startswith('"') and text.endswith('"'):
                text = text[1:-1].strip()
            return text
        except anthropic.APIError as exc:
            raise RuntimeError(
                f"SeniorSimulator LLM call failed: {exc}"
            ) from exc
