"""DB-backed feature flags with in-memory cache.

Flags are loaded from the ``feature_flags`` table and cached for 5 minutes.
Use ``is_enabled(key)`` for fast, synchronous checks in hot paths.
"""

from __future__ import annotations

import time

from loguru import logger

_cache: dict[str, bool] = {}
_cache_ttl = 300  # 5 minutes
_last_refresh = 0.0


async def refresh_flags() -> None:
    """Reload all flags from DB into the in-memory cache."""
    global _last_refresh
    try:
        from db import query_many
        rows = await query_many("SELECT key, enabled FROM feature_flags")
        _cache.clear()
        for row in rows:
            _cache[row["key"]] = row["enabled"]
        _last_refresh = time.time()
        logger.info("Feature flags refreshed: {n} flags loaded", n=len(_cache))
    except Exception as e:
        logger.error("Failed to refresh feature flags: {err}", err=str(e))


def is_enabled(key: str, default: bool = False) -> bool:
    """Check if a flag is enabled. Fast — reads from in-memory cache."""
    return _cache.get(key, default)


async def maybe_refresh() -> None:
    """Refresh cache if stale (older than TTL)."""
    if time.time() - _last_refresh > _cache_ttl:
        await refresh_flags()
