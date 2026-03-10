# Cost Analysis

> Per-call cost breakdown and optimization strategies for the Donna voice system.

*Prices are estimates based on published API pricing as of March 2026. Actual costs vary with usage patterns.*

---

## Per-Call Cost Breakdown (10-Minute Call)

### AI Services

| Service | Usage per Call | Unit Price | Cost per Call |
|---------|---------------|------------|---------------|
| **Deepgram STT** (Nova 3) | 10 min audio | ~$0.0043/min | ~$0.043 |
| **Anthropic Claude Sonnet 4.5** | ~15K input + ~3K output tokens | $3/$15 per 1M tokens | ~$0.090 |
| **ElevenLabs TTS** (turbo v2.5) | ~2,000 characters | ~$0.18/1K chars | ~$0.360 |
| **Gemini Flash** (Director) | ~20 calls × ~500 tokens each | ~$0.075/$0.30 per 1M | ~$0.005 |
| **Gemini Flash** (Post-call analysis) | 1 call × ~5K tokens | ~$0.075/$0.30 per 1M | ~$0.002 |
| **OpenAI Embeddings** (text-embedding-3-small) | ~10 calls × ~200 tokens | $0.02/1M tokens | ~$0.001 |
| **OpenAI Web Search** (news) | ~1 call | ~$0.03/search | ~$0.030 |

**AI Services Total: ~$0.53 per call**

### Infrastructure

| Service | Usage per Call | Unit Price | Cost per Call |
|---------|---------------|------------|---------------|
| **Twilio** (voice minutes) | 10 min | $0.013/min (inbound) | ~$0.130 |
| **Railway** (compute) | ~10 min of 1 vCPU | ~$0.000005/sec | ~$0.003 |
| **Neon** (database) | ~50 queries | Included in plan | ~$0.001 |

**Infrastructure Total: ~$0.13 per call**

### Total Cost per Call

| Component | Cost |
|-----------|------|
| AI Services | ~$0.53 |
| Infrastructure | ~$0.13 |
| **Total per 10-min call** | **~$0.66** |

---

## Cost at Scale

| Scale | Daily Calls | Monthly Cost | Notes |
|-------|-------------|-------------|-------|
| 50 users (current) | 50 | ~$1,000 | Current operating scale |
| 500 users | 500 | ~$10,000 | First rollout cohort |
| 2,000 users | 2,000 | ~$40,000 | Mid-rollout |
| 8,000 users | 8,000 | ~$160,000 | Full capacity target |

*Monthly = daily calls × 30 days × $0.66/call*

### Cost Distribution

At full scale (8,000 calls/day):

| Category | Monthly | % of Total |
|----------|---------|-----------|
| ElevenLabs TTS | ~$86,400 | 54% |
| Twilio Voice | ~$31,200 | 20% |
| Anthropic Claude | ~$21,600 | 14% |
| Deepgram STT | ~$10,320 | 6% |
| OpenAI (news + embeddings) | ~$7,440 | 5% |
| Gemini Flash | ~$1,680 | 1% |
| Railway + Neon | ~$960 | <1% |

**TTS is the largest cost driver at 54% of total spend.**

---

## Implemented Optimizations

### 1. Predictive Context Prefetch (`services/prefetch.py`)
- 2-wave speculative memory search starts while user is still speaking
- Cache hit rate reduces `search_memories` tool calls from ~200ms to ~0ms
- Saves ~4-8 embedding API calls per call (Jaccard fuzzy matching prevents duplicate searches)

### 2. Context Pre-Caching (`services/context_cache.py`)
- Senior context (memories, summaries, daily context) cached at 5 AM local time
- Eliminates per-call startup queries during peak morning hours
- Batch process runs once daily, not 8,000 times

### 3. HNSW Vector Index
- Memory search drops from O(n) sequential scan to O(log n) approximate nearest neighbor
- At 100K memories: query time drops from ~500ms to ~5ms
- Less database compute time = lower Neon costs

### 4. Non-Blocking Director
- Gemini Flash analysis runs in background (`asyncio.create_task`)
- No pipeline stall = no wasted compute while waiting for analysis
- Director results cached per-turn, reused if analysis is slow

### 5. Parallel Post-Call Processing
- Steps 2, 3, 5, 6 run concurrently via `asyncio.gather`
- Processing time: ~20s → ~7-10s per call
- 50% reduction in Railway compute per post-call

### 6. News Cache
- OpenAI web search results cached for 1 hour
- Multiple calls to the same senior within the hour reuse cached news
- Saves ~$0.03 per duplicate search avoided

---

## Future Optimizations

### Telnyx Migration (65% Voice Cost Savings)
- Telnyx voice: ~$0.005/min vs Twilio $0.013/min
- At 8,000 users: saves ~$19,200/month on voice minutes
- On the roadmap; requires SIP trunk reconfiguration

### Anthropic Prompt Caching
- System prompt + context are similar across turns within a call
- Cache hit reduces input token cost by ~90% for subsequent turns
- Estimated savings: ~$15,000/month at full scale

### ElevenLabs Optimization
- Investigate lower-cost TTS alternatives (e.g., Google Cloud TTS, Azure)
- Shorter responses = fewer TTS characters
- Director could optimize response length guidance

### Batch Embedding Generation
- Generate embeddings in batch during post-call instead of inline
- OpenAI batch API: 50% cost reduction on embeddings

---

## Cost Monitoring

Current health endpoint exposes metrics for cost correlation:

```json
{
  "active_calls": 12,
  "peak_calls": 47,
  "uptime_seconds": 86400,
  "pool": { "size": 15, "idle": 8 }
}
```

Track daily:
- Total calls completed (from `conversations` table)
- Average call duration
- API error rates (failed calls still incur partial costs)
- Circuit breaker open events (skipped API calls = cost savings)
