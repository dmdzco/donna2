"""LLM tool definitions for Donna's voice pipeline.

Active tools available to Claude during calls:
- web_search: Real-time web search for factual questions
- mark_reminder_acknowledged: Track reminder delivery status (fire-and-forget)

Removed tools (moved to Director/post-call for latency elimination):
- search_memories → Director injects memories as ephemeral context
- save_important_detail → Post-call extract_from_conversation handles it
- check_caregiver_notes → Pre-fetched at call start, injected into system prompt

Uses closure pattern over session_state to give tool handlers access
to senior context without Pipecat's non-existent set_function_call_context().
"""

from __future__ import annotations

import asyncio
from datetime import date

from loguru import logger
from pipecat_flows import FlowsFunctionSchema


# ---------------------------------------------------------------------------
# Tool schemas (reusable across nodes)
# ---------------------------------------------------------------------------

def _web_search_schema() -> dict:
    today = date.today().strftime("%B %d, %Y")
    return {
        "name": "web_search",
        "description": (
            f"Search the web for current information. Today is {today}. "
            "Use this whenever the senior asks about news, weather, sports, facts, "
            "or anything you're unsure about. Always include the current year in "
            "queries about recent events, scores, or elections. "
            "IMPORTANT: Before calling this tool, always say a brief natural filler "
            "like 'Let me look that up for you', 'One moment while I check on that', "
            "or 'Hmm, let me find out'. This gives the senior something to hear while "
            "the search runs. Vary the phrasing each time."
        ),
        "properties": {
            "query": {
                "type": "string",
                "description": f"What to search for (include {date.today().year} for recent events)",
            },
        },
        "required": ["query"],
    }


WEB_SEARCH_SCHEMA = _web_search_schema()

MARK_REMINDER_SCHEMA = {
    "name": "mark_reminder_acknowledged",
    "description": "Mark a reminder as acknowledged after you have delivered it and the senior has responded. Call this after delivering a reminder and getting their response.",
    "properties": {
        "reminder_id": {
            "type": "string",
            "description": "The ID of the reminder that was delivered",
        },
        "status": {
            "type": "string",
            "enum": ["acknowledged", "confirmed"],
            "description": "Whether the senior acknowledged or explicitly confirmed the reminder",
        },
        "user_response": {
            "type": "string",
            "description": "Brief summary of what the senior said about the reminder",
        },
    },
    "required": ["reminder_id", "status"],
}

# ---------------------------------------------------------------------------
# Tool handler factory (closure over session_state)
# ---------------------------------------------------------------------------

def make_tool_handlers(session_state: dict) -> dict:
    """Create tool handler functions with session_state in closure scope.

    Args:
        session_state: Mutable dict with at minimum:
            - senior_id: str
            - senior: dict (senior profile)
            - reminders_delivered: set[str]

    Returns:
        Dict mapping tool name → async handler function.
    """

    async def handle_web_search(args: dict) -> dict:
        import time as _time
        from lib.growthbook import is_on
        if not is_on("news_search_enabled", session_state):
            logger.info("Tool: web_search BLOCKED by news_search_enabled flag")
            return {"status": "success", "result": "Search unavailable. Continue naturally."}

        query = args.get("query", "")
        logger.info("Tool: web_search CALLED query={q}", q=query)

        if not query:
            return {"status": "success", "result": "No query provided."}

        start = _time.time()
        try:
            from services.news import web_search_query
            result = await asyncio.wait_for(web_search_query(query), timeout=15.0)
            elapsed_ms = round((_time.time() - start) * 1000)
            if not result:
                logger.info("Tool: web_search empty result ({ms}ms) query={q}", ms=elapsed_ms, q=query)
                return {"status": "success", "result": f"I couldn't find information about {query}."}
            logger.info("Tool: web_search SUCCESS ({ms}ms, {n} chars) query={q}", ms=elapsed_ms, n=len(result), q=query)
            return {"status": "success", "result": f"[NEWS] {result}"}
        except asyncio.TimeoutError:
            elapsed_ms = round((_time.time() - start) * 1000)
            logger.warning("Tool: web_search TIMEOUT ({ms}ms) query={q}", ms=elapsed_ms, q=query)
            return {"status": "success", "result": "Search took too long. Continue naturally."}
        except Exception as e:
            import traceback
            elapsed_ms = round((_time.time() - start) * 1000)
            logger.error("Tool: web_search ERROR ({ms}ms) query={q}: {err}\n{tb}", ms=elapsed_ms, q=query, err=str(e), tb=traceback.format_exc())
            return {"status": "success", "result": "Search unavailable. Continue naturally."}

    async def handle_mark_reminder(args: dict) -> dict:
        reminder_id = args.get("reminder_id", "")
        status = args.get("status", "acknowledged")
        user_response = args.get("user_response", "")
        logger.info("Tool: mark_reminder id={rid} status={s}", rid=reminder_id, s=status)

        reminder_label = user_response or reminder_id

        # Local tracking is synchronous (critical for prompt context)
        session_state.setdefault("reminders_delivered", set()).add(reminder_label)

        # Fire-and-forget: DB write in background (don't block Claude's response)
        async def _background_ack():
            try:
                from services.reminder_delivery import mark_reminder_acknowledged
                delivery = session_state.get("reminder_delivery")
                delivery_id = delivery.get("id") if delivery else None
                if delivery_id:
                    await mark_reminder_acknowledged(delivery_id, status, user_response)
                    logger.info("Background mark_reminder completed: {rid}", rid=reminder_id)
                else:
                    logger.warning("mark_reminder: no delivery_id in session")
            except Exception as e:
                logger.error("Background mark_reminder failed: {err}", err=str(e))

        asyncio.create_task(_background_ack())
        return {"status": "success", "result": f"Reminder marked as {status}."}

    handlers = {
        "web_search": handle_web_search,
        "mark_reminder_acknowledged": handle_mark_reminder,
    }

    # Wrap each handler to track tools_used in session_state for metrics
    tools_used = session_state.setdefault("_tools_used", [])

    def _wrap(name, fn):
        async def tracked(args):
            if name not in tools_used:
                tools_used.append(name)
            return await fn(args)
        return tracked

    return {name: _wrap(name, fn) for name, fn in handlers.items()}


