"""Tests for PII sanitization utilities."""

from lib.sanitize import mask_phone, mask_name, truncate


class TestMaskPhone:
    def test_full_phone(self):
        assert mask_phone("+15551234567") == "***4567"

    def test_short_phone(self):
        assert mask_phone("123") == "****"

    def test_none_phone(self):
        assert mask_phone(None) == "[no-phone]"

    def test_empty_phone(self):
        assert mask_phone("") == "[no-phone]"

    def test_formatted_phone(self):
        assert mask_phone("+1 (555) 123-4567") == "***4567"


class TestMaskName:
    def test_full_name(self):
        assert mask_name("David Zuluaga") == "David Z."

    def test_single_name(self):
        assert mask_name("Margaret") == "Margaret"

    def test_three_part_name(self):
        assert mask_name("John Paul Smith") == "John P. S."

    def test_none_name(self):
        assert mask_name(None) == "[unknown]"

    def test_empty_name(self):
        assert mask_name("") == "[unknown]"


class TestTruncate:
    def test_short_text(self):
        assert truncate("Hello", 30) == "Hello"

    def test_long_text(self):
        result = truncate("A" * 50, 30)
        assert len(result) == 33  # 30 chars + "..."
        assert result.endswith("...")

    def test_exact_length(self):
        text = "A" * 30
        assert truncate(text, 30) == text

    def test_none(self):
        assert truncate(None) == ""

    def test_empty(self):
        assert truncate("") == ""
