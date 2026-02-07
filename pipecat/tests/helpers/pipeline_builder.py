"""Build test pipelines with configurable mock/real services.

Provides a factory function that assembles a pipeline matching the
production layout in bot.py, but with mock services for external deps.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask

from processors.quick_observer import QuickObserverProcessor
from processors.conversation_director import ConversationDirectorProcessor
from processors.conversation_tracker import ConversationTrackerProcessor
from processors.guidance_stripper import GuidanceStripperProcessor

from tests.mocks.mock_llm import MockLLMProcessor, ScriptedResponse
from tests.mocks.mock_tts import MockTTSProcessor
from tests.mocks.mock_transport import TestInputTransport, TestOutputTransport
from tests.conftest import FrameCapture


@dataclass
class TestPipelineComponents:
    """References to all components in a test pipeline for assertions."""
    pipeline: Pipeline
    task: PipelineTask
    runner: PipelineRunner
    input_transport: TestInputTransport
    output_transport: TestOutputTransport
    quick_observer: QuickObserverProcessor
    conversation_director: ConversationDirectorProcessor
    conversation_tracker: ConversationTrackerProcessor
    guidance_stripper: GuidanceStripperProcessor
    llm: MockLLMProcessor
    tts: MockTTSProcessor
    frame_capture: FrameCapture
    session_state: dict


def build_test_pipeline(
    session_state: dict,
    llm_responses: list[ScriptedResponse] | None = None,
    default_llm_response: str = "That's nice! Tell me more.",
    include_director: bool = True,
    include_quick_observer: bool = True,
) -> TestPipelineComponents:
    """Build a full test pipeline matching production layout.

    Pipeline layout (matches bot.py):
        input_transport -> quick_observer -> conversation_director ->
        context_aggregator.user() -> llm -> conversation_tracker ->
        guidance_stripper -> tts -> output_transport ->
        context_aggregator.assistant() -> frame_capture

    Returns TestPipelineComponents with references to all components.
    """
    # Set call start time
    session_state.setdefault("_call_start_time", time.time())
    session_state.setdefault("_transcript", [])

    # Create components
    input_transport = TestInputTransport()
    output_transport = TestOutputTransport()

    quick_observer = QuickObserverProcessor(session_state=session_state)
    conversation_director = ConversationDirectorProcessor(session_state=session_state)
    conversation_tracker = ConversationTrackerProcessor(session_state=session_state)
    guidance_stripper = GuidanceStripperProcessor()

    llm = MockLLMProcessor(
        responses=llm_responses or [],
        default_response=default_llm_response,
    )

    tts = MockTTSProcessor()
    frame_capture = FrameCapture()

    # Build pipeline processor list
    processors = [input_transport]

    if include_quick_observer:
        processors.append(quick_observer)

    if include_director:
        processors.append(conversation_director)

    # Note: In a real pipeline, context_aggregator sits here.
    # For tests, the MockLLMProcessor handles context accumulation directly.
    processors.extend([
        llm,
        conversation_tracker,
        guidance_stripper,
        tts,
        output_transport,
        frame_capture,
    ])

    pipeline = Pipeline(processors)

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            enable_metrics=False,
        ),
    )

    # Wire up pipeline task references
    quick_observer.set_pipeline_task(task)
    conversation_director.set_pipeline_task(task)
    session_state["_conversation_tracker"] = conversation_tracker

    runner = PipelineRunner(handle_sigint=False)

    return TestPipelineComponents(
        pipeline=pipeline,
        task=task,
        runner=runner,
        input_transport=input_transport,
        output_transport=output_transport,
        quick_observer=quick_observer,
        conversation_director=conversation_director,
        conversation_tracker=conversation_tracker,
        guidance_stripper=guidance_stripper,
        llm=llm,
        tts=tts,
        frame_capture=frame_capture,
        session_state=session_state,
    )
