# Pipecat Migration Plan — REVIEWED & IMPROVED

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

> **Review Date:** 2026-02-05
> **Reviewed By:** Architecture team (4 parallel research agents + lead architect)
> **Status:** Plan v2 — addresses all identified gaps, adds parallel deployment strategy

---

## Review Summary

The original migration plan is structurally sound but has **12 critical gaps**, **6 API accuracy issues**, and **3 missing architectural concerns**. This reviewed version corrects all issues and adds the required parallel deployment strategy.

### Critical Findings

| # | Finding | Severity | Section |
|---|---------|----------|---------|
| 1 | `context-cache.js` (365 lines) completely missing from plan | **Critical** | Phase 1 |
| 2 | Rate limiting (5 tiers) not mentioned | **High** | Phase 5 |
| 3 | Security headers (Helmet/HSTS/CSP/request-id) not ported | **High** | Phase 5 |
| 4 | Twilio webhook signature verification missing | **High** | Phase 5 |
| 5 | `browser-session.js` (312 lines, browser call support) not mentioned | **Medium** | Scope |
| 6 | `pipecat-ai` is now at `0.0.101`, `pipecat-ai-flows` at `0.0.22` — plan pins outdated `>=0.0.83` / `>=0.0.8` | **High** | Phase 0 |
| 7 | `DeepgramSTTService` requires `LiveOptions` object, NOT a raw dict | **Critical** | Phase 4 |
| 8 | `FlowsFunctionSchema.from_function_schema()` does NOT exist — tools must be defined as FlowsFunctionSchema directly | **Critical** | Phase 3 |
| 9 | `set_function_call_context()` / `FunctionCallParams.function_call_context` do NOT exist — use closures or FlowManager.state | **Critical** | Phase 3 |
| 10 | `call_data["custom_parameters"]` should be `call_data["body"]` (Twilio metadata access) | **High** | Phase 4 |
| 11 | Drizzle ORM → raw asyncpg porting complexity underestimated (scheduler has 6 multi-table joins) | **Medium** | Phase 1 |
| 12 | Voice webhook route does critical pre-processing (conversation record creation, 3 call types, callMetadata pattern) not covered in bot.py | **High** | Phase 4 |
| 13 | No parallel deployment architecture defined — leadership requires both pipelines running simultaneously | **Critical** | New Phase |
| 14 | System prompt has 12 dynamic parameters per turn (not 3 as plan implies) — Flows task_messages can't replicate this alone | **High** | Phase 3 |
| 15 | In-call conversation tracking (252 regex patterns, topic/question/advice tracking with size limits) completely missing | **High** | Phase 2/4 |
| 16 | 7 middleware files exist, plan only covers auth — missing: rate-limit, security, twilio, api-auth, validate (Zod→Pydantic), error-handler | **High** | Phase 5 |
| 17 | PII-safe logging (phone masking, name masking) not mentioned | **Medium** | Phase 5 |
| 18 | Dockerfile should use `python:3.12-slim` not `dailyco/pipecat-base:latest` (latter is for Pipecat Cloud, not Railway) | **Medium** | Phase 7 |

### Verified Correct (no changes needed)

These plan assumptions were verified as accurate:
- `LLMMessagesAppendFrame` EXISTS with `run_llm` parameter (confirmed)
- `TwilioFrameSerializer` auto-handles mulaw↔PCM conversion AND auto-terminates calls when pipeline ends
- `SileroVADAnalyzer` + `VADParams` parameter names are correct (confidence, stop_secs, start_secs, min_volume)
- `AnthropicLLMService.register_function()` works as described
- `FlowManager.state` persists across node transitions as designed
- `ContextStrategy.RESET_WITH_SUMMARY` works as described (makes LLM call, 5s timeout, fallback to RESET)
- Pipeline structure (transport → STT → observer → aggregator → LLM → stripper → TTS → output → aggregator) is correct
- Pipecat's interruption handling is fully automatic via InterruptionFrame with word-level precision

---

## Goal

Migrate Donna's voice pipeline from custom Node.js to Python Pipecat + Pipecat Flows, keeping the same database and frontend apps. **Both pipelines must run in parallel** on separate infrastructure until the Pipecat version is verified stable.

## Architecture

**Parallel deployment during migration:**
- **Node.js (existing):** Stays on Railway at `donna-api-production-2450.up.railway.app`, serving production traffic
- **Pipecat (new):** Runs as a separate Railway service on its own domain, receiving test traffic via a dedicated Twilio number
- **Shared:** Same Neon PostgreSQL database, same React frontend apps (admin, consumer)
- **Twilio routing:** Two phone numbers — production number → Node.js, test number → Pipecat

**Target architecture (post-migration):**
Single Python server running FastAPI (API routes) + Pipecat (voice pipeline). Twilio WebSocket connects to Pipecat's `FastAPIWebsocketTransport` with `TwilioFrameSerializer`. Call phases managed by Pipecat Flows. Quick Observer as custom `FrameProcessor`. Memory/reminders as LLM tool calls.

## Tech Stack

Python 3.12, Pipecat (`pipecat-ai[anthropic,deepgram,elevenlabs,silero,websocket,runner]`), Pipecat Flows (`pipecat-ai-flows`), FastAPI, asyncpg, OpenAI SDK (embeddings), Anthropic SDK (Claude), Google GenAI (Gemini for post-call), Twilio SDK, bcrypt, PyJWT.

**Current codebase reference:** `docs/DONNA_ON_PIPECAT.md` has the full architecture and file mapping.

**Development philosophy:** Railway-first. Never test voice pipelines locally with ngrok. Deploy to Railway and test with real Twilio calls. Local development is only for unit tests on pure logic (regex patterns, service functions). The real test is always a phone call to a real phone.

---

## Prerequisites

