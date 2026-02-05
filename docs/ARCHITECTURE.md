# Donna Architecture

> Comprehensive technical architecture for the AI Senior Companion system (v3.3 - In-Call Memory + Cross-Call Memory + Enhanced Web Search).

---

## System Overview

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                           DONNA v3.3 - CONVERSATION DIRECTOR                            │
│                                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              CLIENT LAYER                                        │   │
│  │                                                                                  │   │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │   │
│  │   │   Senior's   │  │    Admin     │  │  Consumer   │  │ Observability│      │   │
│  │   │    Phone     │  │  Dashboard   │  │    App      │  │  Dashboard   │      │   │
│  │   │  (Twilio)    │  │ apps/admin/  │  │apps/consumer│  │ :5174        │      │   │
│  │   └──────┬───────┘  └──────┬───────┘  └──────┬──────┘  └──────┬───────┘      │   │
│  │          │                   │                   │                               │   │
│  └──────────┼───────────────────┼───────────────────┼───────────────────────────────┘   │
│             │                   │                   │                                    │
│             │ PSTN/WebRTC       │ HTTP              │ HTTP                               │
│             │                   │                   │                                    │
│  ┌──────────┼───────────────────┼───────────────────┼───────────────────────────────┐   │
│  │          ▼                   ▼                   ▼                                │   │
│  │                         GATEWAY LAYER                                             │   │
│  │                                                                                   │   │
│  │   ┌─────────────────────────────────────────────────────────────────────────┐    │   │
│  │   │                        Twilio                                            │    │   │
│  │   │  • Phone number: +1-XXX-XXX-XXXX                                        │    │   │
│  │   │  • Webhooks: /voice/answer, /voice/status                               │    │   │
│  │   │  • Media Streams: WebSocket /media-stream                               │    │   │
│  │   │  • Audio format: mulaw 8kHz mono                                        │    │   │
│  │   └──────────────────────────────┬──────────────────────────────────────────┘    │   │
│  │                                  │                                                │   │
│  └──────────────────────────────────┼────────────────────────────────────────────────┘   │
│                                     │                                                    │
│                                     ▼                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│  │                           APPLICATION LAYER                                       │   │
│  │                                                                                   │   │
│  │   ┌─────────────────────────────────────────────────────────────────────────┐    │   │
│  │   │                     Express Server (index.js)                            │    │   │
│  │   │                                                                          │    │   │
│  │   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │    │   │
│  │   │  │   HTTP      │  │  WebSocket  │  │  V1 Session │  │  Scheduler  │     │    │   │
│  │   │  │   Routes    │  │   Handler   │  │   Router    │  │   (60s)     │     │    │   │
│  │   │  └─────────────┘  └─────────────┘  └──────┬──────┘  └─────────────┘     │    │   │
│  │   │                                           │                              │    │   │
│  │   └───────────────────────────────────────────┼──────────────────────────────┘    │   │
│  │                                               │                                   │   │
│  │   ┌───────────────────────────────────────────▼──────────────────────────────┐   │   │
│  │   │                    V1 ADVANCED SESSION                                    │   │   │
│  │   │                  (pipelines/v1-advanced.js)                               │   │   │
│  │   │                                                                           │   │   │
│  │   │   CRITICAL PATH:                                                          │   │   │
│  │   │                                                                           │   │   │
│  │   │   Audio In → Deepgram STT → Process Utterance                            │   │   │
│  │   │                                   │                                       │   │   │
│  │   │               ┌───────────────────┼───────────────────┐                  │   │   │
│  │   │               ▼                   ▼                                       │   │   │
│  │   │         Layer 1 (0ms)     Layer 2 (~150ms)                               │   │   │
│  │   │         Quick Observer    Conversation Director                           │   │   │
│  │   │         (regex patterns)  (Gemini 3 Flash)                               │   │   │
│  │   │               │                   │                                       │   │   │
│  │   │               └─────────┬─────────┘                                       │   │   │
│  │   │                         ▼                                                 │   │   │
│  │   │              ┌─────────────────────┐                                      │   │   │
│  │   │              │ Dynamic Token Select│                                      │   │   │
│  │   │              │   (100-400 tokens)  │                                      │   │   │
│  │   │              └──────────┬──────────┘                                      │   │   │
│  │   │                         ▼                                                 │   │   │
│  │   │              Claude Sonnet 4.5 Streaming                                  │   │   │
│  │   │                         │                                                 │   │   │
│  │   │                         ▼                                                 │   │   │
│  │   │              Sentence Buffer → ElevenLabs WS → Twilio                    │   │   │
│  │   │                         │                                                 │   │   │
│  │   │                         ▼                                                 │   │   │
│  │   │              Layer 3: Post-Turn Agent (background)                        │   │   │
│  │   │              - Health concern extraction                                  │   │   │
│  │   │              - Memory storage                                             │   │   │
│  │   │              - Topic prefetching                                          │   │   │
│  │   │                         │                                                 │   │   │
│  │   │                         ▼ (on call end)                                   │   │   │
│  │   │              Post-Call Analysis (Gemini Flash)                            │   │   │
│  │   │              - Summary, alerts, engagement metrics                        │   │   │
│  │   │                                                                           │   │   │
│  │   └───────────────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                                   │   │
│  └───────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                          │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              SERVICE LAYER                                         │   │
│  │                                                                                    │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │   │
│  │   │   Memory    │  │   Senior    │  │Conversation │  │    News     │             │   │
│  │   │   Service   │  │   Service   │  │   Service   │  │   Service   │             │   │
│  │   │             │  │             │  │             │  │             │             │   │
│  │   │ • Store     │  │ • CRUD      │  │ • Create    │  │ • Fetch     │             │   │
│  │   │ • Search    │  │ • Find by   │  │ • Complete  │  │ • Cache     │             │   │
│  │   │ • Extract   │  │   phone     │  │ • Get for   │  │ • Format    │             │   │
│  │   │ • Build     │  │ • List      │  │   senior    │  │             │             │   │
│  │   │   context   │  │             │  │             │  │             │             │   │
│  │   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │   │
│  │          │                │                │                │                     │   │
│  │   ┌─────────────┐  ┌─────────────┐                                               │   │
│  │   │   Call      │  │  Scheduler  │                                               │   │
│  │   │  Analysis   │  │   Service   │                                               │   │
│  │   │             │  │             │                                               │   │
│  │   │ • Post-call │  │ • Due check │                                               │   │
│  │   │ • Summary   │  │ • Prefetch  │                                               │   │
│  │   │ • Concerns  │  │ • Initiate  │                                               │   │
│  │   │ • Metrics   │  │   calls     │                                               │   │
│  │   └──────┬──────┘  └──────┬──────┘                                               │   │
│  │          │                │                                                       │   │
│  └──────────┼────────────────┼───────────────────────────────────────────────────────┘   │
│             │                │                                                           │
│             ▼                ▼                                                           │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              DATA LAYER                                            │   │
│  │                                                                                    │   │
│  │   ┌─────────────────────────────────────────────────────────────────────────┐     │   │
│  │   │                    PostgreSQL (Neon + pgvector)                          │     │   │
│  │   │                                                                          │     │   │
│  │   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │     │   │
│  │   │  │ seniors  │  │ memories │  │ conver-  │  │reminders │  │  call_   │  │     │   │
│  │   │  │          │  │          │  │ sations  │  │          │  │ analyses │  │     │   │
│  │   │  │• id      │  │• id      │  │• id      │  │• id      │  │• id      │  │     │   │
│  │   │  │• name    │  │• seniorId│  │• seniorId│  │• seniorId│  │• convId  │  │     │   │
│  │   │  │• phone   │  │• type    │  │• callSid │  │• title   │  │• summary │  │     │   │
│  │   │  │• interest│  │• content │  │• started │  │• schedule│  │• concerns│  │     │   │
│  │   │  │• medical │  │• embedding│ │• duration│  │• recurring│ │• score   │  │     │   │
│  │   │  │• family  │  │  (vector)│  │• status  │  │• lastDel │  │• quality │  │     │   │
│  │   │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │     │   │
│  │   │                                                                          │     │   │
│  │   │                        pgvector extension                                │     │   │
│  │   │                   (1536-dimensional embeddings)                          │     │   │
│  │   └─────────────────────────────────────────────────────────────────────────┘     │   │
│  │                                                                                    │   │
│  └────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                          │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                           EXTERNAL SERVICES                                         │  │
│  │                                                                                     │  │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │  │
│  │   │  Twilio  │  │  Gemini  │  │  Claude  │  │ElevenLabs│  │ Deepgram │            │  │
│  │   │          │  │          │  │(Anthropic)│ │          │  │          │            │  │
│  │   │ • Calls  │  │• Director│  │ • Voice  │  │ • TTS    │  │ • STT    │            │  │
│  │   │ • Media  │  │• Analysis│  │ • Main   │  │ • Voices │  │ • Real-  │            │  │
│  │   │   Stream │  │          │  │   Model  │  │ • WS API │  │   time   │            │  │
│  │   └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │  │
│  │                                                                                     │  │
│  │   ┌──────────┐  ┌──────────┐                                                       │  │
│  │   │  OpenAI  │  │   Neon   │                                                       │  │
│  │   │          │  │          │                                                       │  │
│  │   │• Embedding│ │• Postgres│                                                       │  │
│  │   │• Web     │  │• pgvector│                                                       │  │
│  │   │  Search  │  │• Hosting │                                                       │  │
│  │   └──────────┘  └──────────┘                                                       │  │
│  │                                                                                     │  │
│  └─────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Conversation Director Architecture

