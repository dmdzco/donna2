"""Audit all conversation transcripts for data integrity."""
import asyncio
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


async def check():
    from db.client import get_pool
    pool = await get_pool()

    # Overall stats
    total = await pool.fetchval('SELECT count(*) FROM conversations')
    no_transcript = await pool.fetchval(
        "SELECT count(*) FROM conversations WHERE transcript IS NULL AND duration_seconds > 10"
    )
    no_summary = await pool.fetchval(
        "SELECT count(*) FROM conversations WHERE summary IS NULL AND duration_seconds > 10"
    )
    stuck = await pool.fetchval(
        "SELECT count(*) FROM conversations WHERE status = 'in_progress'"
    )
    healthy = await pool.fetchval(
        "SELECT count(*) FROM conversations "
        "WHERE transcript IS NOT NULL AND summary IS NOT NULL AND status = 'completed'"
    )

    print("=== DATABASE AUDIT ===")
    print(f"Total conversations: {total}")
    print(f"Healthy (transcript + summary + completed): {healthy}")
    print(f"No transcript (>10s calls): {no_transcript}")
    print(f"No summary (>10s calls): {no_summary}")
    print(f"Stuck in_progress: {stuck}")
    print()

    # Breakdown by week
    rows = await pool.fetch("""
        SELECT
            date_trunc('week', started_at) as week,
            count(*) as total,
            count(*) FILTER (WHERE transcript IS NOT NULL AND summary IS NOT NULL AND status = 'completed') as healthy,
            count(*) FILTER (WHERE transcript IS NULL AND duration_seconds > 10) as no_transcript,
            count(*) FILTER (WHERE summary IS NULL AND duration_seconds > 10) as no_summary,
            count(*) FILTER (WHERE status = 'in_progress') as stuck,
            round(avg(duration_seconds) FILTER (WHERE duration_seconds > 0)) as avg_duration
        FROM conversations
        GROUP BY week
        ORDER BY week DESC
        LIMIT 12
    """)

    header = f"{'Week':20} | {'Total':>5} | {'OK':>4} | {'NoTrans':>7} | {'NoSum':>5} | {'Stuck':>5} | {'AvgDur':>6}"
    print(header)
    print("-" * len(header))
    for r in rows:
        week = str(r["week"])[:10] if r["week"] else "?"
        print(
            f"{week:20} | {r['total']:5} | {r['healthy']:4} |"
            f" {r['no_transcript']:7} | {r['no_summary']:5} |"
            f" {r['stuck']:5} | {(r['avg_duration'] or 0):4.0f}s"
        )

    # Lost data — long calls with no transcript
    print("\n=== LOST DATA: Calls >30s with no transcript ===")
    lost = await pool.fetch("""
        SELECT call_sid, senior_id, prospect_id, status, duration_seconds, started_at
        FROM conversations
        WHERE transcript IS NULL AND duration_seconds > 30
        ORDER BY started_at DESC
        LIMIT 20
    """)
    for r in lost:
        sid = str(r["call_sid"] or "")[:12]
        senior = str(r["senior_id"] or "")[:8]
        prospect = str(r["prospect_id"] or "")[:8]
        target = senior if senior and senior != "None" else f"p:{prospect}"
        dur = r["duration_seconds"] or 0
        print(f"  {str(r['started_at'])[:19]} | {sid} | {target:12} | {r['status']:12} | {dur}s")
    if not lost:
        print("  (none)")

    # Stuck in_progress
    print("\n=== STUCK IN_PROGRESS ===")
    stuck_rows = await pool.fetch("""
        SELECT call_sid, senior_id, prospect_id, started_at, duration_seconds
        FROM conversations WHERE status = 'in_progress'
        ORDER BY started_at DESC
        LIMIT 20
    """)
    for r in stuck_rows:
        sid = str(r["call_sid"] or "")[:12]
        senior = str(r["senior_id"] or "")[:8]
        prospect = str(r["prospect_id"] or "")[:8]
        target = senior if senior and senior != "None" else f"p:{prospect}"
        dur = r["duration_seconds"] or 0
        print(f"  {str(r['started_at'])[:19]} | {sid} | {target:12} | {dur}s")
    if not stuck_rows:
        print("  (none)")


asyncio.run(check())
