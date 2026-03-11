"""Tests for Predictive Context Engine — prefetch cache, query extraction, runner."""

import asyncio
import time

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from services.prefetch import (
    PrefetchCache,
    WebPrefetchCache,
    extract_prefetch_queries,
    extract_director_queries,
    extract_web_queries,
    run_prefetch,
    run_web_prefetch,
)


# ===========================================================================
# PrefetchCache
# ===========================================================================


class TestPrefetchCache:
    def test_put_and_get_exact_match(self):
        cache = PrefetchCache()
        results = [{"content": "Loves gardening"}]
        cache.put("gardening", results)

        got = cache.get("gardening")
        assert got == results

    def test_get_returns_none_on_miss(self):
        cache = PrefetchCache()
        assert cache.get("unknown topic") is None

    def test_fuzzy_match_by_word_overlap(self):
        cache = PrefetchCache()
        cache.put("grandson Jake baseball", [{"content": "Jake plays baseball"}])

        # Partial overlap should still match with default threshold=0.3
        got = cache.get("grandson Jake")
        assert got is not None
        assert got[0]["content"] == "Jake plays baseball"

    def test_fuzzy_match_below_threshold_returns_none(self):
        cache = PrefetchCache()
        cache.put("gardening roses flowers", [{"content": "Roses"}])

        # "cooking" has zero overlap with "gardening roses flowers"
        got = cache.get("cooking dinner recipes")
        assert got is None

    def test_ttl_expiry(self):
        cache = PrefetchCache(ttl=0.1)
        cache.put("gardening", [{"content": "test"}])

        # Before expiry
        assert cache.get("gardening") is not None

        # Wait for expiry
        time.sleep(0.15)
        assert cache.get("gardening") is None

    def test_max_entries_evicts_oldest(self):
        cache = PrefetchCache()
        cache.MAX_ENTRIES = 3

        cache.put("topic1", [{"content": "1"}])
        time.sleep(0.01)
        cache.put("topic2", [{"content": "2"}])
        time.sleep(0.01)
        cache.put("topic3", [{"content": "3"}])
        time.sleep(0.01)

        # Adding a 4th should evict topic1 (oldest)
        cache.put("topic4", [{"content": "4"}])

        assert cache.get("topic1") is None
        assert cache.get("topic4") is not None

    def test_stats_tracking(self):
        cache = PrefetchCache()
        cache.put("gardening", [{"content": "test"}])

        cache.get("gardening")  # hit
        cache.get("cooking")  # miss
        cache.get("gardening")  # hit

        stats = cache.stats()
        assert stats["hits"] == 2
        assert stats["misses"] == 1
        assert stats["total"] == 3
        assert stats["hit_rate_pct"] == 67

    def test_stats_empty(self):
        cache = PrefetchCache()
        stats = cache.stats()
        assert stats["total"] == 0
        assert stats["hit_rate_pct"] == 0

    def test_get_recent_queries(self):
        cache = PrefetchCache()
        cache.put("gardening", [{"content": "1"}])
        cache.put("family", [{"content": "2"}])

        recent = cache.get_recent_queries()
        assert "gardening" in recent
        assert "family" in recent

    def test_get_recent_queries_excludes_expired(self):
        cache = PrefetchCache(ttl=0.1)
        cache.put("old topic", [{"content": "old"}])
        time.sleep(0.15)
        cache.put("new topic", [{"content": "new"}])

        recent = cache.get_recent_queries()
        assert "new topic" in recent
        # Expired entries are only cleaned on get(), so we need to trigger that
        cache.get("old topic")  # This cleans expired entries
        recent = cache.get_recent_queries()
        assert "old topic" not in recent

    def test_normalized_key_ignores_word_order(self):
        cache = PrefetchCache()
        cache.put("grandson Jake", [{"content": "test"}])

        # Same words, different order — normalized key is sorted
        got = cache.get("Jake grandson")
        assert got is not None

    def test_empty_query_returns_none(self):
        cache = PrefetchCache()
        cache.put("gardening", [{"content": "test"}])
        assert cache.get("") is None
        assert cache.get("   ") is None


# ===========================================================================
# extract_prefetch_queries
# ===========================================================================


