# Donna Observability & Logging Suite - Implementation Plan

## Executive Summary

Build a real-time observability dashboard that visualizes phone call flows, conversations, and Observer Agent v1 analysis. This is **NOT blocked** by blob storage - Vercel Blob is already configured and working.

## Current State

| Component | Status | Location |
|-----------|--------|----------|
| Blob Storage (Vercel Blob) | ✅ Working | `adapters/vercel-blob/` |
| Transcription Storage | ✅ Working | `conversation_turns` table (PostgreSQL) |
| Observer Signals | ✅ Stored | `conversation_turns.observer_signals` (JSONB) |
| Logging | ❌ Minimal | Scattered `console.log` only |
| Observability Dashboard | ❌ None | Needs to be built |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  OBSERVABILITY DASHBOARD                     │
│                     (New React App)                          │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Call Flow   │  │ Conversation │  │   Observer   │      │
│  │   Timeline   │  │    Viewer    │  │   Insights   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API LAYER (Express)                       │
├─────────────────────────────────────────────────────────────┤
│  GET /api/observability/calls                               │
│  GET /api/observability/calls/:id/timeline                  │
│  GET /api/observability/calls/:id/turns                     │
│  GET /api/observability/calls/:id/observer-signals          │
│  WS  /api/observability/live/:callId (real-time)            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 EVENT COLLECTION LAYER                       │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Structured Logger (Pino)                 │  │
│  │  - Correlation IDs (callId, seniorId, conversationId)│  │
│  │  - Log levels (debug, info, warn, error)             │  │
│  │  - JSON output for aggregation                        │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Event Emitter (EventBus)                 │  │
│  │  - call.initiated, call.connected, call.ended        │  │
│  │  - turn.transcribed, turn.response_generated         │  │
│  │  - observer.signal_emitted                            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    STORAGE LAYER                             │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL (Neon)         │  Redis (Upstash)               │
│  - conversations           │  - Real-time events            │
│  - conversation_turns      │  - Live call state             │
│  - observability_events    │  - WebSocket pub/sub           │
│  - observer_signals (JSONB)│                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Event Infrastructure (Foundation)

### 1.1 Structured Logging Package

Create `packages/logger/` with Pino-based structured logging.

```typescript
// packages/logger/src/index.ts
import pino from 'pino';

interface LogContext {
  callId?: string;
  conversationId?: string;
  seniorId?: string;
  service?: string;
  traceId?: string;
}

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function createLogger(service: string) {
  return logger.child({ service });
}

export function withContext(ctx: LogContext) {
  return logger.child(ctx);
}
```

**Files to create:**
- `packages/logger/package.json`
- `packages/logger/src/index.ts`
- `packages/logger/tsconfig.json`

### 1.2 Event Bus Package

Create `packages/event-bus/` for internal event emission.

```typescript
// packages/event-bus/src/index.ts
import { EventEmitter } from 'events';

type ObservabilityEvent =
  | { type: 'call.initiated'; data: { callId: string; seniorId: string; timestamp: Date } }
  | { type: 'call.connected'; data: { callId: string; timestamp: Date } }
  | { type: 'call.ended'; data: { callId: string; duration: number; reason: string } }
  | { type: 'turn.transcribed'; data: { callId: string; speaker: string; text: string; timestamp: Date } }
  | { type: 'turn.response'; data: { callId: string; text: string; timestamp: Date } }
  | { type: 'observer.signal'; data: { callId: string; signal: ObserverSignal; timestamp: Date } };

class ObservabilityEventBus extends EventEmitter {
  emit<T extends ObservabilityEvent>(event: T['type'], data: T['data']): boolean {
    return super.emit(event, data);
  }

  on<T extends ObservabilityEvent>(event: T['type'], listener: (data: T['data']) => void): this {
    return super.on(event, listener);
  }
}

export const eventBus = new ObservabilityEventBus();
```

**Files to create:**
- `packages/event-bus/package.json`
- `packages/event-bus/src/index.ts`
- `packages/event-bus/src/types.ts`

### 1.3 Database Schema Extension

Add `observability_events` table for persistent event log.

