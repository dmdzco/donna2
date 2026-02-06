"""Post-call analysis service.

Port of services/call-analysis.js — runs after each call to generate
summary, caregiver alerts, engagement metrics, and follow-up suggestions.
Uses Gemini Flash for cost efficiency.
"""

import json
import os
import re
from loguru import logger
from db import query_one


ANALYSIS_MODEL = os.environ.get("CALL_ANALYSIS_MODEL", "gemini-3-flash")

ANALYSIS_PROMPT = """You are analyzing a completed phone call between Donna (an AI companion) and an elderly individual.

## SENIOR CONTEXT
Name: {{SENIOR_NAME}}
Known conditions: {{HEALTH_CONDITIONS}}
Family: {{FAMILY_MEMBERS}}

## FULL CALL TRANSCRIPT
{{TRANSCRIPT}}

## ANALYSIS REQUIRED

Analyze the complete call and provide:

1. **Summary** (2-3 sentences): What happened in this call?

2. **Topics Discussed**: List main topics covered

3. **Reminders**: Were any reminders delivered? Which ones?

4. **Engagement Score** (1-10): How engaged was the senior?

5. **Concerns for Caregiver**: Flag any issues the family should know about
   - Health concerns (pain, symptoms, medication issues, falls)
   - Cognitive concerns (confusion, memory issues, disorientation)
   - Emotional concerns (persistent sadness, loneliness, anxiety)
   - Safety concerns (mentions of strangers, scams, being alone)

   For each concern, provide:
   - Type: health|cognitive|emotional|safety
   - Severity: low|medium|high
   - Description: What was observed
   - Evidence: Quote or specific observation
   - Action: What caregiver should do

6. **Positive Observations**: Good things noticed (high engagement, positive mood, etc.)

7. **Follow-up Suggestions**: Things to bring up in the next call

## OUTPUT FORMAT

Respond with ONLY valid JSON:

{
  "summary": "string",
  "topics_discussed": ["string"],
  "reminders_delivered": ["string"],
  "engagement_score": number,
  "concerns": [
    {
      "type": "health|cognitive|emotional|safety",
      "severity": "low|medium|high",
      "description": "string",
      "evidence": "string",
      "recommended_action": "string"
    }
  ],
  "positive_observations": ["string"],
  "follow_up_suggestions": ["string"],
  "call_quality": {
    "rapport": "strong|moderate|weak",
    "goals_achieved": boolean,
    "duration_appropriate": boolean
  }
}"""


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
    prompt = (
        ANALYSIS_PROMPT
        .replace("{{SENIOR_NAME}}", (senior_context or {}).get("name", "Unknown"))
        .replace("{{HEALTH_CONDITIONS}}", (senior_context or {}).get("medical_notes", "None known"))
        .replace(
            "{{FAMILY_MEMBERS}}",
            ", ".join((senior_context or {}).get("family", [])) if (senior_context or {}).get("family") else "Unknown",
        )
        .replace("{{TRANSCRIPT}}", _format_transcript(transcript))
    )

    try:
        # Use google-genai for Gemini
        from google import genai

        api_key = os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            logger.error("GOOGLE_API_KEY not set")
            return _get_default_analysis()

        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config={"max_output_tokens": 1500, "temperature": 0.2},
        )

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
