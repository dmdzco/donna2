"""Greeting rotation service.

Port of services/greetings.js — generates varied, time-aware greetings
for seniors with per-senior rotation tracking.
"""

from __future__ import annotations

import random
from datetime import datetime
from zoneinfo import ZoneInfo

# Per-senior last-used index (resets on process restart)
_last_used_index: dict[str, int] = {}
_inbound_last_used_index: dict[str, int] = {}

# ── Morning templates (5 AM – 11:59 AM) ──────────────────────────
MORNING_TEMPLATES = [
    "Good morning, {name}! It's Donna. How did you sleep last night?",
    "Hey {name}, it's Donna! Hope you had a good night's rest. How are you feeling this morning?",
    "Morning, {name}! Donna here. What are you up to this fine morning?",
    "Good morning, {name}! It's Donna calling. Have you had your breakfast yet?",
    "Hey {name}! Donna here, bright and early. How's your morning going so far?",
    "Hi {name}, good morning! It's Donna. I hope today is off to a great start for you.",
    "{name}, good morning! It's Donna. Anything exciting planned for today?",
    "Morning, {name}! It's your friend Donna. How are you doing today?",
]

# ── Afternoon templates (12 PM – 4:59 PM) ────────────────────────
AFTERNOON_TEMPLATES = [
    "Hi {name}, it's Donna! How's your afternoon going?",
    "Hey {name}! Donna here. Having a good day so far?",
    "Good afternoon, {name}! It's Donna calling. What have you been up to today?",
    "{name}, hi! It's Donna. How's the rest of your day been?",
    "Hey there {name}! Donna checking in this afternoon. How are you?",
    "Hi {name}! It's Donna. I hope your day has been a good one so far.",
    "Good afternoon, {name}! Donna here. Tell me, how's your day going?",
    "{name}! It's Donna. Enjoying your afternoon?",
]

# ── Evening templates (5 PM – 4:59 AM) ───────────────────────────
EVENING_TEMPLATES = [
    "Good evening, {name}! It's Donna. I hope you had a lovely day.",
    "Hi {name}, it's Donna! How was your day today?",
    "Hey {name}! Donna calling this evening. How are you doing?",
    "{name}, good evening! It's Donna. Have you had a nice day?",
    "Evening, {name}! It's Donna here. How's everything going tonight?",
    "Hi {name}! It's Donna. Winding down for the evening? How was your day?",
    "Hey there {name}! Donna here. Tell me about your day.",
    "Good evening, {name}! Donna checking in. How are you feeling tonight?",
]

# ── Interest-based followups ──────────────────────────────────────
INTEREST_FOLLOWUPS = [
    "Have you had a chance to enjoy any {interest} lately?",
    "Been doing any {interest} this week?",
    "I was thinking about your {interest} - how's that going?",
    "Any updates on the {interest} front?",
    "Done anything fun with {interest} recently?",
    "How's the {interest} going these days?",
]

# ── Last-call context followups ───────────────────────────────────
CONTEXT_FOLLOWUPS = [
    "Last time we chatted about {context} - any updates?",
    "I remember you mentioned {context}. How did that go?",
    "You were telling me about {context} last time. What happened with that?",
    "I've been curious about {context} since our last chat.",
    "How did things turn out with {context}?",
    "Any news about {context} since we last spoke?",
]

# ── News-based followups ──────────────────────────────────────────
NEWS_FOLLOWUPS = [
    "I saw something interesting about {topic} today - have you heard?",
    "There's some neat news about {topic} - want to hear about it?",
    "I came across something about {topic} I think you'd enjoy hearing about.",
    "Did you happen to catch any news about {topic} today?",
    "I read something about {topic} that made me think of you.",
]

# ── Inbound call templates (short, receptive) ────────────────────
INBOUND_TEMPLATES = [
    "Hello, {name}! So nice to hear from you. What's on your mind?",
    "Hi {name}! I'm so glad you called. How can I help?",
    "{name}! What a nice surprise. How are you doing?",
    "Hey {name}, it's so good to hear your voice! What's going on?",
    "Hi there, {name}! I was hoping I'd hear from you. What's up?",
    "Oh, {name}! How wonderful that you called. Tell me, what's new?",
]


def get_local_hour(tz_name: str | None) -> int:
    """Get the current local hour for a timezone."""
    try:
        tz = ZoneInfo(tz_name or "America/New_York")
        return datetime.now(tz).hour
    except Exception:
        return (datetime.now().hour - 5) % 24


def get_time_period(hour: int) -> str:
    """Determine time period from hour."""
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 17:
        return "afternoon"
    return "evening"


def _pick_index(array_length: int, exclude_index: int) -> int:
    """Pick a random index excluding a specific one."""
    indices = [i for i in range(array_length) if i != exclude_index]
    return random.choice(indices)


