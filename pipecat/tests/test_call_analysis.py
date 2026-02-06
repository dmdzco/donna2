"""Tests for call analysis — JSON repair, transcript formatting, default analysis."""

from services.call_analysis import (
    _repair_json,
    _format_transcript,
    _get_default_analysis,
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


class TestDefaultAnalysis:
    def test_has_required_fields(self):
        analysis = _get_default_analysis()
        assert "summary" in analysis
        assert "engagement_score" in analysis
        assert "concerns" in analysis
        assert isinstance(analysis["concerns"], list)
        assert "topics_discussed" in analysis


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
