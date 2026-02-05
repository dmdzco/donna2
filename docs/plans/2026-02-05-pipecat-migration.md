# Pipecat Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate Donna's voice pipeline from custom Node.js to Python Pipecat + Pipecat Flows, keeping the same database and frontend apps.

**Architecture:** Single Python server running FastAPI (API routes) + Pipecat (voice pipeline). Twilio WebSocket connects to Pipecat's `FastAPIWebsocketTransport` with `TwilioFrameSerializer`. Call phases managed by Pipecat Flows. Quick Observer as custom `FrameProcessor`. Memory/reminders as LLM tool calls. Same PostgreSQL + pgvector database, same React frontend apps.

**Tech Stack:** Python 3.12, Pipecat (`pipecat-ai[anthropic,deepgram,elevenlabs,silero,websocket,runner]`), Pipecat Flows (`pipecat-ai-flows`), FastAPI, asyncpg, OpenAI SDK (embeddings), Anthropic SDK (Claude), Google GenAI (Gemini for post-call), Twilio SDK, bcrypt, PyJWT.

**Current codebase reference:** `docs/DONNA_ON_PIPECAT.md` has the full architecture and file mapping.

---

## Prerequisites

Before starting, ensure you have:
- Python 3.12+ installed (`python3 --version`)
- `uv` package manager installed (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Access to the existing Neon PostgreSQL database (same `DATABASE_URL`)
- All API keys: `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`

---

## Phase 0: Project Scaffolding (Day 1)

### Task 0.1: Initialize Python project alongside Node.js

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

```toml
[project]
name = "donna-pipecat"
version = "0.1.0"
requires-python = ">=3.12"
description = "Donna AI companion - Pipecat voice pipeline"
dependencies = [
    "pipecat-ai[anthropic,deepgram,elevenlabs,silero,websocket,runner]>=0.0.83",
    "pipecat-ai-flows>=0.0.8",
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
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.24.0",
    "pytest-cov>=5.0.0",
]
```

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

# Server
PORT=7860
BASE_URL=https://your-domain.com
```

**Step 5: Initialize and verify**

```bash
cd pipecat && uv sync && cd ..
```

Expected: Dependencies install successfully.

**Step 6: Commit**

```bash
git add pipecat/
git commit -m "chore: scaffold Pipecat Python project alongside Node.js"
```

---

## Phase 1: Database Layer (Day 1-2)

Port the database connection and queries to Python. Uses the same Neon PostgreSQL database — no schema changes needed.

### Task 1.1: Database connection + raw query helpers

**Files:**
- Create: `pipecat/db/__init__.py`
- Create: `pipecat/db/client.py`
- Test: `pipecat/tests/test_db.py`

**Step 1: Write the test**

```python
# pipecat/tests/test_db.py
import pytest
import asyncio
from db.client import get_pool, query_one, query_many, execute

@pytest.fixture
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()

@pytest.mark.asyncio
async def test_query_one_returns_row():
    """Verify we can connect and run a simple query."""
    result = await query_one("SELECT 1 as num")
    assert result["num"] == 1

@pytest.mark.asyncio
async def test_query_many_returns_list():
    result = await query_many("SELECT generate_series(1,3) as num")
    assert len(result) == 3
```

**Step 2: Run test to verify it fails**

```bash
cd pipecat && uv run pytest tests/test_db.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'db'`

**Step 3: Write implementation**

```python
# pipecat/db/__init__.py
# empty

# pipecat/db/client.py
import os
import asyncpg
from loguru import logger

_pool = None

async def get_pool():
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            os.environ["DATABASE_URL"],
            min_size=2,
            max_size=10,
        )
        logger.info("Database pool created")
    return _pool

async def query_one(sql: str, *args):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(sql, *args)
        return dict(row) if row else None

async def query_many(sql: str, *args):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *args)
        return [dict(r) for r in rows]

async def execute(sql: str, *args):
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.execute(sql, *args)

