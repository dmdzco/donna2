"""Centralized configuration — all environment variables in one place.

Import `settings` from this module instead of calling os.getenv() directly.
Lazy-loaded on first access; reads from environment at that time.

Usage:
    from config import settings
    print(settings.anthropic_api_key)
    print(settings.twilio_phone_number)
"""

import os
import base64
from dataclasses import dataclass, field
from functools import lru_cache


DEFAULT_JWT_SECRET = "donna-admin-secret-change-me"


@dataclass(frozen=True)
class Settings:
    """All environment variables used by the Donna Pipecat service."""

    # ---- Server ----
    port: int = 7860
    environment: str = ""
    log_level: str = ""
    base_url: str = ""
    pipecat_public_url: str = ""
    admin_url: str = ""
    railway_public_domain: str = ""

    # ---- Database ----
    database_url: str = ""  # Required in production
    db_pool_min: int = 5
    db_pool_max: int = 50

    # ---- Twilio ----
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""

    # ---- AI Services ----
    anthropic_api_key: str = ""
    deepgram_api_key: str = ""
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"
    cartesia_api_key: str = ""
    cartesia_voice_id: str = "f786b574-daa5-4673-aa0c-cbe3e8534c02"
    google_api_key: str = ""
    openai_api_key: str = ""
    tavily_api_key: str = ""
    cerebras_api_key: str = ""
    groq_api_key: str = ""

    # ---- Model Selection ----
    fast_observer_model: str = "gemini-3-flash-preview"
    cerebras_director_model: str = "gpt-oss-120b"
    groq_director_model: str = "openai/gpt-oss-20b"
    call_analysis_model: str = "gemini-3-flash-preview"
    anthropic_model: str = "claude-sonnet-4-5-20250929"

    # ---- Auth ----
    jwt_secret: str = "donna-admin-secret-change-me"
    jwt_secret_previous: str = ""  # Old JWT secret during credential rotation
    donna_api_key: str = ""
    donna_api_keys: str = ""
    cofounder_api_key_1: str = ""
    cofounder_api_key_2: str = ""
    clerk_secret_key: str = ""
    clerk_publishable_key: str = ""
    clerk_jwks_url: str = ""  # Auto-derived from publishable key if not set

    # ---- Monitoring ----
    sentry_dsn: str = ""

    # ---- Scalability ----
    max_concurrent_calls: int = 50
    load_test_mode: bool = False
    redis_url: str = ""  # Optional — enables multi-instance shared state
    pipecat_require_redis: bool = False

    # ---- GrowthBook ----
    growthbook_api_host: str = ""
    growthbook_client_key: str = ""

    # ---- Encryption ----
    field_encryption_key: str = ""  # 32-byte base64url key for PHI encryption

    # ---- Feature Flags ----
    scheduler_enabled: bool = False
    pipecat_retention_enabled: bool = False
    voice_backend: str = ""
    tts_provider: str = ""
    twilio_ws_handshake_timeout_seconds: float = 5.0

    # ---- Data Retention (HIPAA) ----
    retention_conversations_days: int = 365
    retention_conversation_metadata_days: int = 1095
    retention_memories_days: int = 730
    retention_call_analyses_days: int = 365
    retention_daily_context_days: int = 90
    retention_call_metrics_days: int = 180
    retention_reminder_deliveries_days: int = 90
    retention_notifications_days: int = 180
    retention_waitlist_days: int = 365
    retention_audit_logs_days: int = 2190

    @property
    def is_production(self) -> bool:
        return self.environment == "production" or bool(self.railway_public_domain)


def _truthy(value: str | None) -> bool:
    return str(value or "").lower() in {"1", "true", "yes", "on"}


def is_production_environment() -> bool:
    return os.getenv("ENVIRONMENT") == "production" or bool(os.getenv("RAILWAY_PUBLIC_DOMAIN"))


def _decode_field_encryption_key(raw: str) -> bytes | None:
    if not raw:
        return None
    try:
        padded = raw + "=" * (-len(raw) % 4)
        return base64.urlsafe_b64decode(padded)
    except Exception:
        return None


def is_valid_field_encryption_key(raw: str) -> bool:
    decoded = _decode_field_encryption_key(raw)
    return decoded is not None and len(decoded) == 32


