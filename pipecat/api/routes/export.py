"""Data export API route.

HIPAA right-to-access — exports all stored data for a senior in a single JSON bundle.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from loguru import logger

from api.middleware.auth import require_auth, AuthContext
from db.client import query_one, query_many
from lib.encryption import decrypt, decrypt_json
from lib.phi import decrypt_daily_context_phi, decrypt_reminder_phi, decrypt_senior_phi
from services.audit import write_audit, auth_to_role

router = APIRouter()


async def _can_access_senior(auth: AuthContext, senior_id: str) -> bool:
    """Check if the authenticated user can access this senior's data."""
    if auth.is_admin or auth.is_cofounder:
        return True
    if auth.clerk_user_id:
        row = await query_one(
            "SELECT id FROM caregivers WHERE clerk_user_id = $1 AND senior_id = $2 LIMIT 1",
            auth.clerk_user_id,
            senior_id,
        )
        return row is not None
    return False


def _serialize(obj):
    """JSON-safe serialization for datetime, UUID, and other types."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    if hasattr(obj, "hex"):  # UUID
        return str(obj)
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    return str(obj)


def _clean_rows(rows: list[dict]) -> list[dict]:
    """Make all rows JSON-serializable, stripping embedding vectors."""
    cleaned = []
    for row in rows:
        clean = {}
        for k, v in row.items():
            # Skip raw embedding vectors — they are large and not human-readable
            if k == "embedding":
                continue
            if isinstance(v, (datetime,)):
                clean[k] = v.isoformat()
            elif hasattr(v, "hex"):
                clean[k] = str(v)
            elif isinstance(v, bytes):
                clean[k] = v.decode("utf-8", errors="replace")
            else:
                clean[k] = v
        cleaned.append(clean)
    return cleaned


def _decrypt_conversations(rows: list[dict]) -> list[dict]:
    """Decrypt conversation PHI for authorized export responses."""
    exported = []
    for row in rows:
        clean = dict(row)
        if clean.get("summary_encrypted"):
            clean["summary"] = decrypt(clean["summary_encrypted"])
        if clean.get("transcript_encrypted"):
            clean["transcript"] = decrypt_json(clean["transcript_encrypted"])
        if clean.get("transcript_text_encrypted"):
            clean["transcript_text"] = decrypt(clean["transcript_text_encrypted"])
        clean.pop("summary_encrypted", None)
        clean.pop("transcript_encrypted", None)
        clean.pop("transcript_text_encrypted", None)
        exported.append(clean)
    return exported


def _decrypt_memories(rows: list[dict]) -> list[dict]:
    """Decrypt memory PHI for authorized export responses."""
    exported = []
    for row in rows:
        clean = dict(row)
        if clean.get("content_encrypted"):
            clean["content"] = decrypt(clean["content_encrypted"])
        clean.pop("content_encrypted", None)
        exported.append(clean)
    return exported


def _decrypt_call_analyses(rows: list[dict]) -> list[dict]:
    """Decrypt call analysis details for authorized export responses."""
    exported = []
    for row in rows:
        clean = dict(row)
        full = decrypt_json(clean["analysis_encrypted"]) if clean.get("analysis_encrypted") else {}
        if isinstance(full, dict):
            clean["summary"] = clean.get("summary") or full.get("summary")
            clean["topics"] = clean.get("topics") or full.get("topics_discussed") or full.get("topics")
            clean["concerns"] = clean.get("concerns") or full.get("concerns")
            clean["positive_observations"] = clean.get("positive_observations") or full.get("positive_observations")
            clean["follow_up_suggestions"] = clean.get("follow_up_suggestions") or full.get("follow_up_suggestions")
            clean["call_quality"] = clean.get("call_quality") or full.get("call_quality")
        clean.pop("analysis_encrypted", None)
        exported.append(clean)
    return exported


@router.get("/api/seniors/{senior_id}/export")
async def export_senior_data(
    senior_id: str,
    request: Request,
    auth: AuthContext = Depends(require_auth),
):
    """Export all data for a senior (HIPAA right-to-access).

    Returns a JSON bundle with: senior profile, conversations, memories,
    reminders, call analyses, daily context, and caregiver links.
    """
    if not await _can_access_senior(auth, senior_id):
        raise HTTPException(status_code=403, detail="Access denied to this senior")

    # Verify senior exists
    senior = await query_one("SELECT * FROM seniors WHERE id = $1", senior_id)
    if not senior:
        raise HTTPException(status_code=404, detail="Senior not found")

    # Fetch all data in parallel via individual queries
    conversations = await query_many(
        """SELECT id, senior_id, call_sid, started_at, ended_at,
                  duration_seconds, status, summary, summary_encrypted,
                  sentiment, concerns, transcript, transcript_encrypted,
                  transcript_text_encrypted, call_metrics
           FROM conversations WHERE senior_id = $1 ORDER BY started_at DESC""",
        senior_id,
    )

    memories = await query_many(
        """SELECT id, senior_id, type, content, content_encrypted, source, importance, metadata,
                  created_at, last_accessed_at
           FROM memories WHERE senior_id = $1 ORDER BY created_at DESC""",
        senior_id,
    )

    reminders = await query_many(
        """SELECT id, senior_id, type, title, title_encrypted,
                  description, description_encrypted, scheduled_time,
                  is_recurring, cron_expression, is_active, last_delivered_at, created_at
           FROM reminders WHERE senior_id = $1 ORDER BY created_at DESC""",
        senior_id,
    )

    call_analyses = await query_many(
        """SELECT id, conversation_id, senior_id, summary, topics,
                  engagement_score, concerns, positive_observations,
                  follow_up_suggestions, call_quality, analysis_encrypted, created_at
           FROM call_analyses WHERE senior_id = $1 ORDER BY created_at DESC""",
        senior_id,
    )

    daily_context = await query_many(
        """SELECT id, senior_id, call_date, call_sid, topics_discussed,
                  reminders_delivered, advice_given, key_moments, summary,
                  context_encrypted, created_at
           FROM daily_call_context WHERE senior_id = $1 ORDER BY call_date DESC""",
        senior_id,
    )

    caregiver_links = await query_many(
        "SELECT id, clerk_user_id, senior_id, role, created_at FROM caregivers WHERE senior_id = $1",
        senior_id,
    )

    logger.info(
        "Data export for senior {sid}: {c} conversations, {m} memories, {r} reminders",
        sid=senior_id[:8],
        c=len(conversations),
        m=len(memories),
        r=len(reminders),
    )

    await write_audit(
        user_id=auth.user_id,
        user_role=auth_to_role(auth),
        action="export",
        resource_type="senior",
        resource_id=senior_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        metadata={
            "conversations": len(conversations),
            "memories": len(memories),
            "reminders": len(reminders),
            "surface": "pipecat_export",
        },
    )

    # Strip embedding vectors from senior (if call_context_snapshot has any)
    decrypted_senior = decrypt_senior_phi(senior) or senior
    clean_senior = {k: v for k, v in decrypted_senior.items() if k != "embedding"}

    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "senior": _clean_rows([clean_senior])[0] if clean_senior else None,
        "conversations": _clean_rows(_decrypt_conversations(conversations)),
        "memories": _clean_rows(_decrypt_memories(memories)),
        "reminders": _clean_rows([decrypt_reminder_phi(row) for row in reminders]),
        "call_analyses": _clean_rows(_decrypt_call_analyses(call_analyses)),
        "daily_context": _clean_rows([decrypt_daily_context_phi(row) for row in daily_context]),
        "caregiver_links": _clean_rows(caregiver_links),
    }