async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
```

**Step 4: Run test to verify it passes**

```bash
cd pipecat && DATABASE_URL=$DATABASE_URL uv run pytest tests/test_db.py -v
```

Expected: PASS (requires real database connection).

**Step 5: Commit**

```bash
git add pipecat/db/ pipecat/tests/test_db.py
git commit -m "feat(pipecat): add database connection layer with asyncpg"
```

### Task 1.2: Port seniors service

**Files:**
- Create: `pipecat/services/__init__.py`
- Create: `pipecat/services/seniors.py`
- Test: `pipecat/tests/test_seniors.py`
- Reference: `services/seniors.js` (66 lines)

**Step 1: Write the test**

```python
# pipecat/tests/test_seniors.py
import pytest
from services.seniors import senior_service

@pytest.mark.asyncio
async def test_list_returns_active_seniors():
    result = await senior_service.list()
    assert isinstance(result, list)
    # All returned seniors should be active
    for senior in result:
        assert senior.get("is_active") is not False

@pytest.mark.asyncio
async def test_find_by_phone_normalizes():
    """Phone lookup should work with various formats."""
    # This test depends on having a senior in the DB
    # If no seniors exist, it should return None gracefully
    result = await senior_service.find_by_phone("+10000000000")
    assert result is None or "id" in result
```

**Step 2: Run to verify fails, then implement**

```python
# pipecat/services/seniors.py
"""Senior profile CRUD. Port of services/seniors.js (66 lines)."""
import re
from db.client import query_one, query_many, execute

def normalize_phone(phone: str) -> str:
    digits = re.sub(r'\D', '', phone)
    return digits[-10:]

class SeniorService:
    async def find_by_phone(self, phone: str):
        normalized = normalize_phone(phone)
        return await query_one(
            "SELECT * FROM seniors WHERE phone LIKE $1 AND is_active = true",
            f"%{normalized}"
        )

    async def get_by_id(self, senior_id: str):
        return await query_one("SELECT * FROM seniors WHERE id = $1", senior_id)

    async def create(self, data: dict):
        return await query_one(
            """INSERT INTO seniors (name, phone, timezone, interests, family_info,
               medical_notes, preferred_call_times, city, state, zip_code, additional_info)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *""",
            data.get("name"), data.get("phone"), data.get("timezone", "America/New_York"),
            data.get("interests"), data.get("family_info"), data.get("medical_notes"),
            data.get("preferred_call_times"), data.get("city"), data.get("state"),
            data.get("zip_code"), data.get("additional_info"),
        )

    async def update(self, senior_id: str, data: dict):
        set_parts = []
        values = []
        for i, (key, val) in enumerate(data.items(), 1):
            set_parts.append(f"{key} = ${i}")
            values.append(val)
        values.append(senior_id)
        return await query_one(
            f"UPDATE seniors SET {', '.join(set_parts)}, updated_at = now() "
            f"WHERE id = ${len(values)} RETURNING *",
            *values
        )

    async def list(self):
        return await query_many(
            "SELECT * FROM seniors WHERE is_active = true ORDER BY created_at DESC"
        )

    async def delete(self, senior_id: str):
        return await execute(
            "UPDATE seniors SET is_active = false WHERE id = $1", senior_id
        )

