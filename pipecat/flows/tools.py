"""LLM tool definitions for Donna's voice pipeline.

Defines four tools available during calls:
- search_memories: Semantic search over senior's memory bank
- get_news: Web search for current events/topics
- mark_reminder_acknowledged: Track reminder delivery status
- save_important_detail: Store new memories from conversation

Uses closure pattern over session_state to give tool handlers access
to senior context without Pipecat's non-existent set_function_call_context().
"""

from __future__ import annotations

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

GET_NEWS_SCHEMA = {
    "name": "get_news",
    "description": "Search for current news or information about a topic the senior is curious about. Use when they ask about current events, want to know about something happening in the world, or express curiosity about a topic.",
    "properties": {
        "topic": {
            "type": "string",
            "description": "The topic to search for news about",
        },
    },
    "required": ["topic"],
}

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
            return {"status": "error", "error": "No senior context available"}

        query = args.get("query", "")
        logger.info("Tool: search_memories query={q} senior={sid}", q=query, sid=senior_id)

        try:
            from services.memory import search
            results = await search(senior_id, query, limit=3)
            if not results:
                return {"status": "success", "result": "No matching memories found."}
            formatted = "\n".join(
                f"- {r['content']}" for r in results
            )
            return {"status": "success", "result": formatted}
        except Exception as e:
            logger.error("search_memories error: {err}", err=str(e))
            return {"status": "error", "error": str(e)}

    async def handle_get_news(args: dict) -> dict:
        topic = args.get("topic", "")
        logger.info("Tool: get_news topic={t}", t=topic)

        try:
            from services.news import get_news_for_topic
            news = await get_news_for_topic(topic, limit=2)
            if not news:
                return {"status": "success", "result": f"I couldn't find recent news about {topic}."}
            return {"status": "success", "result": news}
        except Exception as e:
            logger.error("get_news error: {err}", err=str(e))
            return {"status": "error", "error": str(e)}

    async def handle_mark_reminder(args: dict) -> dict:
        reminder_id = args.get("reminder_id", "")
        status = args.get("status", "acknowledged")
        user_response = args.get("user_response", "")
        logger.info("Tool: mark_reminder id={rid} status={s}", rid=reminder_id, s=status)

        try:
            from services.scheduler import mark_reminder_acknowledged
            delivery = session_state.get("reminder_delivery")
            delivery_id = delivery.get("id") if delivery else None
            if delivery_id:
                await mark_reminder_acknowledged(delivery_id, status, user_response)
            session_state.setdefault("reminders_delivered", set()).add(reminder_id)
            return {"status": "success", "result": f"Reminder marked as {status}."}
        except Exception as e:
            logger.error("mark_reminder error: {err}", err=str(e))
            return {"status": "error", "error": str(e)}

    async def handle_save_detail(args: dict) -> dict:
        senior_id = session_state.get("senior_id")
        detail = args.get("detail", "")
        category = args.get("category", "preference")
        logger.info("Tool: save_detail category={c} senior={sid}", c=category, sid=senior_id)

        if not senior_id:
            return {"status": "error", "error": "No senior context available"}

        try:
            from services.memory import store
            await store(
                senior_id=senior_id,
                type_=category,
                content=detail,
                source="conversation",
                importance=70,
            )
            return {"status": "success", "result": f"Noted: {detail}"}
        except Exception as e:
            logger.error("save_detail error: {err}", err=str(e))
            return {"status": "error", "error": str(e)}

    return {
        "search_memories": handle_search_memories,
        "get_news": handle_get_news,
        "mark_reminder_acknowledged": handle_mark_reminder,
        "save_important_detail": handle_save_detail,
    }


def make_flows_tools(session_state: dict) -> dict[str, FlowsFunctionSchema]:
    """Create FlowsFunctionSchema instances for use with Pipecat Flows.

    Returns dict mapping tool name → FlowsFunctionSchema.
    """
    handlers = make_tool_handlers(session_state)

    schemas = {}
    for schema_def in [SEARCH_MEMORIES_SCHEMA, GET_NEWS_SCHEMA, MARK_REMINDER_SCHEMA, SAVE_DETAIL_SCHEMA]:
        name = schema_def["name"]
        schemas[name] = FlowsFunctionSchema(
            name=name,
            description=schema_def["description"],
            properties=schema_def["properties"],
            required=schema_def["required"],
            handler=handlers[name],
        )

    return schemas
