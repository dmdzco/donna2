"""LLM tool definitions for Donna's voice pipeline.

Active tools exposed to Claude (2 tools — Director-first architecture):
- web_search: Real-time web search with spoken filler UX
- mark_reminder_acknowledged: Track reminder delivery status (fire-and-forget)

Retired tools (handlers kept for Gemini / future use):
- search_memories → Director injects memories as ephemeral context (500ms gate)
- save_important_detail → post-call extract_from_conversation handles it
- check_caregiver_notes → pre-fetched at call start, injected into system prompt

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

SEARCH_MEMORIES_SCHEMA = {
    "name": "search_memories",
    "description": "Search the senior's memory bank for relevant past conversations, preferences, or details. Use when they mention something you might have discussed before, or when you need context about their life.",
    "properties": {
        "query": {
            "type": "string",
            "description": "What to search for (e.g., 'gardening', 'grandson birthday', 'medication')",
        },
    },
    "required": ["query"],
}

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

SAVE_DETAIL_SCHEMA = {
    "name": "save_important_detail",
    "description": "Save an important detail the senior mentioned that should be remembered for future calls. Use for significant life events, health changes, new interests, family updates, or emotional state changes.",
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
}

CHECK_CAREGIVER_NOTES_SCHEMA = {
    "name": "check_caregiver_notes",
    "description": (
        "Check if any family members or caregivers have left messages or questions "
        "for the senior. Use this naturally in conversation, e.g., 'Oh, by the way, "
        "your daughter wanted me to ask about...'"
    ),
    "properties": {},
    "required": [],
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

    async def handle_search_memories(args: dict) -> dict:
        senior_id = session_state.get("senior_id")
        if not senior_id:
            return {"status": "success", "result": "No memories available right now. Continue naturally."}

        query = args.get("query", "")
        logger.info("Tool: search_memories query={q} senior={sid}", q=query, sid=senior_id)

        # Check prefetch cache first (instant return on hit)
        cache = session_state.get("_prefetch_cache")
        if cache:
            cached = cache.get(query)
            if cached:
                logger.info("Tool: search_memories CACHE HIT query={q}", q=query)
                formatted = "[MEMORY] " + "\n[MEMORY] ".join(
                    r["content"] for r in cached if r.get("content")
                )
                return {"status": "success", "result": formatted}

        try:
            from services.memory import search
            results = await search(senior_id, query, limit=3)
            if not results:
                return {"status": "success", "result": "No matching memories found."}
            formatted = "[MEMORY] " + "\n[MEMORY] ".join(
                r["content"] for r in results if r.get("content")
            )
            return {"status": "success", "result": formatted}
        except Exception as e:
            logger.error("search_memories error: {err}", err=str(e))
            return {"status": "success", "result": "Memory search unavailable. Continue naturally."}

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

    async def handle_save_detail(args: dict) -> dict:
        detail = args.get("detail", "")
        category = args.get("category", "life_event")
        senior_id = session_state.get("senior_id")
        logger.info("Tool: save_important_detail cat={c} detail={d}", c=category, d=detail[:50])

        if not detail or not senior_id:
            return {"status": "success", "result": "Detail noted."}

        # Fire-and-forget: save in background
        async def _background_save():
            try:
                from services.memory import store
                category_to_type = {
                    "health": "health",
                    "family": "relationship",
                    "preference": "preference",
                    "life_event": "fact",
                    "emotional": "concern",
                    "activity": "preference",
                }
                await store(
                    senior_id=senior_id,
                    type_=category_to_type.get(category, "fact"),
                    content=detail,
                    source="conversation",
                    importance=70,
                )
                logger.info("Background save_detail completed: {d}", d=detail[:50])
            except Exception as e:
                logger.error("Background save_detail failed: {err}", err=str(e))

        asyncio.create_task(_background_save())
        return {"status": "success", "result": f"I'll remember that: {detail[:50]}"}

    async def handle_check_caregiver_notes(args: dict) -> dict:
        logger.info("Tool: check_caregiver_notes")

        # Check pre-fetched notes first (from call start)
        notes = session_state.get("_caregiver_notes_content") or []
        if notes:
            formatted = "\n".join(
                f"- {n.get('content', '') if isinstance(n, dict) else str(n)}"
                for n in notes if (n.get("content") if isinstance(n, dict) else n)
            )
            return {"status": "success", "result": f"[CAREGIVER NOTES]\n{formatted}"}

        # Fallback: check DB
        senior_id = session_state.get("senior_id")
        if not senior_id:
            return {"status": "success", "result": "No caregiver notes at this time."}

        try:
            from services.caregivers import get_pending_notes
            notes_db = await get_pending_notes(senior_id)
            if not notes_db:
                return {"status": "success", "result": "No caregiver notes at this time."}
            formatted = "\n".join(f"- {n.get('content', '')}" for n in notes_db)
            return {"status": "success", "result": f"[CAREGIVER NOTES]\n{formatted}"}
        except Exception as e:
            logger.error("check_caregiver_notes error: {err}", err=str(e))
            return {"status": "success", "result": "No caregiver notes at this time."}

    handlers = {
        "search_memories": handle_search_memories,
        "web_search": handle_web_search,
        "mark_reminder_acknowledged": handle_mark_reminder,
        "save_important_detail": handle_save_detail,
        "check_caregiver_notes": handle_check_caregiver_notes,
    }

    # Wrap each handler to track tools_used in session_state for metrics
    tools_used = session_state.setdefault("_tools_used", [])

    def _wrap(name, fn):
        async def tracked(args):
            if name not in tools_used:
                tools_used.append(name)
            logger.info("Tool CALL: {name}({args})", name=name, args=args)
            result = await fn(args)
            # Log truncated result to avoid flooding logs
            result_str = str(result.get("result", ""))
            if len(result_str) > 200:
                result_str = result_str[:200] + "..."
            logger.info("Tool RESULT: {name} → {status} | {result}",
                        name=name, status=result.get("status", "?"), result=result_str)
            return result
        return tracked

    return {name: _wrap(name, fn) for name, fn in handlers.items()}


def make_flows_tools(session_state: dict) -> dict[str, FlowsFunctionSchema]:
    """Create FlowsFunctionSchema instances for use with Pipecat Flows.

    Returns dict mapping tool name → FlowsFunctionSchema.

    IMPORTANT — only 2 tools are exposed to Claude. The others are intentionally
    excluded because exposing them would cost ~4.3s per call (two sequential LLM
    round trips: one to generate the tool call, one to respond after seeing the
    result). Each excluded tool has a zero-latency alternative:

    - search_memories: EXCLUDED — the Director prefetches memories on every
      interim transcription and injects them as ephemeral context before Claude
      ever processes the turn (500ms gate, usually 0ms on cache hit). Giving
      Claude this tool causes it to fetch memories it already has, at 4.3s cost.

    - save_important_detail: EXCLUDED — post-call extract_from_conversation
      (Gemini) extracts all important details from the full transcript after
      the call ends. In-call saving is redundant and adds latency.

    - check_caregiver_notes: EXCLUDED — notes are pre-fetched at call start
      (/voice/answer parallel fetch) and injected directly into the system
      prompt. Claude already has them before the first word is spoken.
    """
    handlers = make_tool_handlers(session_state)

    all_schemas = [
        WEB_SEARCH_SCHEMA,
        MARK_REMINDER_SCHEMA,
    ]

    schemas = {}
    for schema_def in all_schemas:
        name = schema_def["name"]
        schemas[name] = FlowsFunctionSchema(
            name=name,
            description=schema_def["description"],
            properties=schema_def["properties"],
            required=schema_def["required"],
            handler=handlers[name],
        )

    return schemas


def make_onboarding_flows_tools(session_state: dict) -> dict[str, FlowsFunctionSchema]:
    """Create FlowsFunctionSchema instances for onboarding calls.

    Returns: web_search only (prospect details are extracted post-call).
    """
    subscriber_handlers = make_tool_handlers(session_state)

    schemas = {}

    # web_search (for onboarding too)
    schemas["web_search"] = FlowsFunctionSchema(
        name=WEB_SEARCH_SCHEMA["name"],
        description=WEB_SEARCH_SCHEMA["description"],
        properties=WEB_SEARCH_SCHEMA["properties"],
        required=WEB_SEARCH_SCHEMA["required"],
        handler=subscriber_handlers["web_search"],
    )

    return schemas