senior_service = SeniorService()
```

**Step 3: Run tests, commit**

```bash
git add pipecat/services/
git commit -m "feat(pipecat): port seniors service to Python"
```

### Task 1.3: Port memory service (semantic search + embeddings)

**Files:**
- Create: `pipecat/services/memory.py`
- Test: `pipecat/tests/test_memory.py`
- Reference: `services/memory.js` (329 lines)

This is the most complex service port. Key functions: `generate_embedding()`, `store()`, `search()`, `build_context()`, `extract_from_conversation()`.

Port the exact same logic: OpenAI `text-embedding-3-small` for embeddings, pgvector cosine similarity for search, decay model for importance, tiered context building. Use `asyncpg` with `pgvector.asyncpg` for vector operations.

Add `pgvector` to `pyproject.toml` dependencies.

**Commit message:** `feat(pipecat): port memory service with pgvector semantic search`

### Task 1.4: Port remaining services

Port each service, one at a time, with tests:

| Service | Reference | Est. Lines | Commit message |
|---------|-----------|-----------|----------------|
| `services/conversations.py` | `services/conversations.js` (172 lines) | ~120 | `feat(pipecat): port conversations service` |
| `services/daily_context.py` | `services/daily-context.js` (197 lines) | ~140 | `feat(pipecat): port daily context service` |
| `services/greetings.py` | `services/greetings.js` (258 lines) | ~200 | `feat(pipecat): port greeting rotation service` |
| `services/news.py` | `services/news.js` (104 lines) | ~80 | `feat(pipecat): port news service` |
| `services/call_analysis.py` | `services/call-analysis.js` (257 lines) | ~180 | `feat(pipecat): port call analysis service` |
| `services/scheduler.py` | `services/scheduler.js` (515 lines) | ~350 | `feat(pipecat): port scheduler service` |

For each: write test first → verify fail → implement → verify pass → commit.

The scheduler is the most complex — it handles reminder polling, Twilio outbound calls, delivery tracking, and retry logic. Port the exact same logic.

---

## Phase 2: Quick Observer Processor (Day 3)

### Task 2.1: Port regex patterns as Pipecat FrameProcessor

**Files:**
- Create: `pipecat/processors/__init__.py`
- Create: `pipecat/processors/quick_observer.py`
- Test: `pipecat/tests/test_quick_observer.py`
- Reference: `pipelines/quick-observer.js` (1,196 lines)

**Step 1: Write the test**

```python
# pipecat/tests/test_quick_observer.py
import pytest
from processors.quick_observer import quick_analyze

def test_detects_fall():
    result = quick_analyze("I fell in the bathroom yesterday")
    assert any(s["signal"] == "fall" for s in result["health_signals"])
    assert any(s["severity"] == "high" for s in result["health_signals"])
    assert result["guidance"] is not None
    assert "HEALTH" in result["guidance"]

def test_detects_loneliness():
    result = quick_analyze("I've been feeling so lonely lately")
    assert any(s["signal"] == "loneliness" for s in result["emotion_signals"])

def test_detects_scam():
    result = quick_analyze("Someone called saying I won a prize, seemed like a scam")
    assert any(s["signal"] == "scam" for s in result["safety_signals"])

def test_detects_goodbye():
    result = quick_analyze("Well, it was nice talking to you, goodbye!")
    assert result["goodbye_strength"] == "strong"

def test_detects_web_search():
    result = quick_analyze("What's happening in the news today?")
    assert result["needs_web_search"] is True

def test_no_signals_for_simple_message():
    result = quick_analyze("I had soup for lunch")
    assert len(result["health_signals"]) == 0
    assert len(result["safety_signals"]) == 0
    assert result["guidance"] is None

def test_model_recommendation_for_high_severity():
    result = quick_analyze("I fell down the stairs and my head hurts")
    assert result["model_recommendation"] is not None
    assert result["model_recommendation"]["max_tokens"] >= 200
```

**Step 2: Implement**

Port ALL regex patterns from `pipelines/quick-observer.js` lines 1-1196. This is mechanical — same patterns, Python `re` syntax. The `quick_analyze()` function is standalone (no imports). The `FrameProcessor` wrapper is separate.

```python
# pipecat/processors/quick_observer.py
"""
Quick Observer — Port of pipelines/quick-observer.js (1,196 lines).
Pure regex-based pattern matching (0ms latency).

Two interfaces:
1. quick_analyze(text) -> dict  — standalone analysis function
2. QuickObserverProcessor     — Pipecat FrameProcessor that injects guidance
"""
import re
from pipecat.frames.frames import Frame, TranscriptionFrame, LLMMessagesAppendFrame
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

# Port ALL patterns from quick-observer.js exactly.
# Group: HEALTH_PATTERNS, SAFETY_PATTERNS, EMOTION_PATTERNS, FAMILY_PATTERNS,
# SOCIAL_PATTERNS, ACTIVITY_PATTERNS, ADL_PATTERNS, COGNITIVE_PATTERNS,
# GOODBYE_PATTERNS, WEB_SEARCH_PATTERNS, HELP_PATTERNS, etc.

# ... [full regex port — mechanical, ~600 lines] ...

