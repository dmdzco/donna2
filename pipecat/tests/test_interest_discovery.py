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
    _match_category,
)


def _ids(results):
    """Extract interest IDs from discover_new_interests results."""
    return [r["id"] for r in results]


class TestMatchCategory:
    def test_exact_match(self):
        assert _match_category("gardening") == "gardening"

    def test_keyword_match(self):
        assert _match_category("birdwatching") == "animals"
        assert _match_category("Seattle Seahawks") == "sports"
        assert _match_category("Netflix shows") == "film"

    def test_no_match(self):
        assert _match_category("pottery") is None
        assert _match_category("knitting") is None


class TestDiscoverNewInterests:
    def test_finds_new_interest_with_high_engagement(self):
        analysis = {
            "topics_discussed": ["birdwatching", "greeting"],
            "engagement_score": 8,
            "positive_observations": ["Senior was very engaged"],
        }
        result = discover_new_interests(["gardening"], analysis, [])
        ids = _ids(result)
        assert "animals" in ids  # birdwatching maps to animals category

    def test_skips_existing_interests(self):
        analysis = {
            "topics_discussed": ["gardening", "birdwatching"],
            "engagement_score": 8,
            "positive_observations": [],
        }
        result = discover_new_interests(["gardening"], analysis, [])
        ids = _ids(result)
        assert "gardening" not in ids
        assert "animals" in ids  # birdwatching -> animals

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
        ids = _ids(result)
        assert "pottery" in ids  # no predefined category, keeps raw

    def test_includes_tracker_topics(self):
        analysis = {
            "topics_discussed": [],
            "engagement_score": 8,
            "positive_observations": [],
        }
        result = discover_new_interests([], analysis, ["knitting"])
        ids = _ids(result)
        assert "knitting" in ids

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
        ids = _ids(result)
        assert ids.count("painting") == 1

    def test_maps_to_predefined_categories(self):
        analysis = {
            "topics_discussed": ["rose garden", "NFL football", "jazz music"],
            "engagement_score": 8,
            "positive_observations": [],
        }
        result = discover_new_interests([], analysis, [])
        ids = _ids(result)
        assert "gardening" in ids
        assert "sports" in ids
        assert "music" in ids

    def test_returns_detail_text(self):
        analysis = {
            "topics_discussed": ["rose garden"],
            "engagement_score": 8,
            "positive_observations": [],
        }
        result = discover_new_interests([], analysis, [])
        assert len(result) == 1
        assert result[0]["id"] == "gardening"
        assert result[0]["detail"] == "rose garden"


class TestAddInterestsToSenior:
    @pytest.mark.asyncio
    async def test_merges_new_interests(self):
        with patch("services.seniors.update", new_callable=AsyncMock) as mock_update, \
             patch("services.seniors.get_by_id", new_callable=AsyncMock, return_value={"family_info": {}}):
            mock_update.return_value = None
            result = await add_interests_to_senior(
                "s1", [{"id": "painting", "detail": "watercolor painting"}], ["gardening", "cooking"]
            )
            assert "painting" in result
            assert "gardening" in result
            assert len(result) == 3
            mock_update.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_deduplicates(self):
        with patch("services.seniors.update", new_callable=AsyncMock) as mock_update:
            result = await add_interests_to_senior(
                "s1", [{"id": "gardening", "detail": ""}], ["gardening", "cooking"]
            )
            assert len(result) == 2
            mock_update.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_caps_at_max(self):
        existing = [f"interest_{i}" for i in range(MAX_INTERESTS)]
        with patch("services.seniors.update", new_callable=AsyncMock) as mock_update:
            result = await add_interests_to_senior("s1", [{"id": "new_one", "detail": ""}], existing)
            assert len(result) == MAX_INTERESTS
            assert "new_one" not in result
            mock_update.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_updates_interest_details(self):
        existing_family_info = {"donnaLanguage": "en", "interestDetails": {"sports": "loves football"}}
        with patch("services.seniors.update", new_callable=AsyncMock) as mock_update, \
             patch("services.seniors.get_by_id", new_callable=AsyncMock, return_value={"family_info": existing_family_info}):
            mock_update.return_value = None
            await add_interests_to_senior(
                "s1", [{"id": "gardening", "detail": "rose garden"}], ["sports"]
            )
            call_data = mock_update.call_args[0][1]
            assert "familyInfo" in call_data
            details = call_data["familyInfo"]["interestDetails"]
            assert details["gardening"] == "Detected from call: rose garden"
            # Existing detail should be preserved
            assert details["sports"] == "loves football"

    @pytest.mark.asyncio
    async def test_does_not_overwrite_existing_details(self):
        existing_family_info = {"interestDetails": {"gardening": "My custom description"}}
        with patch("services.seniors.update", new_callable=AsyncMock) as mock_update, \
             patch("services.seniors.get_by_id", new_callable=AsyncMock, return_value={"family_info": existing_family_info}):
            mock_update.return_value = None
            await add_interests_to_senior(
                "s1", [{"id": "cooking", "detail": "Italian recipes"}], ["gardening"]
            )
            call_data = mock_update.call_args[0][1]
            details = call_data["familyInfo"]["interestDetails"]
            # Gardening description should NOT be overwritten
            assert details["gardening"] == "My custom description"
            assert details["cooking"] == "Detected from call: Italian recipes"


class TestComputeInterestScores:
    @pytest.mark.asyncio
    async def test_returns_scores_for_all_interests(self):
        now = datetime.now(timezone.utc)
        rows = [
            {
                "topics": ["gardening", "cooking"],
                "analysis_encrypted": None,
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
                "topics": ["gardening"],
                "analysis_encrypted": None,
                "engagement_score": 8,
                "created_at": now - timedelta(days=1),
            },
            {
                "topics": ["cooking"],
                "analysis_encrypted": None,
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
                "topics": ["gardening"],
                "analysis_encrypted": None,
                "engagement_score": 8,
                "created_at": now - timedelta(days=1),
            },
        ]
        with patch("services.interest_discovery.query_many", new_callable=AsyncMock, return_value=rows):
            scores = await compute_interest_scores("s1", ["gardening", "reading"])
            assert scores["reading"] == 1.0
            assert scores["gardening"] > 1.0

    @pytest.mark.asyncio
    async def test_reads_topics_from_encrypted_analysis(self):
        now = datetime.now(timezone.utc)
        rows = [
            {
                "topics": None,
                "analysis_encrypted": {
                    "topics_discussed": ["gardening"],
                    "engagement_score": 9,
                },
                "engagement_score": None,
                "created_at": now - timedelta(days=1),
            },
        ]
        with patch("services.interest_discovery.query_many", new_callable=AsyncMock, return_value=rows), \
             patch("services.interest_discovery.decrypt_json", return_value=rows[0]["analysis_encrypted"]):
            scores = await compute_interest_scores("s1", ["gardening", "reading"])
            assert scores["gardening"] > scores["reading"]


class TestUpdateInterestScores:
    @pytest.mark.asyncio
    async def test_persists_scores(self):
        with patch("services.seniors.update", new_callable=AsyncMock) as mock_update:
            mock_update.return_value = None
            await update_interest_scores("s1", {"gardening": 8.5, "cooking": 3.2})
            mock_update.assert_awaited_once_with("s1", {"interest_scores": {"gardening": 8.5, "cooking": 3.2}})
