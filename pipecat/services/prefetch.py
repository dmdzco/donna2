"""Predictive Context Engine — speculative memory prefetch.

Extracts likely topics/entities from user speech using regex patterns,
then pre-fetches memories in the background so that when Claude calls
search_memories, the results are already cached and return instantly.

Two classes + two functions:
- PrefetchCache: TTL cache stored in session_state
- extract_prefetch_queries(): regex-based topic/entity extraction
- run_prefetch(): async memory search with dedup + concurrency limit
"""

from __future__ import annotations

import re
import time
from typing import Any

import asyncio
from loguru import logger

from processors.conversation_tracker import _TOPIC_PATTERNS


# ---------------------------------------------------------------------------
# Entity extraction patterns (supplement _TOPIC_PATTERNS from tracker)
# ---------------------------------------------------------------------------

_POSSESSIVE_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bmy\s+(grandson|granddaughter|grandchild|grandkid)\b", re.I), "grandchild"),
    (re.compile(r"\bmy\s+(son|daughter|boy|girl)\b", re.I), "child"),
    (re.compile(r"\bmy\s+(husband|wife|spouse|partner)\b", re.I), "spouse"),
    (re.compile(r"\bmy\s+(brother|sister|sibling)\b", re.I), "sibling"),
    (re.compile(r"\bmy\s+(friend|neighbor|neighbour)\b", re.I), "friend"),
    (re.compile(r"\bmy\s+(doctor|physician|nurse|therapist)\b", re.I), "doctor"),
    (re.compile(r"\bmy\s+(cat|dog|bird|pet)\b", re.I), "pet"),
]

_ACTIVITY_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\b(?:went|going|go)\s+(?:to\s+)?(?:the\s+)?(church|store|market|park|hospital|doctor|dentist|library)\b", re.I), None),
    (re.compile(r"\b(?:played|playing|play)\s+(cards|bingo|golf|tennis|bridge)\b", re.I), None),
    (re.compile(r"\b(?:watched|watching|watch)\s+(?:the\s+)?(game|news|movie|show|baseball|football|basketball)\b", re.I), None),
]

# Name pattern: capitalized word after relational context
_NAME_AFTER_RELATION = re.compile(
    r"\b(?:my\s+(?:grandson|granddaughter|son|daughter|husband|wife|friend|neighbor|brother|sister|niece|nephew))\s+([A-Z][a-z]{2,})\b",
    re.I,
)

# Vague utterances to skip
_SKIP_PATTERNS = re.compile(
    r"^(?:yeah|yes|no|nah|okay|ok|uh huh|mm hmm|mhm|hmm|sure|right|I see|oh|ah|well|good|fine|alright|thank you|thanks|bye|goodbye)\.?$",
    re.I,
)

# Max queries per extraction
_MAX_QUERIES = 3


# ---------------------------------------------------------------------------
# PrefetchCache
# ---------------------------------------------------------------------------

