# Cost Analysis

> Per-call cost breakdown and scaling projections for the Donna voice system.

*Prices based on published API pricing as of March 2026. Actual costs vary with usage patterns.*

---

## Current Stack

| Service | Provider | Model/Tier | Pricing |
|---------|----------|------------|---------|
| Voice LLM | Anthropic | Claude Sonnet 4.5 | $3/M in, $15/M out, cache read $0.30/M |
| STT | Deepgram | Nova 3 General | $0.0043/min |
| TTS | Cartesia | Sonic 3 | ~$0.08/1K chars |
| Director LLM | Groq | gpt-oss-20b | $0.10/M in, $0.20/M out |
| Director fallback | Google | Gemini 3 Flash Preview | ~$0.01/M in (free tier available) |
| Embeddings | OpenAI | text-embedding-3-small | $0.02/M tokens |
| Memory extraction | OpenAI | gpt-4o-mini | $0.15/M in, $0.60/M out |
| Web search | Tavily | Basic | ~$0.001/search |
| Daily news | OpenAI | gpt-4o-mini + web_search_preview | ~$0.03/search |
| Voice carrier | Twilio | Programmable Voice + Media Streams | $0.022/min |
| Hosting | Railway | 2 services × 2 envs (dev + prod) | ~$25-35/mo |
| Database | Neon | PostgreSQL + pgvector | Free tier (current) |
| Feature flags | GrowthBook | Cloud free tier | $0 |
| Error monitoring | Sentry | Free tier | $0 |
| VAD | Silero | Local (open source) | $0 |

---

## Per-Call Cost Breakdown (Average 10-Minute Call, 20 Turns)

### AI Services

| Service | Usage per Call | Cost per Call |
|---------|---------------|---------------|
| **Cartesia TTS** (Sonic 3) | ~2,000 chars | **$0.160** |
| **Deepgram STT** (Nova 3) | 10 min continuous stream | **$0.043** |
| **Anthropic Claude** (Sonnet 4.5, prompt cached) | ~70K input (55K cached read + 15K write), 1.5K output | **$0.070** |
| **Groq** (gpt-oss-20b, Director) | ~35K input, 8K output (30-50 calls/call) | **$0.005** |
| **Gemini Flash** (post-call analysis) | ~6K input, 800 output | **~$0.001** |
| **OpenAI Embeddings** (memory search + store) | 40 calls × 30 tokens | **~$0.001** |
| **OpenAI gpt-4o-mini** (post-call memory extraction) | ~6K input, 600 output | **$0.001** |
| **Tavily** (web search, 0-2 per call) | ~1 search avg | **$0.001** |

**AI Services Total: ~$0.28 per call**

### Infrastructure

| Service | Usage per Call | Cost per Call |
|---------|---------------|---------------|
| **Twilio** (voice + media stream) | 10 min | **$0.220** |
| **Railway** (compute) | ~10 min of pipeline | **$0.003** |
| **Neon** (database, ~50 queries) | Included in plan | **$0.001** |

**Infrastructure Total: ~$0.22 per call**

### Total Cost per Call

| Component | Cost |
|-----------|------|
| AI Services | ~$0.28 |
| Infrastructure | ~$0.22 |
| **Total per 10-min call** | **~$0.50** |
| **Per minute** | **~$0.05** |

---

## Cost at Current Volume (~60 calls/week, 150 min/week)

| Service | Monthly |
|---------|---------|
| Cartesia (TTS) | $38 |
| Twilio (voice) | $13 |
| Anthropic (Claude) | $7 |
| Deepgram (STT) | $3 |
| Railway (hosting) | $25-35 |
| Groq (Director) | $1 |
| Tavily + OpenAI | $1 |
| **Total** | **~$90-100** |

---

## Cost at Scale: 1,000 Users

**Assumptions**: 1,000 users, 130 min/week each = 520,000 min/month, ~52,000 calls/month.

### With Current Stack (Twilio)

| Service | Monthly | % |
|---------|---------|---|
| **Twilio** (voice) | $11,440 | 45% |
| **Cartesia** (TTS) | $8,320 | 33% |
| **Deepgram** (STT) | $2,236 | 9% |
| **Anthropic** (Claude) | $2,080 | 8% |
| **Neon** (Scale tier) | $300-500 | 2% |
| **Railway** (scaled) | $200-400 | 2% |
| **Groq** (Director) | $260 | 1% |
| **Tavily + OpenAI** | $156 | <1% |
| **Gemini** | ~$0 | <1% |
| **Total** | **~$25,000/mo** |
| **Per user** | **~$25/mo** |

### With Telnyx (voice carrier switch)

| Service | Monthly | % |
|---------|---------|---|
| **Cartesia** (TTS) | $8,320 | 57% |
| **Deepgram** (STT) | $2,236 | 15% |
| **Anthropic** (Claude) | $2,080 | 14% |
| **Telnyx** (voice) | $1,040 | 7% |
| **Neon** (Scale tier) | $300-500 | 3% |
| **Railway** (scaled) | $200-400 | 3% |
| **Groq** (Director) | $260 | 2% |
| **Total** | **~$14,600/mo** |
| **Per user** | **~$14.60/mo** |