def make_flows_tools(session_state: dict) -> dict[str, FlowsFunctionSchema]:
    """Create FlowsFunctionSchema instances for use with Pipecat Flows.

    Returns dict mapping tool name → FlowsFunctionSchema.
    """
    handlers = make_tool_handlers(session_state)

    schemas = {}
    for schema_def in [WEB_SEARCH_SCHEMA, MARK_REMINDER_SCHEMA]:
        name = schema_def["name"]
        schemas[name] = FlowsFunctionSchema(
            name=name,
            description=schema_def["description"],
            properties=schema_def["properties"],
            required=schema_def["required"],
            handler=handlers[name],
        )

    return schemas


# ---------------------------------------------------------------------------
# Onboarding tool: save_prospect_detail
# ---------------------------------------------------------------------------

SAVE_PROSPECT_DETAIL_SCHEMA = {
    "name": "save_prospect_detail",
    "description": (
        "Save information learned about the caller during an onboarding call. "
        "Call this whenever you learn the caller's name, their relationship to a senior, "
        "the senior's name, their interests, concerns, or any other useful detail. "
        "Save early and often — this persists across calls."
    ),
    "properties": {
        "detail_type": {
            "type": "string",
            "enum": ["name", "relationship", "loved_one_name", "interest", "concern", "context"],
            "description": (
                "Type of detail: 'name' (caller's name), 'relationship' (daughter, son, self, etc.), "
                "'loved_one_name' (name of the senior they're calling about), 'interest' (hobbies, likes), "
                "'concern' (worries about the senior), 'context' (other useful information)"
            ),
        },
        "value": {
            "type": "string",
            "description": "The detail to save (e.g., 'Lisa', 'daughter', 'loves gardening')",
        },
    },
    "required": ["detail_type", "value"],
}


def _make_onboarding_tool_handlers(session_state: dict) -> dict:
    """Create tool handlers for onboarding calls."""

    async def handle_save_prospect_detail(args: dict) -> dict:
        detail_type = args.get("detail_type", "context")
        value = args.get("value", "")
        prospect_id = session_state.get("prospect_id")
        prospect = session_state.get("prospect") or {}

        logger.info("Tool: save_prospect_detail type={t} value={v} prospect={pid}",
                     t=detail_type, v=value, pid=prospect_id)

        if not value:
            return {"status": "success", "result": "Detail noted."}

        # Direct fields: update prospect table
        if detail_type in ("name", "relationship", "loved_one_name") and prospect_id:
            try:
                from services.prospects import update_after_call
                field_map = {
                    "name": "learned_name",
                    "relationship": "relationship",
                    "loved_one_name": "loved_one_name",
                }
                await update_after_call(prospect_id, {field_map[detail_type]: value})
                # Also update in-memory prospect for current call
                prospect[field_map[detail_type]] = value
            except Exception as e:
                logger.error("save_prospect_detail DB error: {err}", err=str(e))

        # All types: store as memory for return call recognition
        if prospect_id:
            try:
                from services.memory import store
                type_map = {
                    "name": "fact",
                    "relationship": "relationship",
                    "loved_one_name": "relationship",
                    "interest": "preference",
                    "concern": "concern",
                    "context": "fact",
                }
                await store(
                    senior_id=None,
                    type_=type_map.get(detail_type, "fact"),
                    content=f"[{detail_type}] {value}",
                    source="onboarding_conversation",
                    importance=70,
                    prospect_id=prospect_id,
                )
            except Exception as e:
                logger.error("save_prospect_detail memory error: {err}", err=str(e))

        return {"status": "success", "result": f"[SAVED] {detail_type}: {value}"}

    return {
        "save_prospect_detail": handle_save_prospect_detail,
    }


def make_onboarding_flows_tools(session_state: dict) -> dict[str, FlowsFunctionSchema]:
    """Create FlowsFunctionSchema instances for onboarding calls.

    Returns: save_prospect_detail only. Web search is handled by the Director.
    """
    onboarding_handlers = _make_onboarding_tool_handlers(session_state)

    schemas = {}

    # save_prospect_detail
    schemas["save_prospect_detail"] = FlowsFunctionSchema(
        name=SAVE_PROSPECT_DETAIL_SCHEMA["name"],
        description=SAVE_PROSPECT_DETAIL_SCHEMA["description"],
        properties=SAVE_PROSPECT_DETAIL_SCHEMA["properties"],
        required=SAVE_PROSPECT_DETAIL_SCHEMA["required"],
        handler=onboarding_handlers["save_prospect_detail"],
    )

    return schemas
