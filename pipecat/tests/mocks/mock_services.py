"""Mock implementations for external services used by tool handlers.

These mocks are designed to be used as module-level patches so that the
lazy imports in flows/tools.py resolve to controlled implementations.
"""

from __future__ import annotations
from unittest.mock import AsyncMock


class MockMemoryService:
    """Mock for services.memory -- configurable search results."""

    def __init__(self, memories: list[dict] | None = None):
        self.memories = memories or [
            {"content": "Loves rose gardening", "similarity": 0.9},
            {"content": "Grandson Jake plays baseball", "similarity": 0.8},
        ]
        self.search = AsyncMock(side_effect=self._search)
        self.store = AsyncMock(return_value=None)
        self.extract_from_conversation = AsyncMock(return_value=None)
        self.search_calls: list[dict] = []
        self.store_calls: list[dict] = []

    async def _search(self, senior_id: str, query: str, limit: int = 3) -> list[dict]:
        self.search_calls.append({"senior_id": senior_id, "query": query, "limit": limit})
        # Simple keyword matching for test scenarios
        matched = [
            m for m in self.memories
            if any(word.lower() in m["content"].lower() for word in query.split())
        ]
        return matched[:limit] if matched else self.memories[:limit]


class MockNewsService:
    """Mock for services.news -- returns canned news."""

    def __init__(self, news_text: str = "The local garden show is this weekend."):
        self.news_text = news_text
        self.get_news_for_topic = AsyncMock(side_effect=self._get_news)
        self.calls: list[str] = []

    async def _get_news(self, topic: str, limit: int = 2) -> str:
        self.calls.append(topic)
        return self.news_text


class MockSchedulerService:
    """Mock for services.scheduler -- tracks reminder acknowledgments."""

    def __init__(self):
        self.acknowledged: list[dict] = []
        self.mark_reminder_acknowledged = AsyncMock(side_effect=self._mark_ack)
        self.mark_call_ended_without_acknowledgment = AsyncMock(return_value=None)
        self.clear_reminder_context = AsyncMock(return_value=None)

    async def _mark_ack(self, delivery_id: str, status: str, response: str = ""):
        self.acknowledged.append({
            "delivery_id": delivery_id,
            "status": status,
            "response": response,
        })


class MockDirectorLLM:
    """Mock for services.director_llm.analyze_turn -- returns configurable directions."""

    def __init__(self, direction: dict | None = None):
        from services.director_llm import get_default_direction
        self.direction = direction or get_default_direction()
        self.call_count = 0

    async def analyze_turn(self, user_message: str, session_state: dict, **kwargs) -> dict:
        self.call_count += 1
        return self.direction

    def set_direction(self, direction: dict):
        """Update the direction returned by subsequent calls."""
        self.direction = direction
