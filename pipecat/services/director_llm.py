"""Conversation Director — Layer 2 LLM analysis.

Primary: Cerebras (~3000 tok/s, OpenAI-compatible) for ultra-fast analysis.
Fallback: Gemini Flash (~150ms) when Cerebras is unavailable.

Results are cached and injected into the LLM context by
ConversationDirectorProcessor. Speculative analysis during silence gaps
enables same-turn guidance injection.

Not in the blocking path — called asynchronously from the processor.
"""

from __future__ import annotations

import asyncio
import json
import os
import random
import re
import time

from loguru import logger

from lib.circuit_breaker import CircuitBreaker

# ---------------------------------------------------------------------------
# Circuit breakers
# ---------------------------------------------------------------------------

_gemini_breaker = CircuitBreaker(
    "gemini_director", failure_threshold=3, recovery_timeout=60.0, call_timeout=10.0
)
_cerebras_breaker = CircuitBreaker(
    "cerebras_director", failure_threshold=3, recovery_timeout=60.0, call_timeout=5.0
)
_cerebras_speculative_breaker = CircuitBreaker(
    "cerebras_speculative", failure_threshold=2, recovery_timeout=30.0, call_timeout=3.0
)
_groq_breaker = CircuitBreaker(
    "groq_director", failure_threshold=3, recovery_timeout=60.0, call_timeout=5.0
)
_groq_speculative_breaker = CircuitBreaker(
    "groq_speculative", failure_threshold=2, recovery_timeout=30.0, call_timeout=3.0
)

# ---------------------------------------------------------------------------
# Client singletons
# ---------------------------------------------------------------------------

_genai_client = None
_cerebras_client = None
_groq_client = None

DIRECTOR_MODEL = os.environ.get("FAST_OBSERVER_MODEL", "gemini-3-flash-preview")
CEREBRAS_MODEL = os.environ.get("CEREBRAS_DIRECTOR_MODEL", "gpt-oss-120b")
GROQ_MODEL = os.environ.get("GROQ_DIRECTOR_MODEL", "openai/gpt-oss-20b")
CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1"
GROQ_BASE_URL = "https://api.groq.com/openai/v1"


def _get_gemini_client():
    global _genai_client
    if _genai_client is None:
        api_key = os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            logger.warning("GOOGLE_API_KEY not set — Gemini Director disabled")
            return None
        from google import genai

        _genai_client = genai.Client(api_key=api_key)
    return _genai_client


def _get_cerebras_client():
    global _cerebras_client
    if _cerebras_client is None:
        api_key = os.environ.get("CEREBRAS_API_KEY")
        if not api_key:
            return None
        from openai import AsyncOpenAI

        _cerebras_client = AsyncOpenAI(api_key=api_key, base_url=CEREBRAS_BASE_URL)
    return _cerebras_client


def _get_groq_client():
    global _groq_client
    if _groq_client is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            return None
        from openai import AsyncOpenAI

        _groq_client = AsyncOpenAI(api_key=api_key, base_url=GROQ_BASE_URL)
    return _groq_client


def cerebras_available() -> bool:
    """Check if Cerebras is configured (has API key)."""
    return bool(os.environ.get("CEREBRAS_API_KEY"))


def groq_available() -> bool:
    """Check if Groq is configured (has API key)."""
    return bool(os.environ.get("GROQ_API_KEY"))


def fast_provider_available() -> bool:
    """Check if any fast inference provider is configured."""
    return cerebras_available() or groq_available()


def _pick_fast_provider() -> str | None:
    """Randomly pick between available fast providers for A/B testing."""
    available = []
    if cerebras_available():
        available.append("cerebras")
    if groq_available():
        available.append("groq")
    if not available:
        return None
    return random.choice(available)


# ---------------------------------------------------------------------------
# JSON repair (ported from fast-observer.js)
# ---------------------------------------------------------------------------


def _repair_json(text: str) -> str:
    """Repair common JSON issues from truncated/malformed LLM responses."""
    repaired = re.sub(r",\s*([}\]])", r"\1", text)
    repaired += "]" * max(0, repaired.count("[") - repaired.count("]"))
    repaired += "}" * max(0, repaired.count("{") - repaired.count("}"))
    repaired = re.sub(r",\s*([}\]])", r"\1", repaired)
    return repaired


