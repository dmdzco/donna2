"""Tests for services/interest_discovery.py — interest discovery + engagement scoring."""

import pytest
from unittest.mock import AsyncMock, patch
from datetime import datetime, timezone, timedelta

from services.interest_discovery import (
    discover_new_interests,
    add_interests_to_senior,
    compute_interest_scores,
    update_interest_scores,
    MAX_INTERESTS,
    _GENERIC_BLOCKLIST,
)


class TestDiscoverNewInterests:
    def test_finds_new_interest_with_high_engagement(self):
        analysis = {
            "topics_discussed": ["birdwatching", "greeting"],
            "engagement_score": 8,
            "positive_observations": ["Senior was very engaged"],
        }
        result = discover_new_interests(["gardening"], analysis, [])
        assert "birdwatching" in result

    def test_skips_existing_interests(self):
        analysis = {
            "topics_discussed": ["gardening", "birdwatching"],
            "engagement_score": 8,
            "positive_observations": [],
        }
        result = discover_new_interests(["gardening"], analysis, [])
        assert "gardening" not in result
        assert "birdwatching" in result

    def test_skips_existing_interests_case_insensitive(self):
        analysis = {
            "topics_discussed": ["Gardening"],
            "engagement_score": 9,
            "positive_observations": [],
        }
        result = discover_new_interests(["gardening"], analysis, [])
        assert result == []

    def test_skips_generic_topics(self):
        analysis = {
            "topics_discussed": ["weather", "medication", "sleep"],
            "engagement_score": 9,
            "positive_observations": [],
        }
        result = discover_new_interests([], analysis, [])
        assert result == []

    def test_requires_engagement_or_positive_observation(self):
        analysis = {
            "topics_discussed": ["pottery"],
            "engagement_score": 4,
            "positive_observations": [],
        }
        result = discover_new_interests([], analysis, [])
        assert result == []

    def test_positive_observation_allows_low_engagement(self):
        analysis = {
            "topics_discussed": ["pottery"],
            "engagement_score": 3,
            "positive_observations": ["Really enjoyed talking about pottery"],
        }
        result = discover_new_interests([], analysis, [])
        assert "pottery" in result

    def test_includes_tracker_topics(self):
        analysis = {
            "topics_discussed": [],
            "engagement_score": 8,
            "positive_observations": [],
        }
        result = discover_new_interests([], analysis, ["knitting"])
        assert "knitting" in result

    def test_returns_empty_for_none_analysis(self):
        result = discover_new_interests(["gardening"], None, ["knitting"])
        assert result == []

    def test_skips_short_topics(self):
        analysis = {
            "topics_discussed": ["ab"],
            "engagement_score": 9,
            "positive_observations": [],
        }
        result = discover_new_interests([], analysis, [])
        assert result == []

    def test_skips_very_long_topics(self):
        analysis = {
            "topics_discussed": ["a" * 50],
            "engagement_score": 9,
            "positive_observations": [],
        }
        result = discover_new_interests([], analysis, [])
        assert result == []

    def test_deduplicates_tracker_and_analysis(self):
        analysis = {
            "topics_discussed": ["painting"],
            "engagement_score": 8,
            "positive_observations": [],
        }
        result = discover_new_interests([], analysis, ["painting"])
        assert result.count("painting") == 1


class TestAddInterestsToSenior:
    @pytest.mark.asyncio
    async def test_merges_new_interests(self):
        with patch("services.seniors.update", new_callable=AsyncMock) as mock_update:
            mock_update.return_value = None
            result = await add_interests_to_senior(
                "s1", ["painting"], ["gardening", "cooking"]
            )
            assert "painting" in result
            assert "gardening" in result
            assert len(result) == 3
            mock_update.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_deduplicates(self):
        with patch("services.seniors.update", new_callable=AsyncMock) as mock_update:
            result = await add_interests_to_senior(
                "s1", ["gardening"], ["gardening", "cooking"]
            )
            assert len(result) == 2
            mock_update.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_caps_at_max(self):
        existing = [f"interest_{i}" for i in range(MAX_INTERESTS)]
        with patch("services.seniors.update", new_callable=AsyncMock) as mock_update:
            result = await add_interests_to_senior("s1", ["new_one"], existing)
            assert len(result) == MAX_INTERESTS
            assert "new_one" not in result
            mock_update.assert_not_awaited()


class TestComputeInterestScores:
    @pytest.mark.asyncio
    async def test_returns_scores_for_all_interests(self):
        now = datetime.now(timezone.utc)
        rows = [
            {
                "topics_discussed": ["gardening", "cooking"],
                "engagement_score": 8,
                "created_at": now - timedelta(days=1),
            },
        ]
        with patch("services.interest_discovery.query_many", new_callable=AsyncMock, return_value=rows):
            scores = await compute_interest_scores("s1", ["gardening", "cooking", "reading"])
            assert "gardening" in scores
            assert "cooking" in scores
            assert "reading" in scores
            # gardening and cooking were discussed with high engagement, reading was not
            assert scores["gardening"] > scores["reading"]
            assert scores["cooking"] > scores["reading"]

    @pytest.mark.asyncio
    async def test_recency_weighting(self):
        now = datetime.now(timezone.utc)
        rows = [
            {
                "topics_discussed": ["gardening"],
                "engagement_score": 8,
                "created_at": now - timedelta(days=1),
            },
            {
                "topics_discussed": ["cooking"],
                "engagement_score": 8,
                "created_at": now - timedelta(days=28),
            },
        ]
        with patch("services.interest_discovery.query_many", new_callable=AsyncMock, return_value=rows):
            scores = await compute_interest_scores("s1", ["gardening", "cooking"])
            assert scores["gardening"] > scores["cooking"]

    @pytest.mark.asyncio
    async def test_empty_interests(self):
        with patch("services.interest_discovery.query_many", new_callable=AsyncMock, return_value=[]):
            scores = await compute_interest_scores("s1", [])
            assert scores == {}

    @pytest.mark.asyncio
    async def test_no_call_data_gives_baseline(self):
        with patch("services.interest_discovery.query_many", new_callable=AsyncMock, return_value=[]):
            scores = await compute_interest_scores("s1", ["gardening", "cooking"])
            assert scores["gardening"] == 1.0
            assert scores["cooking"] == 1.0

    @pytest.mark.asyncio
    async def test_undiscussed_interests_get_baseline(self):
        now = datetime.now(timezone.utc)
        rows = [
            {
                "topics_discussed": ["gardening"],
                "engagement_score": 8,
                "created_at": now - timedelta(days=1),
            },
        ]
        with patch("services.interest_discovery.query_many", new_callable=AsyncMock, return_value=rows):
            scores = await compute_interest_scores("s1", ["gardening", "reading"])
            assert scores["reading"] == 1.0
            assert scores["gardening"] > 1.0


class TestUpdateInterestScores:
    @pytest.mark.asyncio
    async def test_persists_scores(self):
        with patch("services.seniors.update", new_callable=AsyncMock) as mock_update:
            mock_update.return_value = None
            await update_interest_scores("s1", {"gardening": 8.5, "cooking": 3.2})
            mock_update.assert_awaited_once_with("s1", {"interest_scores": {"gardening": 8.5, "cooking": 3.2}})