def select_interest(
    interests: list[str] | None,
    recent_memories: list[dict] | None = None,
    interest_scores: dict[str, float] | None = None,
) -> str | None:
    """Select an interest using weighted random (boosted by recent memory mentions)."""
    if not interests:
        return None

    from datetime import timezone as tz
    now_ts = datetime.now(tz.utc).timestamp() * 1000
    seven_days = 7 * 24 * 60 * 60 * 1000
    fourteen_days = 14 * 24 * 60 * 60 * 1000

    scores = interest_scores or {}
    weights: dict[str, float] = {i.lower(): scores.get(i.lower(), 1.0) for i in interests}

    for memory in (recent_memories or []):
        content = (memory.get("content") or "").lower()
        created = memory.get("created_at")
        if created:
            mem_age = now_ts - created.timestamp() * 1000
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


def _extract_news_topic(news_context: str | None, interests: list[str] | None) -> str | None:
    """Extract a short topic from news context for use in a followup.

    Tries to find an interest mentioned in the news, otherwise returns the
    first interest.
    """
    if not news_context or not interests:
        return None

    news_lower = news_context.lower()
    for interest in interests:
        if interest.lower() in news_lower:
            return interest

    return interests[0] if interests else None


def _extract_context_phrase(summary: str | None) -> str | None:
    """Extract a short, conversational context phrase from a call summary."""
    if not summary or len(summary) < 10:
        return None

    import re
    first_clause = re.split(r"[.;!?]", summary)[0].strip()
    cleaned = re.sub(
        r"^(discussed|talked about|chatted about|mentioned|shared about|spoke about)\s+",
        "",
        first_clause,
        flags=re.IGNORECASE,
    ).strip()

    if len(cleaned) < 5:
        return None
    if len(cleaned) > 60:
        return cleaned[:57] + "..."
    return cleaned


def get_greeting(
    *,
    senior_name: str,
    timezone: str | None = None,
    interests: list[str] | None = None,
    last_call_summary: str | None = None,
    recent_memories: list[dict] | None = None,
    senior_id: str | None = None,
    news_context: str | None = None,
    interest_scores: dict[str, float] | None = None,
) -> dict:
    """Generate a greeting for a senior.

    Returns dict with keys: greeting, period, template_index, selected_interest.
    """
    first_name = (senior_name or "there").split(" ")[0]
    local_hour = get_local_hour(timezone)
    period = get_time_period(local_hour)

    templates = (
        MORNING_TEMPLATES if period == "morning"
        else AFTERNOON_TEMPLATES if period == "afternoon"
        else EVENING_TEMPLATES
    )

    cache_key = senior_id or first_name
    last_index = _last_used_index.get(cache_key, -1)
    template_index = _pick_index(len(templates), last_index)
    _last_used_index[cache_key] = template_index

    greeting = templates[template_index].replace("{name}", first_name)

    # 60% chance of a followup
    add_followup = random.random() < 0.6

    if add_followup and last_call_summary:
        ctx_phrase = _extract_context_phrase(last_call_summary)
        if ctx_phrase:
            followup = random.choice(CONTEXT_FOLLOWUPS).replace("{context}", ctx_phrase)
            greeting += " " + followup
            return {
                "greeting": greeting,
                "period": period,
                "template_index": template_index,
                "selected_interest": None,
            }

    # News followup — 33% chance when news is available (vs interest followup)
    if add_followup and news_context and interests:
        if random.random() < 0.33:
            topic = _extract_news_topic(news_context, interests)
            if topic:
                followup = random.choice(NEWS_FOLLOWUPS).replace("{topic}", topic)
                greeting += " " + followup
                return {
                    "greeting": greeting,
                    "period": period,
                    "template_index": template_index,
                    "selected_interest": None,
                }

    if add_followup and interests:
        selected = select_interest(interests, recent_memories, interest_scores)
        if selected:
            followup = random.choice(INTEREST_FOLLOWUPS).replace("{interest}", selected)
            greeting += " " + followup
            return {
                "greeting": greeting,
                "period": period,
                "template_index": template_index,
                "selected_interest": selected,
            }

    return {
        "greeting": greeting,
        "period": period,
        "template_index": template_index,
        "selected_interest": None,
    }


def get_inbound_greeting(
    *,
    senior_name: str,
    senior_id: str | None = None,
) -> dict:
    """Generate a short, receptive greeting for when the senior calls Donna.

    Returns dict with keys: greeting, template_index.
    """
    first_name = (senior_name or "there").split(" ")[0]

    cache_key = f"inbound_{senior_id or first_name}"
    last_index = _inbound_last_used_index.get(cache_key, -1)
    template_index = _pick_index(len(INBOUND_TEMPLATES), last_index)
    _inbound_last_used_index[cache_key] = template_index

    greeting = INBOUND_TEMPLATES[template_index].replace("{name}", first_name)

    return {
        "greeting": greeting,
        "template_index": template_index,
    }
