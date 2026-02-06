"""Context cache service — pre-caches senior context at 5 AM local time.

Port of services/context-cache.js (365 lines). Caches:
- Recent call summaries
- Critical memories (Tier 1)
- Important memories (with decay)
- Pre-generated greeting (templated with rotation)

In-memory cache with 24-hour TTL. Called by scheduler hourly + at call connect.
"""

import asyncio
import random
import time
from datetime import datetime
from zoneinfo import ZoneInfo
from loguru import logger

# In-memory cache: senior_id -> cached context dict
_cache: dict[str, dict] = {}

CACHE_TTL_SECONDS = 24 * 60 * 60  # 24 hours
PREFETCH_HOUR = 5  # 5 AM local

# Greeting templates — {name} and {interest} replaced dynamically
GREETING_TEMPLATES = [
    "Hey {name}! It's Donna. I was just thinking about your {interest} - how's that going?",
    "Hi {name}, Donna here! Have you had a chance to enjoy any {interest} lately?",
    "{name}! So good to talk to you. Tell me - anything new with your {interest}?",
    "Hello {name}, it's Donna calling. I'd love to hear what you've been up to with {interest}.",
    "Hey there {name}! Donna checking in. Been doing any {interest} this week?",
    "{name}, hi! It's Donna. I was curious - how's the {interest} going these days?",
]

FALLBACK_TEMPLATES = [
    "Hey {name}! It's Donna. How have you been?",
    "Hi {name}, Donna here! How are you doing today?",
    "{name}! So good to talk to you. What's new?",
    "Hello {name}, it's Donna calling. How's everything going?",
    "Hey there {name}! Donna checking in. How are you?",
    "{name}, hi! It's Donna. How's your day been?",
]


def _get_local_hour(tz_name: str | None) -> int:
    """Get the current local hour for a timezone."""
    try:
        tz = ZoneInfo(tz_name or "America/New_York")
        return datetime.now(tz).hour
    except Exception:
        return datetime.utcnow().hour - 5


def _select_interest(
    interests: list[str] | None, recent_memories: list[dict] | None
) -> str | None:
    """Select an interest using weighted random (boosted by recent memory mentions)."""
    if not interests:
        return None

    now_ms = time.time() * 1000
    seven_days = 7 * 24 * 60 * 60 * 1000
    fourteen_days = 14 * 24 * 60 * 60 * 1000

    weights: dict[str, float] = {i.lower(): 1.0 for i in interests}

    for memory in (recent_memories or []):
        content = (memory.get("content") or "").lower()
        created = memory.get("created_at")
        if not created:
            continue
        if isinstance(created, datetime):
            mem_age = now_ms - created.timestamp() * 1000
        else:
            continue
        for interest in interests:
            key = interest.lower()
            if key in content:
                if mem_age <= seven_days:
                    weights[key] = weights.get(key, 1.0) + 2.0
                elif mem_age <= fourteen_days:
                    weights[key] = weights.get(key, 1.0) + 1.0

    total = sum(weights.values())
    r = random.random() * total
    for interest in interests:
        w = weights.get(interest.lower(), 1.0)
        r -= w
        if r <= 0:
            return interest
    return interests[0]


def generate_templated_greeting(
    senior: dict, recent_memories: list[dict] | None, last_greeting_index: int = -1
) -> dict:
    """Generate a templated greeting with rotation.

    Returns dict with keys: greeting, template_index, selected_interest.
    """
    first_name = (senior.get("name") or "there").split(" ")[0]
    interests = senior.get("interests") or []

    selected_interest = _select_interest(interests, recent_memories)
    templates = GREETING_TEMPLATES if selected_interest else FALLBACK_TEMPLATES

    available = [i for i in range(len(templates)) if i != last_greeting_index]
    if not available:
        available = list(range(len(templates)))
    template_index = random.choice(available)

    greeting = templates[template_index].replace("{name}", first_name)
    if selected_interest:
        greeting = greeting.replace("{interest}", selected_interest)

    return {
        "greeting": greeting,
        "template_index": template_index,
        "selected_interest": selected_interest,
    }


