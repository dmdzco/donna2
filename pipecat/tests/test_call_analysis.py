"""Tests for call analysis — JSON repair, transcript formatting, default analysis."""

import json
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from services.call_analysis import (
    _repair_json,
    _format_transcript,
    _get_default_analysis,
    _normalize_analysis,
    get_high_severity_concerns,
)


class TestRepairJson:
    def test_trailing_comma(self):
        repaired = _repair_json('{"key": "value",}')
        assert repaired == '{"key": "value"}'

    def test_unclosed_brace(self):
        repaired = _repair_json('{"key": "value"')
        assert repaired.count("{") == repaired.count("}")

    def test_unclosed_bracket(self):
        repaired = _repair_json('["a", "b"')
        assert repaired.count("[") == repaired.count("]")

    def test_valid_json_unchanged(self):
        valid = '{"key": "value"}'
        assert _repair_json(valid) == valid

    def test_nested_trailing_commas(self):
        repaired = _repair_json('{"a": [1, 2,], "b": 3,}')
        assert repaired == '{"a": [1, 2], "b": 3}'


class TestFormatTranscript:
    def test_formats_roles(self):
        history = [
            {"role": "assistant", "content": "Hello!"},
            {"role": "user", "content": "Hi there."},
        ]
        formatted = _format_transcript(history)
        assert "DONNA: Hello!" in formatted
        assert "SENIOR: Hi there." in formatted

    def test_empty_history(self):
        assert _format_transcript(None) == "No transcript available"
        assert _format_transcript([]) == "No transcript available"

    def test_accepts_persisted_text_transcript(self):
        transcript = "Senior: Hello\nDonna: Hi there"
        assert _format_transcript(transcript) == transcript


class TestDefaultAnalysis:
    def test_has_required_fields(self):
        analysis = _get_default_analysis()
        assert "summary" in analysis
        assert "engagement_score" in analysis
        assert analysis["sentiment"] == "neutral"
        assert "concerns" in analysis
        assert isinstance(analysis["concerns"], list)
        assert "topics_discussed" in analysis
        assert "caregiver_takeaways" in analysis


class TestNormalizeAnalysis:
    def test_preserves_valid_sentiment(self):
        analysis = _normalize_analysis({
            "summary": "She sounded upbeat and engaged.",
            "sentiment": "positive",
            "engagement_score": 9,
        })
        assert analysis["sentiment"] == "positive"
        assert analysis["engagement_score"] == 9

    def test_derives_worried_sentiment_from_high_concern(self):
        analysis = _normalize_analysis({
            "summary": "A safety concern was discussed.",
            "concerns": [
                {"type": "cognitive", "severity": "high", "description": "Confusion"},
            ],
        })
        assert analysis["sentiment"] == "worried"

    def test_derives_distressed_sentiment_from_emotional_safety_concern(self):
        analysis = _normalize_analysis({
            "summary": "She sounded very upset.",
            "concerns": [
                {"type": "emotional", "severity": "high", "description": "Hopelessness"},
            ],
        })
        assert analysis["sentiment"] == "distressed"

    def test_clamps_engagement_score_and_normalizes_lists(self):
        analysis = _normalize_analysis({
            "engagement_score": 99,
            "topics": ["gardening"],
            "follow_ups": ["Ask family to check in."],
        })
        assert analysis["engagement_score"] == 10
        assert analysis["topics_discussed"] == ["gardening"]
        assert analysis["follow_up_suggestions"] == ["Ask family to check in."]


class TestHighSeverityConcerns:
    def test_filters_high_severity(self):
        analysis = {
            "concerns": [
                {"type": "health", "severity": "high", "description": "Fall"},
                {"type": "emotional", "severity": "low", "description": "Mild sadness"},
                {"type": "safety", "severity": "high", "description": "Scam mention"},
            ],
        }
        high = get_high_severity_concerns(analysis)
        assert len(high) == 2
        assert all(c["severity"] == "high" for c in high)

    def test_empty_concerns(self):
        assert get_high_severity_concerns({"concerns": []}) == []

    def test_no_concerns_key(self):
        assert get_high_severity_concerns({}) == []


class TestGetLatestAnalysis:
    @pytest.mark.asyncio
    async def test_adds_local_call_time_label(self):
        from services.call_analysis import get_latest_analysis

        row = {
            "engagement_score": 7,
            "call_quality": None,
            "summary": None,
            "analysis_encrypted": json.dumps({
                "summary": "Planned to work out tomorrow.",
                "call_quality": {"rapport": "strong"},
                "follow_up_suggestions": ["Ask if the workout is still planned."],
            }),
            "created_at": datetime(2026, 4, 14, 20, 40, tzinfo=timezone.utc),
            "call_started_at": datetime(2026, 4, 14, 20, 30, tzinfo=timezone.utc),
        }

        with patch("services.call_analysis.query_one", new_callable=AsyncMock, return_value=row) as mock_query:
            result = await get_latest_analysis("senior-1", "America/Chicago")

        assert "LEFT JOIN conversations" in mock_query.call_args[0][0]
        assert result["summary"] == "Planned to work out tomorrow."
        assert result["call_quality"] == {"rapport": "strong"}
        assert result["call_datetime"] == "Tuesday, April 14, 2026 at 3:30 PM"
        assert result["call_time_label"] != "previous call"
