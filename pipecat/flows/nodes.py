"""Pipecat Flows call phase node definitions.

Defines 4 call phases: opening → main → winding_down → closing.
Each node specifies system prompt, available tools, context strategy,
and transition functions.

Port of the call phase logic from pipelines/v1-advanced.js buildSystemPrompt()
and pipelines/fast-observer.js (Conversation Director).
"""

from __future__ import annotations

import time
from loguru import logger
from pipecat_flows import (
    FlowsFunctionSchema,
    NodeConfig,
    ContextStrategy,
    ContextStrategyConfig,
)


# ---------------------------------------------------------------------------
# Base system prompt (shared across all nodes)
# ---------------------------------------------------------------------------

BASE_SYSTEM_PROMPT = """You are Donna, a warm and caring AI voice companion making a phone call to an elderly person. Your primary goal is to understand the person's spoken words, even if the speech-to-text transcription contains errors. Your responses will be converted to speech using a text-to-speech system, so your output must be plain, natural-sounding text.

CRITICAL - YOUR OUTPUT IS SPOKEN ALOUD:
- Output ONLY the exact words Donna speaks
- Your entire response will be converted to audio - every character will be spoken
- NEVER include tags, thinking, reasoning, XML, or any markup in your output
- NEVER include stage directions like "laughs", "pauses", "speaks with empathy"
- NEVER include action descriptions, internal thoughts, or formatting like bullet points
- Respond in plain text only - no special characters, asterisks, or symbols that don't belong in speech
- Your response should sound natural and conversational when read aloud

SPEECH-TO-TEXT AWARENESS:
- The person's words come through speech-to-text which may contain errors
- Silently correct for likely transcription errors - focus on intended meaning, not literal text
- If you truly cannot understand what they said, warmly ask them to repeat: "I'm sorry, could you say that again for me?"

RESPONSE FORMAT:
- 1-2 sentences MAX - keep it short and direct
- Answer briefly, then ask ONE follow-up question
- NEVER say "dear" or "dearie"
- Just speak naturally as Donna would
- Prioritize clarity and accuracy in every response

CONVERSATION BALANCE - INTEREST USAGE:
- Do NOT lead every conversation with their stored interests
- Let interests emerge naturally from what they share
- If they mention something, THEN connect it to a known interest
- Vary which interests you reference - don't always ask about the same ones

CONVERSATION BALANCE - QUESTION FREQUENCY:
- Avoid asking more than 2 questions in a row - it feels like an interrogation
- After 2 questions, share an observation, story, or react to what they said
- Match their energy: if they're talkative, ask fewer questions and listen more"""


def _build_senior_context(session_state: dict) -> str:
    """Build the senior-specific context sections of the system prompt."""
    parts: list[str] = []
    senior = session_state.get("senior") or {}

    first_name = (senior.get("name") or "").split(" ")[0] or "there"
    parts.append(f"You are speaking with {first_name}.")

    interests = senior.get("interests") or []
    if interests:
        parts.append(f"They enjoy: {', '.join(interests)}.")

    medical = senior.get("medical_notes") or senior.get("medicalNotes")
    if medical:
        parts.append(f"Health notes: {medical}")

    summaries = session_state.get("previous_calls_summary")
    if summaries:
        parts.append(f"\nRecent calls:\n{summaries}")

    todays_ctx = session_state.get("todays_context")
    if todays_ctx:
        parts.append(f"\n{todays_ctx}")

    memory_ctx = session_state.get("memory_context")
    if memory_ctx:
        parts.append(f"\n{memory_ctx}")
        logger.info("System prompt includes memory context ({n} chars)", n=len(memory_ctx))
    else:
        logger.warning("No memory context in session_state for system prompt")

    return "\n".join(parts)


def _build_reminder_context(session_state: dict) -> str:
    """Build reminder-related prompt sections."""
    parts: list[str] = []

    reminder_prompt = session_state.get("reminder_prompt")
    if reminder_prompt:
        parts.append(reminder_prompt)

    delivered = session_state.get("reminders_delivered") or set()
    if delivered:
        parts.append("\nREMINDERS ALREADY DELIVERED THIS CALL (do NOT repeat these):")
        for r in delivered:
            parts.append(f"- {r}")
        parts.append('If they bring up a delivered reminder again, say something like "As I mentioned earlier..." instead of repeating the full reminder.')

    return "\n".join(parts)