def _extract_and_parse_json(text: str) -> dict | None:
    """Extract JSON from LLM response text, with repair fallback."""
    text = text.strip()
    if not text:
        return None

    if "```" in text:
        text = re.sub(r"```json?\n?", "", text)
        text = text.replace("```", "").strip()

    json_match = re.search(r"\{[\s\S]*\}", text)
    if json_match:
        text = json_match.group(0)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        text = _repair_json(text)
        return json.loads(text)


# ---------------------------------------------------------------------------
# System prompt (ported from DIRECTOR_SYSTEM_PROMPT in fast-observer.js)
# ---------------------------------------------------------------------------

# Static instructions — passed as system_instruction (separated from per-turn content)
DIRECTOR_SYSTEM_INSTRUCTION = """\
You direct Donna, an AI companion calling elderly individuals. Analyze the conversation and return JSON guidance.

## RULES
Phases: opening (0-30s) → main (30s-8min) → winding_down (8-9min) → closing (9-10min). If past 30s and still opening, set to "main".
Reminders: deliver at natural pauses with high engagement. NEVER during emotional moments or low engagement. Never repeat delivered.
Low engagement: suggest personal questions, memories, open-ended prompts.
News: only when engagement medium+ and topic winding down, never during emotional moments.
Caregiver notes: suggest during natural pauses if available.

## ONBOARDING CALLS (call_type = "onboarding")
For onboarding calls with unsubscribed callers, use different phases: welcome (0-60s) → discovery (60s-8min) → closing (8-10min).
Focus on: caller engagement level, interest in the service, readiness to learn more.
Do NOT suggest reminders — there are none for onboarding calls.
Do NOT suggest caregiver notes — not applicable.
Do NOT use RE-ENGAGE or topic shift signals — the caller is exploring the service, not a subscriber.
Set reminder.should_deliver to false always.
Priority actions should focus on: ENCOURAGE_DISCOVERY (ask about their loved one), ANSWER_QUESTION (they have a concern), DEMONSTRATE_VALUE (show what Donna can do), WRAP_UP (at 8+ min).
Force close at 12 min (same as subscriber calls).

## PREFETCH (help Donna respond faster)
Extract topics/entities from the senior's speech for memory search. Predict factual questions they might ask next.
memory_queries: 1-3 keyword phrases from the current message (names, places, topics, activities mentioned). Extract what they're TALKING ABOUT, not generic categories.
web_queries: 0-1 factual questions the senior is likely to ask next (only if they seem curious about facts, events, weather, "how to" topics). Empty array if no question anticipated.
anticipated_tools: which tools Donna will likely need next turn (from: search_memories, web_search, save_important_detail, mark_reminder_acknowledged, check_caregiver_notes).

## OUTPUT (JSON only)
{"analysis":{"call_phase":"opening|main|winding_down|closing","engagement_level":"high|medium|low","current_topic":"str","emotional_tone":"positive|neutral|concerned|sad","turns_on_current_topic":0},"direction":{"stay_or_shift":"stay|transition|wrap_up","next_topic":null,"should_mention_news":false,"news_topic":null,"pacing_note":"good|too_fast|dragging|time_to_close"},"reminder":{"should_deliver":false,"which_reminder":null,"delivery_approach":null},"guidance":{"tone":"warm|empathetic|cheerful|gentle|serious","priority_action":"str","specific_instruction":"str"},"prefetch":{"memory_queries":["topic1"],"web_queries":[],"anticipated_tools":["search_memories"]}}"""

# Dynamic per-turn context — passed as contents
DIRECTOR_TURN_TEMPLATE = """\
Senior: {senior_name} | {minutes_elapsed}min / {max_duration}min max | {call_type}
Reminders pending: {pending_reminders}
Delivered (don't repeat): {delivered_reminders}
Interests: {interests}
Has memories: {has_memories} | Has news: {has_news} | Caregiver notes: {has_caregiver_notes} | Calls today: {num_calls_today}

{conversation_history}

Current message from senior: "{user_message}\""""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _format_history(history: list[dict]) -> str:
    if not history:
        return "Call just started"
    return "\n".join(
        f"{'DONNA' if m.get('role') == 'assistant' else 'SENIOR'}: {m.get('content', '')}"
        for m in history[-4:]
    )


