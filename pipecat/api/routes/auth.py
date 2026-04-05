"""Admin auth API routes for Pipecat.

Token revocation endpoints for HIPAA-compliant session management.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from loguru import logger
from pydantic import BaseModel

from api.middleware.auth import require_admin, AuthContext
from services.token_revocation import revoke_token, revoke_all_for_admin

router = APIRouter()


class RevokeTokenRequest(BaseModel):
    token: str
    reason: str = ""


class RevokeAllRequest(BaseModel):
    admin_id: str
    reason: str = ""


@router.post("/api/admin/revoke-token")
async def revoke_single_token(
    body: RevokeTokenRequest,
    auth: AuthContext = Depends(require_admin),
):
    """Revoke a specific JWT token (admin only)."""
    await revoke_token(body.token, auth.user_id, body.reason)
    return {"success": True, "message": "Token revoked"}


@router.post("/api/admin/revoke-all")
async def revoke_all_tokens(
    body: RevokeAllRequest,
    auth: AuthContext = Depends(require_admin),
):
    """Revoke all tokens for a given admin (admin only)."""
    await revoke_all_for_admin(body.admin_id, auth.user_id, body.reason)
    return {"success": True, "message": f"All tokens revoked for admin {body.admin_id}"}


@router.post("/api/admin/logout")
async def logout(
    request: Request,
    auth: AuthContext = Depends(require_admin),
):
    """Logout — revoke the caller's own token."""
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=400, detail="No Bearer token found")
    token = auth_header[7:]
    await revoke_token(token, auth.user_id, "logout")
    return {"success": True, "message": "Logged out"}