### Overview

```
User speaks → Deepgram STT → Process Utterance
                                  │
                  ┌───────────────┼───────────────┐
                  ▼               ▼
            Layer 1 (0ms)   Layer 2 (~150ms)
            Quick Observer  Conversation Director
            (regex)         (Gemini 3 Flash)
                  │               │
                  └───────┬───────┘
                          ▼
              ┌─────────────────────┐
              │ Dynamic Token Select│
              │   (100-400 tokens)  │
              └──────────┬──────────┘
                         ▼
              Claude Sonnet Streaming
                         │
                         ▼
              Sentence Buffer → ElevenLabs WS → Twilio
                         │
                         ▼
              Layer 3: Post-Turn Agent (background)
                         │
                         ▼ (on call end)
              Post-Call Analysis (Gemini Flash)
```

### Layer Summary

| Layer | Name | Model | Latency | Purpose |
|-------|------|-------|---------|---------|
| **1** | Quick Observer | Regex | 0ms | Instant pattern detection |
| **2** | Conversation Director | Gemini 3 Flash | ~150ms | Proactive call guidance |
| **3** | Post-Turn Agent | Various | After response | Background tasks |
| **Post-Call** | Call Analysis | Gemini Flash | After call ends | Summary, alerts |

### Conversation Director Details

