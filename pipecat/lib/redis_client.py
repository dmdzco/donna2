"""Redis client for multi-instance shared state.

Falls back to in-memory dicts when REDIS_URL is not set, so single-instance
deployments work without Redis.

Usage:
    from lib.redis_client import shared_state

    # Dict-like interface (works with or without Redis)
    await shared_state.set("call_metadata:CA123", {...}, ttl=1800)
    data = await shared_state.get("call_metadata:CA123")
    await shared_state.delete("call_metadata:CA123")
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from loguru import logger


class InMemoryState:
    """In-memory fallback when Redis is not configured."""

    def __init__(self):
        self._data: dict[str, Any] = {}
        self._expiry: dict[str, float] = {}

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        self._data[key] = value
        if ttl:
            self._expiry[key] = time.time() + ttl

    async def get(self, key: str) -> Any | None:
        if key in self._expiry and time.time() > self._expiry[key]:
            self._data.pop(key, None)
            self._expiry.pop(key, None)
            return None
        return self._data.get(key)

    async def delete(self, key: str) -> None:
        self._data.pop(key, None)
        self._expiry.pop(key, None)

    async def keys(self, pattern: str = "*") -> list[str]:
        """Return keys matching a simple prefix pattern (prefix*)."""
        self._cleanup_expired()
        if pattern == "*":
            return list(self._data.keys())
        prefix = pattern.rstrip("*")
        return [k for k in self._data if k.startswith(prefix)]

    async def set_hash(self, key: str, mapping: dict, ttl: int | None = None) -> None:
        existing = self._data.get(key, {})
        if isinstance(existing, dict):
            existing.update(mapping)
            self._data[key] = existing
        else:
            self._data[key] = mapping
        if ttl:
            self._expiry[key] = time.time() + ttl

    async def get_hash(self, key: str) -> dict | None:
        if key in self._expiry and time.time() > self._expiry[key]:
            self._data.pop(key, None)
            self._expiry.pop(key, None)
            return None
        val = self._data.get(key)
        return val if isinstance(val, dict) else None

    async def delete_hash_field(self, key: str, field: str) -> None:
        val = self._data.get(key)
        if isinstance(val, dict):
            val.pop(field, None)

    async def cleanup(self) -> int:
        """Remove expired entries. Returns count removed."""
        return self._cleanup_expired()

    def _cleanup_expired(self) -> int:
        now = time.time()
        expired = [k for k, exp in self._expiry.items() if now > exp]
        for k in expired:
            self._data.pop(k, None)
            self._expiry.pop(k, None)
        return len(expired)

    async def close(self) -> None:
        pass


class RedisState:
    """Redis-backed shared state for multi-instance deployments."""

    def __init__(self, url: str):
        self._url = url
        self._redis = None

    async def _get_client(self):
        if self._redis is None:
            import redis.asyncio as aioredis
            self._redis = aioredis.from_url(
                self._url,
                decode_responses=True,
                max_connections=20,
            )
            logger.info("Redis connected: {}", self._url.split("@")[-1] if "@" in self._url else "localhost")
        return self._redis

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        r = await self._get_client()
        serialized = json.dumps(value, default=str)
        if ttl:
            await r.setex(key, ttl, serialized)
        else:
            await r.set(key, serialized)

    async def get(self, key: str) -> Any | None:
        r = await self._get_client()
        val = await r.get(key)
        if val is None:
            return None
        try:
            return json.loads(val)
        except (json.JSONDecodeError, TypeError):
            return val

    async def delete(self, key: str) -> None:
        r = await self._get_client()
        await r.delete(key)

    async def keys(self, pattern: str = "*") -> list[str]:
        r = await self._get_client()
        return [k async for k in r.scan_iter(match=pattern, count=100)]

    async def set_hash(self, key: str, mapping: dict, ttl: int | None = None) -> None:
        r = await self._get_client()
        # Serialize values for Redis hash
        serialized = {k: json.dumps(v, default=str) for k, v in mapping.items()}
        await r.hset(key, mapping=serialized)
        if ttl:
            await r.expire(key, ttl)

    async def get_hash(self, key: str) -> dict | None:
        r = await self._get_client()
        val = await r.hgetall(key)
        if not val:
            return None
        return {k: json.loads(v) for k, v in val.items()}

    async def delete_hash_field(self, key: str, field: str) -> None:
        r = await self._get_client()
        await r.hdel(key, field)

    async def cleanup(self) -> int:
        """Redis handles TTL expiry automatically. Returns 0."""
        return 0

    async def close(self) -> None:
        if self._redis:
            await self._redis.close()
            self._redis = None


def create_shared_state(redis_url: str = "") -> InMemoryState | RedisState:
    """Create shared state backend based on configuration."""
    if redis_url:
        logger.info("Using Redis for shared state")
        return RedisState(redis_url)
    else:
        logger.info("Using in-memory shared state (single instance)")
        return InMemoryState()


# Module-level singleton — lazy init
_state: InMemoryState | RedisState | None = None


def get_shared_state() -> InMemoryState | RedisState:
    """Get or create the shared state singleton."""
    global _state
    if _state is None:
        import os
        redis_url = os.getenv("REDIS_URL", "")
        _state = create_shared_state(redis_url)
    return _state