class TestExtractQueries:
    def test_returns_raw_text(self):
        """Now returns the raw utterance for vector similarity search."""
        queries = extract_prefetch_queries("I was doing some gardening today")
        assert len(queries) == 1
        assert "gardening" in queries[0]

    def test_substantial_text(self):
        queries = extract_prefetch_queries("I went to church and then did some cooking")
        assert len(queries) == 1
        assert queries[0] == "I went to church and then did some cooking"

    def test_any_utterance_searched(self):
        """Any substantial utterance should be searched — no regex gatekeeping."""
        queries = extract_prefetch_queries("My grandson came to visit me yesterday")
        assert len(queries) == 1

    def test_natural_speech_searched(self):
        queries = extract_prefetch_queries("I just finished playing paddle and it was great")
        assert len(queries) == 1

    def test_skip_vague_utterances(self):
        assert extract_prefetch_queries("yeah") == []
        assert extract_prefetch_queries("okay") == []
        assert extract_prefetch_queries("mm hmm") == []
        assert extract_prefetch_queries("uh huh") == []
        assert extract_prefetch_queries("no") == []

    def test_skip_short_text(self):
        assert extract_prefetch_queries("hi") == []
        assert extract_prefetch_queries("good") == []
        assert extract_prefetch_queries("") == []

    def test_interim_needs_longer_text(self):
        # Interim under 25 chars should be skipped
        assert extract_prefetch_queries("I was doing some", source="interim") == []
        # Interim over 25 chars should work
        queries = extract_prefetch_queries("I was doing some gardening today okay", source="interim")
        assert len(queries) == 1

    def test_single_query_returned(self):
        """Returns exactly one query (the raw text)."""
        text = "I was gardening, then cooking dinner, reading my book, and walking the dog"
        queries = extract_prefetch_queries(text)
        assert len(queries) == 1

    def test_quick_observer_signals_ignored(self):
        """Session state signals no longer affect extraction."""
        analysis = MagicMock()
        analysis.family_signals = [{"signal": "family_visit"}]
        analysis.health_signals = []
        analysis.activity_signals = []

        session_state = {"_last_quick_analysis": analysis}
        queries = extract_prefetch_queries(
            "They came over for dinner last night", session_state
        )
        # Raw text returned regardless of Quick Observer signals
        assert len(queries) == 1
        assert queries[0] == "They came over for dinner last night"

    def test_interim_source_length_filter(self):
        # Short interim skipped
        queries = extract_prefetch_queries(
            "My grandson Jake visited", source="interim"
        )
        # Under 25 chars → skipped for interim
        assert len(queries) == 0

    def test_medical_topic(self):
        queries = extract_prefetch_queries("I have a doctor appointment tomorrow")
        assert len(queries) == 1
        assert "doctor" in queries[0]

    def test_health_concern_topic(self):
        queries = extract_prefetch_queries("My back has been hurting lately, quite sore")
        assert len(queries) == 1
        assert "back" in queries[0]


# ===========================================================================
# run_prefetch
# ===========================================================================