def _format_reminders(reminders: list, delivered: set) -> str:
    remaining = [
        r
        for r in reminders
        if r.get("title") not in delivered and r.get("id") not in delivered
    ]
    if not remaining:
        return "None"
    return "\n".join(
        f"- {r.get('title', 'Reminder')}: {r.get('description', 'No details')}"
        for r in remaining
    )


def _build_turn_content(
    user_message: str,
    session_state: dict,
    conversation_history: list[dict] | None = None,
) -> str:
    """Build the dynamic per-turn content string for Director analysis."""
    senior = session_state.get("senior") or {}
    delivered = session_state.get("reminders_delivered") or set()
    pending = session_state.get("_pending_reminders") or []
    call_start = session_state.get("_call_start_time") or time.time()
    minutes_elapsed = (time.time() - call_start) / 60
    max_duration = (session_state.get("call_settings") or {}).get("max_call_minutes", 10)

    return DIRECTOR_TURN_TEMPLATE.format(
        senior_name=(senior.get("name") or "").split(" ")[0] or "Friend",
        minutes_elapsed=f"{minutes_elapsed:.1f}",
        max_duration=max_duration,
        call_type=session_state.get("call_type", "check-in"),
        pending_reminders=_format_reminders(pending, delivered),
        delivered_reminders=", ".join(delivered) if delivered else "None",
        interests=", ".join(senior.get("interests") or []) or "unknown",
        has_memories=str(bool(session_state.get("memory_context"))).lower(),
        has_news=str(bool(session_state.get("news_context"))).lower(),
        has_caregiver_notes=str(session_state.get("_has_caregiver_notes", False)).lower(),
        num_calls_today=len((session_state.get("todays_context") or "").split("Call ")) - 1 if session_state.get("todays_context") else 0,
        conversation_history=_format_history(conversation_history or []),
        user_message=user_message,
    )


def get_default_direction() -> dict:
    """Default direction when analysis fails or LLMs are unavailable."""
    return {
        "analysis": {
            "call_phase": "main",
            "engagement_level": "medium",
            "current_topic": "unknown",
            "emotional_tone": "neutral",
            "turns_on_current_topic": 1,
        },
        "direction": {
            "stay_or_shift": "stay",
            "next_topic": None,
            "pacing_note": "good",
        },
        "reminder": {
            "should_deliver": False,
            "which_reminder": None,
            "delivery_approach": None,
        },
        "guidance": {
            "tone": "warm",
            "priority_action": "Continue conversation naturally",
            "specific_instruction": "Be warm and attentive",
        },
        "prefetch": {
            "memory_queries": [],
            "web_queries": [],
            "anticipated_tools": [],
        },
    }


