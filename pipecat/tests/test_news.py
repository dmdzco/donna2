"""Tests for services/news.py — select_stories_for_call."""

from services.news import select_stories_for_call, format_news_context


class TestSelectStoriesForCall:
    def test_returns_none_for_no_news(self):
        assert select_stories_for_call(None) is None

    def test_returns_full_news_when_no_bullets(self):
        raw = "Just a paragraph with no bullet points."
        result = select_stories_for_call(raw)
        assert result == raw

    def test_selects_top_stories(self):
        full = (
            "Here are some recent news items:\n"
            "- Story about gardening trends\n"
            "- Story about cooking recipes\n"
            "- Story about space exploration\n"
            "- Story about local art show\n"
            "- Story about birdwatching tips\n"
        )
        result = select_stories_for_call(
            full,
            interests=["gardening", "cooking"],
            interest_scores={"gardening": 8.0, "cooking": 5.0},
            count=2,
        )
        assert result is not None
        assert "gardening" in result.lower()

    def test_default_count_is_3(self):
        full = (
            "- Story 1\n"
            "- Story 2\n"
            "- Story 3\n"
            "- Story 4\n"
            "- Story 5\n"
        )
        result = select_stories_for_call(full, count=3)
        # Result should have format_news_context wrapper + 3 bullets
        bullets = [l for l in result.split("\n") if l.strip().startswith("-")]
        assert len(bullets) == 3

    def test_handles_fewer_bullets_than_count(self):
        full = "- Only one story"
        result = select_stories_for_call(full, count=3)
        assert result is not None

    def test_scores_boost_relevant_stories(self):
        full = (
            "- A new gardening technique was discovered\n"
            "- Random unrelated story about politics\n"
            "- Cooking show wins award\n"
        )
        result = select_stories_for_call(
            full,
            interests=["gardening"],
            interest_scores={"gardening": 10.0},
            count=1,
        )
        # Gardening story should be selected due to high score
        assert "gardening" in result.lower()

    def test_works_without_scores(self):
        full = "- Story A\n- Story B\n- Story C"
        result = select_stories_for_call(full, interests=["cooking"])
        assert result is not None