class TestRunPrefetch:
    @pytest.mark.asyncio
    async def test_successful_prefetch(self):
        cache = PrefetchCache()
        mock_results = [{"content": "Loves roses", "id": "1"}]

        with patch("services.memory.search", new_callable=AsyncMock) as mock_search:
            mock_search.return_value = mock_results
            count = await run_prefetch("senior-1", ["gardening"], cache)

        assert count == 1
        assert cache.get("gardening") is not None

    @pytest.mark.asyncio
    async def test_dedup_skips_cached_queries(self):
        cache = PrefetchCache()
        cache.put("gardening", [{"content": "Already cached"}])

        with patch("services.memory.search", new_callable=AsyncMock) as mock_search:
            count = await run_prefetch("senior-1", ["gardening"], cache)

        # Should skip — already cached
        assert count == 0
        mock_search.assert_not_called()

    @pytest.mark.asyncio
    async def test_no_senior_id(self):
        cache = PrefetchCache()
        count = await run_prefetch("", ["gardening"], cache)
        assert count == 0

    @pytest.mark.asyncio
    async def test_empty_queries(self):
        cache = PrefetchCache()
        count = await run_prefetch("senior-1", [], cache)
        assert count == 0

    @pytest.mark.asyncio
    async def test_search_error_handled_gracefully(self):
        cache = PrefetchCache()

        with patch("services.memory.search", new_callable=AsyncMock) as mock_search:
            mock_search.side_effect = Exception("DB connection failed")
            count = await run_prefetch("senior-1", ["gardening"], cache)

        assert count == 0
        assert cache.get("gardening") is None

    @pytest.mark.asyncio
    async def test_max_concurrent_searches(self):
        cache = PrefetchCache()

        with patch("services.memory.search", new_callable=AsyncMock) as mock_search:
            mock_search.return_value = [{"content": "result"}]
            # Pass 5 queries — should only run 2
            count = await run_prefetch(
                "senior-1",
                ["q1", "q2", "q3", "q4", "q5"],
                cache,
            )

        assert mock_search.call_count <= 2

    @pytest.mark.asyncio
    async def test_no_results_not_cached(self):
        cache = PrefetchCache()

        with patch("services.memory.search", new_callable=AsyncMock) as mock_search:
            mock_search.return_value = []
            count = await run_prefetch("senior-1", ["obscure topic"], cache)

        assert count == 0
        assert cache.get("obscure topic") is None


# ===========================================================================
# extract_director_queries (second wave — multi-turn context)
# ===========================================================================


