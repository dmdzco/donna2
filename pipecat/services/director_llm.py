"""Conversation Director — Layer 2 LLM analysis via Gemini Flash.

Port of pipelines/fast-observer.js. Runs Gemini Flash (~150ms) per turn to
provide rich, context-aware conversation guidance. Results are cached and
injected into the next turn's LLM context by ConversationDirectorProcessor.

Not in the blocking path — called asynchronously from the processor.
"""

from __future__ import annotations

import json
import os
import re
import time

from loguru import logger

from lib.circuit_breaker import CircuitBreaker

_breaker = CircuitBreaker("gemini_director", failure_threshold=3, recovery_timeout=60.0, call_timeout=10.0)

_genai_client = None

DIRECTOR_MODEL = os.environ.get("FAST_OBSERVER_MODEL", "gemini-3-flash-preview")


def _get_client():
    global _genai_client
    if _genai_client is None:
        api_key = os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            logger.warning("GOOGLE_API_KEY not set — Conversation Director disabled")
            return None
        from google import genai

        _genai_client = genai.Client(api_key=api_key)
    return _genai_client


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


# ---------------------------------------------------------------------------
# System prompt (ported from DIRECTOR_SYSTEM_PROMPT in fast-observer.js)
# ---------------------------------------------------------------------------

