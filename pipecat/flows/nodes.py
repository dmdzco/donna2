"""Pipecat Flows call phase node definitions.

Defines call phases: [reminder] → main → winding_down → closing.
The opening phase is merged into main — the bot greets and continues
in one phase, eliminating the transition_to_main double-LLM-call penalty.
The reminder phase is conditional — only activates when pending reminders exist.

Prompt text lives in prompts.py — edit prompts there, edit flow logic here.
"""

from __future__ import annotations

from loguru import logger
from pipecat_flows import (
    FlowsFunctionSchema,
    NodeConfig,
    ContextStrategy,
    ContextStrategyConfig,
)

from prompts import (
    BASE_SYSTEM_PROMPT,
    GREETING_TASK_OUTBOUND,
    GREETING_TASK_INBOUND,
    REMINDER_TASK,
    MAIN_TASK,
    WINDING_DOWN_TASK,
    CLOSING_TASK_TEMPLATE,
)


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

    news_ctx = session_state.get("news_context")
    if news_ctx:
        parts.append(f"\n{news_ctx}")

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


def _build_greeting_task(session_state: dict) -> str:
    """Build the greeting instruction for the initial call phase."""
    is_outbound = session_state.get("is_outbound", True)
    greeting_task = GREETING_TASK_OUTBOUND if is_outbound else GREETING_TASK_INBOUND

    greeting = session_state.get("greeting", "")
    if greeting:
        greeting_task += f'\n\nUse this greeting to start: "{greeting}"'

    return greeting_task


# ---------------------------------------------------------------------------
# Transition functions
# ---------------------------------------------------------------------------

def _make_transition_reminder_to_main(session_state: dict, flows_tools: dict):
    """Create transition function: reminder → main."""

    async def transition_to_main(args: dict, flow_manager) -> tuple[dict, NodeConfig]:
        logger.info("Transitioning: reminder → main")
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

def build_reminder_node(
    session_state: dict, flows_tools: dict, *, with_greeting: bool = False
) -> NodeConfig:
    """Build the reminder node — deliver pending reminders.

    Only activated when session_state has pending reminders.
    Tools: mark_reminder_acknowledged, save_important_detail, transition_to_main.
    Context strategy: APPEND.

    When with_greeting=True (initial node), includes system prompt and greeting.
    """
    reminder_ctx = _build_reminder_context(session_state)

    reminder_task = REMINDER_TASK
    if reminder_ctx:
        reminder_task += f"\n\n{reminder_ctx}"

    # When this is the initial node, prepend the greeting
    if with_greeting:
        greeting_task = _build_greeting_task(session_state)
        reminder_task = greeting_task + "\n\n" + reminder_task

    functions: list = []
    if "mark_reminder_acknowledged" in flows_tools:
        functions.append(flows_tools["mark_reminder_acknowledged"])
    if "save_important_detail" in flows_tools:
        functions.append(flows_tools["save_important_detail"])

    functions.append(FlowsFunctionSchema(
        name="transition_to_main",
        description="Call this after all reminders have been delivered and acknowledged, to move into the main conversation.",
        properties={},
        required=[],
        handler=_make_transition_reminder_to_main(session_state, flows_tools),
    ))

    # When this is the initial node, include system prompt
    role_messages = []
    if with_greeting:
        senior_ctx = _build_senior_context(session_state)
        system_content = BASE_SYSTEM_PROMPT + "\n\n" + senior_ctx
        role_messages = [{"role": "system", "content": system_content}]

    return NodeConfig(
        name="reminder",
        role_messages=role_messages,
        task_messages=[{"role": "user", "content": reminder_task}],
        functions=functions,
        context_strategy=ContextStrategyConfig(strategy=ContextStrategy.APPEND),
        respond_immediately=with_greeting,  # Bot speaks first only on initial node
    )


def build_main_node(
    session_state: dict, flows_tools: dict, *, with_greeting: bool = False
) -> NodeConfig:
    """Build the main conversation node — free-form conversation + reminders.

    Tools: all tools + transition_to_winding_down.
    Context strategy: APPEND.

    When with_greeting=True (initial node), includes system prompt and greeting.
    """
    reminder_ctx = _build_reminder_context(session_state)
    tracking_ctx = _build_tracking_context(session_state)

    main_task = MAIN_TASK

    # When this is the initial node, prepend the greeting
    if with_greeting:
        greeting_task = _build_greeting_task(session_state)
        main_task = greeting_task + "\n\n" + main_task

    if reminder_ctx:
        main_task += f"\n\n{reminder_ctx}"

    if tracking_ctx:
        main_task += f"\n\n{tracking_ctx}"

    # All tools for main phase (includes check_caregiver_notes)
    functions: list = list(flows_tools.values())

    # Transition tool
    functions.append(FlowsFunctionSchema(
        name="transition_to_winding_down",
        description="Call this when the conversation is naturally winding down, the senior signals they want to go, or after about 10 minutes of conversation.",
        properties={},
        required=[],
        handler=_make_transition_to_winding_down(session_state, flows_tools),
    ))

    # When this is the initial node, include system prompt
    role_messages = []
    if with_greeting:
        senior_ctx = _build_senior_context(session_state)
        system_content = BASE_SYSTEM_PROMPT + "\n\n" + senior_ctx
        role_messages = [{"role": "system", "content": system_content}]

    return NodeConfig(
        name="main",
        role_messages=role_messages,
        task_messages=[{"role": "user", "content": main_task}],
        functions=functions,
        context_strategy=ContextStrategyConfig(strategy=ContextStrategy.APPEND),
        respond_immediately=with_greeting,  # Bot speaks first only on initial node
    )


def build_winding_down_node(session_state: dict, flows_tools: dict) -> NodeConfig:
    """Build the winding down node — deliver remaining reminders, wrap up.

    Tools: mark_reminder, save_detail, transition_to_closing.
    Context strategy: APPEND.
    """
    senior_ctx = _build_senior_context(session_state)
    reminder_ctx = _build_reminder_context(session_state)

    winding_task = WINDING_DOWN_TASK

    if reminder_ctx:
        winding_task += f"\n\n{reminder_ctx}"

    functions: list = []
    if "mark_reminder_acknowledged" in flows_tools:
        functions.append(flows_tools["mark_reminder_acknowledged"])
    if "save_important_detail" in flows_tools:
        functions.append(flows_tools["save_important_detail"])
    if "web_search" in flows_tools:
        functions.append(flows_tools["web_search"])
    if "check_caregiver_notes" in flows_tools:
        functions.append(flows_tools["check_caregiver_notes"])

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

    closing_task = CLOSING_TASK_TEMPLATE.format(first_name=first_name)

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
    """Build the initial node for a new call.

    Skips the legacy opening phase — starts directly in main (or reminder
    if pending). The greeting is prepended to the task message.
    This eliminates the transition_to_main double-LLM-call penalty (~3-5s).
    """
    reminder_prompt = session_state.get("reminder_prompt")
    reminders_delivered = session_state.get("reminders_delivered") or set()

    if reminder_prompt and not reminders_delivered:
        logger.info("Initial node: reminder (pending reminders)")
        return build_reminder_node(session_state, flows_tools, with_greeting=True)

    logger.info("Initial node: main (no pending reminders)")
    return build_main_node(session_state, flows_tools, with_greeting=True)
