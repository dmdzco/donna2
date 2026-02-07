"""Centralized configuration — all environment variables in one place.

Import `settings` from this module instead of calling os.getenv() directly.
Lazy-loaded on first access; reads from environment at that time.

Usage:
    from config import settings
    print(settings.anthropic_api_key)
    print(settings.twilio_phone_number)
"""

import os
from dataclasses import dataclass, field
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
    """All environment variables used by the Donna Pipecat service."""

    # ---- Server ----
    port: int = 7860
    base_url: str = ""
    admin_url: str = ""
    railway_public_domain: str = ""

    # ---- Database ----
    database_url: str = ""  # Required in production

    # ---- Twilio ----
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""

    # ---- AI Services ----
    anthropic_api_key: str = ""
    deepgram_api_key: str = ""
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"
    google_api_key: str = ""
    openai_api_key: str = ""

    # ---- Model Selection ----
    fast_observer_model: str = "gemini-3-flash-preview"
    call_analysis_model: str = "gemini-3-flash-preview"
    anthropic_model: str = "claude-sonnet-4-5-20250929"

    # ---- Auth ----
    jwt_secret: str = "donna-admin-secret-change-me"
    donna_api_key: str = ""
    cofounder_api_key_1: str = ""
    cofounder_api_key_2: str = ""
    clerk_secret_key: str = ""

    # ---- Feature Flags ----
    scheduler_enabled: bool = False

    @property
    def is_production(self) -> bool:
        return bool(self.railway_public_domain)


@lru_cache(maxsize=1)
def _load_settings() -> Settings:
    """Load settings from environment. Cached after first call."""

    def _env(key: str, default: str = "") -> str:
        return os.environ.get(key, default)

    return Settings(
        # Server
        port=int(_env("PORT", "7860")),
        base_url=_env("BASE_URL"),
        admin_url=_env("ADMIN_URL"),
        railway_public_domain=_env("RAILWAY_PUBLIC_DOMAIN"),
        # Database
        database_url=_env("DATABASE_URL"),
        # Twilio
        twilio_account_sid=_env("TWILIO_ACCOUNT_SID"),
        twilio_auth_token=_env("TWILIO_AUTH_TOKEN"),
        twilio_phone_number=_env("TWILIO_PHONE_NUMBER"),
        # AI Services
        anthropic_api_key=_env("ANTHROPIC_API_KEY"),
        deepgram_api_key=_env("DEEPGRAM_API_KEY"),
        elevenlabs_api_key=_env("ELEVENLABS_API_KEY"),
        elevenlabs_voice_id=_env("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM"),
        google_api_key=_env("GOOGLE_API_KEY"),
        openai_api_key=_env("OPENAI_API_KEY"),
        # Model Selection
        fast_observer_model=_env("FAST_OBSERVER_MODEL", "gemini-3-flash-preview"),
        call_analysis_model=_env("CALL_ANALYSIS_MODEL", "gemini-3-flash-preview"),
        anthropic_model=_env("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929"),
        # Auth
        jwt_secret=_env("JWT_SECRET", "donna-admin-secret-change-me"),
        donna_api_key=_env("DONNA_API_KEY"),
        cofounder_api_key_1=_env("COFOUNDER_API_KEY_1"),
        cofounder_api_key_2=_env("COFOUNDER_API_KEY_2"),
        clerk_secret_key=_env("CLERK_SECRET_KEY"),
        # Feature Flags
        scheduler_enabled=_env("SCHEDULER_ENABLED", "false").lower() == "true",
    )


# Module-level accessor — import this
settings = _load_settings()
