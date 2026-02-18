"""Interest discovery and engagement scoring.

Discovers new interests from post-call analysis and computes
engagement-weighted scores to prioritize topics for future calls.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from loguru import logger

from db import query_one, query_many

# Topics that are NOT real hobbies/interests — filter these out
_GENERIC_BLOCKLIST = {
    "weather", "temperature", "rain", "snow", "sunny",
    "medical", "medication", "doctor", "hospital", "appointment",
    "pain", "ache", "symptom", "diagnosis", "prescription",
    "sleep", "insomnia", "nap", "tired", "fatigue",
    "greeting", "hello", "goodbye", "hi", "bye",
    "emotion", "feeling", "mood", "sad", "happy", "angry",
    "food", "meal", "breakfast", "lunch", "dinner", "eating",
    "phone", "call", "donna", "reminder",
    "day", "today", "yesterday", "tomorrow", "week", "morning", "evening",
    "okay", "fine", "good", "well", "thanks", "thank",
}

MAX_INTERESTS = 15


def discover_new_interests(
    current_interests: list[str],
    analysis: dict | None,
    tracker_topics: list[str] | None = None,
) -> list[str]:
    """Identify new interests from a completed call.

    Collects candidate topics from analysis + tracker, filters out known
    interests & generic topics, and returns only those with strong engagement
    signals.

    Args:
        current_interests: Senior's existing interests list.
        analysis: Post-call analysis dict (from call_analysis service).
        tracker_topics: Topics from ConversationTracker.

    Returns:
        List of new interest strings to add.
    """
    if not analysis:
        return []

    existing = {i.lower() for i in (current_interests or [])}

    # Collect candidate topics
    candidates: set[str] = set()
    for topic in (analysis.get("topics_discussed") or []):
        candidates.add(topic.strip())
    for topic in (tracker_topics or []):
        candidates.add(topic.strip())

    # Filter
    positive_obs = " ".join(analysis.get("positive_observations") or []).lower()
    engagement = analysis.get("engagement_score", 0)

    new_interests: list[str] = []
    for candidate in candidates:
        low = candidate.lower()
        # Skip if already known
        if low in existing:
            continue
        # Skip generic / non-hobby topics
        if any(word in _GENERIC_BLOCKLIST for word in low.split()):
            continue
        # Skip very short or very long strings
        if len(low) < 3 or len(low) > 40:
            continue
        # Require strong engagement signal
        if engagement >= 7 or low in positive_obs:
            new_interests.append(candidate)

    return new_interests


async def add_interests_to_senior(
    senior_id: str,
    new_interests: list[str],
    existing_interests: list[str],
) -> list[str]:
    """Merge new interests into the senior's profile (capped at MAX_INTERESTS).

    Returns the updated full interests list.
    """
    existing_lower = {i.lower() for i in existing_interests}
    merged = list(existing_interests)
    for interest in new_interests:
        if interest.lower() not in existing_lower and len(merged) < MAX_INTERESTS:
            merged.append(interest)
            existing_lower.add(interest.lower())

    if len(merged) != len(existing_interests):
        from services.seniors import update
        await update(senior_id, {"interests": merged})
        logger.info(
            "Added {n} interests for {sid}: {new}",
            n=len(merged) - len(existing_interests),
            sid=senior_id,
            new=[i for i in merged if i not in existing_interests],
        )

    return merged


async def compute_interest_scores(
    senior_id: str,
    interests: list[str],
    lookback_days: int = 30,
) -> dict[str, float]:
    """Compute engagement-weighted scores for each interest.

    Queries recent call analyses for the senior and scores each interest
    based on how often and how recently it was discussed, weighted by
    the call's engagement score.

    Returns dict mapping lowercase interest -> score (0-10 range).
    """
    if not interests:
        return {}

    rows = await query_many(
        """SELECT topics_discussed, engagement_score, created_at
           FROM call_analyses
           WHERE senior_id = $1
             AND created_at > NOW() - INTERVAL '1 day' * $2
           ORDER BY created_at DESC
           LIMIT 20""",
        senior_id,
        lookback_days,
    )

    raw_scores: dict[str, float] = {i.lower(): 0.0 for i in interests}
    now = datetime.now(timezone.utc)

    for row in rows:
        topics = row.get("topics_discussed") or []
        eng = row.get("engagement_score") or 5
        created = row.get("created_at")
        if not created:
            continue

        if isinstance(created, datetime):
            days_ago = (now - created.replace(tzinfo=timezone.utc)).total_seconds() / 86400
        else:
            continue

        recency_weight = math.pow(0.5, days_ago / 14)  # 14-day half-life

        topics_lower = [t.lower() for t in topics]
        for interest in interests:
            if interest.lower() in topics_lower:
                raw_scores[interest.lower()] += eng * recency_weight

    # Normalize to 0-10 range
    max_score = max(raw_scores.values()) if raw_scores else 0
    if max_score > 0:
        scores = {k: round((v / max_score) * 10, 1) for k, v in raw_scores.items()}
    else:
        scores = {k: 1.0 for k in raw_scores}

    # Undiscussed interests get a baseline of 1.0
    for k in scores:
        if scores[k] == 0:
            scores[k] = 1.0

    return scores


async def update_interest_scores(senior_id: str, scores: dict[str, float]) -> None:
    """Persist computed interest scores to the senior's profile."""
    from services.seniors import update
    await update(senior_id, {"interest_scores": scores})
    logger.info("Updated interest scores for {sid}: {s}", sid=senior_id, s=scores)