def format_director_guidance(direction: dict) -> str | None:
    """Format Director output into compact guidance string for LLM injection.

    Returns a single-line string like:
        main/medium/warm | REMIND: Take medication | (concerned)
    """
    if not direction:
        return None

    parts: list[str] = []

    analysis = direction.get("analysis", {})
    guidance = direction.get("guidance", {})
    phase = analysis.get("call_phase", "main")
    engagement = analysis.get("engagement_level", "medium")
    tone = guidance.get("tone", "warm")
    parts.append(f"{phase}/{engagement}/{tone}")

    if phase == "closing":
        parts.append("CLOSING: Say a warm goodbye. Keep it brief.")
    elif phase == "winding_down":
        parts.append(
            "WINDING DOWN: Summarize key points, begin warm sign-off."
        )
    elif direction.get("reminder", {}).get("should_deliver"):
        reminder = direction["reminder"]
        parts.append(
            f"REMIND: {reminder.get('which_reminder', 'pending reminder')}"
        )
        approach = reminder.get("delivery_approach")
        if approach:
            parts.append(f"({approach})")
    elif engagement == "low":
        parts.append(
            "RE-ENGAGE: Ask about something personal or share something interesting."
        )
    elif direction.get("direction", {}).get("stay_or_shift") == "transition":
        next_topic = direction["direction"].get("next_topic")
        if next_topic:
            parts.append(f"SHIFT to {next_topic}")
    elif direction.get("direction", {}).get("stay_or_shift") == "wrap_up":
        parts.append("WRAP-UP: Start wrapping up the conversation.")
    elif guidance.get("specific_instruction"):
        instr = guidance["specific_instruction"]
        # Skip stage-direction-like instructions that the LLM might speak
        if not re.search(
            r"\b(laugh|pause|sigh|smile|nod|speak|empathy|concern|warmth|gently)\b",
            instr,
            re.I,
        ):
            parts.append(instr[:60])

    dir_section = direction.get("direction", {})
    if dir_section.get("should_mention_news") and dir_section.get("news_topic"):
        parts.append(f"NEWS: Naturally mention {dir_section['news_topic']}")

    emotional_tone = analysis.get("emotional_tone")
    if emotional_tone in ("sad", "concerned"):
        parts.append(f"({emotional_tone})")

    # Prefetch hints — let Claude know memories are pre-loaded
    prefetch_hints = direction.get("_prefetch_hints")
    if prefetch_hints:
        parts.append(f"CONTEXT AVAILABLE: Memories about {', '.join(prefetch_hints[:2])}")

    # Web prefetch hints — let Claude know web results are ready (skip filler speech)
    web_prefetch_hints = direction.get("_web_prefetch_hints")
    if web_prefetch_hints:
        parts.append(f"WEB CONTEXT READY: {', '.join(web_prefetch_hints[:1])}")

    return " | ".join(parts) if parts else None


# ---------------------------------------------------------------------------
# Provider-specific analysis functions
# ---------------------------------------------------------------------------


async def _openai_compatible_analyze(
    client, model: str, turn_content: str, breaker: CircuitBreaker
) -> dict | None:
    """Run analysis via any OpenAI-compatible provider. Returns parsed dict or None."""
    if client is None:
        return None

    async def _call():
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": DIRECTOR_SYSTEM_INSTRUCTION},
                {"role": "user", "content": turn_content},
            ],
            temperature=0.2,
            max_tokens=500,
        )
        return response.choices[0].message.content or ""

    text = await breaker.call(_call(), fallback=None)
    if text is None:
        return None

    return _extract_and_parse_json(text)


async def _groq_analyze(turn_content: str, breaker: CircuitBreaker) -> dict | None:
    """Run analysis via Groq. Returns parsed dict or None."""
    return await _openai_compatible_analyze(
        _get_groq_client(), GROQ_MODEL, turn_content, breaker
    )


async def _cerebras_analyze(turn_content: str, breaker: CircuitBreaker) -> dict | None:
    """Run analysis via Cerebras. Returns parsed dict or None."""
    return await _openai_compatible_analyze(
        _get_cerebras_client(), CEREBRAS_MODEL, turn_content, breaker
    )


