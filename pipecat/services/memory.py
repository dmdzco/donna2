"""Memory service with pgvector semantic search.

Port of services/memory.js — stores, searches, and builds context from memories.
Uses OpenAI text-embedding-3-small for embeddings, pgvector for similarity search.
"""

import json
import math
import os
from datetime import datetime, timezone
from loguru import logger

_openai_client = None

DECAY_HALF_LIFE_DAYS = 30
ACCESS_BOOST = 10
MAX_IMPORTANCE = 100


def _get_openai():
    global _openai_client
    if _openai_client is None:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            logger.warning("OPENAI_API_KEY not set — memory features disabled")
            return None
        from openai import OpenAI
        _openai_client = OpenAI(api_key=api_key)
    return _openai_client


def _calculate_effective_importance(
    base_importance: int,
    created_at: datetime,
    last_accessed_at: datetime | None,
) -> int:
    """Apply exponential decay + recent-access boost."""
    now = datetime.now(timezone.utc)
    age_days = (now - created_at).total_seconds() / 86400
    decay_factor = math.pow(0.5, age_days / DECAY_HALF_LIFE_DAYS)
    effective = base_importance * decay_factor

    if last_accessed_at:
        days_since_access = (now - last_accessed_at).total_seconds() / 86400
        if days_since_access < 7:
            effective = min(MAX_IMPORTANCE, effective + ACCESS_BOOST * (1 - days_since_access / 7))

    return round(effective)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def generate_embedding(text: str) -> list[float] | None:
    """Generate an embedding vector using OpenAI text-embedding-3-small."""
    client = _get_openai()
    if client is None:
        return None
    response = client.embeddings.create(model="text-embedding-3-small", input=text)
    return response.data[0].embedding


async def store(
    senior_id: str,
    type_: str,
    content: str,
    source: str | None = None,
    importance: int = 50,
    metadata: dict | None = None,
) -> dict | None:
    """Store a memory with deduplication (cosine similarity > 0.9 = duplicate)."""
    from db import query_one, query_many

    embedding = await generate_embedding(content)
    if embedding is None:
        logger.info("Skipping store — OpenAI not configured")
        return None

    emb_str = json.dumps(embedding)

    # Dedup check
    dupes = await query_many(
        """SELECT id, content, importance,
                  1 - (embedding <=> $1::vector) AS similarity
           FROM memories
           WHERE senior_id = $2
             AND 1 - (embedding <=> $1::vector) > 0.9
           ORDER BY similarity DESC
           LIMIT 1""",
        emb_str,
        senior_id,
    )

    if dupes:
        existing = dupes[0]
        logger.info(
            "Dedup: similar to existing ({sim}%)",
            sim=round(existing["similarity"] * 100),
        )
        if importance > existing["importance"]:
            await query_one(
                "UPDATE memories SET importance = $1, last_accessed_at = NOW() WHERE id = $2",
                importance,
                existing["id"],
            )
            logger.info("Updated importance {old} -> {new}", old=existing["importance"], new=importance)
        return None

    row = await query_one(
        """INSERT INTO memories (senior_id, type, content, source, importance, embedding, metadata)
           VALUES ($1, $2, $3, $4, $5, $6::vector, $7)
           RETURNING *""",
        senior_id,
        type_,
        content,
        source,
        importance,
        emb_str,
        json.dumps(metadata) if metadata else None,
    )
    logger.info("Stored memory for {sid}: {c}", sid=senior_id, c=content)
    return row


async def search(
    senior_id: str, query: str, limit: int = 5, min_similarity: float = 0.7
) -> list[dict]:
    """Semantic search — find memories similar to *query*."""
    from db import query_many, execute

    query_embedding = await generate_embedding(query)
    if query_embedding is None:
        return []

    emb_str = json.dumps(query_embedding)

    rows = await query_many(
        """SELECT id, type, content, importance, metadata, created_at,
                  1 - (embedding <=> $1::vector) AS similarity
           FROM memories
           WHERE senior_id = $2
             AND 1 - (embedding <=> $1::vector) > $3
           ORDER BY embedding <=> $1::vector
           LIMIT $4""",
        emb_str,
        senior_id,
        min_similarity,
        limit,
    )

    if rows:
        ids = [r["id"] for r in rows]
        # Update last_accessed_at for retrieved memories
        placeholders = ", ".join(f"${i+1}" for i in range(len(ids)))
        await execute(
            f"UPDATE memories SET last_accessed_at = NOW() WHERE id IN ({placeholders})",
            *ids,
        )

    return rows


async def get_recent(senior_id: str, limit: int = 10) -> list[dict]:
    """Get the most recent memories for a senior."""
    from db import query_many

    return await query_many(
        "SELECT * FROM memories WHERE senior_id = $1 ORDER BY created_at DESC LIMIT $2",
        senior_id,
        limit,
    )