Before starting, ensure you have:
- Python 3.12+ installed (`python3 --version`)
- `uv` package manager installed (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Access to the existing Neon PostgreSQL database (same `DATABASE_URL`)
- All API keys: `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
- **A dedicated Twilio phone number for Pipecat testing** (separate from the production number)
- **Railway CLI installed and authenticated** (`railway login`)

---

## Phase 0: Project Scaffolding + API Verification (Day 1)

### Task 0.1: Verify Pipecat API compatibility

**CRITICAL — DO THIS FIRST.** The original plan references several Pipecat APIs that may not exist or may have changed. Before writing any code, verify the actual API surface.

**Step 1: Install pipecat-ai and inspect available APIs**

```bash
mkdir -p pipecat && cd pipecat
uv init --no-workspace
uv add "pipecat-ai[anthropic,deepgram,elevenlabs,silero,websocket,runner]" "pipecat-ai-flows"
```

**Step 2: Verify each critical import exists**

Create a verification script and run it:

```python
# pipecat/verify_apis.py
"""Run this to verify all Pipecat APIs the migration depends on exist."""

checks = []

# Transport
try:
    from pipecat.transports.websocket.fastapi import FastAPIWebsocketTransport, FastAPIWebsocketParams
    checks.append(("FastAPIWebsocketTransport", "OK"))
except ImportError as e:
    checks.append(("FastAPIWebsocketTransport", f"FAIL: {e}"))

# Serializer
try:
    from pipecat.serializers.twilio import TwilioFrameSerializer
    checks.append(("TwilioFrameSerializer", "OK"))
except ImportError as e:
    checks.append(("TwilioFrameSerializer", f"FAIL: {e}"))

# Services
try:
    from pipecat.services.anthropic.llm import AnthropicLLMService
    checks.append(("AnthropicLLMService", "OK"))
except ImportError as e:
    checks.append(("AnthropicLLMService", f"FAIL: {e}"))

try:
    from pipecat.services.deepgram.stt import DeepgramSTTService
    checks.append(("DeepgramSTTService", "OK"))
except ImportError as e:
    checks.append(("DeepgramSTTService", f"FAIL: {e}"))

try:
    from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
    checks.append(("ElevenLabsTTSService", "OK"))
except ImportError as e:
    checks.append(("ElevenLabsTTSService", f"FAIL: {e}"))

# VAD
try:
    from pipecat.audio.vad.silero import SileroVADAnalyzer
    from pipecat.audio.vad.vad_analyzer import VADParams
    checks.append(("SileroVADAnalyzer + VADParams", "OK"))
except ImportError as e:
    checks.append(("SileroVADAnalyzer + VADParams", f"FAIL: {e}"))

# Frames
try:
    from pipecat.frames.frames import TranscriptionFrame, TextFrame
    checks.append(("TranscriptionFrame + TextFrame", "OK"))
except ImportError as e:
    checks.append(("TranscriptionFrame + TextFrame", f"FAIL: {e}"))

# Check if LLMMessagesAppendFrame exists (may not!)
try:
    from pipecat.frames.frames import LLMMessagesAppendFrame
    checks.append(("LLMMessagesAppendFrame", "OK"))
except ImportError:
    try:
        from pipecat.frames.frames import LLMMessagesUpdateFrame
        checks.append(("LLMMessagesAppendFrame", "FAIL — use LLMMessagesUpdateFrame instead"))
    except ImportError:
        checks.append(("LLMMessagesAppendFrame", "FAIL — neither AppendFrame nor UpdateFrame found"))

# Pipeline
try:
    from pipecat.pipeline.pipeline import Pipeline
    from pipecat.pipeline.runner import PipelineRunner
    from pipecat.pipeline.task import PipelineParams, PipelineTask
    checks.append(("Pipeline + Runner + Task", "OK"))
except ImportError as e:
    checks.append(("Pipeline + Runner + Task", f"FAIL: {e}"))

# Runner utils
try:
    from pipecat.runner.utils import parse_telephony_websocket
    checks.append(("parse_telephony_websocket", "OK"))
except ImportError as e:
    checks.append(("parse_telephony_websocket", f"FAIL: {e}"))

# Context aggregators
try:
    from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
    checks.append(("LLMContextAggregatorPair", "OK"))
except ImportError as e:
    checks.append(("LLMContextAggregatorPair", f"FAIL: {e}"))

# Function schema
try:
    from pipecat.adapters.schemas.function_schema import FunctionSchema
    checks.append(("FunctionSchema", "OK"))
except ImportError as e:
    checks.append(("FunctionSchema", f"FAIL: {e}"))

# Flows
try:
    from pipecat_flows import FlowManager, NodeConfig, FlowsFunctionSchema
    checks.append(("FlowManager + NodeConfig + FlowsFunctionSchema", "OK"))
except ImportError as e:
    checks.append(("FlowManager + NodeConfig + FlowsFunctionSchema", f"FAIL: {e}"))

try:
    from pipecat_flows import ContextStrategy, ContextStrategyConfig
    checks.append(("ContextStrategy + ContextStrategyConfig", "OK"))
except ImportError as e:
    checks.append(("ContextStrategy + ContextStrategyConfig", f"FAIL: {e}"))

# LLM tool registration
try:
    llm = AnthropicLLMService.__new__(AnthropicLLMService)
    has_register = hasattr(llm, 'register_function')
    has_context = hasattr(llm, 'set_function_call_context')
    checks.append(("register_function", "OK" if has_register else "FAIL — method not found"))
    checks.append(("set_function_call_context", "OK" if has_context else "FAIL — method not found"))
except Exception as e:
    checks.append(("LLM tool registration", f"FAIL: {e}"))

print("\n=== Pipecat API Compatibility Check ===\n")
for name, status in checks:
    icon = "✓" if status == "OK" else "✗"
    print(f"  {icon} {name}: {status}")

fails = [c for c in checks if c[1] != "OK"]
print(f"\n{'ALL CHECKS PASSED' if not fails else f'{len(fails)} CHECKS FAILED — update plan before proceeding'}")
```

```bash
cd pipecat && uv run python verify_apis.py
```

**Step 3: Update the plan based on verification results.** Any failed check means the corresponding code in the plan MUST be rewritten before that phase.

**Commit message:** `chore: verify Pipecat API compatibility`

### Task 0.2: Initialize Python project alongside Node.js

The Python project lives in a `pipecat/` directory inside the repo. The Node.js code stays until migration is complete — both can run side by side.

**Files:**
- Create: `pipecat/pyproject.toml`
- Create: `pipecat/.env.example`
- Create: `pipecat/.python-version`

**Step 1: Create project structure**

```bash
mkdir -p pipecat/processors pipecat/flows pipecat/services pipecat/api/routes pipecat/api/middleware pipecat/db pipecat/tests
```

**Step 2: Create `pipecat/pyproject.toml`**

> **NOTE:** Pin to the EXACT version that passed Task 0.1 verification, not a minimum version.

```toml
[project]
name = "donna-pipecat"
version = "0.1.0"
requires-python = ">=3.12"
description = "Donna AI companion - Pipecat voice pipeline"
dependencies = [
    "pipecat-ai[anthropic,deepgram,elevenlabs,silero,websocket,runner]>=0.0.101",
    "pipecat-ai-flows>=0.0.22",
    "fastapi>=0.115.0",
    "uvicorn>=0.30.0",
    "asyncpg>=0.30.0",
    "pgvector>=0.3.0",
    "openai>=1.50.0",
    "anthropic>=0.39.0",
    "google-genai>=1.0.0",
    "twilio>=9.0.0",
    "bcrypt>=4.0.0",
    "PyJWT>=2.9.0",
    "python-dotenv>=1.0.0",
    "httpx>=0.27.0",
    "loguru>=0.7.0",
    "slowapi>=0.1.9",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.24.0",
    "pytest-cov>=5.0.0",
]
```

> **ADDED:** `slowapi` for rate limiting (FastAPI equivalent of express-rate-limit).

**Step 3: Create `pipecat/.python-version`**

```
3.12
```

**Step 4: Create `pipecat/.env.example`**

```bash
# Database (same Neon PostgreSQL as Node.js)
DATABASE_URL=postgres://...

# AI Services
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
DEEPGRAM_API_KEY=...
ELEVENLABS_API_KEY=...

# Twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...

# Auth
JWT_SECRET=...
COFOUNDER_API_KEY_1=...
COFOUNDER_API_KEY_2=...

# Clerk (for consumer app auth)
CLERK_SECRET_KEY=...

# Server
PORT=7860
BASE_URL=https://your-pipecat-domain.up.railway.app
```

**Step 5: Initialize and verify**

```bash
cd pipecat && uv sync && cd ..
```

**Step 6: Commit**

```bash
git add pipecat/
git commit -m "chore: scaffold Pipecat Python project alongside Node.js"
```

---

## Phase 1: Database Layer + Services (Day 1-3)

Port the database connection and ALL services to Python. Uses the same Neon PostgreSQL database — no schema changes needed.

### Task 1.1: Database connection + raw query helpers

**Files:**
- Create: `pipecat/db/__init__.py`
- Create: `pipecat/db/client.py`
- Test: `pipecat/tests/test_db.py`

**Implementation:** Same as original plan (asyncpg pool, query_one, query_many, execute helpers).

**IMPORTANT NOTE:** The existing Node.js code uses Drizzle ORM with complex query builders (joins, conditions, subqueries). The Python port uses raw SQL via asyncpg. This means every Drizzle query must be manually rewritten as parameterized SQL. The scheduler service alone has 6 multi-table joins with complex WHERE clauses. Budget extra time for this.

**Commit message:** `feat(pipecat): add database connection layer with asyncpg`

### Task 1.2: Port seniors service

Same as original plan. Reference: `services/seniors.js` (66 lines).

**Commit message:** `feat(pipecat): port seniors service to Python`

### Task 1.3: Port memory service (semantic search + embeddings)

Same as original plan. Reference: `services/memory.js` (329 lines).

**ADDITIONAL:** Port `groupByType()` and `formatGroupedMemories()` methods — these are used by context-cache (Task 1.5) to format tiered memory context.

**Commit message:** `feat(pipecat): port memory service with pgvector semantic search`

### Task 1.4: Port remaining services

Same as original plan, plus one addition.

| Service | Reference | Est. Lines | Commit message |
|---------|-----------|-----------|----------------|
| `services/conversations.py` | `services/conversations.js` (172 lines) | ~120 | `feat(pipecat): port conversations service` |
| `services/daily_context.py` | `services/daily-context.js` (197 lines) | ~140 | `feat(pipecat): port daily context service` |
| `services/greetings.py` | `services/greetings.js` (258 lines) | ~200 | `feat(pipecat): port greeting rotation service` |
| `services/news.py` | `services/news.js` (104 lines) | ~80 | `feat(pipecat): port news service` |
| `services/call_analysis.py` | `services/call-analysis.js` (257 lines) | ~180 | `feat(pipecat): port call analysis service` |
| `services/caregivers.py` | `services/caregivers.js` (84 lines) | ~60 | `feat(pipecat): port caregivers service` |
| `services/scheduler.py` | `services/scheduler.js` (515 lines) | ~400 | `feat(pipecat): port scheduler service` |

**Scheduler complexity warning:** The scheduler has:
- `getDueReminders()` with 3 separate DB queries (non-recurring, recurring time-of-day match, retry-pending)
- `triggerReminderCall()` with pre-fetched context, delivery record creation/update, Twilio outbound
- `markReminderAcknowledged()` with delivery status updates and retry logic
- `formatReminderPrompt()` for natural language reminder formatting
- `getReminderContext()` / `getPrefetchedContext()` for in-memory context maps
- `clearReminderContext()` for cleanup
- `startScheduler()` with `setInterval` polling — replace with `asyncio` task or APScheduler
- Retry logic: 30-minute retry window, max attempt tracking, status transitions

### Task 1.5: Port context-cache service (MISSING FROM ORIGINAL PLAN)

**Files:**
- Create: `pipecat/services/context_cache.py`
- Test: `pipecat/tests/test_context_cache.py`
- Reference: `services/context-cache.js` (365 lines)

This service was **completely missing** from the original plan. It:
1. Pre-caches senior context at 5 AM in each senior's local timezone
2. Uses weighted random interest selection based on recent memory mentions
3. Generates templated greetings with rotation (avoids repeating the same greeting)
4. Maintains in-memory cache with 24-hour TTL
5. Is called by the scheduler's hourly tick AND by `v1-advanced.js` at call connect time

Key functions to port:
- `prefetchAndCache(seniorId)` — parallel DB fetches, builds memory context string
- `getCache(seniorId)` — returns cached context or null
- `clearCache(seniorId)` — invalidated after call ends
- `runDailyPrefetch()` — iterates all seniors, pre-fetches at 5 AM local
- `getLocalHour(timezone)` — timezone-aware hour calculation
- `selectInterest(interests, recentMemories)` — weighted random selection
- `generateTemplatedGreeting(senior, recentMemories, lastGreetingIndex)` — template + rotation

**Commit message:** `feat(pipecat): port context cache service (5 AM pre-fetch + greeting rotation)`

---

## Phase 2: Quick Observer Processor (Day 3-4)

### Task 2.1: Port regex patterns as Pipecat FrameProcessor

Same as original plan, with one critical correction.

**API CORRECTION:** The original plan uses `LLMMessagesAppendFrame` which may not exist in the current Pipecat version. Verify in Task 0.1. The correct approach depends on what's available:

- **If `LLMMessagesAppendFrame` exists:** Use as shown in the plan
- **If `LLMMessagesUpdateFrame` exists:** Use that instead with the same message format
- **If neither exists:** Inject guidance through the context aggregator or by modifying the `LLMContext.messages` directly before the LLM processes the frame

The Quick Observer should also update session state with its analysis results so the Flow Manager can access them for transition decisions.

**Files:**
- Create: `pipecat/processors/__init__.py`
- Create: `pipecat/processors/quick_observer.py`
- Test: `pipecat/tests/test_quick_observer.py`
- Reference: `pipelines/quick-observer.js` (1,196 lines)

**Exact pattern count from codebase audit (252 total):**

| Category | Count | Notes |
|----------|-------|-------|
| HEALTH_PATTERNS | 31 | Pain, dizziness, falls, cardiovascular, fatigue, cognitive, GI, vision, medication |
| FAMILY_PATTERNS | 25 | All relationships including pets |
| EMOTION_PATTERNS | 27 | Loneliness, sadness, anxiety, happiness, gratitude, frustration |
| NEWS/WEB_SEARCH_PATTERNS | 23 | Factual/curiosity triggers |
| ACTIVITY_PATTERNS | 18 | Daily living, hobbies, meals |
| SAFETY_PATTERNS | 14 | Falls, scams, strangers, accidents, wandering |
| ADL_PATTERNS | 13 | Activities of daily living |
| TIME_PATTERNS | 12 | Memories, plans, schedules |
| GOODBYE_PATTERNS | 11 | Strong and weak goodbye signals |
| REMINDER_ACKNOWLEDGMENT | 11 | "okay", "I'll do that", "already did" |
| SOCIAL_PATTERNS | 10 | Friends, neighbors, community, isolation |
| COGNITIVE_PATTERNS | 9 | Confusion, repetition, memory |
| ENVIRONMENT_PATTERNS | 8 | Home, weather, surroundings |
| END_OF_LIFE_PATTERNS | 8 | Sensitive topics |
| HYDRATION_PATTERNS | 8 | Water, drinks, dehydration |
| TRANSPORTATION_PATTERNS | 8 | Driving, getting around |
| HELP_REQUEST_PATTERNS | 6 | Direct requests for help |
| QUESTION_PATTERNS | 5 | User asking questions |
| ENGAGEMENT_PATTERNS | 5 | Short responses, disengagement |

Plus `buildGuidance()` has specific guidance text for 100+ signal types, and `buildModelRecommendation()` has 16 priority-ordered token adjustment rules.

**Commit message:** `feat(pipecat): port Quick Observer regex patterns as FrameProcessor`

### Task 2.2: Guidance stripper processor

Same as original plan. **One addition:** handle partial/streaming `<guidance>` tags (the existing code handles unclosed tags at the end of streaming chunks).

**Commit message:** `feat(pipecat): add guidance stripper processor`

---

## Phase 3: Tools + Flows (Day 4-5)

### Task 3.1: Define LLM tools (memory search, news, reminders)

**API CORRECTION:** The original plan uses `FunctionCallParams.function_call_context` and `llm.set_function_call_context()` to pass senior_id to tool handlers. These methods likely do NOT exist. Instead, use a closure or pass session state through the tool handler:

```python
# Pattern: use closure over session_state instead of function_call_context
def make_tool_handlers(session_state: dict):
    """Create tool handlers with session state in closure scope."""

    async def handle_search_memories(params: FunctionCallParams):
        senior_id = session_state.get("senior_id")
        if not senior_id:
            await params.result_callback("No senior context available.")
            return
        query = params.arguments["query"]
        results = await memory_service.search(senior_id, query, limit=3)
        # ... format and return results
        await params.result_callback(formatted)

    async def handle_get_news(params: FunctionCallParams):
        topic = params.arguments["topic"]
        news = await news_service.get_news_for_topic(topic, limit=2)
        await params.result_callback(news or f"I couldn't find recent news about {topic}.")

    async def handle_mark_reminder(params: FunctionCallParams):
        reminder_id = params.arguments["reminder_id"]
        status = params.arguments.get("status", "acknowledged")
        response = params.arguments.get("user_response", "")
        await scheduler_service.mark_reminder_acknowledged(reminder_id, status, response)
        session_state["reminders_delivered"].add(reminder_id)
        await params.result_callback(f"Reminder marked as {status}.")

    async def handle_save_detail(params: FunctionCallParams):
        senior_id = session_state.get("senior_id")
        content = params.arguments["detail"]
        category = params.arguments["category"]
        if senior_id:
            await memory_service.store(
                senior_id=senior_id, type=category,
                content=content, source="conversation", importance=70,
            )
            await params.result_callback(f"Noted: {content}")
        else:
            await params.result_callback("Could not save — no senior context.")

    return {
        "search_memories": handle_search_memories,
        "get_news": handle_get_news,
        "mark_reminder_acknowledged": handle_mark_reminder,
        "save_important_detail": handle_save_detail,
    }
```

**Commit message:** `feat(pipecat): add LLM tool definitions for memory, news, reminders`

### Task 3.2: Define Flows nodes (call phases)

**CORRECTION:** The original plan has 3 nodes (opening, main, closing). The DONNA_ON_PIPECAT.md architecture shows 5 nodes (opening, rapport, main, winding_down, closing). Use the 3-node model from the plan for simplicity but add a 4th `winding_down` node to handle the gradual transition that the current Director manages:

| Node | System prompt focus | Tools | Context strategy | Transitions to |
|------|-------------------|-------|-----------------|---------------|
| `opening` | Greet warmly, ask how they are | base tools | APPEND | `main` |
| `main` | Free-form conversation, deliver reminders | all tools | RESET_WITH_SUMMARY | `winding_down` or `closing` |
| `winding_down` | Natural wrap-up, deliver undelivered reminders | reminder tools | APPEND | `closing` |
| `closing` | Warm goodbye | minimal | APPEND | end_conversation |

**Critical: System prompt has 12 dynamic parameters per turn**

The current `buildSystemPrompt()` takes 12 parameters that change every turn:
1. `senior` — profile data
2. `memoryContext` — pre-fetched memory context string
3. `reminderPrompt` — formatted reminder text
4. `observerSignal` (deprecated)
5. `dynamicMemoryContext` — real-time memory search results from Director
6. `quickObserverGuidance` — instant regex-based guidance
7. `directorGuidance` — Conversation Director's AI-based guidance
8. `previousCallsSummary` — recent call summaries
9. `newsContext` — news/current events
10. `deliveredReminders[]` — already-delivered reminders (to prevent re-delivery)
11. `conversationTracking` — topics, questions asked, advice given (repetition prevention)
12. `todaysContext` — same-day cross-call context

In Pipecat Flows, this is handled by:
- **Static context** (1, 2, 8, 9, 12) → role_messages and initial task_messages, set once per node
- **Per-turn guidance** (6, 7) → `LLMMessagesAppendFrame` injected by Quick Observer processor (guidance only, since Director is eliminated)
- **Dynamic state** (3, 5, 10, 11) → Updated in `flow_manager.state` and injected into task_messages at node transitions, or via a custom `ContextInjectorProcessor` that rebuilds relevant parts before each LLM call
- **Tools replace Director** (5, 9) → `search_memories` and `get_news` tools called by LLM when needed

**Key additions to node logic:**
- The `main` node needs conversation tracking (topics, questions, advice) injected into task_messages — port `getConversationTrackingSummary()` from v1-advanced.js
- The `main` node needs delivered-reminder tracking to prevent repetition — use `flow_manager.state["reminders_delivered"]`
- Transition from `main` → `winding_down` should trigger based on goodbye signals from Quick Observer OR call duration > 15 minutes
- The `closing` node's `post_actions: [{"type": "end_conversation"}]` triggers pipeline shutdown → TwilioFrameSerializer auto-terminates the Twilio call (verified)
- Use `FlowManager(global_functions=[...])` for tools that should be available in ALL nodes (search_memories, save_detail)

**In-call conversation tracking (MISSING from original plan):**

Port the repetition-prevention system from v1-advanced.js:
- `topicsDiscussed[]` — max 10 topics, extracted via 16 regex patterns from user messages
- `questionsAsked[]` — max 8 questions, extracted from Donna's response (sentences ending in `?`)
- `adviceGiven[]` — max 8, extracted via regex (`"you should"`, `"try to"`, `"remember to"`, etc.)
- `trackTopicsFromSignals(quickResult)` — adds topics from Quick Observer signals (health, family, activities, emotions)
- `getConversationTrackingSummary()` — formats as `"CONVERSATION SO FAR THIS CALL (avoid repeating):"`

Implement as a custom `ConversationTrackerProcessor` in the pipeline, after the LLM and before the guidance stripper. It reads both TranscriptionFrames (user) and TextFrames (LLM output), updates `flow_manager.state`, and the state is referenced in node task_messages.

**Commit message:** `feat(pipecat): add Pipecat Flows call phase nodes`

---

## Phase 4: Voice Pipeline (Day 5-7)

### Task 4.1: Create bot.py — the core pipeline

Same structure as original plan, with critical additions.

**Critical API fix: DeepgramSTTService requires LiveOptions object**

The plan passes a raw dict to `live_options`. This will fail. Use the Deepgram SDK's `LiveOptions` class:

```python
from deepgram import LiveOptions

stt = DeepgramSTTService(
    api_key=os.getenv("DEEPGRAM_API_KEY"),
    live_options=LiveOptions(
        model="nova-3-general",
        language="en",
        sample_rate=8000,
        encoding="linear16",
        channels=1,
        interim_results=True,
        smart_format=True,
        punctuate=True,
    ),
)
```

**Critical API fix: Twilio custom parameters are in `call_data["body"]`**

The plan accesses `call_data.get("custom_parameters", {})`. The actual key is `call_data.get("body", {})` which contains the custom parameters from Twilio's `start.customParameters`.

**Critical addition 1: Voice webhook handler**

The current architecture has a TwiML webhook (`/voice/answer`) that does significant work BEFORE the WebSocket connects:
1. Determines call type (inbound, outbound-manual, outbound-reminder) from Twilio params
2. Looks up senior by phone number
3. Pre-fetches memory context (for inbound calls that aren't pre-cached)
4. Creates a conversation record in the database
5. Stores all this as `callMetadata` that the WebSocket handler picks up

In Pipecat, `parse_telephony_websocket()` handles the WebSocket handshake, but you still need a TwiML endpoint for Twilio to call. The voice route must:

```python
# pipecat/api/routes/voice.py
@router.post("/voice/answer")
async def voice_answer(request: Request):
    """Twilio calls this — returns TwiML pointing to the Pipecat WebSocket."""
    form = await request.form()
    call_sid = form.get("CallSid")
    from_number = form.get("From")
    to_number = form.get("To")
    direction = form.get("Direction", "")

    is_outbound = (from_number == os.getenv("TWILIO_PHONE_NUMBER")
                   or direction == "outbound-api")
    target_phone = to_number if is_outbound else from_number

    # Pre-fetch context (same logic as current routes/voice.js)
    senior = None
    reminder_context = scheduler_service.get_reminder_context(call_sid)
    prefetched = scheduler_service.get_prefetched_context(target_phone)

    if reminder_context:
        senior = reminder_context["senior"]
    elif prefetched:
        senior = prefetched["senior"]
    else:
        senior = await senior_service.find_by_phone(target_phone)

    # Create conversation record
    conversation_id = None
    if senior:
        conv = await conversation_service.create(
            senior_id=senior["id"], call_sid=call_sid
        )
        conversation_id = conv["id"] if conv else None

    # Store metadata for WebSocket handler (passed via TwiML Parameter)
    # ... (store in shared state or pass via custom parameters)

    # Return TwiML
    ws_url = os.getenv("BASE_URL", "").replace("https://", "wss://")
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
    <Response>
        <Connect>
            <Stream url="{ws_url}/ws">
                <Parameter name="senior_id" value="{senior['id'] if senior else ''}" />
                <Parameter name="call_sid" value="{call_sid}" />
                <Parameter name="conversation_id" value="{conversation_id or ''}" />
                <Parameter name="call_type" value="{'reminder' if reminder_context else 'check-in'}" />
            </Stream>
        </Connect>
    </Response>"""
    return Response(content=twiml, media_type="text/xml")
```

**Critical addition 2: Call ending logic**

The current system has a sophisticated call-ending mechanism:
- Quick Observer detects strong/weak goodbye signals
- When senior says goodbye AND Donna responds with goodbye → 4-second silence timer starts
- If senior speaks again during the timer → cancel the timer, continue call
- If 4 seconds of silence → terminate call via Twilio REST API (`calls(callSid).update({status: 'completed'})`)

In Pipecat, the `end_conversation` post_action in the closing node triggers pipeline shutdown. **Verified:** When Twilio credentials (`account_sid`, `auth_token`) are provided to `TwilioFrameSerializer`, it **automatically ends the Twilio call when the pipeline ends**. No manual `calls(callSid).update()` needed.

However, the **4-second grace period for "false goodbyes"** still needs custom implementation:
- Add a custom `GoodbyeGateProcessor` that sits between the Quick Observer and the Flow transition
- When a goodbye signal is detected, start a 4-second timer instead of immediately transitioning to closing
- If the senior speaks again during the timer, cancel it and stay in the `main` node
- If 4 seconds of silence pass, then trigger the `begin_closing` tool call
- This replicates the current `initiateCallEnding()` / `cancelCallEnding()` logic

**Critical addition 3: In-call conversation tracking**

The current `V1AdvancedSession` tracks per-call state to prevent repetition:
- `topicsDiscussed[]` — topics that came up
- `questionsAsked[]` — questions Donna asked (max 8)
- `adviceGiven[]` — advice Donna provided (max 8)
- `storiesShared[]` — facts Donna mentioned
- `deliveredReminderSet` — reminders already delivered

This tracking is done by `extractConversationElements()` and `trackTopicsFromSignals()` which run after every LLM response. In Pipecat, implement this as:
1. A custom `ConversationTracker` FrameProcessor that sits after the LLM in the pipeline
2. It intercepts `TextFrame`s (LLM output) and `TranscriptionFrame`s (user input)
3. It updates `flow_manager.state` with extracted elements
4. The Flow nodes' `task_messages` reference this state to build the tracking summary

**Step 1: Deploy to Railway as separate service and test with a real call**

```bash
git push && railway up
# Point TEST Twilio number to the new Pipecat service URL
```

**Commit message:** `feat(pipecat): add core voice pipeline with Flows + tools`

### Task 4.2: Post-call processing

Same as original plan.

**Commit message:** `feat(pipecat): add post-call analysis and memory extraction`

---

## Phase 5: API Layer + Security (Day 7-10)

> **Strategic recommendation from deployment analysis:** Consider deferring the full API route port (Tasks 5.10+) until AFTER the voice pipeline is validated in production. During parallel running, the Node.js service continues to serve all API routes for the admin dashboard and consumer app. The Pipecat service only needs to handle voice calls. This reduces risk by not changing two things at once. Port the API routes when ready for full cutover.
>
> **However:** Security middleware (Tasks 5.1-5.9) must be implemented from the start since the voice webhook needs auth, rate limiting, and validation.

### Task 5.1: FastAPI server with health check

Same as original plan.

**Commit message:** `feat(pipecat): add FastAPI server with health check`

### Task 5.2: Auth middleware

Same as original plan but with full detail on what must be ported.

The auth middleware has 5 exported functions:
1. `requireAuth` — 3-tier check: cofounder API key → JWT Bearer → Clerk session
2. `optionalAuth` — same checks but doesn't reject unauthenticated requests
3. `requireAdmin` — wraps requireAuth + checks isAdmin
4. `clerkMiddleware` — Clerk session initialization
5. `getClerkUserId` — extracts Clerk user ID

In FastAPI, implement as `Depends()` callables:

```python
async def require_auth(request: Request) -> AuthContext:
    """3-tier auth: cofounder API key → JWT → Clerk."""
    # 1. Cofounder API key
    api_key = request.headers.get("x-api-key")
    if api_key and api_key in COFOUNDER_API_KEYS:
        return AuthContext(is_cofounder=True, is_admin=True, user_id="cofounder")

    # 2. JWT Bearer
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            decoded = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            return AuthContext(is_cofounder=False, is_admin=True, user_id=decoded["adminId"])
        except jwt.InvalidTokenError:
            pass

    # 3. Clerk session
    # ... Clerk verification logic

    raise HTTPException(status_code=401, detail="Authentication required")
```

**Commit message:** `feat(pipecat): port auth middleware (cofounder + JWT + Clerk)`

### Task 5.3: Rate limiting (MISSING FROM ORIGINAL PLAN)

**Files:**
- Create: `pipecat/api/middleware/rate_limit.py`
- Reference: `middleware/rate-limit.js` (99 lines)

The existing system has 5 rate limiters:

| Limiter | Scope | Limit | Applied to |
|---------|-------|-------|-----------|
| `apiLimiter` | Per IP | 100/min | All `/api/*` routes |
| `callLimiter` | Per IP | 5/min | Call initiation endpoints |
| `writeLimiter` | Per IP | 30/min | POST/PUT/DELETE operations |
| `authLimiter` | Per IP | 10/min | Login/auth endpoints |
| `webhookLimiter` | Per IP | 500/min | Twilio webhooks |

Use `slowapi` (already added to pyproject.toml) which is the FastAPI equivalent of express-rate-limit:

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

# Apply per-route:
@router.get("/api/seniors")
@limiter.limit("100/minute")
async def list_seniors(request: Request, auth=Depends(require_auth)):
    ...
```

**Commit message:** `feat(pipecat): add rate limiting middleware`

### Task 5.4: Security headers (MISSING FROM ORIGINAL PLAN)

**Files:**
- Create: `pipecat/api/middleware/security.py`
- Reference: `middleware/security.js` (41 lines)

Port Helmet-equivalent headers for FastAPI:

```python
from starlette.middleware.base import BaseHTTPMiddleware
import uuid

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Request-Id"] = request.headers.get("x-request-id", str(uuid.uuid4()))
        return response
```

**Commit message:** `feat(pipecat): add security headers middleware`

### Task 5.5: Twilio webhook verification (MISSING FROM ORIGINAL PLAN)

**Files:**
- Create: `pipecat/api/middleware/twilio.py`
- Reference: `middleware/twilio.js` (84 lines)

Verify `X-Twilio-Signature` on all `/voice/*` endpoints:

```python
from twilio.request_validator import RequestValidator

async def verify_twilio_webhook(request: Request):
    """Dependency that validates Twilio webhook signatures."""
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    validator = RequestValidator(auth_token)

    signature = request.headers.get("x-twilio-signature", "")
    url = str(request.url)
    form = await request.form()
    params = dict(form)

    if not validator.validate(url, params, signature):
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")
```

**Commit message:** `feat(pipecat): add Twilio webhook verification`

### Task 5.6: API key authentication (MISSING FROM ORIGINAL PLAN)

**Files:**
- Create: `pipecat/api/middleware/api_auth.py`
- Reference: `middleware/api-auth.js` (48 lines)

Port the `DONNA_API_KEY` authentication with constant-time comparison:

```python
import hmac

async def require_api_key(request: Request):
    """API key auth — skipped if DONNA_API_KEY not set."""
    expected = os.getenv("DONNA_API_KEY")
    if not expected:
        return  # Dev mode — no API key required

    provided = request.headers.get("x-api-key", "")
    if not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Invalid API key")
```

**Commit message:** `feat(pipecat): add API key authentication middleware`

### Task 5.7: Input validation — Zod schemas → Pydantic (MISSING FROM ORIGINAL PLAN)

**Files:**
- Create: `pipecat/api/validators/schemas.py`
- Reference: `validators/schemas.js` (335 lines) + `middleware/validate.js` (165 lines)

The existing system uses Zod for request validation on all API routes. Port to Pydantic models:

```python
from pydantic import BaseModel, Field
from typing import Optional, List

class CreateSeniorRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    phone: str = Field(pattern=r"^\+?[1-9]\d{1,14}$")
    timezone: str = "America/New_York"
    interests: Optional[List[str]] = None
    family_info: Optional[dict] = None
    # ... etc

class CreateReminderRequest(BaseModel):
    senior_id: str
    type: str = Field(pattern=r"^(medication|appointment|custom)$")
    title: str = Field(min_length=1, max_length=255)
    # ... etc
```

FastAPI automatically validates request bodies against Pydantic models when used as endpoint parameters.

**Commit message:** `feat(pipecat): add Pydantic request validation schemas`

### Task 5.8: PII-safe logging (MISSING FROM ORIGINAL PLAN)

**Files:**
- Create: `pipecat/lib/sanitize.py`
- Reference: `lib/logger.js` + `lib/sanitize.js`

Port the PII sanitization:
- Phone masking: `+1234567890` → `***7890`
- Name masking: `John Smith` → `J***`
- Content truncation for log safety

Configure `loguru` to pipe through sanitization before output.

**Commit message:** `feat(pipecat): add PII-safe logging with sanitization`

### Task 5.9: Centralized error handler (MISSING FROM ORIGINAL PLAN)

**Files:**
- Create: `pipecat/api/middleware/error_handler.py`
- Reference: `middleware/error-handler.js` (34 lines)

FastAPI exception handlers for consistent error responses:

```python
@app.exception_handler(Exception)
async def global_error_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "message": "Something went wrong"},
    )
```

**Commit message:** `feat(pipecat): add centralized error handler`

### Task 5.10: Port REST API routes

Same as original plan.

| Route | Reference | Priority | Commit message |
|-------|-----------|----------|----------------|
| `api/routes/seniors.py` | `routes/seniors.js` | High | `feat(pipecat): port seniors API routes` |
| `api/routes/reminders.py` | `routes/reminders.js` | High | `feat(pipecat): port reminders API routes` |
| `api/routes/calls.py` | `routes/calls.js` | High | `feat(pipecat): port calls API routes` |
| `api/routes/conversations.py` | `routes/conversations.js` | Medium | `feat(pipecat): port conversations API routes` |
| `api/routes/memories.py` | `routes/memories.js` | Medium | `feat(pipecat): port memories API routes` |
| `api/routes/caregivers.py` | `routes/caregivers.js` | Medium | `feat(pipecat): port caregivers API routes` |
| `api/routes/admin_auth.py` | `routes/admin-auth.js` | Medium | `feat(pipecat): port admin auth API routes` |
| `api/routes/stats.py` | `routes/stats.js` | Low | `feat(pipecat): port stats API routes` |
| `api/routes/call_analyses.py` | `routes/call-analyses.js` | Low | `feat(pipecat): port call analyses API routes` |
| `api/routes/daily_context.py` | `routes/daily-context.js` | Low | `feat(pipecat): port daily context API routes` |
| `api/routes/onboarding.py` | `routes/onboarding.js` | Low | `feat(pipecat): port onboarding API routes` |
| `api/routes/observability.py` | `routes/observability.js` | Low | `feat(pipecat): port observability API routes` |
| `api/routes/voice.py` | `routes/voice.js` | High | `feat(pipecat): port voice webhook routes` |

---

## Phase 6: Outbound Calls (Day 10-11)

### Task 6.1: Scheduler with Twilio outbound

Same as original plan.

**Additional detail:** The scheduler must also call `context_cache_service.run_daily_prefetch()` hourly (port from `startScheduler()` in `services/scheduler.js` which calls `contextCacheService.runDailyPrefetch()` on the same interval).

**Commit message:** `feat(pipecat): add outbound call support via Twilio`

---

## Phase 7: Parallel Deployment (Day 11-13) — NEW PHASE

### Task 7.1: Dockerfile

**Files:**
- Create: `pipecat/Dockerfile`

> **CORRECTION:** The original plan uses `dailyco/pipecat-base:latest` which is designed for Pipecat Cloud, NOT for self-hosted Railway deployment. It includes Pipecat Cloud-specific orchestration (auto-starting agents, session management) that isn't needed. Use `python:3.12-slim` instead.

```dockerfile
FROM python:3.12-slim

# Install system dependencies for audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install uv for dependency management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-install-project --no-dev

COPY . .

EXPOSE 7860

CMD ["uv", "run", "python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
```

> **CORRECTION:** The original CMD `uv run bot.py -t twilio` only starts the Pipecat voice runner. The new service needs to run the FastAPI server (which hosts both API routes AND the WebSocket endpoint for Pipecat). Use `main.py` via uvicorn as the entry point. The `--host 0.0.0.0` is required for Docker/Railway (default localhost won't accept external connections).

**Commit message:** `feat(pipecat): add Dockerfile for Railway deployment`

### Task 7.2: Railway parallel service setup

**Architecture:**

```
┌──────────────────────────────────────────────────────────────┐
│                     Railway Project                           │
│                                                               │
│  ┌──────────────────────┐    ┌──────────────────────┐       │
│  │ Node.js Service       │    │ Pipecat Service       │       │
│  │ (existing, production)│    │ (new, testing)        │       │
│  │ Port 3001             │    │ Port 7860             │       │
│  │ donna-api-prod.up...  │    │ donna-pipecat.up...   │       │
│  └──────────┬───────────┘    └──────────┬───────────┘       │
│             │                           │                     │
│             └─────────┬─────────────────┘                     │
│                       ▼                                       │
│              ┌─────────────────┐                             │
│              │  Neon PostgreSQL │                             │
│              │  (shared DB)     │                             │
│              └─────────────────┘                             │
└──────────────────────────────────────────────────────────────┘

Twilio:
  Production number (+1-XXX-XXX-XXXX) → Node.js voice webhook
  Test number (+1-YYY-YYY-YYYY) → Pipecat voice webhook
```

**Step 1: Create a new Railway service**

```bash
# In the Railway dashboard:
# 1. Go to the existing project
# 2. Click "New Service"
# 3. Select "Docker" or "GitHub repo" pointing to pipecat/ subdirectory
# 4. Set root directory to "pipecat/"
# 5. Set all environment variables (same as Node.js + PORT=7860)
```

**Step 2: Configure a test Twilio number**

1. Buy or allocate a second Twilio phone number
2. Configure its voice webhook to point to the Pipecat Railway URL: `https://donna-pipecat.up.railway.app/voice/answer`
3. Configure status callback to: `https://donna-pipecat.up.railway.app/voice/status`

**Step 3: Verify shared database safety**

Both services read/write the same database. Potential conflicts:

| Operation | Conflict Risk | Mitigation |
|-----------|--------------|------------|
| Reading seniors/memories | None | Read-only |
| Creating conversation records | Low | Different call_sids |
| Writing memories | Low | Different conversation_ids |
| Scheduler polling | **HIGH** | **Only ONE scheduler must run** |
| Daily context writes | Low | Keyed by call_sid |

**CRITICAL:** Disable the scheduler in the Pipecat service initially. Only the Node.js service should run the scheduler. When ready to switch, disable Node.js scheduler and enable Pipecat's.

```python
# In pipecat/main.py - only start scheduler if explicitly enabled
if os.getenv("SCHEDULER_ENABLED", "false").lower() == "true":
    start_scheduler()
```

**Step 4: Configure CORS for the Pipecat service**

The admin dashboard and consumer app may need to talk to the Pipecat API for testing. Add the Pipecat domain to CORS origins.

**Step 5: Deploy and verify**

```bash
# Deploy to Railway
cd pipecat && railway up

# Verify health
curl https://donna-pipecat.up.railway.app/health

# Test voice: call the TEST Twilio number from a real phone
```

**Commit message:** `feat(pipecat): add Railway deployment config for parallel running`

### Task 7.3: Frontend A/B testing (optional)

To test the Pipecat API with the admin dashboard without disrupting production:

1. Add an environment variable to admin-v2: `VITE_API_URL_PIPECAT=https://donna-pipecat.up.railway.app`
2. Add a toggle in the admin dashboard to switch between API backends
3. Or: create a separate Vercel deployment of admin-v2 pointing to the Pipecat API

---

## Phase 8: Senior Testing + Tuning (Day 13-16)

### Task 8.1: VAD tuning for elderly speech

Same as original plan.

**Verified VAD params (names confirmed correct in pipecat-ai 0.0.101):**
- `confidence` (float, default 0.7): Use **0.6** — lower than default catches quieter elderly speech
- `stop_secs` (float, default 0.8): Use **1.0-1.5s** — elderly speakers pause more between thoughts. The plan's 0.8 is the default and too aggressive; start at **1.2s**
- `start_secs` (float, default 0.2): Use **0.2** — default is fine, don't increase or speech onset detection suffers
- `min_volume` (float, default 0.6): Use **0.5** — lower than default catches quieter/breathier voices

```python
SileroVADAnalyzer(
    params=VADParams(
        confidence=0.6,    # Lower than default 0.7 for elderly
        start_secs=0.2,    # Default
        stop_secs=1.2,     # Higher than default 0.8 for elderly pauses
        min_volume=0.5,    # Lower than default 0.6 for quiet speakers
    )
)
```

### Task 8.2: TTS tuning

Same as original plan.

### Task 8.3: Tool calling verification

Same as original plan.

### Task 8.4: Context management verification

Same as original plan.

### Task 8.5: Side-by-side comparison (NEW)

Call the same senior through both pipelines (on different days or with their consent on the same day using the test number). Compare:
- Time-to-first-audio (latency)
- Audio quality (clarity, naturalness)
- Conversation coherence
- Reminder delivery timing
- Memory recall accuracy
- Call ending smoothness

Document results in a comparison matrix.

---

## Phase 9: Production Cutover (Day 16-18)

### Task 9.1: Switch Twilio routing

Once Pipecat is verified stable:

1. Update production Twilio number webhook to point to Pipecat service
2. Enable scheduler on Pipecat service (`SCHEDULER_ENABLED=true`)
3. Disable scheduler on Node.js service
4. Update admin-v2 `VITE_API_URL` to point to Pipecat service
5. Update consumer app API URL to point to Pipecat service
6. Monitor for 48 hours

### Task 9.2: Keep Node.js as rollback

**Do NOT remove Node.js code yet.** Keep it running (without scheduler) as a hot standby for at least 2 weeks. If issues arise:

1. Point Twilio webhook back to Node.js
2. Re-enable Node.js scheduler
3. Revert frontend API URLs

### Task 9.3: Final cleanup (after 2-week stability period)

Same file removals as original Phase 9, but only after the stability period.

**Files to remove (same as original):**
- `pipelines/v1-advanced.js`, `pipelines/quick-observer.js`, `pipelines/fast-observer.js`
- `websocket/media-stream.js`, `browser-session.js`
- `adapters/elevenlabs-streaming.js`, `adapters/elevenlabs.js`, `adapters/llm/index.js`
- `audio-utils.js`, `index.js`
- `services/*.js`, `routes/*.js`, `middleware/*.js`
- `db/client.js`, `db/schema.js`

**Files to keep:**
- `apps/admin-v2/`, `apps/consumer/`, `apps/observability/`
- `docs/`, `scripts/`
- `packages/` — evaluate if TypeScript packages are still needed

### Task 9.4: Move Pipecat to root + update docs

Same as original Phase 9.

---

## Scope Decisions

### Browser call support (NOT ported)

`browser-session.js` provides browser-based calls (PCM 16kHz in, PCM 24kHz out). This is NOT covered in the migration because:
1. It's a separate audio format (not Twilio media streams)
2. It's not used in production (only for demo/testing)
3. Pipecat can add browser support later via `DailyTransport` if needed

**Decision:** Document as out-of-scope. Add as a future enhancement.

### Conversation Director elimination

The original plan correctly identifies that the Conversation Director (`fast-observer.js`, 647 lines, Gemini Flash ~150ms) is replaced by Flows + tools. However, some Director capabilities need explicit mapping:

| Director Capability | Pipecat Equivalent |
|--------------------|--------------------|
| Call phase tracking | Flow nodes (opening → main → closing) |
| Topic management | Conversation tracker + task_messages |
| Reminder delivery timing | LLM decides via system prompt |
| Engagement monitoring | Quick Observer detects low engagement |
| Emotional detection | Quick Observer detects emotions |
| Token recommendations | Per-node max_tokens config |
| Dynamic memory search | LLM tool call (search_memories) |
| News context injection | LLM tool call (get_news) |

**Risks of Director elimination:**
1. The Director's proactive topic management (suggesting new topics when conversation stalls) is lost. The LLM must handle this purely through system prompt instructions. This may need iteration.
2. The Director ran 3 things in PARALLEL every turn: direction analysis + memory search + web search. This pre-fetched relevant context. In Pipecat, memory search and news are on-demand tool calls, meaning the LLM must decide to call them. The pre-fetched `memory_context` in the system prompt mitigates this for memories, but news/current events will only be available when the LLM explicitly calls `get_news`.
3. The Director's `formatDirectorGuidance()` created compact guidance strings (phase/engagement/tone format). This structured guidance helped Claude maintain conversation quality. In Pipecat, conversation quality depends on the system prompt instructions being comprehensive enough.

**Mitigation:** If conversation quality degrades without the Director, consider adding a lightweight "engagement monitor" processor that periodically checks `flow_manager.state` (turn count, last topic change, etc.) and injects guidance via `LLMMessagesAppendFrame` — similar to what Quick Observer does for health/safety signals.

---

## Risk Mitigation (Updated)

### Rollback Strategy

1. Node.js service stays running on Railway throughout migration
2. Twilio webhooks can be switched back in < 1 minute
3. Shared database means no data migration needed for rollback
4. Frontend apps can switch API URLs via environment variables

### Known Risks (Updated)

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Pipecat API doesn't match plan | **High** | High | Task 0.1 verification script — run before writing any code |
| Twilio audio quality bugs in Pipecat | Medium | High | Test early (Phase 4), report issues upstream |
| `LLMMessagesAppendFrame` doesn't exist | **High** | Medium | Use alternative context injection — verify in Task 0.1 |
| `set_function_call_context()` doesn't exist | **High** | Medium | Use closure pattern for tool handlers |
| Scheduler dual-running creates duplicate calls | **High** | High | Only ONE scheduler active at a time (env var flag) |
| Drizzle → raw SQL introduces query bugs | Medium | Medium | Test each query against real data before integration |
| Context cache miss → slow first call | Medium | Low | Port context-cache service faithfully |
| Long call (30 min) context overflow | Medium | Medium | RESET_WITH_SUMMARY handles this, test with real calls |
| VAD too aggressive for elderly | Medium | Medium | Tune in Phase 8, start conservative |
| Rate limiting not ported → abuse risk | Medium | High | Port all 5 rate limiters in Phase 5 |
| Missing security headers → compliance risk | Medium | Medium | Port Helmet-equivalent in Phase 5 |
| Webhook verification missing → security risk | Medium | High | Port Twilio signature validation in Phase 5 |

---

## Timeline Summary (Revised)

| Phase | Duration | What |
|-------|----------|------|
| Phase 0: Scaffolding + API Verify | Day 1 | **Verify Pipecat APIs**, project setup |
| Phase 1: Database + Services | Day 1-3 | asyncpg, port ALL services including context-cache |
| Phase 2: Quick Observer | Day 3-4 | Port regex patterns as FrameProcessor |
| Phase 3: Tools + Flows | Day 4-5 | Tool definitions, call phase nodes |
| Phase 4: Voice Pipeline | Day 5-7 | bot.py, voice webhook, end-to-end voice |
| Phase 5: API Layer + Security | Day 7-10 | FastAPI routes, auth, rate limiting, security headers |
| Phase 6: Outbound Calls | Day 10-11 | Scheduler + Twilio outbound |
| Phase 7: Parallel Deployment | Day 11-13 | Railway service, test Twilio number, A/B setup |
| Phase 8: Senior Testing | Day 13-16 | Real calls, VAD tuning, side-by-side comparison |
| Phase 9: Production Cutover | Day 16-18 | Switch routing, 2-week stability period |

**Total: 18 working days (~3.5 weeks)** + 2-week stability period before cleanup

> **vs. Original estimate:** 12 days → 18 days. The 6 additional days account for: API verification (1 day), missing services (context-cache, 0.5 day), missing security middleware (1 day), parallel deployment setup (2 days), side-by-side testing (1.5 days).

---

## Database Schema Reference (9 tables)

For reference when porting queries — all tables the Python code must interact with:

| Table | Key Columns | Used By |
|-------|-------------|---------|
| `seniors` | id, name, phone, timezone, interests, family_info, medical_notes, is_active | seniors service, memory, scheduler |
| `conversations` | id, senior_id, call_sid, started_at, ended_at, duration_seconds, summary, transcript | conversations service, call analysis |
| `memories` | id, senior_id, type, content, importance, embedding (vector 1536), metadata | memory service |
| `reminders` | id, senior_id, type, title, scheduled_time, is_recurring, cron_expression, is_active | scheduler |
| `reminder_deliveries` | id, reminder_id, scheduled_for, delivered_at, acknowledged_at, status, attempt_count, call_sid | scheduler |
| `caregivers` | id, clerk_user_id, senior_id, role | caregivers service |
| `call_analyses` | id, conversation_id, senior_id, summary, topics, engagement_score, concerns | call analysis |
| `daily_call_context` | id, senior_id, call_date, call_sid, topics_discussed, reminders_delivered | daily context |
| `admin_users` | id, email, password_hash, name | admin auth |

---

## Future: Adding New Features

Same as original plan — once migrated, adding structured conversation features is simple via new NodeConfig definitions.

---

*This reviewed plan addresses 12 critical gaps, 6 API accuracy issues, and adds the required parallel deployment architecture. Total effort revised from 12 to 18 working days plus a 2-week stability period.*
