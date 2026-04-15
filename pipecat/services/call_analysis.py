"""Post-call analysis service.

Port of services/call-analysis.js — runs after each call to generate
summary, caregiver alerts, engagement metrics, and follow-up suggestions.
Uses Gemini Flash for cost efficiency.
"""

from __future__ import annotations

import json
import os
import re
from loguru import logger
from db import query_one
from lib.circuit_breaker import CircuitBreaker
from lib.encryption import encrypt, decrypt, encrypt_json, decrypt_json
from services.time_context import format_call_time_label, format_local_datetime

_breaker = CircuitBreaker("gemini_analysis", failure_threshold=3, recovery_timeout=60.0, call_timeout=15.0)


ANALYSIS_MODEL = os.environ.get("CALL_ANALYSIS_MODEL", "gemini-3-flash-preview")

# Static instructions — passed as system_instruction
ANALYSIS_SYSTEM_INSTRUCTION = """You analyze completed phone calls between Donna (an AI companion) and elderly individuals for the senior's caregiver.

Write the summary for a caregiver, not for Donna or an internal operator. It should answer: how did the senior seem, what mattered from the conversation, whether anything may need follow-up, and what a caregiver could do next. Keep it concise, factual, and useful. Do not include raw quotes, private details that are not relevant to care, or unsupported medical/financial conclusions.

Return JSON with:
- summary: 2-3 caregiver-facing sentences. Start with the senior's overall sentiment/mood, then include useful context, concerns, reminders, or follow-up needs if present.
- sentiment: one of positive, neutral, concerned, worried, distressed. Use positive for upbeat/engaged calls; neutral for routine calls; concerned for mild wellbeing or engagement issues; worried for material health/cognitive/safety concerns; distressed for acute emotional distress.
- topics_discussed
- reminders_delivered
- engagement_score: 1-10
- mood: one or two caregiver-friendly words, such as cheerful, calm, content, quiet, tired, worried, sad
- caregiver_sms: a warm, privacy-respecting caregiver message. Keep it high-level, never expose vulnerability or repeat sensitive details; if mood seems low, subtly suggest the caregiver give them a call; include call duration naturally; max 280 chars.
- caregiver_takeaways: 1-4 concise items a caregiver would care about
- recommended_caregiver_action: short action or empty string if no action is needed
- concerns: health/cognitive/emotional/safety with severity low/medium/high, description, evidence, recommended_action
- positive_observations
- follow_up_suggestions: caregiver-actionable suggestions for future calls or family follow-up
- call_quality: rapport strong/moderate/weak, goals_achieved bool, duration_appropriate bool

Temporal grounding:
- The transcript is anchored to the call date/time provided below.
- If the senior says "tomorrow", "next week", "later today", or similar, preserve that future timing in summaries and follow-up suggestions.
- Do not write a follow-up that implies a future plan already happened unless the transcript says it happened.

Output ONLY valid JSON: {"summary":"str","sentiment":"positive|neutral|concerned|worried|distressed","topics_discussed":["str"],"reminders_delivered":["str"],"engagement_score":0,"mood":"str","caregiver_sms":"str","caregiver_takeaways":["str"],"recommended_caregiver_action":"str","concerns":[{"type":"health|cognitive|emotional|safety","severity":"low|medium|high","description":"str","evidence":"str","recommended_action":"str"}],"positive_observations":["str"],"follow_up_suggestions":["str"],"call_quality":{"rapport":"strong|moderate|weak","goals_achieved":true,"duration_appropriate":true}}"""

# Dynamic per-call content — passed as contents
ANALYSIS_TURN_TEMPLATE = """Senior: {{SENIOR_NAME}}
Call date/time: {{CALL_DATETIME}}
Conditions: {{HEALTH_CONDITIONS}}
Family: {{FAMILY_MEMBERS}}

## TRANSCRIPT
{{TRANSCRIPT}}"""

_SENTIMENT_VALUES = {"positive", "neutral", "concerned", "worried", "distressed"}


def _repair_json(json_text: str) -> str:
    """Repair malformed JSON from LLM responses."""
    repaired = json_text
    # Remove trailing commas
    repaired = re.sub(r",\s*([}\]])", r"\1", repaired)

    open_braces = repaired.count("{")
    close_braces = repaired.count("}")
    open_brackets = repaired.count("[")
    close_brackets = repaired.count("]")

    # Close unclosed brackets
    repaired += "]" * (open_brackets - close_brackets)
    repaired += "}" * (open_braces - close_braces)

    # Final trailing comma cleanup
    repaired = re.sub(r",\s*([}\]])", r"\1", repaired)
    return repaired