async def get_important(senior_id: str, limit: int = 5) -> list[dict]:
    """Get important memories with decay applied."""
    from db import query_many

    rows = await query_many(
        """SELECT * FROM memories
           WHERE senior_id = $1 AND importance >= 50
           ORDER BY importance DESC
           LIMIT $2""",
        senior_id,
        limit * 3,
    )

    with_effective = []
    for m in rows:
        eff = _calculate_effective_importance(
            m["importance"], m["created_at"], m.get("last_accessed_at")
        )
        if eff >= 50:
            with_effective.append({**m, "effective_importance": eff})

    with_effective.sort(key=lambda m: m["effective_importance"], reverse=True)
    return with_effective[:limit]


async def get_critical(senior_id: str, limit: int = 3) -> list[dict]:
    """Tier 1: health concerns + high-importance memories."""
    from db import query_many

    return await query_many(
        """SELECT * FROM memories
           WHERE senior_id = $1
             AND (type = 'concern' OR importance >= 80)
           ORDER BY importance DESC
           LIMIT $2""",
        senior_id,
        limit,
    )


def group_by_type(memories_list: list[dict]) -> dict[str, list[str]]:
    """Group memories by type for compact display."""
    groups: dict[str, list[str]] = {}
    for m in memories_list:
        t = m.get("type") or "fact"
        groups.setdefault(t, []).append(m["content"])
    return groups


def format_grouped_memories(groups: dict[str, list[str]]) -> str:
    """Format grouped memories compactly."""
    type_labels = {
        "relationship": "Family/Friends",
        "concern": "Concerns",
        "preference": "Preferences",
        "event": "Recent events",
        "fact": "Facts",
    }
    lines = []
    for t, contents in groups.items():
        label = type_labels.get(t, t)
        sep = "; " if t == "relationship" else ", "
        lines.append(f"{label}: {sep.join(contents)}")
    return "\n".join(lines)


async def build_context(
    senior_id: str,
    current_topic: str | None = None,
    senior: dict | None = None,
    is_first_turn: bool = True,
) -> str:
    """Build tiered context string for conversation.

    Tier 1 (Critical): always included
    Tier 2 (Contextual): when topic provided
    Tier 3 (Background): first turn only
    """
    parts: list[str] = []
    included_ids: set[str] = set()

    # Tier 1: Critical
    critical = await get_critical(senior_id, 3)
    if critical:
        parts.append("Critical to know:")
        for m in critical:
            parts.append(f"- {m['content']}")
            included_ids.add(m["id"])

    # Tier 2: Contextual
    if current_topic:
        relevant = await search(senior_id, current_topic, 3, 0.7)
        new_relevant = [m for m in relevant if m["id"] not in included_ids]
        if new_relevant:
            parts.append("\nRelevant:")
            for m in new_relevant:
                parts.append(f"- {m['content']}")
                included_ids.add(m["id"])

    # Tier 3: Background (first turn only)
    if is_first_turn:
        background = []
        important = await get_important(senior_id, 5)
        for m in important:
            if m["id"] not in included_ids:
                background.append(m)
                included_ids.add(m["id"])

        recent = await get_recent(senior_id, 5)
        for m in recent:
            if m["id"] not in included_ids:
                background.append(m)

        if background:
            groups = group_by_type(background)
            formatted = format_grouped_memories(groups)
            parts.append(f"\nBackground:\n{formatted}")

    # News (first turn only)
    if is_first_turn and senior and senior.get("interests"):
        try:
            from services.news import get_news_for_senior

            news_ctx = await get_news_for_senior(senior["interests"])
            if news_ctx:
                parts.append(f"\n{news_ctx}")
        except Exception as e:
            logger.error("Error fetching news: {err}", err=str(e))

    return "\n".join(parts)


async def extract_from_conversation(
    senior_id: str, transcript: str, conversation_id: str
) -> None:
    """Extract and store memories from a conversation transcript via OpenAI."""
    client = _get_openai()
    if client is None:
        logger.info("Skipping extraction — OpenAI not configured")
        return

    prompt = (
        "Analyze this conversation and extract important facts, preferences, "
        "events, or concerns about the person. Return a JSON array of memories.\n\n"
        f"Conversation:\n{transcript}\n\n"
        'Return format:\n[\n  {"type": "fact|preference|event|concern|relationship", '
        '"content": "...", "importance": 50-100}\n]\n\n'
        "Only include genuinely important or memorable information. Be concise."
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        memories_array = result.get("memories", result) if isinstance(result, dict) else result

        if isinstance(memories_array, list):
            for mem in memories_array:
                await store(
                    senior_id,
                    mem.get("type", "fact"),
                    mem["content"],
                    conversation_id,
                    mem.get("importance", 50),
                )
            logger.info("Extracted {n} memories from conversation", n=len(memories_array))
    except Exception as e:
        logger.error("Failed to extract memories: {err}", err=str(e))