def quick_analyze(text: str) -> dict:
    """Run all pattern categories. Returns analysis dict."""
    # ... [same logic as quick-observer.js quickAnalyze()] ...

def build_guidance(analysis: dict) -> str | None:
    """Format analysis into guidance text for system prompt injection."""
    # ... [same logic as quick-observer.js buildGuidance()] ...


class QuickObserverProcessor(FrameProcessor):
    """Pipecat FrameProcessor wrapper. Intercepts transcriptions, injects guidance."""

    def __init__(self, session_state: dict, **kwargs):
        super().__init__(**kwargs)
        self.state = session_state

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame):
            analysis = quick_analyze(frame.text)
            self.state["last_analysis"] = analysis
            self.state["turn_count"] = self.state.get("turn_count", 0) + 1

            if analysis["guidance"]:
                await self.push_frame(LLMMessagesAppendFrame(
                    messages=[{"role": "system", "content": analysis["guidance"]}],
                    run_llm=False,
                ))

        await self.push_frame(frame, direction)
```

**Step 3: Run tests, commit**

```bash
git commit -m "feat(pipecat): port Quick Observer regex patterns as FrameProcessor"
```

### Task 2.2: Guidance stripper processor

**Files:**
- Create: `pipecat/processors/guidance_stripper.py`
- Test: `pipecat/tests/test_guidance_stripper.py`

Small processor (~30 lines) that strips `<guidance>` tags and `[BRACKETS]` from LLM output before it reaches TTS. Reference: `stripGuidanceTags()` in `pipelines/v1-advanced.js`.

**Commit message:** `feat(pipecat): add guidance stripper processor`

---

## Phase 3: Tools + Flows (Day 3-4)

### Task 3.1: Define LLM tools (memory search, news, reminders)

**Files:**
- Create: `pipecat/flows/__init__.py`
- Create: `pipecat/flows/tools.py`
- Test: `pipecat/tests/test_tools.py`
- Reference: `docs/DONNA_ON_PIPECAT.md` tools section

Define tool handlers that call the ported Python services. Tools: `search_memories`, `get_news`, `mark_reminder_acknowledged`, `save_important_detail`.

Each tool handler is an `async def` that receives `FunctionCallParams` and calls `params.result_callback()`.

Register tools on the `AnthropicLLMService` via `llm.register_function()`.

**Commit message:** `feat(pipecat): add LLM tool definitions for memory, news, reminders`

### Task 3.2: Define Flows nodes (call phases)

**Files:**
- Create: `pipecat/flows/nodes.py`
- Create: `pipecat/flows/actions.py`
- Test: `pipecat/tests/test_nodes.py`
- Reference: `docs/DONNA_ON_PIPECAT.md` flows section

Define `NodeConfig` for each call phase:

| Node | System prompt focus | Tools | Context strategy | Transitions to |
|------|-------------------|-------|-----------------|---------------|
| `opening` | Greet warmly, ask how they are | base tools | APPEND | `main` |
| `main` | Free-form conversation, deliver reminders | all tools | RESET_WITH_SUMMARY | `closing` |
| `closing` | Warm goodbye, mention undelivered reminders | reminder tools | APPEND | end_conversation |

Key details:
- `opening` uses `pre_actions: [{"type": "tts_say", "text": greeting}]` to speak the greeting
- `main` uses `RESET_WITH_SUMMARY` with a summary prompt that preserves topics, health mentions, and reminder state
- `closing` uses `post_actions: [{"type": "end_conversation"}]`
- Transition functions are edge functions that return `(result, next_node)` tuples
- `flow_manager.state` carries all session state across transitions

**Commit message:** `feat(pipecat): add Pipecat Flows call phase nodes`

---

## Phase 4: Voice Pipeline (Day 4-5)

### Task 4.1: Create bot.py — the core pipeline

**Files:**
- Create: `pipecat/bot.py`
- Reference: `docs/DONNA_ON_PIPECAT.md` bot.py section

This is the main entry point. Each Twilio call spawns a new `bot()` invocation. It:

1. Parses Twilio WebSocket metadata via `parse_telephony_websocket()`
2. Loads senior context (pre-fetch all DB queries)
3. Creates transport (`FastAPIWebsocketTransport` + `TwilioFrameSerializer`)
4. Creates services (Deepgram STT, Anthropic LLM, ElevenLabs TTS)
5. Registers tools on the LLM
6. Creates the pipeline: `transport.input() → stt → quick_observer → user_aggregator → llm → guidance_stripper → tts → transport.output() → assistant_aggregator`
7. Creates `FlowManager` with initial state
8. Handles `on_client_connected` (initialize flow) and `on_client_disconnected` (post-call processing)
9. Runs the pipeline

**Key configuration:**
- VAD: `SileroVADAnalyzer(params=VADParams(confidence=0.6, stop_secs=0.8))` — tuned for elderly speech
- STT: Deepgram nova-3, 8kHz, smart_format=True
- LLM: Claude Sonnet, with registered tools
- TTS: ElevenLabs turbo v2.5, voice Rachel, speed=0.87, stability=0.4

**Step 1: Create `bot.py` with full pipeline**

Follow the code in `docs/DONNA_ON_PIPECAT.md` `bot.py` section. Key sections:
- `async def bot(runner_args)` — entry point
- `build_base_system_prompt()` — system prompt construction
- `run_post_call()` — async post-call processing

**Step 2: Test locally with ngrok**

```bash
cd pipecat
cp .env.example .env  # Fill in real values
ngrok http 7860
# Update Twilio TwiML to point to ngrok URL
uv run bot.py -t twilio -x your-ngrok-url.ngrok.io
```

Make a test call. Verify:
- Audio flows both directions
- Deepgram transcribes speech
- Claude responds
- ElevenLabs speaks the response
- Quick Observer detects patterns
- Tools work (say "remember when..." → triggers search_memories)
- Flows transitions work (greeting → main → goodbye → close)

**Step 3: Commit**

```bash
git commit -m "feat(pipecat): add core voice pipeline with Flows + tools"
```

### Task 4.2: Post-call processing

**Files:**
- Modify: `pipecat/bot.py` (`run_post_call` function)

Verify post-call processing works:
- Daily context saved to `daily_call_context` table
- Memories extracted from conversation
- Post-call analysis runs via Gemini Flash and saves to `call_analyses` table
- Conversation record updated with summary

**Commit message:** `feat(pipecat): add post-call analysis and memory extraction`

---

## Phase 5: API Layer (Day 5-7)

### Task 5.1: FastAPI server with health check

**Files:**
- Create: `pipecat/main.py`
- Create: `pipecat/api/__init__.py`
- Create: `pipecat/api/routes/__init__.py`
- Create: `pipecat/api/routes/health.py`

The API server runs alongside the Pipecat bot in the same FastAPI process. Pipecat's runner creates a FastAPI app — we mount our API routes on it.

```python
# pipecat/main.py
"""
Donna API + Voice server.

Combines FastAPI REST API (for admin, consumer, caregivers)
with Pipecat voice pipeline (for Twilio calls).
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import mount_routes

app = FastAPI(title="Donna API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://donna-admin.vercel.app",
        "https://admin-v2-liart.vercel.app",
        "https://consumer-ruddy.vercel.app",
        "http://localhost:5173",
        "http://localhost:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

mount_routes(app)
```

**Commit message:** `feat(pipecat): add FastAPI server with health check`

### Task 5.2: Auth middleware

**Files:**
- Create: `pipecat/api/middleware/__init__.py`
- Create: `pipecat/api/middleware/auth.py`
- Reference: `middleware/auth.js` (196 lines)

Port the 3-tier auth: cofounder API key → JWT Bearer → Clerk session.

Use FastAPI `Depends()` pattern:
```python
async def require_auth(request: Request) -> AuthContext:
    # Check cofounder API key, JWT, or Clerk
    ...
```

**Commit message:** `feat(pipecat): port auth middleware (cofounder + JWT + Clerk)`

### Task 5.3: Port REST API routes

Port each route file one at a time. Each Express router becomes a FastAPI `APIRouter`.

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

For each: read the Node.js route → write equivalent FastAPI router → test with curl → commit.

Pattern:
```python
# Express:  router.get('/api/seniors', requireAuth, async (req, res) => { ... })
# FastAPI:  @router.get('/api/seniors')
#           async def list_seniors(auth: AuthContext = Depends(require_auth)): ...
```

---

## Phase 6: Outbound Calls (Day 7-8)

### Task 6.1: Scheduler with Twilio outbound

**Files:**
- Modify: `pipecat/services/scheduler.py`
- Create: `pipecat/outbound.py`

The scheduler needs to:
1. Poll for due reminders (same logic as current)
2. Pre-fetch senior context (memory, greeting, reminder prompt)
3. Initiate outbound Twilio call with TwiML pointing to the Pipecat WebSocket
4. Pass custom parameters (senior_id, reminder context) via TwiML `<Parameter>`

The outbound TwiML:
```xml
<Response>
  <Connect>
    <Stream url="wss://your-server.com/ws">
      <Parameter name="senior_id" value="{senior_id}" />
      <Parameter name="call_type" value="reminder" />
      <Parameter name="reminder_id" value="{reminder_id}" />
    </Stream>
  </Connect>
</Response>
```

**Commit message:** `feat(pipecat): add outbound call support via Twilio`

---

## Phase 7: Deployment (Day 8-9)

### Task 7.1: Dockerfile

**Files:**
- Create: `pipecat/Dockerfile`

```dockerfile
FROM dailyco/pipecat-base:latest

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

WORKDIR /app

RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-dev

COPY . .

EXPOSE 7860

CMD ["uv", "run", "bot.py", "-t", "twilio"]
```

**Commit message:** `feat(pipecat): add Dockerfile for Railway deployment`

### Task 7.2: Railway configuration

**Files:**
- Create: `pipecat/railway.toml` (or modify root Railway config)

Configure Railway to build from `pipecat/` directory with Python buildpack.

Update Twilio webhooks to point to the new Pipecat server URL.

**Commit message:** `feat(pipecat): add Railway deployment config`

### Task 7.3: Deploy and test

1. Push to Railway
2. Verify health endpoint responds
3. Verify API routes work (test from admin dashboard)
4. Make test call — verify full voice pipeline works
5. Test outbound reminder call
6. Verify post-call analysis saves to database
7. Verify admin dashboard loads data correctly

---

## Phase 8: Senior Testing + Tuning (Day 9-11)

### Task 8.1: VAD tuning for elderly speech

Test with 3+ real seniors. Adjust:
- `VADParams.confidence` — lower if cutting off quiet speech
- `VADParams.stop_secs` — increase if cutting off mid-pause
- `VADParams.min_volume` — lower for quiet/breathy voices

### Task 8.2: TTS tuning

Adjust ElevenLabs parameters:
- `speed` — currently 0.87, may need adjustment
- `stability` — currently 0.4, increase for more consistent tone
- Compare voice quality with current Node.js pipeline

### Task 8.3: Tool calling verification

Verify each tool works in real calls:
- Say "remember when I told you about my garden?" → `search_memories` fires
- Say "what's in the news today?" → `get_news` fires
- After reminder delivery, say "okay I'll do that" → `mark_reminder_acknowledged` fires
- Share something personal → `save_important_detail` fires

### Task 8.4: Context management verification

- Make a 15+ minute call. Verify `RESET_WITH_SUMMARY` triggers and context stays coherent
- Make two calls to the same senior same day. Verify daily context carries over
- Verify post-call analysis accurately captures conversation

---

## Phase 9: Cleanup (Day 11-12)

### Task 9.1: Remove Node.js voice pipeline code

Once Pipecat is running in production and verified:

**Files to remove:**
- `pipelines/v1-advanced.js` (1,592 lines)
- `pipelines/quick-observer.js` (1,196 lines)
- `pipelines/fast-observer.js` (647 lines)
- `websocket/media-stream.js` (202 lines)
- `adapters/elevenlabs-streaming.js` (270 lines)
- `adapters/elevenlabs.js`
- `adapters/llm/index.js` (157 lines)
- `audio-utils.js` (135 lines)
- `index.js` (93 lines) — Express server no longer needed
- `services/*.js` — all JavaScript services (replaced by Python)
- `routes/*.js` — all Express routes (replaced by FastAPI)
- `middleware/*.js` — all Express middleware (replaced by FastAPI)
- `db/client.js`, `db/schema.js` — replaced by Python DB layer

**Files to keep:**
- `apps/admin/` — React admin dashboard (unchanged, points to new API URL)
- `apps/consumer/` — React consumer app (unchanged)
- `apps/observability/` — React observability dashboard
- `packages/` — TypeScript packages (evaluate if still needed)
- `docs/` — All documentation
- `scripts/` — May need Python equivalents

**Commit message:** `chore: remove Node.js voice pipeline (replaced by Pipecat)`

### Task 9.2: Update documentation

**Files to update:**
- `CLAUDE.md` — Update architecture, key files, deployment commands
- `README.md` — Update setup instructions, tech stack
- `docs/architecture/OVERVIEW.md` — Update architecture diagrams
- `docs/PRODUCT_PLAN.md` — Mark Pipecat migration as complete

**Commit message:** `docs: update all docs for Pipecat migration`

### Task 9.3: Move Pipecat to root

Once Node.js is fully removed, move `pipecat/` contents to root:

```bash
# Move all Pipecat files to root
mv pipecat/* .
mv pipecat/.* . 2>/dev/null
rmdir pipecat
```

**Commit message:** `chore: move Pipecat project to repository root`

---

## Risk Mitigation

### Rollback Strategy

The Node.js and Python servers can run side by side during migration. If Pipecat has issues:
1. Point Twilio webhooks back to the Node.js server
2. Node.js server is untouched until Phase 9

### Parallel Running

During Phases 4-8, run both servers:
- Node.js on port 3001 (current production)
- Pipecat on port 7860 (testing)
- Use a test Twilio number for Pipecat calls
- Compare call quality side by side

### Known Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Twilio audio quality bugs in Pipecat | Medium | High | Test early (Phase 4), report issues upstream, have Daily telephony as fallback |
| Anthropic dynamic system prompt limitation | Low | Medium | Use `LLMMessagesAppendFrame` for per-turn context; role_messages static per node |
| Python async bugs | Low | Medium | Use `loguru` for detailed logging; test with real calls |
| Service port introduces bugs | Medium | Medium | Test each service independently before integration |
| VAD too aggressive/passive for elderly | Medium | Medium | Tune in Phase 8 with real seniors |

---

## Timeline Summary

| Phase | Duration | What |
|-------|----------|------|
| Phase 0: Scaffolding | Day 1 | Project setup, dependencies |
| Phase 1: Database | Day 1-2 | asyncpg connection, port all services |
| Phase 2: Quick Observer | Day 3 | Port 1,196 lines of regex patterns |
| Phase 3: Tools + Flows | Day 3-4 | Tool definitions, call phase nodes |
| Phase 4: Voice Pipeline | Day 4-5 | bot.py, end-to-end voice working |
| Phase 5: API Layer | Day 5-7 | FastAPI routes, auth middleware |
| Phase 6: Outbound Calls | Day 7-8 | Scheduler + Twilio outbound |
| Phase 7: Deployment | Day 8-9 | Docker, Railway, production deploy |
| Phase 8: Senior Testing | Day 9-11 | Real calls, VAD tuning, tool verification |
| Phase 9: Cleanup | Day 11-12 | Remove Node.js, update docs |

**Total: 12 working days (~2.5 weeks)**

---

## Future: Adding New Features

Once migrated, adding structured conversation features is simple:

```python
# New feature = new NodeConfig in flows/nodes.py
def create_storytelling_node(topic: str) -> NodeConfig:
    return NodeConfig(
        name=f"story_{topic}",
        task_messages=[{
            "role": "system",
            "content": f"You're collecting a story about {topic}. Ask open-ended questions...",
        }],
        functions=[save_story_tool, continue_tool, change_topic_tool, read_back_tool],
        context_strategy=ContextStrategyConfig(
            strategy=ContextStrategy.RESET_WITH_SUMMARY,
            summary_prompt="Summarize the story shared so far...",
        ),
    )
```

Each new feature is ~50-100 lines of node definitions + tool handlers. No framework changes needed.
