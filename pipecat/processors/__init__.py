"""Pipecat FrameProcessors — custom pipeline stages.

Each processor sits in the pipeline between STT input and TTS output.
"""

__all__ = [
    "conversation_director",
    "conversation_tracker",
    "goodbye_gate",
    "guidance_stripper",
    "patterns",
    "quick_observer",
]
