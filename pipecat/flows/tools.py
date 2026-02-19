"""LLM tool definitions for Donna's voice pipeline.

Defines four tools available during calls:
- search_memories: Semantic search over senior's memory bank
- web_search: General web search with spoken filler UX
- mark_reminder_acknowledged: Track reminder delivery status
- save_important_detail: Store new memories from conversation

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


# Static reference for iteration in make_flows_tools
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
            return {"status": "success", "result": "No memories available right now. Continue the conversation naturally."}

        query = args.get("query", "")
        logger.info("Tool: search_memories query={q} senior={sid}", q=query, sid=senior_id)

        try:
            from services.memory import search
            results = await search(senior_id, query, limit=3)
            if not results:
                return {"status": "success", "result": "No matching memories found."}
            formatted = "[MEMORY] " + "\n[MEMORY] ".join(
                r['content'] for r in results
            )
            return {"status": "success", "result": formatted}
        except Exception as e:
            logger.error("search_memories error: {err}", err=str(e))
            return {"status": "success", "result": "Memory search is temporarily unavailable. Continue the conversation naturally — don't mention any technical issues."}

    async def handle_web_search(args: dict) -> dict:
        query = args.get("query", "")
        logger.info("Tool: web_search query={q}", q=query)

        if not query:
            return {"status": "success", "result": "No query provided."}

        try:
            from services.news import web_search_query
            result = await asyncio.wait_for(web_search_query(query), timeout=15.0)
            if not result:
                return {"status": "success", "result": f"I couldn't find information about {query}."}
            return {"status": "success", "result": f"[NEWS] {result}"}
        except asyncio.TimeoutError:
            logger.warning("web_search timed out after 15s for query={q}", q=query)
            return {"status": "success", "result": "Search took too long. Continue naturally."}
        except Exception as e:
            logger.error("web_search error: {err}", err=str(e))
            return {"status": "success", "result": "Search unavailable. Continue naturally."}

    async def handle_mark_reminder(args: dict) -> dict:
        reminder_id = args.get("reminder_id", "")
        status = args.get("status", "acknowledged")
        user_response = args.get("user_response", "")
        logger.info("Tool: mark_reminder id={rid} status={s}", rid=reminder_id, s=status)

        # Build a descriptive label for tracking (not just the UUID)
        reminder_label = user_response or reminder_id

        try:
            from services.reminder_delivery import mark_reminder_acknowledged
            delivery = session_state.get("reminder_delivery")
            delivery_id = delivery.get("id") if delivery else None
            if delivery_id:
                await mark_reminder_acknowledged(delivery_id, status, user_response)
            else:
                logger.warning("mark_reminder called but no delivery_id in session (not a reminder call)")
            session_state.setdefault("reminders_delivered", set()).add(reminder_label)
            return {"status": "success", "result": f"Reminder marked as {status}."}
        except Exception as e:
            logger.error("mark_reminder error: {err}", err=str(e))
            # Still track locally even if DB write failed
            session_state.setdefault("reminders_delivered", set()).add(reminder_label)
            return {"status": "success", "result": f"Reminder noted. Continue the conversation naturally."}

    async def handle_save_detail(args: dict) -> dict:
        senior_id = session_state.get("senior_id")
        detail = args.get("detail", "")
        category = args.get("category", "preference")
        logger.info("Tool: save_detail category={c} senior={sid}", c=category, sid=senior_id)

        if not senior_id:
            return {"status": "success", "result": "Detail noted for this conversation."}

        try:
            from services.memory import store
            await store(
                senior_id=senior_id,
                type_=category,
                content=detail,
                source="conversation",
                importance=70,
            )
            return {"status": "success", "result": f"[SAVED] Detail noted and saved to memory."}
        except Exception as e:
            logger.error("save_detail error: {err}", err=str(e))
            return {"status": "success", "result": "Detail noted for this conversation. Continue naturally."}

    async def handle_check_caregiver_notes(args: dict) -> dict:
        senior_id = session_state.get("senior_id")
        if not senior_id:
            return {"status": "success", "result": "[CAREGIVER NOTE] No caregiver notes available."}

        try:
            from services.caregivers import get_pending_notes, mark_note_delivered
            notes = await get_pending_notes(senior_id)
            if not notes:
                return {"status": "success", "result": "[CAREGIVER NOTE] No new messages from family members."}

            results = []
            call_sid = session_state.get("call_sid")
            for note in notes:
                results.append(f"[CAREGIVER NOTE] Family message: {note['content']}")
                await mark_note_delivered(note["id"], call_sid)
            return {"status": "success", "result": "\n".join(results)}
        except Exception as e:
            logger.error("check_caregiver_notes error: {err}", err=str(e))
            return {"status": "success", "result": "[CAREGIVER NOTE] Unable to check notes right now. Continue naturally."}

    return {
        "search_memories": handle_search_memories,
        "web_search": handle_web_search,
        "mark_reminder_acknowledged": handle_mark_reminder,
        "save_important_detail": handle_save_detail,
        "check_caregiver_notes": handle_check_caregiver_notes,
    }


def make_flows_tools(session_state: dict) -> dict[str, FlowsFunctionSchema]:
    """Create FlowsFunctionSchema instances for use with Pipecat Flows.

    Returns dict mapping tool name → FlowsFunctionSchema.
    """
    handlers = make_tool_handlers(session_state)

    schemas = {}
    for schema_def in [SEARCH_MEMORIES_SCHEMA, WEB_SEARCH_SCHEMA, MARK_REMINDER_SCHEMA, SAVE_DETAIL_SCHEMA, CHECK_CAREGIVER_NOTES_SCHEMA]:
        name = schema_def["name"]
        schemas[name] = FlowsFunctionSchema(
            name=name,
            description=schema_def["description"],
            properties=schema_def["properties"],
            required=schema_def["required"],
            handler=handlers[name],
        )

    return schemas
