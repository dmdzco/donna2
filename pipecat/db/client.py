"""Database connection layer using asyncpg.

Provides a connection pool and helper functions for executing queries
against the shared Neon PostgreSQL database.
"""

import os
import asyncpg
from loguru import logger

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    """Get or create the database connection pool."""
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            os.environ["DATABASE_URL"],
            min_size=2,
            max_size=10,
        )
        logger.info("Database pool created")
    return _pool


async def query_one(sql: str, *args) -> dict | None:
    """Execute a query and return a single row as a dict, or None."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(sql, *args)
        return dict(row) if row else None


async def query_many(sql: str, *args) -> list[dict]:
    """Execute a query and return all rows as a list of dicts."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *args)
        return [dict(r) for r in rows]


async def execute(sql: str, *args) -> str:
    """Execute a mutation query (INSERT, UPDATE, DELETE). Returns status string."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.execute(sql, *args)


async def close_pool():
    """Close the database connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("Database pool closed")