class PrefetchCache:
    """TTL-based in-memory cache for prefetched memory results.

    Stored in session_state so it's per-call. Uses fuzzy word-overlap
    (Jaccard similarity on word sets) for lookup — no embeddings needed.
    """

    DEFAULT_TTL = 30.0  # seconds
    MAX_ENTRIES = 10

    def __init__(self, ttl: float = DEFAULT_TTL):
        self._ttl = ttl
        self._entries: dict[str, dict[str, Any]] = {}
        self._hits = 0
        self._misses = 0

    def _normalize_key(self, query: str) -> str:
        return " ".join(sorted(query.lower().split()))

    def _word_set(self, text: str) -> set[str]:
        return set(text.lower().split())

    def put(self, query: str, results: list[dict], source: str = "prefetch") -> None:
        """Store prefetch results. Evicts oldest entry if at capacity."""
        key = self._normalize_key(query)

        # Evict oldest if at capacity
        if len(self._entries) >= self.MAX_ENTRIES and key not in self._entries:
            oldest_key = min(self._entries, key=lambda k: self._entries[k]["ts"])
            del self._entries[oldest_key]

        self._entries[key] = {
            "results": results,
            "source": source,
            "ts": time.time(),
            "query": query,
        }

    def get(self, query: str, threshold: float = 0.3) -> list[dict] | None:
        """Fuzzy lookup via Jaccard word-overlap similarity.

        Returns cached results if a matching entry is found and not expired.
        """
        now = time.time()
        query_words = self._word_set(query)
        if not query_words:
            self._misses += 1
            return None

        best_match: dict | None = None
        best_sim = 0.0

        for key, entry in list(self._entries.items()):
            # Expire old entries
            if now - entry["ts"] > self._ttl:
                del self._entries[key]
                continue

            entry_words = self._word_set(entry["query"])
            if not entry_words:
                continue

            # Jaccard similarity
            intersection = len(query_words & entry_words)
            union = len(query_words | entry_words)
            sim = intersection / union if union > 0 else 0.0

            if sim > best_sim:
                best_sim = sim
                best_match = entry

        if best_match and best_sim >= threshold:
            self._hits += 1
            return best_match["results"]

        self._misses += 1
        return None

    def get_recent_queries(self) -> list[str]:
        """Return queries from non-expired entries (for dedup + hints)."""
        now = time.time()
        return [
            entry["query"]
            for entry in self._entries.values()
            if now - entry["ts"] <= self._ttl
        ]

    def stats(self) -> dict[str, int]:
        """Cache statistics for metrics logging."""
        total = self._hits + self._misses
        return {
            "hits": self._hits,
            "misses": self._misses,
            "total": total,
            "hit_rate_pct": round(self._hits / total * 100) if total > 0 else 0,
            "entries": len(self._entries),
        }


# ---------------------------------------------------------------------------
# Query extraction
# ---------------------------------------------------------------------------

def extract_prefetch_queries(
    text: str,
    session_state: dict | None = None,
    source: str = "final",
) -> list[str]:
    """Extract likely memory-search queries from user speech.

    Uses _TOPIC_PATTERNS from conversation_tracker + entity patterns.
    Returns max 3 query strings. Skips vague utterances.

    Args:
        text: User transcription text.
        session_state: Pipeline session state (for Quick Observer signals).
        source: "final" or "interim" — interim uses stricter rules.
    """
    if not text or len(text.strip()) < 10:
        return []

    text = text.strip()

    # Skip vague utterances
    if _SKIP_PATTERNS.match(text):
        return []

    queries: list[str] = []
    seen: set[str] = set()

    def _add(q: str) -> None:
        q = q.strip().lower()
        if q and q not in seen and len(q) >= 3:
            seen.add(q)
            queries.append(q)

    # 1. Topic patterns from conversation_tracker
    for pattern, label in _TOPIC_PATTERNS:
        if pattern.search(text):
            _add(label)

    # For interim transcriptions, only use topic patterns (stricter)
    if source == "interim":
        return queries[:min(2, _MAX_QUERIES)]

    # 2. Possessive entity patterns ("my grandson", "my doctor")
    for pattern, label in _POSSESSIVE_PATTERNS:
        match = pattern.search(text)
        if match:
            _add(label)

    # 3. Named entities after relations ("my grandson Jake")
    for match in _NAME_AFTER_RELATION.finditer(text):
        name = match.group(1)
        _add(name)

    # 4. Activity patterns ("went to church", "played bingo")
    for pattern, _ in _ACTIVITY_PATTERNS:
        match = pattern.search(text)
        if match:
            _add(match.group(1).lower())

    # 5. Quick Observer signals (family, health, activity)
    if session_state:
        quick_analysis = session_state.get("_last_quick_analysis")
        if quick_analysis:
            if getattr(quick_analysis, "family_signals", None):
                _add("family")
            if getattr(quick_analysis, "health_signals", None):
                _add("health")
            if getattr(quick_analysis, "activity_signals", None):
                _add("activities")

    return queries[:_MAX_QUERIES]