DIRECTOR_SYSTEM_PROMPT = """\
You are a Conversation Director for Donna, an AI companion that calls elderly individuals.

Your job is to GUIDE the conversation proactively — not just react to what was said, but steer where it should go next.

## CALL CONTEXT

Senior: {senior_name}
Call duration: {minutes_elapsed} minutes (max {max_duration} minutes)
Call type: {call_type}
Pending reminders (NOT yet delivered): {pending_reminders}
Already delivered this call (do NOT repeat): {delivered_reminders}
Senior's interests: {interests}
Important memories: {memories}
Previous calls today: {todays_context}
News available for this senior: {news_context}
Has caregiver notes to deliver: {has_caregiver_notes}

## CONVERSATION SO FAR

{conversation_history}

## DIRECTION PRINCIPLES

### Call Phases (must match these exactly)
1. **Opening (0-30 sec)**: Brief greeting only. Donna should transition to main IMMEDIATELY after the senior's first response. Do NOT linger here.
2. **Main (30 sec - 8 min)**: The real conversation. Explore topics, deliver reminders, use tools (web_search, search_memories). This is where 90% of the call happens.
3. **Winding Down (8-9 min)**: Deliver any remaining reminders, summarize, begin sign-off.
4. **Closing (9-10 min, or after goodbye)**: Warm goodbye. Keep brief.

IMPORTANT: There is NO "rapport" phase. If the call is past 30 seconds and still in opening, set call_phase to "main" and add guidance to transition immediately.

### Reminder Delivery
- Connect to what they care about ("stay healthy for the grandkids")
- Find natural pauses in positive conversation
- NEVER during emotional moments or when engagement is low
- NEVER repeat already-delivered reminders

### Re-engagement
If low engagement: ask about something personal, reference a memory, ask open-ended questions.

### Emotional Moments
STAY on the topic. Validate feelings. NEVER deliver reminders during grief/sadness.

### News Integration
If news context is available:
- Recommend mentioning news when engagement is medium/high and topic is winding down
- NEVER during emotional moments or low engagement
- Pick stories that match the senior's interests
- Include "should_mention_news" in your direction when appropriate
- Suggest a natural lead-in: "I saw something about {{topic}} that made me think of you"

### Caregiver Notes
If has_caregiver_notes is true, suggest checking notes during a natural pause in conversation.
Do NOT interrupt emotional moments to deliver caregiver notes.

## OUTPUT FORMAT

Respond with ONLY valid JSON:

{{
  "analysis": {{
    "call_phase": "opening|main|winding_down|closing",
    "engagement_level": "high|medium|low",
    "current_topic": "string",
    "emotional_tone": "positive|neutral|concerned|sad",
    "turns_on_current_topic": 0
  }},
  "direction": {{
    "stay_or_shift": "stay|transition|wrap_up",
    "next_topic": null,
    "should_mention_news": false,
    "news_topic": null,
    "pacing_note": "good|too_fast|dragging|time_to_close"
  }},
  "reminder": {{
    "should_deliver": false,
    "which_reminder": null,
    "delivery_approach": null
  }},
  "guidance": {{
    "tone": "warm|empathetic|cheerful|gentle|serious",
    "priority_action": "string",
    "specific_instruction": "string"
  }},
  "model_recommendation": {{
    "use_sonnet": false,
    "max_tokens": 150,
    "reason": "string"
  }}
}}

Now analyze the current conversation and provide direction:"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _format_history(history: list[dict]) -> str:
    if not history:
        return "Call just started"
    return "\n".join(
        f"{'DONNA' if m.get('role') == 'assistant' else 'SENIOR'}: {m.get('content', '')}"
        for m in history[-10:]
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


def get_default_direction() -> dict:
    """Default direction when analysis fails or Gemini is unavailable."""
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
        "model_recommendation": {
            "use_sonnet": False,
            "max_tokens": 150,
            "reason": "default",
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

    return " | ".join(parts) if parts else None


# ---------------------------------------------------------------------------
# Main analysis function
# ---------------------------------------------------------------------------


async def analyze_turn(
    user_message: str,
    session_state: dict,
    conversation_history: list[dict] | None = None,
) -> dict:
    """Run Gemini Flash analysis on the current turn.

    Non-blocking caller should ``await`` this in a background task.
    Returns structured direction dict, or default on failure.
    """
    start = time.time()
    client = _get_client()
    if client is None:
        return get_default_direction()

    senior = session_state.get("senior") or {}
    delivered = session_state.get("reminders_delivered") or set()
    pending = session_state.get("_pending_reminders") or []
    call_start = session_state.get("_call_start_time") or time.time()
    minutes_elapsed = (time.time() - call_start) / 60

    # Resolve max call duration from call_settings if available
    max_duration = (session_state.get("call_settings") or {}).get("max_call_minutes", 10)

    prompt = DIRECTOR_SYSTEM_PROMPT.format(
        senior_name=(senior.get("name") or "").split(" ")[0] or "Friend",
        minutes_elapsed=f"{minutes_elapsed:.1f}",
        max_duration=max_duration,
        call_type=session_state.get("call_type", "check-in"),
        pending_reminders=_format_reminders(pending, delivered),
        delivered_reminders=", ".join(delivered) if delivered else "None",
        interests=", ".join(senior.get("interests") or []) or "unknown",
        memories=(session_state.get("memory_context") or "None available"),
        todays_context=(
            session_state.get("todays_context") or "None (first call today)"
        ),
        news_context=(session_state.get("news_context") or "None available"),
        has_caregiver_notes=str(session_state.get("_has_caregiver_notes", False)).lower(),
        conversation_history=_format_history(conversation_history or []),
    )

    try:
        from google import genai

        async def _gemini_call():
            return await client.aio.models.generate_content(
                model=DIRECTOR_MODEL,
                contents=f'{prompt}\n\nCurrent message from senior: "{user_message}"',
                config=genai.types.GenerateContentConfig(
                    temperature=0.2,
                    max_output_tokens=500,
                    thinking_config=genai.types.ThinkingConfig(thinking_budget=0),
                ),
            )

        response = await _breaker.call(_gemini_call(), fallback=None)
        if response is None:
            return get_default_direction()

        text = (response.text or "").strip()
        if not text:
            logger.warning("[Director] Empty response from Gemini")
            return get_default_direction()

        # Extract JSON from response
        if "```" in text:
            text = re.sub(r"```json?\n?", "", text)
            text = text.replace("```", "").strip()

        json_match = re.search(r"\{[\s\S]*\}", text)
        if json_match:
            text = json_match.group(0)

        try:
            direction = json.loads(text)
        except json.JSONDecodeError:
            text = _repair_json(text)
            direction = json.loads(text)

        elapsed_ms = round((time.time() - start) * 1000)
        logger.info(
            "[Director] {ms}ms: phase={p} engagement={e} tone={t}",
            ms=elapsed_ms,
            p=direction.get("analysis", {}).get("call_phase"),
            e=direction.get("analysis", {}).get("engagement_level"),
            t=direction.get("analysis", {}).get("emotional_tone"),
        )
        return direction

    except Exception as e:
        elapsed_ms = round((time.time() - start) * 1000)
        logger.error("[Director] Error ({ms}ms): {err}", ms=elapsed_ms, err=str(e))
        return get_default_direction()
