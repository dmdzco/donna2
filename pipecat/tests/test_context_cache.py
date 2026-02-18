"""Tests for services/context_cache.py — pre-caching + greeting generation."""

import time
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from datetime import datetime, timezone

from services.context_cache import (
    _get_local_hour,
    _select_interest,
    generate_templated_greeting,
    get_cache,
    clear_cache,
    clear_all,
    get_stats,
    _cache,
    CACHE_TTL_SECONDS,
    GREETING_TEMPLATES,
    FALLBACK_TEMPLATES,
)


class TestGetLocalHour:
    def test_valid_timezone(self):
        result = _get_local_hour("America/New_York")
        assert 0 <= result <= 23

    def test_none_falls_back(self):
        result = _get_local_hour(None)
        assert 0 <= result <= 23

    def test_invalid_no_crash(self):
        result = _get_local_hour("Invalid/Timezone")
        assert isinstance(result, int)


class TestSelectInterest:
    def test_empty_returns_none(self):
        assert _select_interest([], None) is None

    def test_none_returns_none(self):
        assert _select_interest(None, None) is None

    def test_returns_one_of_interests(self):
        interests = ["gardening", "cooking", "reading"]
        result = _select_interest(interests, None)
        assert result in interests

    def test_with_recent_memories(self):
        interests = ["gardening", "cooking"]
        recent = [{"content": "Talked about gardening", "created_at": datetime.now(timezone.utc)}]
        result = _select_interest(interests, recent)
        assert result in interests


class TestGenerateTemplatedGreeting:
    def test_contains_first_name(self):
        senior = {"name": "Margaret Johnson", "interests": ["gardening"]}
        result = generate_templated_greeting(senior, None)
        assert "Margaret" in result["greeting"]

    def test_with_interests_uses_greeting_templates(self):
        senior = {"name": "Margaret", "interests": ["gardening"]}
        result = generate_templated_greeting(senior, None)
        assert result["selected_interest"] is not None

    def test_without_interests_uses_fallback(self):
        senior = {"name": "Margaret", "interests": []}
        result = generate_templated_greeting(senior, None)
        assert result["selected_interest"] is None

    def test_rotation_avoids_last_index(self):
        senior = {"name": "Test", "interests": []}
        for i in range(len(FALLBACK_TEMPLATES)):
            result = generate_templated_greeting(senior, None, last_greeting_index=i)
            assert result["template_index"] != i

    def test_result_keys(self):
        senior = {"name": "Test", "interests": ["reading"]}
        result = generate_templated_greeting(senior, None)
        assert "greeting" in result
        assert "template_index" in result
        assert "selected_interest" in result


class TestCacheOps:
    @pytest.fixture(autouse=True)
    def clear(self):
        _cache.clear()
        yield
        _cache.clear()

    def test_cache_hit(self):
        now = time.time()
        _cache["s1"] = {"cached_at": now, "expires_at": now + 3600, "data": "test"}
        result = get_cache("s1")
        assert result is not None
        assert result["data"] == "test"

    def test_cache_miss(self):
        assert get_cache("unknown") is None

    def test_cache_expired(self):
        now = time.time()
        _cache["s1"] = {"cached_at": now - 100000, "expires_at": now - 1}
        assert get_cache("s1") is None
        assert "s1" not in _cache

    def test_clear_cache(self):
        _cache["s1"] = {"cached_at": 0, "expires_at": 0}
        clear_cache("s1")
        assert "s1" not in _cache

    def test_clear_all(self):
        _cache["s1"] = {"cached_at": 0, "expires_at": 0}
        _cache["s2"] = {"cached_at": 0, "expires_at": 0}
        clear_all()
        assert len(_cache) == 0

    def test_get_stats(self):
        now = time.time()
        _cache["s1"] = {"cached_at": now, "expires_at": now + 3600}
        _cache["s2"] = {"cached_at": now - 100000, "expires_at": now - 1}
        stats = get_stats()
        assert stats["total"] == 2
        assert stats["valid"] == 1
        assert stats["expired"] == 1


class TestPrefetchAndCache:
    @pytest.fixture(autouse=True)
    def clear(self):
        _cache.clear()
        yield
        _cache.clear()

    @pytest.mark.asyncio
    async def test_returns_none_when_senior_not_found(self):
        with patch("services.seniors.get_by_id", new_callable=AsyncMock, return_value=None):
            from services.context_cache import prefetch_and_cache
            result = await prefetch_and_cache("s-unknown")
            assert result is None

    @pytest.mark.asyncio
    async def test_populates_cache(self):
        senior = {"id": "s1", "name": "Margaret", "interests": ["gardening"], "timezone": "America/New_York"}
        with patch("services.seniors.get_by_id", new_callable=AsyncMock, return_value=senior), \
             patch("services.conversations.get_recent_summaries", new_callable=AsyncMock, return_value="Recent call summary"), \
             patch("services.conversations.get_recent_turns", new_callable=AsyncMock, return_value="Turn history"), \
             patch("services.memory.get_critical", new_callable=AsyncMock, return_value=[]), \
             patch("services.memory.get_important", new_callable=AsyncMock, return_value=[]), \
             patch("services.memory.get_recent", new_callable=AsyncMock, return_value=[]), \
             patch("services.news.get_news_for_senior", new_callable=AsyncMock, return_value=None), \
             patch("services.greetings.get_greeting", return_value={"greeting": "Hi Margaret!", "period": "morning", "template_index": 0, "selected_interest": "gardening"}):
            from services.context_cache import prefetch_and_cache
            result = await prefetch_and_cache("s1")
            assert result is not None
            assert "s1" in _cache
            assert _cache["s1"]["greeting"] == "Hi Margaret!"


class TestRunDailyPrefetch:
    @pytest.fixture(autouse=True)
    def clear(self):
        _cache.clear()
        yield
        _cache.clear()

    @pytest.mark.asyncio
    async def test_only_prefetches_at_hour_5(self):
        seniors = [{"id": "s1", "timezone": "America/New_York"}, {"id": "s2", "timezone": "America/Los_Angeles"}]
        with patch("services.seniors.list_active", new_callable=AsyncMock, return_value=seniors), \
             patch("services.context_cache._get_local_hour", side_effect=lambda tz: 5 if tz == "America/New_York" else 10), \
             patch("services.context_cache.prefetch_and_cache", new_callable=AsyncMock) as mock_prefetch:
            from services.context_cache import run_daily_prefetch
            await run_daily_prefetch()
            mock_prefetch.assert_called_once_with("s1")

    @pytest.mark.asyncio
    async def test_skips_non_hour_5(self):
        seniors = [{"id": "s1", "timezone": "America/New_York"}]
        with patch("services.seniors.list_active", new_callable=AsyncMock, return_value=seniors), \
             patch("services.context_cache._get_local_hour", return_value=10), \
             patch("services.context_cache.prefetch_and_cache", new_callable=AsyncMock) as mock_prefetch:
            from services.context_cache import run_daily_prefetch
            await run_daily_prefetch()
            mock_prefetch.assert_not_called()