async def prefetch_and_cache(senior_id: str) -> dict | None:
    """Pre-fetch and cache context for a senior (parallel DB fetches)."""
    start = time.time()

    try:
        from services.seniors import get_by_id
        from services.conversations import get_recent_summaries
        from services.memory import get_critical, get_important, get_recent, group_by_type, format_grouped_memories
        from services.greetings import get_greeting

        senior = await get_by_id(senior_id)
        if not senior:
            logger.info("Senior {sid} not found, skipping", sid=senior_id)
            return None

        # Parallel fetches
        summaries, critical, important, recent_mems = await asyncio.gather(
            get_recent_summaries(senior_id, 3),
            get_critical(senior_id, 3),
            get_important(senior_id, 5),
            get_recent(senior_id, 10),
        )

        # Generate greeting using the greeting rotation service
        greeting_result = get_greeting(
            senior_name=senior.get("name", ""),
            timezone=senior.get("timezone"),
            interests=senior.get("interests"),
            last_call_summary=summaries,
            recent_memories=recent_mems,
            senior_id=senior_id,
        )

        logger.info(
            "Generated greeting for {name}: period={p}, template={t}, interest={i}",
            name=senior.get("name"),
            p=greeting_result["period"],
            t=greeting_result["template_index"],
            i=greeting_result.get("selected_interest") or "none",
        )

        # Build memory context string
        memory_parts: list[str] = []
        if critical:
            memory_parts.append("Critical to know:")
            for m in critical:
                memory_parts.append(f"- {m['content']}")

        if important:
            critical_ids = {m["id"] for m in critical}
            unique = [m for m in important if m["id"] not in critical_ids]
            if unique:
                groups = group_by_type(unique)
                formatted = format_grouped_memories(groups)
                memory_parts.append(f"\nBackground:\n{formatted}")

        now = time.time()
        cached = {
            "senior_id": senior_id,
            "senior": senior,
            "summaries": summaries,
            "critical_memories": critical,
            "important_memories": important,
            "memory_context": "\n".join(memory_parts),
            "greeting": greeting_result["greeting"],
            "last_greeting_index": greeting_result["template_index"],
            "cached_at": now,
            "expires_at": now + CACHE_TTL_SECONDS,
        }

        _cache[senior_id] = cached

        elapsed = round((time.time() - start) * 1000)
        logger.info("Pre-cached context for {name} in {ms}ms", name=senior.get("name"), ms=elapsed)
        return cached

    except Exception as e:
        logger.error("Error pre-caching {sid}: {err}", sid=senior_id, err=str(e))
        return None


def get_cache(senior_id: str) -> dict | None:
    """Get cached context for a senior. Returns None if not cached or expired."""
    cached = _cache.get(senior_id)
    if not cached:
        return None

    if time.time() > cached["expires_at"]:
        del _cache[senior_id]
        logger.info("Cache expired for {sid}", sid=senior_id)
        return None

    age_min = round((time.time() - cached["cached_at"]) / 60)
    logger.info("Cache hit for {sid} (age: {age} min)", sid=senior_id, age=age_min)
    return cached


def clear_cache(senior_id: str) -> None:
    """Clear cache for a senior (e.g., after call ends and new memories stored)."""
    if senior_id in _cache:
        del _cache[senior_id]
        logger.info("Cleared cache for {sid}", sid=senior_id)


def clear_all() -> None:
    """Clear all caches."""
    count = len(_cache)
    _cache.clear()
    logger.info("Cleared all {n} cached contexts", n=count)


async def run_daily_prefetch() -> None:
    """Run pre-fetch for seniors whose local time is 5 AM. Called hourly by scheduler."""
    logger.info("Running daily pre-fetch check...")

    try:
        from services.seniors import list_active
        seniors = await list_active()
        prefetched = 0

        for senior in seniors:
            local_hour = _get_local_hour(senior.get("timezone"))
            if local_hour == PREFETCH_HOUR:
                await prefetch_and_cache(senior["id"])
                prefetched += 1

        if prefetched > 0:
            logger.info("Pre-fetched context for {n} seniors", n=prefetched)
    except Exception as e:
        logger.error("Daily pre-fetch error: {err}", err=str(e))


def get_stats() -> dict:
    """Get cache statistics."""
    now = time.time()
    valid = sum(1 for c in _cache.values() if now <= c["expires_at"])
    expired = len(_cache) - valid
    return {"total": len(_cache), "valid": valid, "expired": expired}
