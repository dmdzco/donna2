"""Tests for guidance stripper processor."""

from processors.guidance_stripper import (
    strip_guidance,
    has_unclosed_guidance_tag,
    GuidanceStripperProcessor,
)


def test_strip_complete_tags():
    text = "Hello there. <guidance>Be warm and caring</guidance> How are you?"
    assert strip_guidance(text) == "Hello there. How are you?"


def test_strip_partial_open_tag():
    text = "I'm doing well. <guidance>some internal note"
    assert strip_guidance(text) == "I'm doing well."


def test_strip_orphaned_close_tag():
    text = "still going</guidance> and hello!"
    assert strip_guidance(text) == "still going and hello!"


def test_strip_bracketed_directives():
    text = "[HEALTH] They mentioned pain. Ask about it."
    assert strip_guidance(text) == "They mentioned pain. Ask about it."


def test_strip_mixed():
    text = "[EMOTION] <guidance>Be empathetic</guidance> I understand how you feel."
    assert strip_guidance(text) == "I understand how you feel."


def test_clean_empty():
    assert strip_guidance("") == ""
    assert strip_guidance("<guidance>all internal</guidance>") == ""


def test_no_tags():
    text = "Just a normal sentence."
    assert strip_guidance(text) == "Just a normal sentence."


def test_has_unclosed_tag():
    assert has_unclosed_guidance_tag("Hello <guidance>some text") is True
    assert has_unclosed_guidance_tag("Hello <guidance>x</guidance>") is False
    assert has_unclosed_guidance_tag("No tags here") is False


def test_multi_space_cleanup():
    text = "Hello   there    friend"
    assert strip_guidance(text) == "Hello there friend"


def test_module_imports():
    assert GuidanceStripperProcessor is not None