```sql
-- New table for observability events
CREATE TABLE observability_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  call_id VARCHAR(100),
  conversation_id UUID,
  senior_id UUID,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_obs_events_call ON observability_events(call_id);
CREATE INDEX idx_obs_events_type ON observability_events(event_type);
CREATE INDEX idx_obs_events_time ON observability_events(timestamp DESC);
```

**Files to modify:**
- `database/src/schema.ts` - Add observability_events table
- `database/drizzle/` - New migration

---

## Phase 2: Instrument Existing Modules

### 2.1 Call Orchestrator Instrumentation

Emit events at each stage of call lifecycle.

```typescript
// modules/call-orchestrator/src/service.ts - Add to existing methods

import { eventBus } from '@donna/event-bus';
import { createLogger } from '@donna/logger';

const log = createLogger('call-orchestrator');

// In initiateCall():
eventBus.emit('call.initiated', { callId, seniorId, timestamp: new Date() });
log.info({ callId, seniorId }, 'Call initiated');

// In handleCallConnected():
eventBus.emit('call.connected', { callId, timestamp: new Date() });
log.info({ callId }, 'Call connected - senior answered');

// In handleCallEnded():
eventBus.emit('call.ended', { callId, duration, reason });
log.info({ callId, duration, reason }, 'Call ended');
```

### 2.2 Voice Pipeline Instrumentation

Track transcription and response generation.

```typescript
// modules/voice-pipeline/src/service.ts

// After Deepgram returns transcription:
eventBus.emit('turn.transcribed', {
  callId,
  speaker: 'senior',
  text: transcribedText,
  timestamp: new Date()
});

// After Claude generates response:
eventBus.emit('turn.response', {
  callId,
  text: responseText,
  timestamp: new Date()
});
```

### 2.3 Observer Agent Instrumentation

**This is the key one** - emit every signal the observer produces.

```typescript
// modules/observer-agent/src/service.ts

// After analyze() produces a signal:
eventBus.emit('observer.signal', {
  callId,
  signal: {
    engagementLevel,
    emotionalState,
    shouldDeliverReminder,
    reminderToDeliver,
    suggestedTransition,
    shouldEndCall,
    endCallReason,
    concerns,
    confidenceScore
  },
  timestamp: new Date()
});

log.info({
  callId,
  engagement: signal.engagementLevel,
  emotion: signal.emotionalState,
  confidence: signal.confidenceScore,
  concerns: signal.concerns.length
}, 'Observer signal emitted');
```

**Modules to instrument:**
- `modules/call-orchestrator/src/service.ts`
- `modules/voice-pipeline/src/service.ts`
- `modules/observer-agent/src/service.ts`
- `modules/conversation-manager/src/service.ts`
- `adapters/twilio/src/adapter.ts`

---

## Phase 3: API Endpoints

### 3.1 Observability Routes

Create new route file `apps/api/src/routes/observability.ts`.

```typescript
// GET /api/observability/calls
// List all calls with summary stats
router.get('/calls', async (req, res) => {
  const calls = await db.query.conversations.findMany({
    orderBy: desc(conversations.startedAt),
    limit: 50,
    with: { senior: true }
  });
  res.json(calls);
});

// GET /api/observability/calls/:id/timeline
// Full timeline of events for a call
router.get('/calls/:id/timeline', async (req, res) => {
  const events = await db.query.observabilityEvents.findMany({
    where: eq(observabilityEvents.callId, req.params.id),
    orderBy: asc(observabilityEvents.timestamp)
  });
  res.json(events);
});

// GET /api/observability/calls/:id/turns
// All conversation turns with transcriptions
router.get('/calls/:id/turns', async (req, res) => {
  const turns = await db.query.conversationTurns.findMany({
    where: eq(conversationTurns.conversationId, req.params.id),
    orderBy: asc(conversationTurns.timestampOffsetMs)
  });
  res.json(turns);
});

// GET /api/observability/calls/:id/observer
// All observer signals for a call
router.get('/calls/:id/observer', async (req, res) => {
  const signals = await db.query.observabilityEvents.findMany({
    where: and(
      eq(observabilityEvents.callId, req.params.id),
      eq(observabilityEvents.eventType, 'observer.signal')
    ),
    orderBy: asc(observabilityEvents.timestamp)
  });
  res.json(signals.map(s => s.data));
});
```

### 3.2 WebSocket for Live Calls