The Director proactively guides each call:

1. **Call Phase Tracking** - opening → rapport → main → closing
2. **Topic Management** - When to stay, transition, or wrap up
3. **Reminder Delivery** - Natural moments to deliver reminders
4. **Engagement Monitoring** - Detect low engagement, suggest re-engagement
5. **Emotional Detection** - Adjust tone for sad/concerned seniors
6. **Token Recommendations** - 100-400 tokens based on context

**Director Output Schema:**
```javascript
{
  analysis: {
    call_phase: "opening|rapport|main|closing",
    engagement_level: "high|medium|low",
    current_topic: "string",
    emotional_tone: "positive|neutral|concerned|sad"
  },
  direction: {
    stay_or_shift: "stay|transition|wrap_up",
    next_topic: "string or null",
    transition_phrase: "natural transition phrase"
  },
  reminder: {
    should_deliver: boolean,
    which_reminder: "string",
    delivery_approach: "how to weave in naturally"
  },
  guidance: {
    tone: "warm|empathetic|cheerful|gentle",
    priority_action: "main thing to do",
    specific_instruction: "concrete guidance"
  },
  model_recommendation: {
    max_tokens: 100-400,
    reason: "why this token count"
  }
}
```

---

## Dynamic Token Selection

| Situation | Tokens | Trigger |
|-----------|--------|---------|
| Normal conversation | 100 | Default |
| Health mention | 150 | Quick Observer |
| Emotional support | 200-250 | Director |
| Low engagement | 200 | Director |
| Reminder delivery | 150 | Director |
| Call closing | 150 | Director |

---

## Post-Call Analysis

When a call ends, async batch analysis runs:

```javascript
{
  summary: "2-3 sentence call summary",
  topics_discussed: ["greeting", "health", "family"],
  engagement_score: 8,  // 1-10
  concerns: [
    {
      type: "health|cognitive|emotional|safety",
      severity: "low|medium|high",
      description: "what was observed",
      recommended_action: "what caregiver should do"
    }
  ],
  positive_observations: ["good engagement", "positive mood"],
  follow_up_suggestions: ["ask about doctor appointment"]
}
```

---

## Key Files