def _build_tracking_context(session_state: dict) -> str:
    """Build conversation tracking context."""
    tracking = session_state.get("conversation_tracking")
    return tracking or ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _update_tracking_context(session_state: dict) -> None:
    """Pull current tracking summary from ConversationTracker into session_state."""
    tracker = session_state.get("_conversation_tracker")
    if tracker and hasattr(tracker, "get_summary"):
        summary = tracker.get_summary()
        if summary:
            session_state["conversation_tracking"] = summary


# ---------------------------------------------------------------------------
# Transition functions
# ---------------------------------------------------------------------------

def _make_transition_to_main(session_state: dict, flows_tools: dict):
    """Create transition function: opening → main."""

    async def transition_to_main(args: dict, flow_manager) -> tuple[dict, NodeConfig]:
        logger.info("Transitioning: opening → main")
        _update_tracking_context(session_state)
        return (
            {"status": "success"},
            build_main_node(session_state, flows_tools),
        )

    return transition_to_main


def _make_transition_to_winding_down(session_state: dict, flows_tools: dict):
    """Create transition function: main → winding_down."""

    async def transition_to_winding_down(args: dict, flow_manager) -> tuple[dict, NodeConfig]:
        logger.info("Transitioning: main → winding_down")
        _update_tracking_context(session_state)
        return (
            {"status": "success"},
            build_winding_down_node(session_state, flows_tools),
        )

    return transition_to_winding_down


def _make_transition_to_closing(session_state: dict):
    """Create transition function: → closing."""

    async def transition_to_closing(args: dict, flow_manager) -> tuple[dict, NodeConfig]:
        logger.info("Transitioning → closing")
        return (
            {"status": "success"},
            build_closing_node(session_state),
        )

    return transition_to_closing


# ---------------------------------------------------------------------------
# Node builders
# ---------------------------------------------------------------------------

def build_opening_node(session_state: dict, flows_tools: dict) -> NodeConfig:
    """Build the opening node — warm greeting and initial engagement.

    Tools: search_memories, save_important_detail, transition_to_main.
    Context strategy: APPEND (keep greeting in context).
    """
    senior_ctx = _build_senior_context(session_state)
    greeting = session_state.get("greeting", "")

    opening_task = (
        "PHASE: OPENING\n"
        "Greet the senior warmly and ask how they are doing. "
        "Keep it brief and natural. After they respond and you've exchanged "
        "a few pleasantries, call transition_to_main to move into the main conversation."
    )

    if greeting:
        opening_task += f'\n\nUse this greeting to start: "{greeting}"'

    # Available tools for opening
    functions: list = []
    if "search_memories" in flows_tools:
        functions.append(flows_tools["search_memories"])
    if "save_important_detail" in flows_tools:
        functions.append(flows_tools["save_important_detail"])

    # Transition tool
    functions.append(FlowsFunctionSchema(
        name="transition_to_main",
        description="Call this after the opening pleasantries are done and you are ready to move into the main conversation.",
        properties={},
        required=[],
        handler=_make_transition_to_main(session_state, flows_tools),
    ))

    # Anthropic only extracts the FIRST system message from the messages array.
    # Combine base prompt + senior context into one system message, and put
    # task instructions in a user message.
    system_content = BASE_SYSTEM_PROMPT + "\n\n" + senior_ctx

    return NodeConfig(
        name="opening",
        role_messages=[{"role": "system", "content": system_content}],
        task_messages=[{"role": "user", "content": opening_task}],
        functions=functions,
        context_strategy=ContextStrategyConfig(strategy=ContextStrategy.APPEND),
        respond_immediately=True,  # Bot always speaks first on phone calls
    )


