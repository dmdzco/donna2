"""Tests for non-blocking memory injection in Conversation Director."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from services.prefetch import PrefetchCache


def _make_director(session_state=None):
    """Create a ConversationDirector with mocked pipeline."""
    from processors.conversation_director import ConversationDirectorProcessor

    state = session_state or {}
    director = ConversationDirectorProcessor(session_state=state)
    director.push_frame = AsyncMock()
    return director


class TestInjectMemories:
    @pytest.mark.asyncio
    async def test_injects_on_cache_hit(self):
        cache = PrefetchCache()
        cache.put("gardening", [{"content": "David loves growing roses in his garden"}])
        state = {"_prefetch_cache": cache}
        director = _make_director(state)

        # "gardening" topic pattern extracts "gardening" → cache hit
        result = await director._inject_memories("I was doing some gardening today")
        assert result is True
        assert director.push_frame.call_count == 1

        frame = director.push_frame.call_args[0][0]
        content = frame.messages[0]["content"]
        assert "[MEMORY CONTEXT" in content
        assert "roses" in content

    @pytest.mark.asyncio
    async def test_no_injection_on_cache_miss(self):
        cache = PrefetchCache()
        state = {"_prefetch_cache": cache}
        director = _make_director(state)

        result = await director._inject_memories("something with no cached memories")
        assert result is False
        director.push_frame.assert_not_called()

    @pytest.mark.asyncio
    async def test_no_injection_without_cache(self):
        director = _make_director({})

        result = await director._inject_memories("hello there")
        assert result is False
        director.push_frame.assert_not_called()

    @pytest.mark.asyncio
    async def test_dedup_across_turns(self):
        cache = PrefetchCache()
        cache.put("gardening", [{"content": "Loves growing roses"}])
        state = {"_prefetch_cache": cache}
        director = _make_director(state)

        # First injection
        result1 = await director._inject_memories("I was doing some gardening")
        assert result1 is True

        # Same memory should not be re-injected
        result2 = await director._inject_memories("more about my gardening")
        assert result2 is False
        assert director.push_frame.call_count == 1

    @pytest.mark.asyncio
    async def test_new_memories_injected_after_dedup(self):
        cache = PrefetchCache()
        cache.put("gardening", [{"content": "Loves growing roses"}])
        state = {"_prefetch_cache": cache}
        director = _make_director(state)

        await director._inject_memories("I was doing some gardening")

        # Add new memory with a key that matches via extraction
        cache.put("grandchildren", [{"content": "Grandson Jake visits on Sundays"}])
        result = await director._inject_memories("My grandson Jake came to visit yesterday")
        assert result is True
        assert director.push_frame.call_count == 2

    @pytest.mark.asyncio
    async def test_counter_incremented(self):
        cache = PrefetchCache()
        cache.put("cooking", [{"content": "Makes great soup"}])
        state = {"_prefetch_cache": cache}
        director = _make_director(state)

        assert director._memories_injected == 0
        await director._inject_memories("I was cooking dinner")
        assert director._memories_injected == 1

    @pytest.mark.asyncio
    async def test_frame_format(self):
        cache = PrefetchCache()
        cache.put("family", [
            {"content": "Has two grandchildren"},
            {"content": "Son lives in Dallas"},
        ])
        state = {"_prefetch_cache": cache}
        director = _make_director(state)

        await director._inject_memories("My family came to visit")
        frame = director.push_frame.call_args[0][0]
        content = frame.messages[0]["content"]

        assert content.startswith("[MEMORY CONTEXT")
        assert "- Has two grandchildren" in content
        assert "- Son lives in Dallas" in content
        assert "I remember you telling me" in content
        assert frame.run_llm is False
