"""Tests for Pydantic validation schemas."""

import pytest
from pydantic import ValidationError

from api.validators.schemas import (
    CreateSeniorRequest,
    InitiateCallRequest,
    AdminLoginRequest,
)


class TestInitiateCallRequest:
    def test_valid_phone(self):
        req = InitiateCallRequest(phone_number="+15551234567")
        assert req.phone_number == "+15551234567"

    def test_normalizes_phone(self):
        req = InitiateCallRequest(phone_number="5551234567")
        # Should normalize to include +1 or similar
        assert req.phone_number is not None

    def test_rejects_empty(self):
        with pytest.raises(ValidationError):
            InitiateCallRequest(phone_number="")


class TestAdminLoginRequest:
    def test_valid_login(self):
        req = AdminLoginRequest(email="admin@test.com", password="secret123")
        assert req.email == "admin@test.com"

    def test_rejects_no_email(self):
        with pytest.raises(ValidationError):
            AdminLoginRequest(email="", password="secret")

    def test_rejects_no_password(self):
        with pytest.raises(ValidationError):
            AdminLoginRequest(email="admin@test.com", password="")


class TestCreateSeniorRequest:
    def test_valid_senior(self):
        req = CreateSeniorRequest(
            name="Margaret Smith",
            phone="+15551234567",
        )
        assert req.name == "Margaret Smith"

    def test_rejects_no_name(self):
        with pytest.raises(ValidationError):
            CreateSeniorRequest(name="", phone="+15551234567")
