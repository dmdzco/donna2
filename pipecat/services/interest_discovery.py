"""Interest discovery and engagement scoring.

Discovers new interests from post-call analysis and computes
engagement-weighted scores to prioritize topics for future calls.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from loguru import logger

from db import query_one, query_many
from lib.encryption import decrypt_json

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

# Predefined interest categories — must match the mobile app's INTERESTS constant IDs.
# Keywords map free-form topics from call analysis to the canonical category ID.
_CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "sports": ["sport", "football", "soccer", "baseball", "basketball", "tennis", "golf", "nfl", "nba", "mlb", "hockey", "boxing", "wrestling", "surfing", "skiing", "swimming", "running", "cycling", "exercise", "workout", "fitness", "gym", "push-up", "seahawks", "cowboys", "lakers"],
    "history": ["history", "historical", "wwii", "civil war", "revolution", "ancient", "medieval"],
    "music": ["music", "song", "band", "concert", "jazz", "rock", "classical", "piano", "guitar", "singer", "album"],
    "film": ["film", "movie", "tv", "television", "show", "series", "netflix", "documentary", "actor", "actress", "cinema"],
    "politics": ["politic", "election", "congress", "senate", "president", "democrat", "republican", "vote", "government"],
    "poetry": ["poetry", "poem", "poet", "verse", "sonnet"],
    "geography": ["geography", "travel", "country", "continent", "map", "capital", "explore"],
    "animals": ["animal", "pet", "dog", "cat", "bird", "horse", "fish", "puppy", "kitten"],
    "literature": ["book", "read", "novel", "author", "library", "literature", "biography", "fiction"],
    "gardening": ["garden", "plant", "flower", "vegetable", "herb", "rose", "seed", "grow", "yard", "lawn"],
    "travel": ["travel", "trip", "vacation", "flight", "destination", "cruise", "beach", "tourism"],
    "cooking": ["cook", "recipe", "bake", "kitchen", "food", "chef", "cuisine", "ingredient", "restaurant"],
}

def _match_category(topic: str) -> str | None:
    """Try to match a free-form topic to a predefined interest category."""
    low = topic.lower()
    # Exact match first
    if low in _CATEGORY_KEYWORDS:
        return low
    # Keyword search
    for category, keywords in _CATEGORY_KEYWORDS.items():
        if any(kw in low for kw in keywords):
            return category
    return None


def discover_new_interests(
    current_interests: list[str],
    analysis: dict | None,
    tracker_topics: list[str] | None = None,
) -> list[dict[str, str]]:
    """Identify new interests from a completed call.

    Collects candidate topics from analysis + tracker, filters out known
    interests & generic topics, and returns only those with strong engagement
    signals.

    Returns list of dicts with 'id' (predefined category or raw string) and
    'detail' (original topic text as detected by AI).
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

    new_interests: list[dict[str, str]] = []
    seen_categories: set[str] = set(existing)
    for candidate in candidates:
        low = candidate.lower()
        # Skip generic / non-hobby topics
        if any(word in _GENERIC_BLOCKLIST for word in low.split()):
            continue
        # Skip very short or very long strings
        if len(low) < 3 or len(low) > 40:
            continue
        # Require strong engagement signal
        if not (engagement >= 7 or low in positive_obs):
            continue

        # Map to predefined category when possible
        category = _match_category(candidate)
        interest_id = category or low
        if interest_id in seen_categories:
            continue
        seen_categories.add(interest_id)
        new_interests.append({"id": interest_id, "detail": candidate})

    return new_interests


async def add_interests_to_senior(
    senior_id: str,
    new_interests: list[dict[str, str]],
    existing_interests: list[str],
) -> list[str]:
    """Merge new interests into the senior's profile (capped at MAX_INTERESTS).

    Also updates familyInfo.interestDetails with AI-detected descriptions
    so caregivers can see and edit them in the mobile app.

    Returns the updated full interests list.
    """
    existing_lower = {i.lower() for i in existing_interests}
    merged = list(existing_interests)
    details_to_add: dict[str, str] = {}

    for entry in new_interests:
        interest_id = entry["id"]
        detail = entry.get("detail", "")
        if interest_id.lower() not in existing_lower and len(merged) < MAX_INTERESTS:
            merged.append(interest_id)
            existing_lower.add(interest_id.lower())
            if detail and detail.lower() != interest_id.lower():
                details_to_add[interest_id] = f"Detected from call: {detail}"

    if len(merged) != len(existing_interests):
        from services.seniors import update, get_by_id
        update_data: dict = {"interests": merged}

        # Merge AI-detected details into familyInfo.interestDetails
        if details_to_add:
            senior = await get_by_id(senior_id)
            family_info = (senior or {}).get("family_info") or {}
            if isinstance(family_info, str):
                import json as _json
                try:
                    family_info = _json.loads(family_info)
                except Exception:
                    family_info = {}
            existing_details = family_info.get("interestDetails") or {}
            # Only add details for interests that don't already have a description
            for k, v in details_to_add.items():
                if k not in existing_details:
                    existing_details[k] = v
            family_info["interestDetails"] = existing_details
            update_data["familyInfo"] = family_info

        await update(senior_id, update_data)
        logger.info(
            "Added {n} interests for senior_id={sid} (details={d})",
            n=len(merged) - len(existing_interests),
            sid=str(senior_id)[:8],
            d=len(details_to_add),
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
        """SELECT topics, analysis_encrypted, engagement_score, created_at
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
        topics = row.get("topics") or []
        encrypted = None
        if row.get("analysis_encrypted"):
            encrypted = decrypt_json(row["analysis_encrypted"])
            if isinstance(encrypted, dict):
                topics = topics or encrypted.get("topics_discussed") or encrypted.get("topics") or []
        eng = row.get("engagement_score") or 5
        if isinstance(encrypted, dict):
            eng = row.get("engagement_score") or encrypted.get("engagement_score") or 5
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
    logger.info("Updated interest scores for senior_id={sid} count={n}", sid=str(senior_id)[:8], n=len(scores))