def _format_transcript(history: list[dict] | str | None) -> str:
    """Format transcript for analysis prompt."""
    if not history:
        return "No transcript available"
    if isinstance(history, str):
        return history
    return "\n\n".join(
        f"{'DONNA' if m.get('role') == 'assistant' else 'SENIOR'}: {m.get('content', '')}"
        for m in history
    )


def _as_list(value) -> list:
    if isinstance(value, list):
        return value
    return []


def _normalize_sentiment(raw, analysis: dict) -> str:
    """Return a stable caregiver-facing sentiment label."""
    if isinstance(raw, str):
        value = raw.strip().lower()
        if value in _SENTIMENT_VALUES:
            return value

    concerns = _as_list(analysis.get("concerns"))
    severities = {
        str(c.get("severity", "")).lower()
        for c in concerns
        if isinstance(c, dict)
    }
    types = {
        str(c.get("type") or c.get("category") or "").lower()
        for c in concerns
        if isinstance(c, dict)
    }

    mood = str(analysis.get("mood") or "").lower()
    engagement = analysis.get("engagement_score")
    try:
        engagement = int(engagement)
    except (TypeError, ValueError):
        engagement = None

    if any(term in mood for term in ("distress", "hopeless", "panic", "despair")):
        return "distressed"
    if "high" in severities and ("emotional" in types or "safety" in types):
        return "distressed"
    if "high" in severities:
        return "worried"
    if "medium" in severities:
        return "concerned"
    if engagement is not None and engagement <= 3:
        return "concerned"
    if any(term in mood for term in ("worried", "anxious", "sad", "lonely", "tired", "quiet")):
        return "concerned"
    if any(term in mood for term in ("cheer", "happy", "content", "upbeat", "positive", "engaged")):
        return "positive"
    return "neutral"


def _normalize_analysis(analysis: dict | None) -> dict:
    """Normalize LLM output so downstream storage and UI get stable keys."""
    if not isinstance(analysis, dict):
        analysis = {}
    raw_sentiment = analysis.get("sentiment")

    default = _get_default_analysis()
    merged = {**default, **analysis}

    merged["topics_discussed"] = _as_list(merged.get("topics_discussed") or merged.get("topics"))
    merged["reminders_delivered"] = _as_list(merged.get("reminders_delivered"))
    merged["concerns"] = _as_list(merged.get("concerns"))
    merged["positive_observations"] = _as_list(merged.get("positive_observations"))
    merged["follow_up_suggestions"] = _as_list(
        merged.get("follow_up_suggestions") or merged.get("follow_ups")
    )
    merged["caregiver_takeaways"] = _as_list(merged.get("caregiver_takeaways"))
    merged["recommended_caregiver_action"] = str(
        merged.get("recommended_caregiver_action") or ""
    ).strip()
    merged["sentiment"] = _normalize_sentiment(raw_sentiment, merged)

    try:
        merged["engagement_score"] = int(merged.get("engagement_score", 5))
    except (TypeError, ValueError):
        merged["engagement_score"] = 5
    merged["engagement_score"] = max(1, min(10, merged["engagement_score"]))

    call_quality = merged.get("call_quality")
    if not isinstance(call_quality, dict):
        call_quality = default["call_quality"]
    merged["call_quality"] = call_quality

    return merged


def _get_default_analysis() -> dict:
    """Default analysis when processing fails."""
    return {
        "summary": "Analysis unavailable",
        "sentiment": "neutral",
        "topics_discussed": [],
        "reminders_delivered": [],
        "engagement_score": 5,
        "mood": "unknown",
        "caregiver_sms": "",
        "caregiver_takeaways": [],
        "recommended_caregiver_action": "",
        "concerns": [],
        "positive_observations": [],
        "follow_up_suggestions": [],
        "call_quality": {
            "rapport": "moderate",
            "goals_achieved": False,
            "duration_appropriate": True,
        },
    }


