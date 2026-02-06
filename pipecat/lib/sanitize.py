"""PII sanitization utilities.

Port of lib/sanitize.js — masks phone numbers, names, and truncates content
for safe logging.
"""

from __future__ import annotations

import re


def mask_phone(phone: str | None) -> str:
    """Mask a phone number: '+15551234567' → '***4567'."""
    if not phone:
        return "[no-phone]"
    digits = re.sub(r"\D", "", phone)
    if len(digits) < 4:
        return "****"
    return "***" + digits[-4:]


def mask_name(name: str | None) -> str:
    """Mask a name for logs: 'David Zuluaga' → 'David Z.'."""
    if not name:
        return "[unknown]"
    parts = name.split()
    if len(parts) == 1:
        return parts[0]
    return parts[0] + " " + " ".join(p[0] + "." for p in parts[1:])


def truncate(text: str | None, max_len: int = 30) -> str:
    """Truncate content for safe logging."""
    if not text:
        return ""
    if len(text) <= max_len:
        return text
    return text[:max_len] + "..."
