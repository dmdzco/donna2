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

_breaker = CircuitBreaker("gemini_analysis", failure_threshold=3, recovery_timeout=60.0, call_timeout=15.0)


ANALYSIS_MODEL = os.environ.get("CALL_ANALYSIS_MODEL", "gemini-3-flash-preview")

# Static instructions — passed as system_instruction
ANALYSIS_SYSTEM_INSTRUCTION = """You analyze completed phone calls between Donna (an AI companion) and elderly individuals.

Analyze the call and return JSON with: summary (2-3 sentences), topics_discussed, reminders_delivered, engagement_score (1-10), concerns (health/cognitive/emotional/safety with severity low/medium/high, description, evidence, recommended_action), positive_observations, follow_up_suggestions, call_quality (rapport: strong/moderate/weak, goals_achieved: bool, duration_appropriate: bool).

Output ONLY valid JSON: {"summary":"str","topics_discussed":["str"],"reminders_delivered":["str"],"engagement_score":0,"concerns":[{"type":"health|cognitive|emotional|safety","severity":"low|medium|high","description":"str","evidence":"str","recommended_action":"str"}],"positive_observations":["str"],"follow_up_suggestions":["str"],"call_quality":{"rapport":"strong|moderate|weak","goals_achieved":true,"duration_appropriate":true}}"""

# Dynamic per-call content — passed as contents
ANALYSIS_TURN_TEMPLATE = """Senior: {{SENIOR_NAME}}
Conditions: {{HEALTH_CONDITIONS}}
Family: {{FAMILY_MEMBERS}}

## TRANSCRIPT
{{TRANSCRIPT}}"""


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


def _format_transcript(history: list[dict] | None) -> str:
    """Format transcript for analysis prompt."""
    if not history:
        return "No transcript available"
    return "\n\n".join(
        f"{'DONNA' if m.get('role') == 'assistant' else 'SENIOR'}: {m.get('content', '')}"
        for m in history
    )


def _get_default_analysis() -> dict:
    """Default analysis when processing fails."""
    return {
        "summary": "Analysis unavailable",
        "topics_discussed": [],
        "reminders_delivered": [],
        "engagement_score": 5,
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
    transcript: list[dict], senior_context: dict | None
) -> dict:
    """Analyze a completed call using Gemini Flash."""
    turn_content = (
        ANALYSIS_TURN_TEMPLATE
        .replace("{{SENIOR_NAME}}", (senior_context or {}).get("name", "Unknown"))
        .replace("{{HEALTH_CONDITIONS}}", (senior_context or {}).get("medical_notes", "None known"))
        .replace(
            "{{FAMILY_MEMBERS}}",
            ", ".join((senior_context or {}).get("family", [])) if (senior_context or {}).get("family") else "Unknown",
        )
        .replace("{{TRANSCRIPT}}", _format_transcript(transcript))
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

        logger.info(
            "Analysis complete: engagement={score}/10, concerns={cc}",
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
    """Save call analysis to database."""
    try:
        row = await query_one(
            """INSERT INTO call_analyses
               (conversation_id, senior_id, summary, topics, engagement_score,
                concerns, positive_observations, follow_up_suggestions, call_quality)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               RETURNING *""",
            conversation_id,
            senior_id,
            analysis.get("summary"),
            analysis.get("topics_discussed"),
            analysis.get("engagement_score"),
            json.dumps(analysis.get("concerns")),
            analysis.get("positive_observations"),
            analysis.get("follow_up_suggestions"),
            json.dumps(analysis.get("call_quality")),
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


async def get_latest_analysis(senior_id: str) -> dict | None:
    """Get the most recent call analysis for a senior."""
    return await query_one(
        """SELECT engagement_score, call_quality, summary
           FROM call_analyses
           WHERE senior_id = $1
           ORDER BY created_at DESC LIMIT 1""",
        senior_id,
    )