def parse_service_api_keys(raw: str | None = None) -> dict[str, str]:
    value = os.getenv("DONNA_API_KEYS", "") if raw is None else raw
    keys: dict[str, str] = {}
    for entry in value.split(","):
        item = entry.strip()
        if not item or ":" not in item:
            continue
        label, key = item.split(":", 1)
        label = label.strip()
        key = key.strip()
        if label and key:
            keys[label] = key
    if not is_production_environment() and os.getenv("DONNA_API_KEY"):
        keys["legacy"] = os.getenv("DONNA_API_KEY", "")
    return keys


def get_service_api_key(label: str) -> str | None:
    return parse_service_api_keys().get(label)


def get_pipecat_public_url() -> str:
    public_url = os.getenv("PIPECAT_PUBLIC_URL", "")
    if public_url:
        return public_url.rstrip("/")
    base_url = os.getenv("BASE_URL", "")
    if not is_production_environment() and base_url:
        return base_url.rstrip("/")
    return ""


def validate_production_config() -> list[str]:
    if not is_production_environment():
        return []

    errors: list[str] = []
    jwt_secret = os.getenv("JWT_SECRET", DEFAULT_JWT_SECRET)
    field_key = os.getenv("FIELD_ENCRYPTION_KEY", "")
    public_url = os.getenv("PIPECAT_PUBLIC_URL", "")

    if not jwt_secret or jwt_secret == DEFAULT_JWT_SECRET:
        errors.append("JWT_SECRET must be set to a non-default value")
    if not parse_service_api_keys():
        errors.append("DONNA_API_KEYS must contain at least one labeled key")
    if not is_valid_field_encryption_key(field_key):
        errors.append("FIELD_ENCRYPTION_KEY must decode to 32 bytes")
    if not os.getenv("TWILIO_AUTH_TOKEN", ""):
        errors.append("TWILIO_AUTH_TOKEN is required")
    if not public_url or not public_url.startswith("https://"):
        errors.append("PIPECAT_PUBLIC_URL must be an https:// URL")
    if _truthy(os.getenv("PIPECAT_REQUIRE_REDIS")) and not os.getenv("REDIS_URL", ""):
        errors.append("REDIS_URL is required when PIPECAT_REQUIRE_REDIS=true")

    return errors


def assert_production_config() -> None:
    errors = validate_production_config()
    if errors:
        raise RuntimeError(
            "Production security configuration invalid: " + "; ".join(errors)
        )


