"""Production security configuration tests."""

import base64
import os

from config import (
    get_pipecat_public_url,
    get_service_api_key,
    is_valid_field_encryption_key,
    parse_service_api_keys,
    validate_production_config,
)


def _field_key() -> str:
    return base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")


def test_service_api_keys_ignore_legacy_in_production(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("DONNA_API_KEY", "legacy-key")
    monkeypatch.delenv("DONNA_API_KEYS", raising=False)

    assert parse_service_api_keys() == {}


def test_service_api_keys_allow_legacy_outside_production(monkeypatch):
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("RAILWAY_PUBLIC_DOMAIN", raising=False)
    monkeypatch.setenv("DONNA_API_KEY", "legacy-key")
    monkeypatch.delenv("DONNA_API_KEYS", raising=False)

    assert get_service_api_key("legacy") == "legacy-key"


def test_validate_production_config_requires_security_secrets(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    for key in [
        "JWT_SECRET",
        "DONNA_API_KEYS",
        "FIELD_ENCRYPTION_KEY",
        "TWILIO_AUTH_TOKEN",
        "PIPECAT_PUBLIC_URL",
    ]:
        monkeypatch.delenv(key, raising=False)

    errors = validate_production_config()

    assert any("JWT_SECRET" in err for err in errors)
    assert any("DONNA_API_KEYS" in err for err in errors)
    assert any("FIELD_ENCRYPTION_KEY" in err for err in errors)
    assert any("TWILIO_AUTH_TOKEN" in err for err in errors)
    assert any("PIPECAT_PUBLIC_URL" in err for err in errors)


def test_validate_production_config_accepts_required_values(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("JWT_SECRET", "not-the-default-secret")
    monkeypatch.setenv("DONNA_API_KEYS", "pipecat:service-key")
    monkeypatch.setenv("FIELD_ENCRYPTION_KEY", _field_key())
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "twilio-token")
    monkeypatch.setenv("PIPECAT_PUBLIC_URL", "https://pipecat.example.com")

    assert validate_production_config() == []


def test_field_encryption_key_accepts_unpadded_base64url():
    assert is_valid_field_encryption_key(_field_key()) is True


def test_pipecat_public_url_prefers_explicit_value(monkeypatch):
    monkeypatch.setenv("PIPECAT_PUBLIC_URL", "https://pipecat.example.com/")
    monkeypatch.setenv("BASE_URL", "https://legacy.example.com")

    assert get_pipecat_public_url() == "https://pipecat.example.com"