Real-time updates for active calls.

```typescript
// apps/api/src/routes/observability-ws.ts
import { WebSocketServer } from 'ws';

// Subscribe to live events for a specific call
wss.on('connection', (ws, req) => {
  const callId = req.url?.split('/').pop();

  const handler = (data: any) => {
    ws.send(JSON.stringify(data));
  };

  eventBus.on('turn.transcribed', handler);
  eventBus.on('turn.response', handler);
  eventBus.on('observer.signal', handler);

  ws.on('close', () => {
    eventBus.off('turn.transcribed', handler);
    eventBus.off('turn.response', handler);
    eventBus.off('observer.signal', handler);
  });
});
```

---

## Phase 4: Observability Dashboard

### 4.1 Dashboard Components

Create `apps/observability/` - a simple React app.

```
apps/observability/
├── src/
│   ├── components/
│   │   ├── CallList.tsx          # List of recent calls
│   │   ├── CallTimeline.tsx      # Visual timeline of events
│   │   ├── ConversationView.tsx  # Turn-by-turn transcript
│   │   ├── ObserverPanel.tsx     # Observer signals visualization
│   │   └── LiveCallMonitor.tsx   # Real-time view via WebSocket
│   ├── pages/
│   │   ├── index.tsx             # Dashboard home
│   │   └── call/[id].tsx         # Single call detail view
│   └── App.tsx
├── package.json
└── vite.config.ts
```

### 4.2 Key Views

#### Call Timeline View
```
┌─────────────────────────────────────────────────────────────┐
│ Call #abc123 - Margaret (555-1234)     Duration: 8:42       │
├─────────────────────────────────────────────────────────────┤
│ Timeline                                                     │
│ ────────────────────────────────────────────────────────────│
│ 0:00  ● Call Initiated                                      │
│ 0:03  ● Call Connected (senior answered)                    │
│ 0:05  ○ Donna: "Hello Margaret! How are you today?"         │
│ 0:12  ○ Senior: "Oh hi Donna, I'm doing well..."            │
│ 0:12  ◆ Observer: engagement=high, emotion=positive         │
│ 0:45  ○ Senior: "My knee has been hurting..."               │
│ 0:45  ◆ Observer: emotion=negative, concern flagged         │
│ ...                                                          │
│ 8:40  ○ Donna: "It was lovely talking with you!"            │
│ 8:42  ● Call Ended (graceful)                               │
└─────────────────────────────────────────────────────────────┘
```

#### Observer Insights Panel
```
┌─────────────────────────────────────────────────────────────┐
│ Observer Agent Analysis                                      │
├─────────────────────────────────────────────────────────────┤
│ Engagement Over Time        Emotional State                  │
│ ┌───────────────────┐      ┌───────────────────┐            │
│ │ HIGH ████████░░░░ │      │ 😊 Positive: 65%  │            │
│ │ MED  ░░░░████░░░░ │      │ 😐 Neutral: 25%   │            │
│ │ LOW  ░░░░░░░░████ │      │ 😟 Negative: 10%  │            │
│ └───────────────────┘      └───────────────────┘            │
│                                                              │
│ Concerns Flagged (2):                                        │
│ • "Mentioned knee pain - potential mobility issue"           │
│ • "Seemed confused about medication schedule"                │
│                                                              │
│ Reminders Delivered:                                         │
│ ✓ Doctor appointment tomorrow at 2pm                        │
│ ✓ Take evening medication                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 5: Historical Analysis

### 5.1 Aggregate Metrics

```typescript
// GET /api/observability/metrics
{
  "totalCalls": 1247,
  "avgDuration": "6:32",
  "avgEngagement": 0.72,
  "emotionDistribution": {
    "positive": 0.58,
    "neutral": 0.31,
    "negative": 0.08,
    "confused": 0.02,
    "distressed": 0.01
  },
  "concernsPerCall": 0.4,
  "reminderDeliveryRate": 0.89
}
```

### 5.2 Senior-Specific Trends

Track engagement and emotional patterns over time for each senior.

---

## Implementation Order

| Step | What | Priority | Effort | Status |
|------|------|----------|--------|--------|
| 1 | Create `packages/logger` | High | Small | ✅ DONE |
| 2 | Create `packages/event-bus` | High | Small | ✅ DONE |
| 3 | Add `observability_events` table | High | Small | ✅ DONE |
| 3.5 | Add conversation continuity (last 10 turns) | High | Medium | ✅ DONE |
| 4 | Instrument Observer Agent | High | Medium | ✅ DONE |
| 5 | Instrument Call Orchestrator | High | Medium | ✅ DONE |
| 6 | Instrument Voice Pipeline/Routes | Medium | Medium | ✅ DONE |
| 7 | Create observability API routes | High | Medium | ✅ DONE |
| 8 | Build dashboard (basic) | Medium | Large | ✅ DONE |
| 9 | Add WebSocket live view | Low | Medium | |
| 10 | Add aggregate metrics | Low | Medium | |

## What Was Built (Phase 1)

### 1. `packages/logger` - Structured Logging
- Pino-based structured JSON logging
- Context-aware logging with callId, conversationId, seniorId
- Pre-configured loggers for each module
- Pretty printing in development mode

```typescript
import { loggers, withContext, logEvent } from '@donna/logger';

