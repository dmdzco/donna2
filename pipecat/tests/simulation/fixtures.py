"""Test fixtures — seed data for simulation tests.

Provides ``TestSenior``, a lightweight dataclass representing a senior profile
used by scenario definitions.  The real DB seed/cleanup logic will live here
once Task 5 is complete; for now this is the minimal shape needed by
``scenarios.py`` and the rest of the simulation package.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class TestSenior:
    """Senior profile used in simulation scenarios.

    Mirrors the columns that matter for call behaviour without requiring
    a database connection.  Field names match the ``seniors`` table.

    Attributes:
        id: Synthetic UUID (or placeholder) for the test senior.
        name: Display name used in greetings and prompts.
        phone: 10-digit phone number (not dialled in sim tests).
        timezone: IANA timezone for scheduling logic.
        interests: Free-text interests injected into the system prompt.
        medical_notes: Medical context available to the pipeline.
        city: City for weather/news personalisation.
        state: US state abbreviation.
    """

    id: str = "senior-sim-001"
    name: str = "Margaret Johnson"
    phone: str = "5551234567"
    timezone: str = "America/Chicago"
    interests: str = "gardening, Dallas Cowboys, baking, family"
    medical_notes: str = "Type 2 diabetes, takes metformin"
    city: str = "Dallas"
    state: str = "TX"
