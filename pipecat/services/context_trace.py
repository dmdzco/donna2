"""Per-call LLM context provenance for observability.

Records what prompt/context/tool information entered the LLM path during a
call. The trace is persisted encrypted by post-call processing and is intended
only for authenticated internal observability.
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
import math
import time
from typing import Any


MAX_CONTEXT_EVENTS = 480
MAX_CONTEXT_CONTENT_CHARS = 12_000


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _offset_ms(session_state: dict) -> int | None:
    started = session_state.get("_trace_start_time")
    if not started:
        started = session_state.get("_call_start_time")
    if not started:
        return None
    try:
        return max(0, round((time.time() - float(started)) * 1000))
    except (TypeError, ValueError):
        return None


def _normalize_content(content: Any) -> str | None:
    if content is None:
        return None
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            text = item.get("text") if isinstance(item, dict) else item
            if text:
                parts.append(str(text))
        return "\n".join(parts)
    if isinstance(content, dict):
        return json.dumps(content, default=str, ensure_ascii=False)
    return str(content)


def _json_safe(value: Any) -> Any:
    if value is None:
        return None
    try:
        return json.loads(json.dumps(value, default=str))
    except (TypeError, ValueError):
        return str(value)


def _preferred_turn_sequence(session_state: dict) -> int | None:
    current_turn = session_state.get("_current_turn_sequence")
    if isinstance(current_turn, int) and current_turn >= 0:
        return current_turn

    metrics = session_state.get("_call_metrics") or {}
    turn_count = metrics.get("turn_count")
    if isinstance(turn_count, int) and turn_count >= 0:
        return turn_count

    return None


def _is_priority_event(event: dict[str, Any]) -> bool:
    if event.get("source") == "call_lifecycle":
        return True
    if event.get("latency_ms") is not None:
        return True
    stage = event.get("metadata", {}).get("stage") if isinstance(event.get("metadata"), dict) else None
    return isinstance(stage, str) and bool(stage.strip())


def _trim_context_events(events: list[dict[str, Any]]) -> None:
    while len(events) > MAX_CONTEXT_EVENTS:
        removal_index = next(
            (index for index, event in enumerate(events) if not _is_priority_event(event)),
            0,
        )
        del events[removal_index]

    for index, item in enumerate(events):
        item["sequence"] = index


def record_context_event(
    session_state: dict | None,
    *,
    source: str,
    action: str,
    label: str,
    content: Any = None,
    provider: str | None = None,
    item_count: int | None = None,
    latency_ms: int | None = None,
    turn_sequence: int | None = None,
    metadata: dict | None = None,
    dedupe_key: str | None = None,
) -> dict | None:
    """Append a context provenance event to ``session_state``.

    The function intentionally does not log content. Content can include PHI and
    is encrypted when post-call metrics are written.
    """
    if session_state is None:
        return None

    if dedupe_key:
        seen = session_state.setdefault("_context_trace_dedupe", set())
        if dedupe_key in seen:
            return None
        seen.add(dedupe_key)

    events = session_state.setdefault("_context_trace_events", [])
    content_text = _normalize_content(content)
    content_chars = len(content_text) if content_text else 0
    truncated = False
    if content_text and len(content_text) > MAX_CONTEXT_CONTENT_CHARS:
        content_text = content_text[:MAX_CONTEXT_CONTENT_CHARS]
        truncated = True

    if turn_sequence is None:
        turn_sequence = _preferred_turn_sequence(session_state)

    event = {
        "sequence": len(events),
        "timestamp": _utc_now(),
        "timestamp_offset_ms": _offset_ms(session_state),
        "source": source,
        "action": action,
        "label": label,
        "provider": provider,
        "item_count": item_count,
        "latency_ms": latency_ms,
        "turn_sequence": turn_sequence,
        "content": content_text,
        "content_chars": content_chars,
        "content_truncated": truncated,
        "metadata": _json_safe(metadata or {}),
    }
    events.append(event)
    _trim_context_events(events)
    return event


def record_latency_event(
    session_state: dict | None,
    *,
    stage: str,
    source: str,
    label: str,
    latency_ms: int | float | None,
    action: str = "measured",
    content: Any = None,
    provider: str | None = None,
    item_count: int | None = None,
    turn_sequence: int | None = None,
    metadata: dict | None = None,
    dedupe_key: str | None = None,
) -> dict | None:
    """Record a latency sample in both call metrics and the encrypted trace."""
    if session_state is None or latency_ms is None:
        return None

    try:
        latency_value = max(0, round(float(latency_ms)))
    except (TypeError, ValueError):
        return None

    normalized_stage = str(stage or "unknown").strip() or "unknown"
    metrics = session_state.setdefault("_call_metrics", {})
    stage_values = metrics.setdefault("stage_latency_values", {})
    samples = stage_values.setdefault(normalized_stage, [])
    samples.append(latency_value)

    enriched_metadata = dict(metadata or {})
    enriched_metadata.setdefault("stage", normalized_stage)

    return record_context_event(
        session_state,
        source=source,
        action=action,
        label=label,
        content=content,
        provider=provider,
        item_count=item_count,
        latency_ms=latency_value,
        turn_sequence=turn_sequence,
        metadata=enriched_metadata,
        dedupe_key=dedupe_key,
    )


def summarize_stage_latencies(session_state: dict | None) -> dict[str, dict[str, int]]:
    """Return per-stage latency aggregates collected during the call."""
    if session_state is None:
        return {}

    metrics = session_state.get("_call_metrics") or {}
    stage_values = metrics.get("stage_latency_values") or {}
    summary: dict[str, dict[str, int]] = {}

    for stage, raw_values in stage_values.items():
        values: list[int] = []
        for value in raw_values or ():
            try:
                values.append(max(0, round(float(value))))
            except (TypeError, ValueError):
                continue
        if not values:
            continue

        ordered = sorted(values)
        p95_index = max(0, math.ceil(len(ordered) * 0.95) - 1)
        summary[str(stage)] = {
            "count": len(ordered),
            "avg_ms": round(sum(ordered) / len(ordered)),
            "p95_ms": ordered[p95_index],
            "max_ms": ordered[-1],
            "last_ms": values[-1],
        }

    return summary


def get_context_trace(session_state: dict | None) -> dict | None:
    """Return the serializable context trace payload for persistence."""
    if session_state is None:
        return None
    events = session_state.get("_context_trace_events") or []
    if not events:
        return None
    latency_breakdown = summarize_stage_latencies(session_state)
    return {
        "version": 1,
        "captured_at": _utc_now(),
        "event_count": len(events),
        "latency_breakdown": _json_safe(latency_breakdown),
        "events": _json_safe(events),
    }