def build_main_node(session_state: dict, flows_tools: dict) -> NodeConfig:
    """Build the main conversation node — free-form conversation + reminders.

    Tools: all 4 tools + transition_to_winding_down.
    Context strategy: RESET_WITH_SUMMARY (manage context window size).
    """
    senior_ctx = _build_senior_context(session_state)
    reminder_ctx = _build_reminder_context(session_state)
    tracking_ctx = _build_tracking_context(session_state)

    main_task = (
        "PHASE: MAIN CONVERSATION\n"
        "Have a natural, warm conversation. Listen actively, respond empathetically, "
        "and gently weave in any pending reminders when appropriate.\n\n"
        "Use search_memories when the senior mentions something you might know about. "
        "Use get_news when they express curiosity about current events. "
        "Use save_important_detail when they share significant life updates.\n\n"
        "IMPORTANT — ENDING THE CALL:\n"
        "When the senior says goodbye, wants to go, or the conversation naturally winds down, "
        "you MUST call transition_to_winding_down. Do NOT just say goodbye in text — "
        "the call only ends when you use the transition tool. If you say bye without "
        "calling the tool, the call stays open and the senior hears silence."
    )

    if reminder_ctx:
        main_task += f"\n\n{reminder_ctx}"

    if tracking_ctx:
        main_task += f"\n\n{tracking_ctx}"

    # All tools for main phase
    functions: list = list(flows_tools.values())

    # Transition tool
    functions.append(FlowsFunctionSchema(
        name="transition_to_winding_down",
        description="Call this when the conversation is naturally winding down, the senior signals they want to go, or after about 10 minutes of conversation.",
        properties={},
        required=[],
        handler=_make_transition_to_winding_down(session_state, flows_tools),
    ))

    system_content = BASE_SYSTEM_PROMPT + "\n\n" + senior_ctx

    return NodeConfig(
        name="main",
        role_messages=[{"role": "system", "content": system_content}],
        task_messages=[{"role": "user", "content": main_task}],
        functions=functions,
        context_strategy=ContextStrategyConfig(
            strategy=ContextStrategy.RESET_WITH_SUMMARY,
            summary_prompt=(
                "Summarize the conversation so far in 2-3 sentences, noting: "
                "key topics discussed, the senior's mood/engagement, any reminders "
                "delivered, and any concerns raised. Keep it concise — this summary "
                "will replace the full conversation history."
            ),
        ),
        respond_immediately=False,
    )


def build_winding_down_node(session_state: dict, flows_tools: dict) -> NodeConfig:
    """Build the winding down node — deliver remaining reminders, wrap up.

    Tools: mark_reminder, save_detail, transition_to_closing.
    Context strategy: APPEND.
    """
    senior_ctx = _build_senior_context(session_state)
    reminder_ctx = _build_reminder_context(session_state)

    winding_task = (
        "PHASE: WINDING DOWN\n"
        "The conversation is wrapping up. If there are any undelivered reminders, "
        "deliver them now in a natural way. Then say a brief warm goodbye and "
        "IMMEDIATELY call transition_to_closing. Do NOT wait for another response — "
        "call the tool right after your goodbye message."
    )

    if reminder_ctx:
        winding_task += f"\n\n{reminder_ctx}"

    functions: list = []
    if "mark_reminder_acknowledged" in flows_tools:
        functions.append(flows_tools["mark_reminder_acknowledged"])
    if "save_important_detail" in flows_tools:
        functions.append(flows_tools["save_important_detail"])

    functions.append(FlowsFunctionSchema(
        name="transition_to_closing",
        description="Call this when you are ready to say goodbye.",
        properties={},
        required=[],
        handler=_make_transition_to_closing(session_state),
    ))

    system_content = BASE_SYSTEM_PROMPT + "\n\n" + senior_ctx

    return NodeConfig(
        name="winding_down",
        role_messages=[{"role": "system", "content": system_content}],
        task_messages=[{"role": "user", "content": winding_task}],
        functions=functions,
        context_strategy=ContextStrategyConfig(strategy=ContextStrategy.APPEND),
        respond_immediately=False,
    )


def build_closing_node(session_state: dict) -> NodeConfig:
    """Build the closing node — warm goodbye and end conversation.

    Tools: none (just end_conversation post-action).
    Context strategy: APPEND.
    """
    senior = session_state.get("senior") or {}
    first_name = (senior.get("name") or "").split(" ")[0] or "there"

    closing_task = (
        "PHASE: CLOSING\n"
        f"Say a warm goodbye to {first_name}. Keep it brief, caring, and positive. "
        "Mention that you enjoyed talking with them and look forward to the next call. "
        "Do NOT ask any more questions — just say goodbye."
    )

    senior_ctx = _build_senior_context(session_state)
    system_content = BASE_SYSTEM_PROMPT + "\n\n" + senior_ctx

    return NodeConfig(
        name="closing",
        role_messages=[{"role": "system", "content": system_content}],
        task_messages=[{"role": "user", "content": closing_task}],
        functions=[],
        post_actions=[{"type": "end_conversation"}],
        context_strategy=ContextStrategyConfig(strategy=ContextStrategy.APPEND),
        respond_immediately=False,
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def build_initial_node(session_state: dict, flows_tools: dict) -> NodeConfig:
    """Build the initial (opening) node for a new call.

    This is the entry point — pass the returned NodeConfig to FlowManager.
    """
    return build_opening_node(session_state, flows_tools)