async def analyze_completed_call(
    transcript: list[dict] | str,
    senior_context: dict | None,
    *,
    call_started_at=None,
) -> dict:
    """Analyze a completed call using Gemini Flash."""
    call_datetime = (
        format_local_datetime(
            call_started_at,
            (senior_context or {}).get("timezone") or "America/New_York",
        )
        or "Unknown"
    )
    turn_content = (
        ANALYSIS_TURN_TEMPLATE
        .replace("{{SENIOR_NAME}}", (senior_context or {}).get("name") or "Unknown")
        .replace("{{CALL_DATETIME}}", call_datetime)
        .replace("{{HEALTH_CONDITIONS}}", (senior_context or {}).get("medical_notes") or "None known")
        .replace(
            "{{FAMILY_MEMBERS}}",
            ", ".join((senior_context or {}).get("family") or []) or "Unknown",
        )
        .replace("{{TRANSCRIPT}}", _format_transcript(transcript) or "")
    )

    try:
        # Use google-genai for Gemini (async to avoid blocking event loop)
        from google import genai

        api_key = os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            logger.error("GOOGLE_API_KEY not set")
            return _get_default_analysis()

        client = genai.Client(api_key=api_key)

        async def _gemini_call():
            return await client.aio.models.generate_content(
                model=ANALYSIS_MODEL,
                contents=turn_content,
                config=genai.types.GenerateContentConfig(
                    system_instruction=ANALYSIS_SYSTEM_INSTRUCTION,
                    max_output_tokens=1500,
                    temperature=0.2,
                ),
            )

        response = await _breaker.call(_gemini_call(), fallback=None)
        if response is None:
            return _get_default_analysis()

        json_text = response.text.strip()
        # Strip markdown fences
        if "```" in json_text:
            json_text = re.sub(r"```json?\n?", "", json_text).replace("```", "").strip()
        # Extract JSON object
        match = re.search(r"\{[\s\S]*\}", json_text)
        if match:
            json_text = match.group(0)

        try:
            analysis = json.loads(json_text)
        except json.JSONDecodeError:
            logger.info("JSON parse failed, attempting repair")
            analysis = json.loads(_repair_json(json_text))

        analysis = _normalize_analysis(analysis)

        logger.info(
            "Analysis complete: sentiment={sentiment}, engagement={score}/10, concerns={cc}",
            sentiment=analysis.get("sentiment"),
            score=analysis.get("engagement_score"),
            cc=len(analysis.get("concerns", [])),
        )
        return analysis

    except Exception as e:
        logger.error("Call analysis error: {err}", err=str(e))
        return _get_default_analysis()


async def save_call_analysis(
    conversation_id: str, senior_id: str, analysis: dict
) -> dict | None:
    """Save call analysis to database.

    Writes analysis_encrypted for PHI-bearing details. Legacy plaintext
    columns remain read-only fallback for rows written before encryption.
    """
    try:
        row = await query_one(
            """INSERT INTO call_analyses
               (conversation_id, senior_id, summary, topics, engagement_score,
                concerns, positive_observations, follow_up_suggestions, call_quality,
                analysis_encrypted)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
               RETURNING *""",
            conversation_id,
            senior_id,
            None,
            None,
            analysis.get("engagement_score"),
            None,
            None,
            None,
            None,
            encrypt_json(analysis),
        )
        logger.info("Saved analysis for conversation {cid}", cid=conversation_id)
        return row
    except Exception as e:
        logger.error("Save analysis error: {err}", err=str(e))
        return None


def get_high_severity_concerns(analysis: dict) -> list[dict]:
    """Return only high-severity concerns from an analysis."""
    concerns = analysis.get("concerns") or []
    return [c for c in concerns if c.get("severity") == "high"]


async def get_latest_analysis(
    senior_id: str,
    timezone_name: str = "America/New_York",
) -> dict | None:
    """Get the most recent call analysis for a senior."""
    row = await query_one(
        """SELECT ca.engagement_score, ca.call_quality, ca.summary,
                  ca.analysis_encrypted, ca.created_at,
                  c.started_at AS call_started_at
           FROM call_analyses ca
           LEFT JOIN conversations c ON c.id = ca.conversation_id
           WHERE ca.senior_id = $1
           ORDER BY ca.created_at DESC LIMIT 1""",
        senior_id,
    )
    if row and row.get("analysis_encrypted"):
        full = decrypt_json(row["analysis_encrypted"])
        if full and isinstance(full, dict):
            row["summary"] = full.get("summary", row.get("summary"))
            row["call_quality"] = full.get("call_quality", row.get("call_quality"))
            row["sentiment"] = full.get("sentiment")
            row["mood"] = full.get("mood")
        row.pop("analysis_encrypted", None)
    elif row:
        row.pop("analysis_encrypted", None)
    if row:
        call_started_at = row.get("call_started_at") or row.get("created_at")
        row["call_time_label"] = format_call_time_label(call_started_at, timezone_name)
        row["call_datetime"] = format_local_datetime(call_started_at, timezone_name)
    return row