class TestExtractDirectorQueries:
    def test_next_topic_anticipation(self):
        direction = {
            "analysis": {"current_topic": "gardening", "turns_on_current_topic": 2},
            "direction": {"next_topic": "medication", "stay_or_shift": "transition"},
            "reminder": {"should_deliver": False},
        }
        queries = extract_director_queries(direction)
        assert "medication" in queries

    def test_next_topic_same_as_current_is_skipped(self):
        direction = {
            "analysis": {"current_topic": "gardening", "turns_on_current_topic": 3},
            "direction": {"next_topic": "gardening"},
            "reminder": {"should_deliver": False},
        }
        queries = extract_director_queries(direction)
        # "gardening" may appear from current_topic rule, but not duplicated
        assert queries.count("gardening") <= 1

    def test_reminder_prefetch(self):
        direction = {
            "analysis": {"current_topic": "family", "turns_on_current_topic": 1},
            "direction": {"next_topic": None},
            "reminder": {
                "should_deliver": True,
                "which_reminder": "blood pressure medication",
            },
        }
        queries = extract_director_queries(direction)
        assert "blood pressure medication" in queries

    def test_reminder_not_prefetched_when_not_delivering(self):
        direction = {
            "analysis": {"current_topic": "family", "turns_on_current_topic": 1},
            "direction": {"next_topic": None},
            "reminder": {
                "should_deliver": False,
                "which_reminder": "blood pressure medication",
            },
        }
        queries = extract_director_queries(direction)
        assert "blood pressure medication" not in queries

    def test_news_topic_prefetch(self):
        direction = {
            "analysis": {"current_topic": "sports", "turns_on_current_topic": 1},
            "direction": {
                "next_topic": None,
                "should_mention_news": True,
                "news_topic": "local baseball scores",
            },
            "reminder": {"should_deliver": False},
        }
        queries = extract_director_queries(direction)
        assert "local baseball scores" in queries

    def test_news_not_prefetched_when_not_mentioning(self):
        direction = {
            "analysis": {"current_topic": "sports", "turns_on_current_topic": 1},
            "direction": {
                "next_topic": None,
                "should_mention_news": False,
                "news_topic": "local baseball scores",
            },
            "reminder": {"should_deliver": False},
        }
        queries = extract_director_queries(direction)
        assert "local baseball scores" not in queries

    def test_sustained_current_topic(self):
        direction = {
            "analysis": {"current_topic": "grandson", "turns_on_current_topic": 3},
            "direction": {"next_topic": None},
            "reminder": {"should_deliver": False},
        }
        queries = extract_director_queries(direction)
        assert "grandson" in queries

    def test_current_topic_ignored_if_only_1_turn(self):
        direction = {
            "analysis": {"current_topic": "grandson", "turns_on_current_topic": 1},
            "direction": {"next_topic": None},
            "reminder": {"should_deliver": False},
        }
        queries = extract_director_queries(direction)
        assert "grandson" not in queries

    def test_unknown_current_topic_ignored(self):
        direction = {
            "analysis": {"current_topic": "unknown", "turns_on_current_topic": 5},
            "direction": {"next_topic": None},
            "reminder": {"should_deliver": False},
        }
        queries = extract_director_queries(direction)
        assert "unknown" not in queries

    def test_max_3_queries(self):
        direction = {
            "analysis": {"current_topic": "family", "turns_on_current_topic": 3},
            "direction": {
                "next_topic": "medication",
                "should_mention_news": True,
                "news_topic": "weather forecast",
            },
            "reminder": {
                "should_deliver": True,
                "which_reminder": "blood pressure pills",
            },
        }
        queries = extract_director_queries(direction)
        assert len(queries) <= 3

    def test_empty_direction(self):
        queries = extract_director_queries({})
        assert queries == []

    def test_combined_scenario(self):
        """Director says: shift to medication, deliver reminder, mention news."""
        direction = {
            "analysis": {"current_topic": "gardening", "turns_on_current_topic": 4},
            "direction": {
                "next_topic": "health",
                "stay_or_shift": "transition",
                "should_mention_news": True,
                "news_topic": "local garden show",
            },
            "reminder": {
                "should_deliver": True,
                "which_reminder": "afternoon medication",
            },
        }
        queries = extract_director_queries(direction)
        # Should include anticipatory queries, capped at 3
        assert len(queries) <= 3
        assert len(queries) >= 2  # at least next_topic + reminder or news

    def test_groq_memory_queries_take_priority(self):
        """Groq-extracted memory_queries should be included first."""
        direction = {
            "analysis": {"current_topic": "travel", "turns_on_current_topic": 1},
            "direction": {"next_topic": None},
            "reminder": {"should_deliver": False},
            "prefetch": {
                "memory_queries": ["India trip", "wedding in Hyderabad"],
                "web_queries": [],
                "anticipated_tools": ["search_memories"],
            },
        }
        queries = extract_director_queries(direction)
        assert "india trip" in queries
        assert "wedding in hyderabad" in queries

    def test_groq_memory_queries_with_heuristic_fallback(self):
        """When Groq provides memory_queries, heuristics still supplement."""
        direction = {
            "analysis": {"current_topic": "family", "turns_on_current_topic": 3},
            "direction": {"next_topic": "health"},
            "reminder": {"should_deliver": False},
            "prefetch": {
                "memory_queries": ["grandson Jake"],
                "web_queries": [],
                "anticipated_tools": ["search_memories"],
            },
        }
        queries = extract_director_queries(direction)
        assert "grandson jake" in queries
        assert "health" in queries  # from next_topic heuristic

    def test_missing_prefetch_section_uses_heuristics(self):
        """Backward compatibility: no prefetch section falls back to heuristics."""
        direction = {
            "analysis": {"current_topic": "family", "turns_on_current_topic": 3},
            "direction": {"next_topic": "medication"},
            "reminder": {"should_deliver": False},
        }
        queries = extract_director_queries(direction)
        assert "medication" in queries
        assert "family" in queries


# ===========================================================================
# WebPrefetchCache
# ===========================================================================


class TestWebPrefetchCache:
    def test_put_and_get(self):
        cache = WebPrefetchCache()
        cache.put("Indian wedding traditions", "Haldi ceremony involves turmeric...")
        result = cache.get("Indian wedding traditions")
        assert result is not None
        assert "Haldi" in result

    def test_fuzzy_match_with_stop_words(self):
        cache = WebPrefetchCache()
        cache.put("Indian wedding customs and traditions", "Rich cultural ceremonies...")

        # Similar query with different stop words should still match
        result = cache.get("what are Indian wedding traditions")
        assert result is not None

    def test_miss_on_unrelated_query(self):
        cache = WebPrefetchCache()
        cache.put("Indian wedding traditions", "Ceremonies include...")
        result = cache.get("weather forecast Austin Texas")
        assert result is None

    def test_ttl_expiry(self):
        cache = WebPrefetchCache(ttl=0.1)
        cache.put("test query", "test result")
        assert cache.get("test query") is not None
        time.sleep(0.15)
        assert cache.get("test query") is None

    def test_stats_tracking(self):
        cache = WebPrefetchCache()
        cache.put("query1", "result1")
        cache.get("query1")  # hit
        cache.get("unrelated")  # miss
        stats = cache.stats()
        assert stats["hits"] == 1
        assert stats["misses"] == 1
        assert stats["hit_rate_pct"] == 50

    def test_higher_threshold_than_memory_cache(self):
        cache = WebPrefetchCache()
        cache.put("Indian wedding traditions customs", "Result here")
        # Very low overlap — should NOT match at 0.4 threshold
        result = cache.get("Indian food recipes")
        assert result is None


