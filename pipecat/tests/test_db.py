"""Tests for database connection layer.

These tests validate the module structure and query helper signatures.
Integration tests (requiring DATABASE_URL) are skipped locally.
"""

import os
import pytest

from db.client import get_pool, query_one, query_many, execute, close_pool


def test_module_exports():
    """All expected functions are importable."""
    from db import get_pool, query_one, query_many, execute, close_pool
    assert callable(get_pool)
    assert callable(query_one)
    assert callable(query_many)
    assert callable(execute)
    assert callable(close_pool)


@pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL not set - skip integration tests"
)
@pytest.mark.asyncio
async def test_pool_creation():
    """Pool can be created and closed."""
    pool = await get_pool()
    assert pool is not None
    await close_pool()


@pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL not set - skip integration tests"
)
@pytest.mark.asyncio
async def test_query_one_returns_dict_or_none():
    """query_one returns a dict for existing rows, None for no results."""
    result = await query_one("SELECT 1 as val")
    assert result == {"val": 1}

    result = await query_one("SELECT 1 as val WHERE false")
    assert result is None
    await close_pool()


@pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL not set - skip integration tests"
)
@pytest.mark.asyncio
async def test_query_many_returns_list():
    """query_many returns a list of dicts."""
    result = await query_many("SELECT generate_series(1, 3) as val")
    assert len(result) == 3
    assert result[0] == {"val": 1}
    await close_pool()