// Module-specific logger
loggers.observerAgent.info({ signal }, 'Observer signal emitted');

// Context-aware logger
const log = withContext({ callId, seniorId });
log.info('Call connected');
```

### 2. `packages/event-bus` - Event Emission
- Type-safe event bus for observability events
- Events: call.initiated, call.connected, call.ended, turn.transcribed, turn.response, observer.signal, reminder.delivered, error.occurred
- Helper functions to create events
- Wildcard subscription for catching all events

```typescript
import { eventBus, createObserverSignalEvent } from '@donna/event-bus';

// Emit event
eventBus.emit(createObserverSignalEvent({
  callId,
  conversationId,
  seniorId,
  signal,
  turnIndex
}));

// Subscribe
eventBus.on('observer.signal', (event) => {
  console.log(event.signal.engagementLevel);
});
```

### 3. `observability_events` table
Added to `database/src/schema.ts`:
- Stores all observability events persistently
- Links to conversations, seniors, caregivers
- JSONB for flexible event payloads

### 4. Conversation Continuity
Added `getContinuity()` to `IConversationManager`:
- Returns last 10 turns across ALL calls for a senior
- Highlights the senior's last message (what they wanted)
- Tracks if last call was dropped
- Persists across call endings

```typescript
const continuity = await conversationManager.getContinuity(seniorId);
// {
//   recentTurns: [...],           // Last 10 turns across calls
//   lastSeniorTurn: {...},        // Senior's most recent message
//   lastCallDropped: false,       // Was last call dropped?
//   lastInteractionAt: Date       // When was last interaction?
// }
```

## What Was Built (Phase 2)

### 5. Observer Agent Instrumentation
- Emits `observer.signal` events after each analysis
- Logs engagement level, emotional state, confidence, concerns
- Context-aware logging with callId, conversationId, seniorId
- Error event emission on analysis failures

### 6. Call Orchestrator Instrumentation
- Emits `call.initiated` when call starts
- Emits `call.connected` when senior answers
- Emits `call.ended` with duration and reason
- Comprehensive logging throughout call lifecycle

### 7. Voice Routes Instrumentation
- Logs call initiation, status updates, recording events
- Emits call lifecycle events from Twilio webhooks
- Context-aware logging with callId

### 8. Observability API Routes (`/api/observability/*`)

| Endpoint | Description |
|----------|-------------|
| `GET /calls` | List recent calls with summary info |
| `GET /calls/:id` | Get detailed call info |
| `GET /calls/:id/timeline` | Chronological timeline of all events |
| `GET /calls/:id/turns` | All conversation turns |
| `GET /calls/:id/observer` | Observer signals with aggregates |
| `GET /continuity/:seniorId` | Last 10 turns across calls |

Example timeline response:
```json
{
  "callId": "uuid",
  "callSid": "CA...",
  "timeline": [
    { "type": "call.initiated", "timestamp": "...", "data": {...} },
    { "type": "turn.transcribed", "timestamp": "...", "data": { "speaker": "senior", "content": "Hello" } },
    { "type": "observer.signal", "timestamp": "...", "data": { "engagement": "high", "emotion": "positive" } },
    { "type": "turn.response", "timestamp": "...", "data": { "speaker": "donna", "content": "Hi there!" } },
    { "type": "call.ended", "timestamp": "...", "data": { "status": "completed", "durationSeconds": 423 } }
  ]
}
```

## What Was Built (Phase 3)

### 9. Observability Dashboard (`apps/observability/`)

A React + Vite dashboard for visualizing call flows and observer analysis.

**Run locally:**
```bash
npm run dev --workspace=@donna/observability
# Opens at http://localhost:3002
```

**Components:**

| Component | Description |
|-----------|-------------|
| `CallList` | List of recent calls with status, duration, turn count |
| `CallTimeline` | Chronological timeline of all events in a call |
| `ObserverPanel` | Observer signals visualization with aggregates |

**Features:**
- Dark theme optimized for monitoring
- Real-time refresh
- Toggle between Timeline and Observer views
- Engagement/emotional state distribution charts
- Concerns flagged prominently
- Turn-by-turn conversation view

**Screenshot Preview:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Donna Observability    Call Flow & Observer Analysis           │
├──────────────────┬──────────────────────────────────────────────┤
│  RECENT CALLS    │  Margaret Smith    (555) 123-4567  completed │
│  ────────────────│──────────────────────────────────────────────│
│  Margaret Smith  │  [Timeline]  [Observer]                      │
│  Today 2:34pm    │                                              │
│  ✓ completed     │  Call Timeline                               │
│  8:42  12 turns  │  ────────────────────────────────────────────│
│                  │  0:00 📞 Call Started                        │
│  John Doe        │  0:05 👤 Senior: "Hello Donna..."            │
│  Today 1:15pm    │       👁 Observer: high engagement, positive │
│  ✓ completed     │  0:12 🤖 Donna: "Hi Margaret! How are..."    │
│  5:23  8 turns   │  0:45 👤 Senior: "My knee hurts..."          │
│                  │       👁 Observer: medium, negative           │
│  Alice Brown     │       ⚠ Concern: mobility issue              │
│  Yesterday       │  ...                                          │
│  ✗ no_answer     │  8:42 📴 Call Ended (completed)              │
└──────────────────┴──────────────────────────────────────────────┘
```

---

## Dependencies & Blockers

### NOT Blocked By:
- ✅ Blob storage - Already working (Vercel Blob)
- ✅ Transcription storage - Already in `conversation_turns`
- ✅ Observer signals - Already stored in JSONB

### Prerequisites:
- None - can start immediately

### New Dependencies:
- `pino` - Structured logging
- `ws` - WebSocket support (already in project)
- React app tooling (Vite)

---

## File Structure Summary

```
packages/
├── logger/                    # NEW - Structured logging
│   ├── package.json
│   └── src/index.ts
├── event-bus/                 # NEW - Event emission
│   ├── package.json
│   └── src/index.ts

modules/
├── observer-agent/src/service.ts    # MODIFY - Add instrumentation
├── call-orchestrator/src/service.ts # MODIFY - Add instrumentation
├── voice-pipeline/src/service.ts    # MODIFY - Add instrumentation

apps/
├── api/src/routes/
│   ├── observability.ts       # NEW - REST endpoints
│   └── observability-ws.ts    # NEW - WebSocket
├── observability/             # NEW - Dashboard app
│   ├── src/
│   │   ├── components/
│   │   └── pages/
│   └── package.json

database/
├── src/schema.ts              # MODIFY - Add observability_events
└── drizzle/                   # NEW migration
```

---

## Success Criteria

1. **Call Flow Visibility**: See every call from initiation to completion with timestamps
2. **Conversation Replay**: View full transcript with speaker labels and timing
3. **Observer Transparency**: See exactly what the Observer Agent detected at each turn
4. **Real-time Monitoring**: Watch active calls as they happen
5. **Historical Analysis**: Track trends in engagement and emotional patterns

---

## Questions for Clarification

1. **Dashboard hosting**: Should this be part of the caregiver portal or a separate internal tool?
2. **Access control**: Who should see the observability dashboard? (Developers only? Caregivers?)
3. **Retention policy**: How long should we keep detailed observability events?
4. **Real-time priority**: Is live call monitoring critical, or is post-call analysis sufficient?
