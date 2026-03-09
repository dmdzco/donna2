"""Tests for daily news caching to DB."""

import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_prefetch_persists_news_to_db():
    """Daily prefetch should persist news to seniors.cached_news column."""
    from services.context_cache import prefetch_and_cache

    mock_senior = {
        "id": "abc-123",
        "name": "David",
        "timezone": "America/New_York",
        "interests": ["gardening", "baseball"],
        "interest_scores": {},
        "call_settings": None,
    }

    with patch("services.seniors.get_by_id", new_callable=AsyncMock, return_value=mock_senior), \
         patch("services.conversations.get_recent_summaries", new_callable=AsyncMock, return_value=None), \
         patch("services.conversations.get_recent_turns", new_callable=AsyncMock, return_value=None), \
         patch("services.memory.get_critical", new_callable=AsyncMock, return_value=[]), \
         patch("services.memory.get_important", new_callable=AsyncMock, return_value=[]), \
         patch("services.memory.get_recent", new_callable=AsyncMock, return_value=[]), \
         patch("services.news.get_news_for_senior", new_callable=AsyncMock, return_value="NEWS: gardening tips"), \
         patch("services.news.select_stories_for_call", return_value="NEWS: gardening tips"), \
         patch("services.greetings.get_greeting", return_value={"greeting": "Hi", "period": "morning", "template_index": 0}), \
         patch("services.context_cache.execute", new_callable=AsyncMock, return_value="UPDATE 1") as mock_exec:
        await prefetch_and_cache("abc-123")

        # Should have called execute to persist news
        mock_exec.assert_called_once()
        sql = mock_exec.call_args[0][0]
        assert "cached_news" in sql
        assert "seniors" in sql


@pytest.mark.asyncio
async def test_prefetch_skips_news_persistence_when_no_news():
    """Prefetch should not persist news when fetch returns None."""
    from services.context_cache import prefetch_and_cache

    mock_senior = {
        "id": "abc-123",
        "name": "David",
        "timezone": "America/New_York",
        "interests": ["gardening"],
        "interest_scores": {},
        "call_settings": None,
    }

    with patch("services.seniors.get_by_id", new_callable=AsyncMock, return_value=mock_senior), \
         patch("services.conversations.get_recent_summaries", new_callable=AsyncMock, return_value=None), \
         patch("services.conversations.get_recent_turns", new_callable=AsyncMock, return_value=None), \
         patch("services.memory.get_critical", new_callable=AsyncMock, return_value=[]), \
         patch("services.memory.get_important", new_callable=AsyncMock, return_value=[]), \
         patch("services.memory.get_recent", new_callable=AsyncMock, return_value=[]), \
         patch("services.news.get_news_for_senior", new_callable=AsyncMock, return_value=None), \
         patch("services.news.select_stories_for_call", return_value=None), \
         patch("services.greetings.get_greeting", return_value={"greeting": "Hi", "period": "morning", "template_index": 0}), \
         patch("services.context_cache.execute", new_callable=AsyncMock) as mock_exec:
        await prefetch_and_cache("abc-123")

        # Should NOT have called execute (no news to persist)
        mock_exec.assert_not_called()
