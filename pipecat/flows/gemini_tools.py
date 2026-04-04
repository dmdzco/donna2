"""Gemini Live tool schemas and handler adapters.

Adapts existing flows/tools.py handlers for use with GeminiLiveLLMService.

Two pieces:
1. _build_gemini_tools() - returns list[dict] in Gemini function_declarations format
2. register_gemini_tools() - registers handlers via llm.register_function()
"""

from __future__ import annotations

from datetime import date
from loguru import logger


def _build_gemini_tools(session_state: dict) -> list[dict]:
    """Build Gemini-format tool schema list."""
    today = date.today().strftime("%B %d, %Y")

    declarations = [
        {
            "name": "search_memories",
            "description": (
                "Search the senior's memory bank for relevant past conversations, "
                "preferences, or details. Use when they mention something you might "
                "have discussed before, or when you need context about their life."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "What to search for (e.g., 'gardening', 'grandson birthday', 'medication')",
                    }
                },
                "required": ["query"],
            },
        },
        {
            "name": "web_search",
            "description": (
                f"Search the web for current information. Today is {today}. "
                "Use when the senior asks about news, weather, sports, facts, or "
                "anything you're unsure about. Always say a brief filler aloud "
                "before calling this tool — 'Let me look that up' or 'One moment' — "
                "so the senior hears something while the search runs."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": f"What to search for (include {date.today().year} for recent events)",
                    }
                },
                "required": ["query"],
            },
        },
        {
            "name": "save_important_detail",
            "description": (
                "Save an important detail the senior mentioned that should be remembered "
                "for future calls. Use for significant life events, health changes, new "
                "interests, family updates, or emotional state changes."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "detail": {
                        "type": "string",
                        "description": "The detail to remember (e.g., 'Grandson Jake graduated from college')",
                    },
                    "category": {
                        "type": "string",
                        "enum": ["health", "family", "preference", "life_event", "emotional", "activity"],
                        "description": "Category of the detail",
                    },
                },
                "required": ["detail", "category"],
            },
        },
        {
            "name": "mark_reminder_acknowledged",
            "description": (
                "Mark a reminder as acknowledged after you have delivered it and the senior "
                "has responded. Call this after delivering a reminder and getting their response."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reminder_id": {
                        "type": "string",
                        "description": "The ID of the reminder that was delivered",
                    },
                    "status": {
                        "type": "string",
                        "enum": ["acknowledged", "confirmed"],
                        "description": "Whether the senior acknowledged or confirmed the reminder",
                    },
                    "user_response": {
                        "type": "string",
                        "description": "Brief summary of what the senior said about the reminder",
                    },
                },
                "required": ["reminder_id", "status"],
            },
        },
        {
            "name": "end_call",
            "description": (
                "End the call gracefully. Call this ONLY when the senior says goodbye "
                "and is clearly done — 'goodbye', 'talk to you later', 'I gotta go', etc. "
                "Say your goodbye first, THEN call this tool. The call will end immediately."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    ]

    return [{"function_declarations": declarations}]


def _pipecat_adapter(name: str, handler):
    """Wrap a simple async (args: dict) -> dict handler for Pipecat's register_function.

    Pipecat's register_function callback signature:
        async def cb(function_name, tool_call_id, args, llm, context, result_callback)

    result_callback expects a string result.
    """
    async def adapted(function_name, tool_call_id, args, llm, context, result_callback):
        logger.info("Gemini tool CALL: {name}({args})", name=name, args=args)
        try:
            result = await handler(args or {})
            result_str = result.get("result", "ok") if isinstance(result, dict) else str(result)
        except Exception as e:
            logger.error("Gemini tool ERROR {name}: {err}", name=name, err=str(e))
            result_str = "Tool unavailable. Continue naturally."
        logger.info("Gemini tool RESULT: {name} -> {r}", name=name, r=result_str[:100])
        await result_callback(result_str)
    return adapted


def register_gemini_tools(llm, session_state: dict, task_ref: list) -> None:
    """Register all tool handlers on a GeminiLiveLLMService instance.

    Args:
        llm: GeminiLiveLLMService instance
        session_state: call session state dict
        task_ref: single-element list holding the PipelineTask (populated after task creation)
    """
    import asyncio
    from pipecat.frames.frames import EndFrame
    from flows.tools import make_tool_handlers

    handlers = make_tool_handlers(session_state)

    # Register existing handlers with Pipecat adapter
    for name, handler in handlers.items():
        llm.register_function(name, _pipecat_adapter(name, handler))

    # Register end_call — triggers EndFrame to terminate the pipeline
    async def handle_end_call(function_name, tool_call_id, args, llm_ref, context, result_callback):
        logger.info("Gemini tool: end_call triggered")
        session_state["_end_reason"] = "gemini_end_call_tool"
        await result_callback("Call ended.")
        if task_ref[0] is not None:
            await asyncio.sleep(0.5)  # Brief pause so goodbye TTS finishes
            await task_ref[0].queue_frame(EndFrame())

    llm.register_function("end_call", handle_end_call)
