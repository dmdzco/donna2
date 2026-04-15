"""Per-call LLM context provenance for observability.

Records what prompt/context/tool information entered the LLM path during a
call. The trace is persisted encrypted by post-call processing and is intended
only for authenticated internal observability.
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
import time
from typing import Any


MAX_CONTEXT_EVENTS = 240
MAX_CONTEXT_CONTENT_CHARS = 12_000


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _offset_ms(session_state: dict) -> int | None:
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
        metrics = session_state.get("_call_metrics") or {}
        turn_count = metrics.get("turn_count")
        if isinstance(turn_count, int):
            turn_sequence = turn_count

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
    if len(events) > MAX_CONTEXT_EVENTS:
        del events[: len(events) - MAX_CONTEXT_EVENTS]
        for index, item in enumerate(events):
            item["sequence"] = index
    return event


def get_context_trace(session_state: dict | None) -> dict | None:
    """Return the serializable context trace payload for persistence."""
    if session_state is None:
        return None
    events = session_state.get("_context_trace_events") or []
    if not events:
        return None
    return {
        "version": 1,
        "captured_at": _utc_now(),
        "event_count": len(events),
        "events": _json_safe(events),
    }
