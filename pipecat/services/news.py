"""News service.

Port of services/news.js — fetches senior-friendly news via OpenAI web search.
"""

from __future__ import annotations

import os
import time
from loguru import logger

_openai_client = None
_news_cache: dict[str, dict] = {}
CACHE_TTL = 3600  # 1 hour in seconds
_MAX_CACHE_ENTRIES = 50


def _get_openai():
    global _openai_client
    if _openai_client is None:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            return None
        from openai import OpenAI
        _openai_client = OpenAI(api_key=api_key)
    return _openai_client


def _evict_expired():
    """Remove expired entries from the cache."""
    now = time.time()
    expired = [k for k, v in _news_cache.items() if now - v["timestamp"] >= CACHE_TTL]
    for k in expired:
        del _news_cache[k]


def _cache_key(interests: list[str]) -> str:
    return "|".join(sorted(i.lower() for i in interests))


async def get_news_for_senior(interests: list[str], limit: int = 3) -> str | None:
    """Fetch news relevant to a senior's interests using OpenAI web search."""
    if not interests:
        return None

    client = _get_openai()
    if client is None:
        logger.info("OpenAI not configured, skipping news fetch")
        return None

    key = _cache_key(interests)
    cached = _news_cache.get(key)
    if cached and time.time() - cached["timestamp"] < CACHE_TTL:
        logger.info("Using cached news")
        return cached["news"]

    try:
        interest_list = ", ".join(interests[:3])
        logger.info("Fetching news for interests: {il}", il=interest_list)

        response = client.responses.create(
            model="gpt-4o-mini",
            tools=[{"type": "web_search_preview"}],
            input=(
                f"Find 2-3 brief, positive news stories from today about: {interest_list}.\n"
                "These are for an elderly person, so:\n"
                "- Choose uplifting or interesting stories (avoid distressing news)\n"
                "- Keep each summary to 1-2 sentences\n"
                "- Focus on human interest, health tips, local events, or hobby-related news\n\n"
                "Format as a simple list with bullet points."
            ),
            tool_choice="required",
        )

        news_content = (response.output_text or "").strip()
        if not news_content:
            logger.info("No news content returned")
            return None

        formatted = format_news_context(news_content)
        # Evict expired entries if cache is getting large
        if len(_news_cache) >= _MAX_CACHE_ENTRIES:
            _evict_expired()
        _news_cache[key] = {"news": formatted, "timestamp": time.time()}
        logger.info("Fetched and cached news successfully")
        return formatted

    except Exception as e:
        logger.error("Error fetching news: {err}", err=str(e))
        return None


def format_news_context(raw_news: str) -> str:
    """Format news for natural conversation injection."""
    return (
        "Here are some recent news items you could mention naturally "
        f"if the conversation allows:\n{raw_news}\n\n"
        "Only bring these up if relevant to the conversation - don't force it."
    )


async def web_search_query(query: str) -> str | None:
    """General-purpose web search for answering a senior's question.

    Unlike get_news_for_senior (which finds curated news), this answers
    any question the senior might ask during a call.
    """
    if not query:
        return None

    client = _get_openai()
    if client is None:
        logger.info("OpenAI not configured, skipping web search")
        return None

    # Check cache (short TTL for general queries)
    key = f"ws:{query.lower().strip()}"
    cached = _news_cache.get(key)
    if cached and time.time() - cached["timestamp"] < CACHE_TTL:
        logger.info("Using cached web search result")
        return cached["news"]

    try:
        logger.info("Web search query: {q}", q=query)

        response = client.responses.create(
            model="gpt-4o-mini",
            tools=[{"type": "web_search_preview"}],
            input=(
                f"Answer this question concisely: {query}\n\n"
                "Keep the answer to 2-3 sentences max. "
                "Use simple, clear language suitable for an elderly person. "
                "If the question is about current events, include today's date context."
            ),
        )

        content = (response.output_text or "").strip()
        if not content:
            logger.info("No web search content returned")
            return None

        if len(_news_cache) >= _MAX_CACHE_ENTRIES:
            _evict_expired()
        _news_cache[key] = {"news": content, "timestamp": time.time()}
        logger.info("Web search completed successfully")
        return content

    except Exception as e:
        logger.error("Web search error: {err}", err=str(e))
        return None


def clear_cache():
    """Clear the news cache."""
    _news_cache.clear()
    logger.info("News cache cleared")
