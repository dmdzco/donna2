"""Helpers for PHI-bearing shared-state payloads.

Redis/shared state is transport storage, not the system of record. Keep
payloads encrypted there while preserving read compatibility with older raw
dict entries and non-production environments without FIELD_ENCRYPTION_KEY.
"""

from __future__ import annotations

from typing import Any

from loguru import logger

from lib.encryption import decrypt_json, encrypt_json


def encode_phi_payload(payload: dict) -> str | None:
    """Encode a PHI-bearing dict for shared state storage."""
    return encrypt_json(payload)


def decode_phi_payload(payload: Any, *, label: str = "shared state") -> dict | None:
    """Decode a PHI-bearing shared-state payload.

    Accepts the encrypted string format written by ``encode_phi_payload`` and
    legacy raw dict values that may still exist during a deploy.
    """
    if payload is None:
        return None

    decoded = decrypt_json(payload)
    if isinstance(decoded, dict):
        return decoded

    logger.warning(
        "Unable to decode PHI payload from {label}: decoded_type={type}",
        label=label,
        type=type(decoded).__name__,
    )
    return None