# ---------------------------------------------------------------------------
# Director-driven query extraction (second wave — multi-turn context)
# ---------------------------------------------------------------------------

def extract_director_queries(
    direction: dict,
    session_state: dict | None = None,
) -> list[str]:
    """Extract prefetch queries from Director analysis (multi-turn context).

    Uses Gemini's structured output — current_topic, next_topic, reminder
    info, news topics — to anticipate what Claude will need next.

    Called after Gemini analysis completes (~150ms after first-wave regex).
    """
    queries: list[str] = []
    seen: set[str] = set()

    def _add(q: str) -> None:
        q = q.strip().lower()
        if q and q not in seen and len(q) >= 3:
            seen.add(q)
            queries.append(q)

    analysis = direction.get("analysis", {})
    dir_section = direction.get("direction", {})
    reminder = direction.get("reminder", {})

    # 1. Anticipatory: prefetch next_topic before conversation gets there
    next_topic = dir_section.get("next_topic")
    if next_topic and next_topic != analysis.get("current_topic"):
        _add(next_topic)

    # 2. Reminder delivery: prefetch memories related to upcoming reminder
    #    so Claude can weave it into context ("stay healthy for the grandkids")
    if reminder.get("should_deliver") and reminder.get("which_reminder"):
        _add(reminder["which_reminder"])

    # 3. News topic: prefetch memories so Claude can connect news to personal context
    if dir_section.get("should_mention_news") and dir_section.get("news_topic"):
        _add(dir_section["news_topic"])

    # 4. Current topic with depth — if they've been on a topic for 2+ turns,
    #    prefetch it (first-wave regex may have missed it on earlier turns)
    current_topic = analysis.get("current_topic")
    turns_on_topic = analysis.get("turns_on_current_topic", 0)
    if current_topic and current_topic != "unknown" and turns_on_topic >= 2:
        _add(current_topic)

    return queries[:_MAX_QUERIES]


# ---------------------------------------------------------------------------
# Prefetch runner
# ---------------------------------------------------------------------------

_MAX_CONCURRENT_SEARCHES = 2


async def run_prefetch(
    senior_id: str,
    queries: list[str],
    cache: PrefetchCache,
) -> int:
    """Run speculative memory searches and store results in cache.

    Skips queries already in cache. Runs up to 2 concurrent searches.
    Returns count of successful prefetches.

    Args:
        senior_id: Senior UUID.
        queries: Query strings to prefetch.
        cache: PrefetchCache instance to store results.
    """
    if not queries or not senior_id:
        return 0

    # Dedup: skip queries already cached
    recent = set(q.lower() for q in cache.get_recent_queries())
    new_queries = [q for q in queries if q.lower() not in recent]

    if not new_queries:
        return 0

    # Limit concurrency
    new_queries = new_queries[:_MAX_CONCURRENT_SEARCHES]

    async def _search_one(query: str) -> bool:
        try:
            from services.memory import search
            start = time.time()
            results = await search(senior_id, query, limit=3)
            elapsed_ms = round((time.time() - start) * 1000)
            if results:
                cache.put(query, results, source="prefetch")
                logger.info(
                    "[Prefetch] Cached {n} results for q={q!r} ({ms}ms)",
                    n=len(results), q=query, ms=elapsed_ms,
                )
                return True
            else:
                logger.debug(
                    "[Prefetch] No results for q={q!r} ({ms}ms)",
                    q=query, ms=elapsed_ms,
                )
                return False
        except Exception as e:
            logger.warning("[Prefetch] Search failed for q={q!r}: {err}", q=query, err=str(e))
            return False

    results = await asyncio.gather(*[_search_one(q) for q in new_queries])
    return sum(1 for r in results if r)
