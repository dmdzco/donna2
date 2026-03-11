"""Get usage stats for cost estimation."""
import asyncio
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


async def stats():
    from db.client import get_pool
    pool = await get_pool()

    # This week's calls
    rows = await pool.fetch("""
        SELECT
            count(*) as total_calls,
            count(*) FILTER (WHERE duration_seconds > 0) as connected_calls,
            sum(duration_seconds) as total_seconds,
            avg(duration_seconds) FILTER (WHERE duration_seconds > 0) as avg_duration,
            max(duration_seconds) as max_duration
        FROM conversations
        WHERE started_at > now() - interval '7 days'
    """)
    r = rows[0]
    print("=== THIS WEEK (last 7 days) ===")
    print(f"Total calls: {r['total_calls']}")
    print(f"Connected calls: {r['connected_calls']}")
    print(f"Total call minutes: {(r['total_seconds'] or 0) / 60:.1f}")
    print(f"Avg duration: {(r['avg_duration'] or 0):.0f}s")
    print(f"Max duration: {(r['max_duration'] or 0)}s")

    # Unique seniors/prospects
    seniors = await pool.fetchval("""
        SELECT count(DISTINCT senior_id) FROM conversations
        WHERE started_at > now() - interval '7 days' AND senior_id IS NOT NULL
    """)
    prospects = await pool.fetchval("""
        SELECT count(DISTINCT prospect_id) FROM conversations
        WHERE started_at > now() - interval '7 days' AND prospect_id IS NOT NULL
    """)
    print(f"Unique seniors called: {seniors}")
    print(f"Unique prospects called: {prospects}")

    # All time stats
    all_time = await pool.fetch("""
        SELECT
            count(*) as total,
            sum(duration_seconds) as total_seconds,
            count(DISTINCT senior_id) FILTER (WHERE senior_id IS NOT NULL) as seniors,
            count(DISTINCT prospect_id) FILTER (WHERE prospect_id IS NOT NULL) as prospects
        FROM conversations
    """)
    a = all_time[0]
    print(f"\n=== ALL TIME ===")
    print(f"Total calls: {a['total']}")
    print(f"Total minutes: {(a['total_seconds'] or 0) / 60:.1f}")
    print(f"Unique seniors: {a['seniors']}")
    print(f"Unique prospects: {a['prospects']}")

    # Memory count
    mem_count = await pool.fetchval("SELECT count(*) FROM memories")
    print(f"Total memories stored: {mem_count}")

    # Per-day breakdown this week
    daily = await pool.fetch("""
        SELECT
            date_trunc('day', started_at) as day,
            count(*) as calls,
            sum(duration_seconds) as seconds
        FROM conversations
        WHERE started_at > now() - interval '7 days'
        GROUP BY day ORDER BY day
    """)
    print(f"\n=== DAILY BREAKDOWN ===")
    for d in daily:
        day = str(d["day"])[:10]
        mins = (d["seconds"] or 0) / 60
        print(f"  {day}: {d['calls']} calls, {mins:.1f} min")


asyncio.run(stats())
