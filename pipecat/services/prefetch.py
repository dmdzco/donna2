"""Predictive Context Engine — speculative memory + web prefetch.

Extracts likely topics/entities from user speech using regex patterns
and Director LLM analysis, then pre-fetches memories and web results
in the background so that when Claude calls search_memories or
web_search, the results are already cached and return instantly.

Key classes + functions:
- PrefetchCache: TTL cache for memory results (stored in session_state)
- WebPrefetchCache: TTL cache for web search results (stored in session_state)
- extract_prefetch_queries(): regex-based topic/entity extraction
- extract_director_queries(): LLM-extracted topics from Director analysis
- extract_web_queries(): anticipated web search queries from Director
- run_prefetch(): async memory search with dedup + concurrency limit
- run_web_prefetch(): async web search prefetch
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
# WebPrefetchCache
# ---------------------------------------------------------------------------

_WEB_STOP_WORDS = frozenset({
    "the", "a", "an", "is", "are", "was", "were", "what", "when",
    "where", "how", "do", "does", "did", "in", "on", "at", "to", "for",
    "of", "and", "or", "about", "can", "you", "me", "tell", "i",
})


class WebPrefetchCache:
    """TTL-based cache for prefetched web search results.

    Uses Jaccard word-overlap for fuzzy lookup (with stop-word removal),
    same pattern as PrefetchCache. Stored in session_state["_web_prefetch_cache"].
    """

    DEFAULT_TTL = 3600.0  # 1 hour (matches news.py CACHE_TTL)
    MAX_ENTRIES = 10

    def __init__(self, ttl: float = DEFAULT_TTL):
        self._ttl = ttl
        self._entries: dict[str, dict[str, Any]] = {}
        self._hits = 0
        self._misses = 0

    def _word_set(self, text: str) -> set[str]:
        return set(w for w in text.lower().split() if w not in _WEB_STOP_WORDS)

    def put(self, query: str, result: str, source: str = "web_prefetch") -> None:
        """Store web prefetch result. Evicts oldest entry if at capacity."""
        key = " ".join(sorted(query.lower().split()))
        if len(self._entries) >= self.MAX_ENTRIES and key not in self._entries:
            oldest_key = min(self._entries, key=lambda k: self._entries[k]["ts"])
            del self._entries[oldest_key]
        self._entries[key] = {
            "result": result,
            "source": source,
            "ts": time.time(),
            "query": query,
        }

    def get(self, query: str, threshold: float = 0.4) -> str | None:
        """Fuzzy lookup via Jaccard word-overlap (with stop-word removal).

        Higher threshold (0.4) than memory cache (0.3) to avoid false hits.
        """
        now = time.time()
        query_words = self._word_set(query)
        if not query_words:
            self._misses += 1
            return None

        best_match: dict | None = None
        best_sim = 0.0

        for key, entry in list(self._entries.items()):
            if now - entry["ts"] > self._ttl:
                del self._entries[key]
                continue
            entry_words = self._word_set(entry["query"])
            if not entry_words:
                continue
            intersection = len(query_words & entry_words)
            union = len(query_words | entry_words)
            sim = intersection / union if union > 0 else 0.0
            if sim > best_sim:
                best_sim = sim
                best_match = entry

        if best_match and best_sim >= threshold:
            self._hits += 1
            return best_match["result"]

        self._misses += 1
        return None

    def get_recent_queries(self) -> list[str]:
        """Return queries from non-expired entries."""
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
    """Extract memory-search queries from user speech.

    Uses the raw utterance as the search query — let pgvector similarity
    do the filtering instead of regex gatekeeping. Skips only vague
    utterances ("yeah", "okay", "mhm").

    Args:
        text: User transcription text.
        session_state: Pipeline session state (unused, kept for API compat).
        source: "final" or "interim" — interim requires longer text.
    """
    if not text or len(text.strip()) < 10:
        return []

    text = text.strip()

    # Skip vague utterances
    if _SKIP_PATTERNS.match(text):
        return []

    # Interims need more text to be worth searching (avoid noise)
    if source == "interim" and len(text) < 25:
        return []

    # Use the raw utterance as the search query — vector similarity
    # will find relevant memories without regex pre-filtering.
    return [text]


# ---------------------------------------------------------------------------
# Director-driven query extraction (second wave — multi-turn context)
# ---------------------------------------------------------------------------

def extract_director_queries(
    direction: dict,
    session_state: dict | None = None,
) -> list[str]:
    """Extract prefetch queries from Director analysis (multi-turn context).

    Uses Groq/Cerebras LLM-extracted memory_queries (highest quality) with
    heuristic fallbacks from structured output fields.

    Called after Director analysis completes (~600ms).
    """
    queries: list[str] = []
    seen: set[str] = set()

    def _add(q: str) -> None:
        q = q.strip().lower()
        if q and q not in seen and len(q) >= 3:
            seen.add(q)
            queries.append(q)

    # 1. LLM-extracted memory queries (highest quality, from prefetch section)
    prefetch = direction.get("prefetch", {})
    for mq in prefetch.get("memory_queries", []):
        if isinstance(mq, str):
            _add(mq)

    # 2. Heuristic fallbacks from structured analysis
    analysis = direction.get("analysis", {})
    dir_section = direction.get("direction", {})
    reminder = direction.get("reminder", {})

    next_topic = dir_section.get("next_topic")
    if next_topic and next_topic != analysis.get("current_topic"):
        _add(next_topic)

    if reminder.get("should_deliver") and reminder.get("which_reminder"):
        _add(reminder["which_reminder"])

    if dir_section.get("should_mention_news") and dir_section.get("news_topic"):
        _add(dir_section["news_topic"])

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


# ---------------------------------------------------------------------------
# Web search prefetch (Director-driven)
# ---------------------------------------------------------------------------


def extract_web_queries(direction: dict) -> list[str]:
    """Extract anticipated web search queries from Director analysis.

    Only returns queries when the Director predicts the senior will ask
    a factual question. Returns max 1 query to limit API costs.
    """
    prefetch = direction.get("prefetch", {})
    anticipated = prefetch.get("anticipated_tools", [])

    # Only prefetch web if Director explicitly predicts web_search usage
    if "web_search" not in anticipated:
        return []

    web_queries = prefetch.get("web_queries", [])
    return [q.strip() for q in web_queries[:1] if isinstance(q, str) and len(q.strip()) >= 5]


async def run_web_prefetch(
    queries: list[str],
    web_cache: WebPrefetchCache,
) -> int:
    """Run speculative web searches and store results in web cache.

    Skips queries already in cache. Runs max 1 concurrent web search.
    Returns count of successful prefetches.
    """
    if not queries:
        return 0

    # Dedup: skip queries with fuzzy cache hits
    new_queries = [q for q in queries if web_cache.get(q) is None]
    if not new_queries:
        return 0

    query = new_queries[0]

    try:
        from services.news import web_search_query
        start = time.time()
        result = await asyncio.wait_for(web_search_query(query), timeout=12.0)
        elapsed_ms = round((time.time() - start) * 1000)
        if result:
            web_cache.put(query, result, source="web_prefetch")
            logger.info(
                "[WebPrefetch] Cached result for q={q!r} ({ms}ms)",
                q=query, ms=elapsed_ms,
            )
            return 1
        else:
            logger.debug("[WebPrefetch] No result for q={q!r} ({ms}ms)", q=query, ms=elapsed_ms)
            return 0
    except asyncio.TimeoutError:
        logger.warning("[WebPrefetch] Timeout for q={q!r}", q=query)
        return 0
    except Exception as e:
        logger.warning("[WebPrefetch] Error for q={q!r}: {err}", q=query, err=str(e))
        return 0