### With Telnyx + Cheaper TTS (Deepgram Aura at ~$0.005/min)

| Service | Monthly | % |
|---------|---------|---|
| **Deepgram** (STT + TTS) | $4,836 | 44% |
| **Anthropic** (Claude) | $2,080 | 19% |
| **Telnyx** (voice) | $1,040 | 10% |
| **Neon** (Scale tier) | $300-500 | 4% |
| **Railway** (scaled) | $200-400 | 4% |
| **Groq** (Director) | $260 | 2% |
| **Total** | **~$8,800/mo** |
| **Per user** | **~$8.80/mo** |

---

## Cost Distribution (Top 3 at Each Scale)

| Rank | Current (~$100/mo) | 1K Users Twilio (~$25K) | 1K Users Optimized (~$9K) |
|------|-------------------|------------------------|--------------------------|
| 1 | Cartesia TTS (38%) | Twilio voice (45%) | Deepgram STT+TTS (44%) |
| 2 | Railway hosting (30%) | Cartesia TTS (33%) | Anthropic Claude (19%) |
| 3 | Twilio voice (13%) | Deepgram STT (9%) | Telnyx voice (10%) |

**Key insight**: TTS is the silent killer. At scale, voice carrier + TTS = 78% of costs. Optimizing these two (Telnyx + cheaper TTS) cuts the bill in half.

---

## Implemented Optimizations

### 1. Anthropic Prompt Caching (enabled)
- System prompt + senior context (~1,500 tokens) cached across all turns in a call
- Cache read at $0.30/M vs $3/M normal input = 90% savings on static context
- Estimated savings: ~$1,500/mo at 1K users

### 2. Predictive Context Prefetch (`services/prefetch.py`)
- 2-wave speculative memory search starts while user is still speaking
- Cache hit returns instantly (~0ms vs 200-300ms cold search)
- Saves ~20-40 embedding API calls per call via Jaccard fuzzy dedup

### 3. Context Pre-Caching (`services/context_cache.py`)
- Senior context (memories, summaries, news) cached at 5 AM local time
- News persisted to `seniors.cached_news` — eliminates per-call web search
- Batch process runs once daily per senior

### 4. HNSW Vector Index
- Memory search: O(log n) approximate nearest neighbor vs O(n) sequential scan
- At 100K memories: ~5ms vs ~500ms query time

### 5. Director on Groq (not Gemini)
- Groq gpt-oss-20b: $0.10/M in vs Gemini's higher per-token cost
- ~70ms latency vs Gemini's ~500ms — enables speculative same-turn guidance
- Gemini kept as fallback only (fires when Groq circuit breaker opens)

### 6. save_important_detail Removed from In-Call Tools
- Memory extraction moved to post-call analysis (single Gemini call)
- Eliminates 2-5 tool call interruptions per call (~500-1000ms each)
- No loss: post-call analysis has full transcript context for better extraction

### 7. Confidence-Gated Web Search
- Web search only fires when Quick Observer confirms factual question (23 regex patterns)
- Low-confidence predictions cached for tool fallback instead of gating the frame
- Eliminates wasted web searches on social/rhetorical questions

### 8. asyncpg JSON Codecs
- Registered json/jsonb decoders on the connection pool
- All JSON columns auto-parse — eliminates scattered `json.loads()` calls and crash risk

---

## Future Optimizations

### Telnyx Migration (~$10K/mo savings at 1K users)
- Telnyx voice: ~$0.002/min vs Twilio $0.022/min
- Pipecat has built-in `TelnyxFrameSerializer`
- Requires: new number, webhook migration, call control API
- **Estimated savings at 1K users: $10,400/month**

### TTS Provider Comparison
- Cartesia Sonic 3: ~$0.016/min (current)
- Deepgram Aura: ~$0.005/min (3x cheaper)
- Self-hosted Piper/Coqui: ~$0.001/min (requires GPU)
- **Estimated savings at 1K users: $3,500-5,700/month**

### Batch Embedding Generation
- Post-call memory extraction could use OpenAI batch API (50% cheaper)
- Minor savings (~$25/mo at 1K users) but easy to implement

### Neon Scaling Strategy
- Current: Free tier (0.25 CU, 0.5 GB)
- 100 users: Launch tier ($50-100/mo, 1-4 CU, 10-50 GB)
- 1K users: Scale tier ($200-500/mo, 4-8 CU, 50-100 GB)
- Monitor: pgvector HNSW index RAM usage as memories grow past 100K

---

## Cost Monitoring

Track daily from the `conversations` table:
- Total calls completed + average duration
- API error rates (failed calls still incur partial costs)
- Circuit breaker open events (Groq failures = Gemini fallback at higher latency)
- Prefetch cache hit rate (higher = fewer embedding calls)
- Web search tool-call rate (should be <10% of turns)

*Last updated: April 2026 — current Director/memory-prefetch architecture*