# ===========================================================================
# extract_web_queries
# ===========================================================================


class TestExtractWebQueries:
    def test_returns_queries_when_web_search_anticipated(self):
        direction = {
            "prefetch": {
                "memory_queries": ["India"],
                "web_queries": ["Indian wedding customs and traditions"],
                "anticipated_tools": ["search_memories", "web_search"],
            },
        }
        queries = extract_web_queries(direction)
        assert len(queries) == 1
        assert "Indian wedding customs and traditions" in queries

    def test_returns_empty_when_web_search_not_anticipated(self):
        direction = {
            "prefetch": {
                "memory_queries": ["India"],
                "web_queries": ["Indian wedding customs"],
                "anticipated_tools": ["search_memories"],
            },
        }
        queries = extract_web_queries(direction)
        assert queries == []

    def test_max_one_query(self):
        direction = {
            "prefetch": {
                "memory_queries": [],
                "web_queries": ["query1 long enough", "query2 long enough"],
                "anticipated_tools": ["web_search"],
            },
        }
        queries = extract_web_queries(direction)
        assert len(queries) <= 1

    def test_skips_short_queries(self):
        direction = {
            "prefetch": {
                "memory_queries": [],
                "web_queries": ["hi"],
                "anticipated_tools": ["web_search"],
            },
        }
        queries = extract_web_queries(direction)
        assert queries == []

    def test_missing_prefetch_section(self):
        queries = extract_web_queries({})
        assert queries == []

    def test_missing_anticipated_tools(self):
        direction = {
            "prefetch": {
                "web_queries": ["some question here"],
            },
        }
        queries = extract_web_queries(direction)
        assert queries == []


# ===========================================================================
# run_web_prefetch
# ===========================================================================


class TestRunWebPrefetch:
    @pytest.mark.asyncio
    async def test_successful_web_prefetch(self):
        cache = WebPrefetchCache()

        with patch("services.news.web_search_query", new_callable=AsyncMock) as mock_ws:
            mock_ws.return_value = "Indian weddings involve multiple ceremonies..."
            count = await run_web_prefetch(["Indian wedding traditions"], cache)

        assert count == 1
        assert cache.get("Indian wedding traditions") is not None

    @pytest.mark.asyncio
    async def test_dedup_skips_cached(self):
        cache = WebPrefetchCache()
        cache.put("Indian wedding traditions", "Already cached result")

        with patch("services.news.web_search_query", new_callable=AsyncMock) as mock_ws:
            count = await run_web_prefetch(["Indian wedding traditions"], cache)

        assert count == 0
        mock_ws.assert_not_called()

    @pytest.mark.asyncio
    async def test_empty_queries(self):
        cache = WebPrefetchCache()
        count = await run_web_prefetch([], cache)
        assert count == 0

    @pytest.mark.asyncio
    async def test_error_handled_gracefully(self):
        cache = WebPrefetchCache()

        with patch("services.news.web_search_query", new_callable=AsyncMock) as mock_ws:
            mock_ws.side_effect = Exception("API error")
            count = await run_web_prefetch(["some query here"], cache)

        assert count == 0

    @pytest.mark.asyncio
    async def test_no_result_not_cached(self):
        cache = WebPrefetchCache()

        with patch("services.news.web_search_query", new_callable=AsyncMock) as mock_ws:
            mock_ws.return_value = None
            count = await run_web_prefetch(["obscure question"], cache)

        assert count == 0
        assert cache.get("obscure question") is None