```
donna/
├── index.js                    # Main Express server (1,234 LOC)
├── pipelines/
│   ├── v1-advanced.js          # Main pipeline + call state tracking (1,198 LOC)
│   ├── quick-observer.js       # Layer 1: Instant regex patterns (1,127 LOC)
│   ├── fast-observer.js        # Layer 2: Conversation Director (615 LOC)
│   ├── post-turn-agent.js      # Layer 3: Background tasks
│   └── observer-agent.js       # DEPRECATED (kept for reference)
├── adapters/
│   ├── llm/
│   │   ├── index.js            # Multi-provider LLM adapter
│   │   ├── claude.js           # Claude adapter with streaming
│   │   ├── gemini.js           # Gemini adapter for Director
│   │   └── base.js             # Base LLM interface
│   ├── elevenlabs.js           # ElevenLabs REST TTS
│   └── elevenlabs-streaming.js # ElevenLabs WebSocket TTS
├── services/
│   ├── call-analysis.js        # Post-call batch analysis
│   ├── caregivers.js           # Caregiver-senior relationships
│   ├── context-cache.js        # Pre-caches senior context
│   ├── daily-context.js        # Same-day cross-call memory service
│   ├── seniors.js              # Senior CRUD operations
│   ├── memory.js               # Memory storage + search
│   ├── conversations.js        # Conversation records
│   ├── scheduler.js            # Reminder scheduler
│   └── news.js                 # News via OpenAI
├── middleware/
│   ├── auth.js                 # Clerk authentication (requireAuth, requireAdmin)
│   ├── clerk.js                # Clerk middleware initialization
│   ├── rate-limit.js           # Rate limiting (100/min API, 5/min calls)
│   ├── twilio.js               # Twilio webhook signature verification
│   └── validate.js             # Zod schema validation
├── validators/
│   └── schemas.js              # Zod schemas for all API inputs
├── packages/
│   ├── logger/                 # TypeScript logging package
│   └── event-bus/              # TypeScript event bus package
├── db/
│   ├── client.js               # Database connection (Drizzle)
│   ├── schema.js               # Table definitions (8 tables)
│   └── setup-pgvector.js       # pgvector initialization
├── apps/
│   ├── admin/                  # React admin dashboard (Railway)
│   ├── consumer/               # Caregiver onboarding + dashboard (Vercel)
│   ├── observability/          # React observability dashboard
│   └── web/                    # Future placeholder
├── public/
│   └── admin.html              # Legacy admin UI (fallback)
└── docs/
    └── architecture/           # This file and related docs
```

---

## Environment Configuration

```bash
# ═══════════════════════════════════════════════════════════════
# REQUIRED - Core Infrastructure
# ═══════════════════════════════════════════════════════════════
PORT=3001
DATABASE_URL=postgresql://user:pass@host:5432/donna

# ═══════════════════════════════════════════════════════════════
# REQUIRED - Twilio (Phone Calls)
# ═══════════════════════════════════════════════════════════════
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1234567890

# ═══════════════════════════════════════════════════════════════
# REQUIRED - AI Services
# ═══════════════════════════════════════════════════════════════
OPENAI_API_KEY=sk-...              # Embeddings + news search
ANTHROPIC_API_KEY=sk-ant-...       # Claude Sonnet (voice)
GOOGLE_API_KEY=...                 # Gemini Flash (Director + Analysis)
ELEVENLABS_API_KEY=...             # Text-to-speech
DEEPGRAM_API_KEY=...               # Speech-to-text

# ═══════════════════════════════════════════════════════════════
# OPTIONAL - Configuration
# ═══════════════════════════════════════════════════════════════
V1_STREAMING_ENABLED=true          # Enable streaming pipeline
VOICE_MODEL=claude-sonnet          # Main voice model
FAST_OBSERVER_MODEL=gemini-3-flash # Director model
```

---

## Latency Budget

| Component | Target | Notes |
|-----------|--------|-------|
| Deepgram utterance | ~300ms | 300ms endpointing config |
| Quick Observer (L1) | 0ms | Regex only |
| Director (L2) | ~150ms | Runs parallel with response |
| Claude first token | ~200-300ms | Streaming enabled |
| Sentence buffering | ~50ms | Until punctuation detected |
| TTS first audio | ~100-150ms | WebSocket pre-connected |
| **Total time-to-first-audio** | **~400-500ms** | After user stops speaking |

---

## Cost Summary (15-min call, ~20 turns)

| Component | Model | Per Call |
|-----------|-------|----------|
| L1 Quick Observer | Regex | $0 |
| L2 Director | Gemini 3 Flash | ~$0.01 |
| Voice | Claude Sonnet 4.5 | ~$0.08 |
| Post-Call Analysis | Gemini Flash | ~$0.005 |
| Memory/Embeddings | OpenAI | ~$0.01 |
| **AI Total** | | **~$0.11** |
| Twilio Voice | | ~$0.30 |
| Deepgram STT | | ~$0.065 |
| ElevenLabs TTS | | ~$0.18 |
| **Total per call** | | **~$0.65** |

---

*Last updated: February 2026 - v3.3 (In-Call Memory + Cross-Call Memory + Enhanced Web Search)*