@lru_cache(maxsize=1)
def _load_settings() -> Settings:
    """Load settings from environment. Cached after first call."""

    def _env(key: str, default: str = "") -> str:
        return os.environ.get(key, default)

    return Settings(
        # Server
        port=int(_env("PORT", "7860")),
        environment=_env("ENVIRONMENT"),
        log_level=_env("LOG_LEVEL", "INFO" if is_production_environment() else "DEBUG"),
        base_url=_env("BASE_URL"),
        pipecat_public_url=_env("PIPECAT_PUBLIC_URL"),
        admin_url=_env("ADMIN_URL"),
        railway_public_domain=_env("RAILWAY_PUBLIC_DOMAIN"),
        # Database
        database_url=_env("DATABASE_URL"),
        db_pool_min=int(_env("DB_POOL_MIN", "5")),
        db_pool_max=int(_env("DB_POOL_MAX", "50")),
        # Twilio
        twilio_account_sid=_env("TWILIO_ACCOUNT_SID"),
        twilio_auth_token=_env("TWILIO_AUTH_TOKEN"),
        twilio_phone_number=_env("TWILIO_PHONE_NUMBER"),
        # AI Services
        anthropic_api_key=_env("ANTHROPIC_API_KEY"),
        deepgram_api_key=_env("DEEPGRAM_API_KEY"),
        elevenlabs_api_key=_env("ELEVENLABS_API_KEY"),
        elevenlabs_voice_id=_env("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM"),
        cartesia_api_key=_env("CARTESIA_API_KEY"),
        cartesia_voice_id=_env("CARTESIA_VOICE_ID", "f786b574-daa5-4673-aa0c-cbe3e8534c02"),
        google_api_key=_env("GOOGLE_API_KEY"),
        openai_api_key=_env("OPENAI_API_KEY"),
        tavily_api_key=_env("TAVILY_API_KEY"),
        cerebras_api_key=_env("CEREBRAS_API_KEY"),
        groq_api_key=_env("GROQ_API_KEY"),
        # Model Selection
        fast_observer_model=_env("FAST_OBSERVER_MODEL", "gemini-3-flash-preview"),
        cerebras_director_model=_env("CEREBRAS_DIRECTOR_MODEL", "gpt-oss-120b"),
        groq_director_model=_env("GROQ_DIRECTOR_MODEL", "openai/gpt-oss-20b"),
        call_analysis_model=_env("CALL_ANALYSIS_MODEL", "gemini-3-flash-preview"),
        anthropic_model=_env("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929"),
        # Auth
        jwt_secret=_env("JWT_SECRET", "donna-admin-secret-change-me"),
        jwt_secret_previous=_env("JWT_SECRET_PREVIOUS"),
        donna_api_key=_env("DONNA_API_KEY"),
        donna_api_keys=_env("DONNA_API_KEYS"),
        cofounder_api_key_1=_env("COFOUNDER_API_KEY_1"),
        cofounder_api_key_2=_env("COFOUNDER_API_KEY_2"),
        clerk_secret_key=_env("CLERK_SECRET_KEY"),
        clerk_publishable_key=_env("CLERK_PUBLISHABLE_KEY", _env("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY")),
        clerk_jwks_url=_env("CLERK_JWKS_URL"),
        # Monitoring
        sentry_dsn=_env("SENTRY_DSN"),
        # Scalability
        max_concurrent_calls=int(_env("MAX_CONCURRENT_CALLS", "50")),
        load_test_mode=_env("LOAD_TEST_MODE", "false").lower() == "true",
        redis_url=_env("REDIS_URL"),
        pipecat_require_redis=_truthy(_env("PIPECAT_REQUIRE_REDIS")),
        # GrowthBook
        growthbook_api_host=_env("GROWTHBOOK_API_HOST"),
        growthbook_client_key=_env("GROWTHBOOK_CLIENT_KEY"),
        # Encryption
        field_encryption_key=_env("FIELD_ENCRYPTION_KEY"),
        # Feature Flags
        scheduler_enabled=_env("SCHEDULER_ENABLED", "false").lower() == "true",
        pipecat_retention_enabled=_truthy(_env("PIPECAT_RETENTION_ENABLED")),
        voice_backend=_env("VOICE_BACKEND"),
        tts_provider=_env("TTS_PROVIDER"),
        twilio_ws_handshake_timeout_seconds=float(_env("TWILIO_WS_HANDSHAKE_TIMEOUT_SECONDS", "5")),
        # Data Retention (HIPAA)
        retention_conversations_days=int(_env("RETENTION_CONVERSATIONS_DAYS", "365")),
        retention_conversation_metadata_days=int(_env("RETENTION_CONVERSATION_METADATA_DAYS", "1095")),
        retention_memories_days=int(_env("RETENTION_MEMORIES_DAYS", "730")),
        retention_call_analyses_days=int(_env("RETENTION_CALL_ANALYSES_DAYS", "365")),
        retention_daily_context_days=int(_env("RETENTION_DAILY_CONTEXT_DAYS", "90")),
        retention_call_metrics_days=int(_env("RETENTION_CALL_METRICS_DAYS", "180")),
        retention_reminder_deliveries_days=int(_env("RETENTION_REMINDER_DELIVERIES_DAYS", "90")),
        retention_notifications_days=int(_env("RETENTION_NOTIFICATIONS_DAYS", "180")),
        retention_waitlist_days=int(_env("RETENTION_WAITLIST_DAYS", "365")),
        retention_audit_logs_days=int(_env("RETENTION_AUDIT_LOGS_DAYS", "2190")),
    )


# Module-level accessor — import this
settings = _load_settings()


def get_settings() -> Settings:
    """Return a fresh settings snapshot for code paths that rely on env overrides."""
    _load_settings.cache_clear()
    return _load_settings()
