"""Call metrics API routes for the observability dashboard.

Queries the call_metrics table with time-range filtering and aggregation.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from loguru import logger

from api.middleware.auth import require_admin, AuthContext
from db.client import query_many, query_one

router = APIRouter()


@router.get("/api/metrics/calls")
async def get_call_metrics(
    auth: AuthContext = Depends(require_admin),
    hours: int = Query(24, ge=1, le=168, description="Lookback window in hours"),
    limit: int = Query(50, ge=1, le=500, description="Max rows to return"),
):
    """Get recent call metrics for the observability dashboard."""
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    rows = await query_many(
        """SELECT call_sid, senior_id, call_type, duration_seconds,
                  end_reason, turn_count, phase_durations, latency,
                  breaker_states, tools_used, token_usage, error_count,
                  created_at
           FROM call_metrics
           WHERE created_at >= $1
           ORDER BY created_at DESC
           LIMIT $2""",
        since,
        limit,
    )
    return {"metrics": [dict(r) for r in rows], "since": since.isoformat()}


@router.get("/api/metrics/summary")
async def get_metrics_summary(
    auth: AuthContext = Depends(require_admin),
    hours: int = Query(24, ge=1, le=168, description="Lookback window in hours"),
):
    """Get aggregated metrics summary for dashboard widgets."""
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    row = await query_one(
        """SELECT
             COUNT(*) AS total_calls,
             COUNT(*) FILTER (WHERE error_count = 0) AS successful_calls,
             ROUND(AVG(duration_seconds)) AS avg_duration_seconds,
             ROUND(AVG(turn_count)) AS avg_turn_count,
             ROUND(AVG((latency->>'llm_ttfb_avg_ms')::numeric)) AS avg_llm_ttfb_ms,
             ROUND(AVG((latency->>'tts_ttfb_avg_ms')::numeric)) AS avg_tts_ttfb_ms,
             ROUND(AVG((latency->>'turn_avg_ms')::numeric)) AS avg_turn_latency_ms
           FROM call_metrics
           WHERE created_at >= $1""",
        since,
    )
    # End reason breakdown
    end_reasons = await query_many(
        """SELECT end_reason, COUNT(*) AS count
           FROM call_metrics
           WHERE created_at >= $1
           GROUP BY end_reason
           ORDER BY count DESC""",
        since,
    )
    return {
        "summary": dict(row) if row else {},
        "end_reasons": [dict(r) for r in end_reasons],
        "since": since.isoformat(),
    }
