"""Level 3: Full call simulation tests.

Assembles the complete pipeline with mock services and runs scripted call
scenarios end-to-end. Verifies conversation flow, goodbye detection,
and topic tracking.
"""

import asyncio
import re
import pytest
from unittest.mock import AsyncMock, patch

from pipecat.frames.frames import EndFrame

from tests.scenarios.happy_path import HAPPY_PATH_SCENARIO, HAPPY_PATH_LLM_RESPONSES
from tests.scenarios.goodbye_detection import STRONG_GOODBYE_SCENARIO
from tests.helpers.pipeline_builder import build_test_pipeline
from tests.helpers.assertions import (
    assert_no_guidance_spoken,
    assert_topics_tracked,
)
from tests.conftest import make_transcription
from tests.mocks.mock_llm import ScriptedResponse


class TestHappyPathCall:
    """Full happy-path check-in call simulation."""

    @pytest.mark.asyncio
    async def test_happy_path_completes(self):
        """Normal check-in call should complete with EndFrame and tracked topics."""
        session_state = HAPPY_PATH_SCENARIO.to_session_state()

        with patch("processors.conversation_director.analyze_turn", new_callable=AsyncMock) as mock_analyze, \
             patch("processors.conversation_director.format_director_guidance") as mock_format:
            from services.director_llm import get_default_direction
            mock_analyze.return_value = get_default_direction()
            mock_format.return_value = "main/medium/warm"

            components = build_test_pipeline(
                session_state=session_state,
                llm_responses=HAPPY_PATH_LLM_RESPONSES,
                default_llm_response="That sounds lovely!",
            )
            # Shorten goodbye delay for fast test
            components.quick_observer.GOODBYE_DELAY_SECONDS = 0.3

            async def run_scenario():
                for utterance in HAPPY_PATH_SCENARIO.utterances:
                    if utterance.speaker == "senior":
                        await asyncio.sleep(utterance.delay_seconds)
                        await components.task.queue_frame(
                            make_transcription(utterance.text)
                        )
                        # Allow pipeline to process
                        await asyncio.sleep(0.2)

                # Wait for goodbye EndFrame
                await asyncio.sleep(1.0)

            asyncio.create_task(run_scenario())
            await components.runner.run(components.task)

        # Verify call ended
        assert components.frame_capture.has_end_frame

        # Verify topics tracked
        assert_topics_tracked(
            components.conversation_tracker,
            HAPPY_PATH_SCENARIO.expect_topics,
        )

        # Verify no guidance leaked to TTS
        assert_no_guidance_spoken(components.tts.full_text)


class TestGoodbyeScenarios:
    """Goodbye detection simulation tests."""

    @pytest.mark.asyncio
    async def test_strong_goodbye_ends_call(self):
        """A strong goodbye should end the call via EndFrame."""
        session_state = STRONG_GOODBYE_SCENARIO.to_session_state()

        with patch("processors.conversation_director.analyze_turn", new_callable=AsyncMock) as mock_analyze, \
             patch("processors.conversation_director.format_director_guidance") as mock_format:
            from services.director_llm import get_default_direction
            mock_analyze.return_value = get_default_direction()
            mock_format.return_value = "main/medium/warm"

            components = build_test_pipeline(
                session_state=session_state,
                llm_responses=[
                    ScriptedResponse(
                        trigger=re.compile(r"goodbye|bye", re.I),
                        response="Goodbye Margaret! Talk to you tomorrow!",
                    ),
                ],
                default_llm_response="Hello Margaret! How are you?",
            )
            components.quick_observer.GOODBYE_DELAY_SECONDS = 0.3

            async def run_scenario():
                for utterance in STRONG_GOODBYE_SCENARIO.utterances:
                    if utterance.speaker == "senior":
                        await asyncio.sleep(utterance.delay_seconds)
                        await components.task.queue_frame(
                            make_transcription(utterance.text)
                        )
                        await asyncio.sleep(0.2)

                await asyncio.sleep(1.0)

            asyncio.create_task(run_scenario())
            await components.runner.run(components.task)

        assert components.frame_capture.has_end_frame
