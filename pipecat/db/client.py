"""Database connection layer using asyncpg.

Provides a connection pool and helper functions for executing queries
against the shared Neon PostgreSQL database.
"""

from __future__ import annotations

import os
import time

import asyncpg
from loguru import logger

_pool: asyncpg.Pool | None = None

_SLOW_QUERY_THRESHOLD_MS = 100


async def get_pool() -> asyncpg.Pool:
    """Get or create the database connection pool."""
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            os.environ["DATABASE_URL"],
            min_size=int(os.getenv("DB_POOL_MIN", "5")),
            max_size=int(os.getenv("DB_POOL_MAX", "50")),
        )
        logger.info(
            "Database pool created (min={min}, max={max})",
            min=_pool.get_min_size(),
            max=_pool.get_max_size(),
        )
    return _pool


async def get_pool_stats() -> dict:
    """Return current connection pool statistics."""
    pool = await get_pool()
    return {
        "size": pool.get_size(),
        "idle": pool.get_idle_size(),
        "max": pool.get_max_size(),
        "min": pool.get_min_size(),
    }


async def query_one(sql: str, *args) -> dict | None:
    """Execute a query and return a single row as a dict, or None."""
    pool = await get_pool()
    t0 = time.monotonic()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(sql, *args)
    elapsed_ms = (time.monotonic() - t0) * 1000
    if elapsed_ms > _SLOW_QUERY_THRESHOLD_MS:
        logger.warning(
            "Slow query ({ms:.0f}ms): {sql}",
            ms=elapsed_ms,
            sql=sql[:120],
        )
    return dict(row) if row else None


async def query_many(sql: str, *args) -> list[dict]:
    """Execute a query and return all rows as a list of dicts."""
    pool = await get_pool()
    t0 = time.monotonic()
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *args)
    elapsed_ms = (time.monotonic() - t0) * 1000
    if elapsed_ms > _SLOW_QUERY_THRESHOLD_MS:
        logger.warning(
            "Slow query ({ms:.0f}ms, {n} rows): {sql}",
            ms=elapsed_ms,
            n=len(rows),
            sql=sql[:120],
        )
    return [dict(r) for r in rows]


async def execute(sql: str, *args) -> str:
    """Execute a mutation query (INSERT, UPDATE, DELETE). Returns status string."""
    pool = await get_pool()
    t0 = time.monotonic()
    async with pool.acquire() as conn:
        result = await conn.execute(sql, *args)
    elapsed_ms = (time.monotonic() - t0) * 1000
    if elapsed_ms > _SLOW_QUERY_THRESHOLD_MS:
        logger.warning(
            "Slow mutation ({ms:.0f}ms): {sql}",
            ms=elapsed_ms,
            sql=sql[:120],
        )
    return result


async def check_health() -> bool:
    """Check if the database is reachable."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return True
    except Exception:
        return False


async def close_pool():
    """Close the database connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("Database pool closed")
