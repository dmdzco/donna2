"""Token revocation service.

Provides database-backed JWT token revocation for HIPAA-compliant session management.
Stores SHA-256 hashes of revoked tokens (never the raw tokens).
"""

from __future__ import annotations

import hashlib

from loguru import logger

from db.client import query_one, query_many, execute


def _hash_token(token: str) -> str:
    """SHA-256 hash a JWT token for storage."""
    return hashlib.sha256(token.encode()).hexdigest()


async def revoke_token(token: str, revoked_by: str, reason: str = "") -> None:
    """Revoke a specific JWT token.

    Stores the hash with a 7-day expiry (matching JWT max lifetime).
    """
    token_hash = _hash_token(token)
    await execute(
        """INSERT INTO revoked_tokens (token_hash, revoked_by, reason, expires_at)
           VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')
           ON CONFLICT (token_hash) DO NOTHING""",
        token_hash,
        revoked_by,
        reason,
    )
    logger.info(
        "Revoked token by={who} reason_chars={n}",
        who=str(revoked_by)[:8],
        n=len(reason or ""),
    )


async def revoke_all_for_admin(admin_id: str, revoked_by: str, reason: str = "") -> int:
    """Revoke all active tokens for a given admin.

    Since JWTs are stateless and we can't enumerate them, this stores a
    marker row. The auth middleware must also check admin-level revocation.
    Returns count of newly inserted revocation rows (always 1 for the marker).
    """
    marker_hash = hashlib.sha256(f"revoke_all:{admin_id}".encode()).hexdigest()
    await execute(
        """INSERT INTO revoked_tokens (token_hash, revoked_by, reason, expires_at)
           VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')
           ON CONFLICT (token_hash) DO UPDATE SET
             revoked_at = NOW(),
             revoked_by = EXCLUDED.revoked_by,
             reason = EXCLUDED.reason,
             expires_at = EXCLUDED.expires_at""",
        marker_hash,
        revoked_by,
        reason or f"revoke_all for admin {admin_id}",
    )
    logger.info("Revoked all tokens for admin={aid}", aid=str(admin_id)[:8])
    return 1


async def is_token_revoked(token: str) -> bool:
    """Check if a specific token has been revoked. Fast indexed lookup."""
    token_hash = _hash_token(token)
    row = await query_one(
        "SELECT 1 FROM revoked_tokens WHERE token_hash = $1 AND expires_at > NOW()",
        token_hash,
    )
    return row is not None


async def is_admin_revoked(admin_id: str) -> bool:
    """Check if all tokens for an admin have been revoked (bulk revocation)."""
    marker_hash = hashlib.sha256(f"revoke_all:{admin_id}".encode()).hexdigest()
    row = await query_one(
        "SELECT 1 FROM revoked_tokens WHERE token_hash = $1 AND expires_at > NOW()",
        marker_hash,
    )
    return row is not None


async def cleanup_expired() -> int:
    """Remove expired revocation entries. Returns count deleted."""
    result = await query_one(
        "WITH d AS (DELETE FROM revoked_tokens WHERE expires_at < NOW() RETURNING 1) SELECT count(*) AS c FROM d"
    )
    count = result["c"] if result else 0
    if count > 0:
        logger.info("Cleaned up {n} expired token revocations", n=count)
    return count
