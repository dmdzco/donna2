"""Tests for Predictive Context Engine — prefetch cache, query extraction, runner."""

import asyncio
import time

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from services.prefetch import (
    PrefetchCache,
    extract_prefetch_queries,
    extract_director_queries,
    run_prefetch,
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
    def test_topic_patterns_from_tracker(self):
        queries = extract_prefetch_queries("I was doing some gardening today")
        assert "gardening" in queries

    def test_multiple_topics(self):
        queries = extract_prefetch_queries("I went to church and then did some cooking")
        assert "faith" in queries
        assert "cooking" in queries

    def test_possessive_entity_patterns(self):
        queries = extract_prefetch_queries("My grandson came to visit me yesterday")
        assert "grandchild" in queries or "grandchildren" in queries

    def test_named_entity_after_relation(self):
        queries = extract_prefetch_queries("My grandson Jake came to visit")
        assert any("jake" in q.lower() for q in queries)

    def test_activity_patterns(self):
        queries = extract_prefetch_queries("I went to the park with my friend yesterday")
        assert "park" in queries or "social" in queries

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

    def test_max_3_queries(self):
        # Long sentence with many topics
        text = "I was gardening, then cooking dinner, reading my book, and walking the dog"
        queries = extract_prefetch_queries(text)
        assert len(queries) <= 3

    def test_dedup_queries(self):
        # "family" should only appear once even if matched by multiple patterns
        queries = extract_prefetch_queries("My family came over, my son and daughter visited")
        family_count = sum(1 for q in queries if q == "family")
        assert family_count <= 1

    def test_quick_observer_signals(self):
        analysis = MagicMock()
        analysis.family_signals = [{"signal": "family_visit"}]
        analysis.health_signals = []
        analysis.activity_signals = []

        session_state = {"_last_quick_analysis": analysis}
        queries = extract_prefetch_queries(
            "They came over for dinner last night", session_state
        )
        assert "family" in queries

    def test_interim_source_stricter(self):
        # Interim only uses topic patterns, no entity extraction
        queries = extract_prefetch_queries(
            "My grandson Jake visited", source="interim"
        )
        # Should get "grandchildren" (topic pattern) but not "jake" (entity)
        assert not any("jake" in q.lower() for q in queries)
        assert len(queries) <= 2

    def test_medical_topic(self):
        queries = extract_prefetch_queries("I have a doctor appointment tomorrow")
        assert "medical" in queries

    def test_health_concern_topic(self):
        queries = extract_prefetch_queries("My back has been hurting lately, quite sore")
        assert "health concerns" in queries


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