async def _gemini_analyze(turn_content: str) -> dict | None:
    """Run analysis via Gemini Flash. Returns parsed dict or None."""
    client = _get_gemini_client()
    if client is None:
        return None

    from google import genai

    async def _gemini_call():
        return await client.aio.models.generate_content(
            model=DIRECTOR_MODEL,
            contents=turn_content,
            config=genai.types.GenerateContentConfig(
                system_instruction=DIRECTOR_SYSTEM_INSTRUCTION,
                temperature=0.2,
                max_output_tokens=500,
                thinking_config=genai.types.ThinkingConfig(thinking_budget=0),
            ),
        )

    response = await _gemini_breaker.call(_gemini_call(), fallback=None)
    if response is None:
        return None

    text = (response.text or "").strip()
    if not text:
        return None

    return _extract_and_parse_json(text)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def analyze_turn(
    user_message: str,
    session_state: dict,
    conversation_history: list[dict] | None = None,
) -> dict:
    """Run Director analysis. Cerebras primary, Gemini fallback.

    Non-blocking caller should ``await`` this in a background task.
    Returns structured direction dict, or default on failure.
    """
    start = time.time()
    turn_content = _build_turn_content(user_message, session_state, conversation_history)

    # Try Groq first (primary), then Cerebras, then Gemini
    direction = None
    source = "gemini"

    if groq_available():
        try:
            direction = await _groq_analyze(turn_content, _groq_breaker)
            if direction:
                source = "groq"
        except Exception as e:
            logger.warning("[Director] Groq failed: {err}", err=str(e))

    if direction is None and cerebras_available():
        try:
            direction = await _cerebras_analyze(turn_content, _cerebras_breaker)
            if direction:
                source = "cerebras"
        except Exception as e:
            logger.warning("[Director] Cerebras failed: {err}", err=str(e))

    # Gemini fallback
    if direction is None:
        try:
            direction = await _gemini_analyze(turn_content)
            if direction:
                source = "gemini"
        except Exception as e:
            logger.error("[Director] All providers failed: {err}", err=str(e))

    if direction is None:
        elapsed_ms = round((time.time() - start) * 1000)
        logger.error("[Director] All providers failed ({ms}ms)", ms=elapsed_ms)
        return get_default_direction()

    elapsed_ms = round((time.time() - start) * 1000)
    logger.info(
        "[Director] {src} {ms}ms: phase={p} engagement={e} tone={t}",
        src=source,
        ms=elapsed_ms,
        p=direction.get("analysis", {}).get("call_phase"),
        e=direction.get("analysis", {}).get("engagement_level"),
        t=direction.get("analysis", {}).get("emotional_tone"),
    )

    # Attach prefetch hints so guidance can mention available context
    cache = session_state.get("_prefetch_cache")
    if cache:
        recent = cache.get_recent_queries()
        if recent:
            direction["_prefetch_hints"] = recent

    return direction


async def analyze_turn_speculative(
    user_message: str,
    session_state: dict,
    conversation_history: list[dict] | None = None,
) -> dict | None:
    """Run speculative analysis via fast provider (Groq primary, Cerebras fallback).

    Uses the speculative circuit breaker (shorter timeout, lower threshold).
    Does NOT fall back to Gemini — speculative uses fast providers only.
    """
    if not fast_provider_available():
        return None

    start = time.time()
    turn_content = _build_turn_content(user_message, session_state, conversation_history)

    direction = None
    source = None

    # Try Groq first for speculative (lower TTFT)
    if groq_available():
        try:
            direction = await _groq_analyze(turn_content, _groq_speculative_breaker)
            if direction:
                source = "groq"
        except Exception as e:
            logger.debug("[Director] Speculative Groq failed: {err}", err=str(e))

    # Cerebras fallback for speculative
    if direction is None and cerebras_available():
        try:
            direction = await _cerebras_analyze(turn_content, _cerebras_speculative_breaker)
            if direction:
                source = "cerebras"
        except Exception as e:
            logger.debug("[Director] Speculative Cerebras failed: {err}", err=str(e))

    if direction is None:
        return None

    if direction:
        elapsed_ms = round((time.time() - start) * 1000)
        logger.info(
            "[Director] Speculative ({src}) {ms}ms: phase={p} engagement={e}",
            src=source,
            ms=elapsed_ms,
            p=direction.get("analysis", {}).get("call_phase"),
            e=direction.get("analysis", {}).get("engagement_level"),
        )

        # Attach prefetch hints
        cache = session_state.get("_prefetch_cache")
        if cache:
            recent = cache.get_recent_queries()
            if recent:
                direction["_prefetch_hints"] = recent

    return direction


async def warmup_fast_providers() -> None:
    """Send trivial requests to warm TCP/TLS connections.

    Call this at pipeline start so the first speculative analysis is fast.
    """

    async def _warmup_one(name: str, client, model: str):
        if client is None:
            return
        try:
            start = time.time()
            await client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": "hello"}],
                max_tokens=1,
            )
            elapsed_ms = round((time.time() - start) * 1000)
            logger.info("[Director] {name} warmup complete ({ms}ms)", name=name, ms=elapsed_ms)
        except Exception as e:
            logger.debug("[Director] {name} warmup failed (non-critical): {err}", name=name, err=str(e))

    tasks = []
    if groq_available():
        tasks.append(_warmup_one("Groq", _get_groq_client(), GROQ_MODEL))
    if cerebras_available():
        tasks.append(_warmup_one("Cerebras", _get_cerebras_client(), CEREBRAS_MODEL))

    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
