"""Tests for field-level encryption of PHI data."""

import base64
import json
import os
import pytest


@pytest.fixture(autouse=True)
def _reset_encryption_module():
    """Reset the encryption module's global state between tests."""
    import lib.encryption as enc
    enc._KEY = None
    enc._aes = None
    yield
    enc._KEY = None
    enc._aes = None


@pytest.fixture()
def encryption_key(monkeypatch):
    """Set a valid 32-byte base64url-encoded encryption key."""
    key = base64.urlsafe_b64encode(os.urandom(32)).decode()
    monkeypatch.setenv("FIELD_ENCRYPTION_KEY", key)
    return key


class TestEncryptDecryptWithKey:
    """Tests with FIELD_ENCRYPTION_KEY configured."""

    def test_roundtrip_string(self, encryption_key):
        from lib.encryption import encrypt, decrypt

        original = "The patient has diabetes and takes metformin daily."
        ciphertext = encrypt(original)
        assert ciphertext is not None
        assert ciphertext.startswith("enc:")
        assert original not in ciphertext  # plaintext is not visible
        assert decrypt(ciphertext) == original

    def test_roundtrip_empty_string(self, encryption_key):
        from lib.encryption import encrypt, decrypt

        ciphertext = encrypt("")
        assert ciphertext.startswith("enc:")
        assert decrypt(ciphertext) == ""

    def test_roundtrip_unicode(self, encryption_key):
        from lib.encryption import encrypt, decrypt

        original = "Maria tiene 85 anos y vive en Madrid."
        assert decrypt(encrypt(original)) == original

    def test_encrypt_none_returns_none(self, encryption_key):
        from lib.encryption import encrypt

        assert encrypt(None) is None

    def test_decrypt_none_returns_none(self, encryption_key):
        from lib.encryption import decrypt

        assert decrypt(None) is None

    def test_decrypt_legacy_unencrypted(self, encryption_key):
        from lib.encryption import decrypt

        legacy = "This was stored before encryption was enabled."
        assert decrypt(legacy) == legacy

    def test_encrypt_produces_different_ciphertexts(self, encryption_key):
        """Each encryption uses a random nonce, so two encryptions of the same
        plaintext should produce different ciphertexts."""
        from lib.encryption import encrypt

        text = "Same input"
        ct1 = encrypt(text)
        ct2 = encrypt(text)
        assert ct1 != ct2  # different nonces

    def test_ciphertext_format(self, encryption_key):
        from lib.encryption import encrypt

        ct = encrypt("test")
        assert ct.startswith("enc:")
        parts = ct[4:].split(":")
        assert len(parts) == 3  # iv:tag:ciphertext
        # Each part should be valid base64
        for part in parts:
            base64.b64decode(part)  # should not raise


class TestEncryptDecryptJson:
    """Tests for JSON encrypt/decrypt."""

    def test_roundtrip_dict(self, encryption_key):
        from lib.encryption import encrypt_json, decrypt_json

        original = {"role": "user", "content": "Hello, how are you?"}
        ciphertext = encrypt_json(original)
        assert isinstance(ciphertext, str)
        assert ciphertext.startswith("enc:")
        result = decrypt_json(ciphertext)
        assert result == original

    def test_roundtrip_list(self, encryption_key):
        from lib.encryption import encrypt_json, decrypt_json

        original = [
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Hello!"},
        ]
        result = decrypt_json(encrypt_json(original))
        assert result == original

    def test_decrypt_json_already_deserialized(self, encryption_key):
        """asyncpg's JSONB codec returns dicts/lists already deserialized."""
        from lib.encryption import decrypt_json

        already_parsed = {"summary": "Good call"}
        assert decrypt_json(already_parsed) == already_parsed

    def test_decrypt_json_none(self, encryption_key):
        from lib.encryption import decrypt_json

        assert decrypt_json(None) is None

    def test_encrypt_json_none(self, encryption_key):
        from lib.encryption import encrypt_json

        assert encrypt_json(None) is None


class TestGracefulDegradation:
    """Tests with NO encryption key — data passes through unencrypted."""

    def test_encrypt_returns_plaintext(self):
        from lib.encryption import encrypt

        text = "Sensitive PHI data"
        assert encrypt(text) == text

    def test_decrypt_returns_plaintext(self):
        from lib.encryption import decrypt

        text = "Unencrypted data"
        assert decrypt(text) == text

    def test_encrypt_json_returns_json_string(self):
        from lib.encryption import encrypt_json

        data = {"key": "value"}
        result = encrypt_json(data)
        # Without a key, encrypt() returns the plaintext (which is JSON string)
        assert json.loads(result) == data

    def test_decrypt_json_handles_plain_json(self):
        from lib.encryption import decrypt_json

        result = decrypt_json('{"key": "value"}')
        assert result == {"key": "value"}

    def test_decrypt_encrypted_without_key_returns_marker(self):
        """If data was encrypted but the key is missing, return a safe marker."""
        from lib.encryption import decrypt

        encrypted = "enc:AAAA:BBBB:CCCC"
        assert decrypt(encrypted) == "[encrypted]"


class TestInvalidKey:
    """Tests with an invalid encryption key."""

    def test_short_key_returns_none(self, monkeypatch):
        monkeypatch.setenv("FIELD_ENCRYPTION_KEY", "too-short")
        from lib.encryption import encrypt

        # Should fall back to plaintext (graceful degradation)
        assert encrypt("test") == "test"


class TestKeyGeneration:
    def test_generate_key_length(self):
        from lib.encryption import generate_key

        key = generate_key()
        raw = base64.urlsafe_b64decode(key)
        assert len(raw) == 32

    def test_generate_key_unique(self):
        from lib.encryption import generate_key

        k1 = generate_key()
        k2 = generate_key()
        assert k1 != k2
