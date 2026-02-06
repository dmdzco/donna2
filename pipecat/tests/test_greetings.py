"""Tests for greeting rotation service."""

from services.greetings import (
    get_greeting,
    get_time_period,
    get_local_hour,
    MORNING_TEMPLATES,
    AFTERNOON_TEMPLATES,
    EVENING_TEMPLATES,
)


class TestTimePeriod:
    def test_morning(self):
        assert get_time_period(8) == "morning"

    def test_afternoon(self):
        assert get_time_period(14) == "afternoon"

    def test_evening(self):
        assert get_time_period(19) == "evening"

    def test_late_night_is_evening(self):
        assert get_time_period(2) == "evening"

    def test_all_hours_valid(self):
        for h in range(24):
            period = get_time_period(h)
            assert period in ("morning", "afternoon", "evening")


class TestTemplates:
    def test_morning_templates_have_name_placeholder(self):
        for t in MORNING_TEMPLATES:
            assert "{name}" in t

    def test_afternoon_templates_have_name_placeholder(self):
        for t in AFTERNOON_TEMPLATES:
            assert "{name}" in t

    def test_evening_templates_have_name_placeholder(self):
        for t in EVENING_TEMPLATES:
            assert "{name}" in t


class TestGetGreeting:
    def test_generates_for_senior(self):
        result = get_greeting(senior_name="Margaret Smith", interests=["gardening"])
        assert isinstance(result, dict)
        assert "greeting" in result
        assert "Margaret" in result["greeting"]

    def test_generates_without_interests(self):
        result = get_greeting(senior_name="John Doe", interests=[])
        assert "John" in result["greeting"]

    def test_generates_with_defaults(self):
        result = get_greeting(senior_name="Jane")
        assert isinstance(result, dict)
        assert "Jane" in result["greeting"]

    def test_result_has_period(self):
        result = get_greeting(senior_name="Margaret")
        assert result["period"] in ("morning", "afternoon", "evening")
