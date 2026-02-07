"""Tests for greeting rotation service."""

from services.greetings import (
    get_greeting,
    get_inbound_greeting,
    get_time_period,
    get_local_hour,
    _extract_news_topic,
    MORNING_TEMPLATES,
    AFTERNOON_TEMPLATES,
    EVENING_TEMPLATES,
    INBOUND_TEMPLATES,
    NEWS_FOLLOWUPS,
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

    def test_inbound_templates_have_name_placeholder(self):
        for t in INBOUND_TEMPLATES:
            assert "{name}" in t

    def test_news_followups_have_topic_placeholder(self):
        for t in NEWS_FOLLOWUPS:
            assert "{topic}" in t


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

    def test_accepts_news_context(self):
        result = get_greeting(
            senior_name="Margaret",
            interests=["gardening"],
            news_context="Some news about gardening trends.",
        )
        assert isinstance(result, dict)
        assert "Margaret" in result["greeting"]


class TestInboundGreeting:
    def test_generates_greeting(self):
        result = get_inbound_greeting(senior_name="Margaret Smith")
        assert isinstance(result, dict)
        assert "greeting" in result
        assert "Margaret" in result["greeting"]

    def test_has_template_index(self):
        result = get_inbound_greeting(senior_name="John")
        assert "template_index" in result
        assert isinstance(result["template_index"], int)

    def test_rotates_templates(self):
        """Calling multiple times should not always return the same template."""
        results = set()
        for _ in range(20):
            result = get_inbound_greeting(senior_name="RotateTest", senior_id="rotate-test")
            results.add(result["template_index"])
        assert len(results) > 1

    def test_handles_missing_name(self):
        result = get_inbound_greeting(senior_name="")
        assert "there" in result["greeting"]


class TestExtractNewsTopic:
    def test_finds_interest_in_news(self):
        news = "Here are some recent news items about gardening..."
        topic = _extract_news_topic(news, ["gardening", "reading"])
        assert topic == "gardening"

    def test_returns_first_interest_when_no_match(self):
        news = "Here are some recent news items about politics..."
        topic = _extract_news_topic(news, ["gardening", "reading"])
        assert topic == "gardening"

    def test_returns_none_for_no_news(self):
        assert _extract_news_topic(None, ["gardening"]) is None

    def test_returns_none_for_no_interests(self):
        assert _extract_news_topic("Some news", None) is None
