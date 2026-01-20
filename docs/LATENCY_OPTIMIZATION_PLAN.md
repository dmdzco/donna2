# Latency Optimization Plan

## Current State (January 2026)

**Achieved so far:**
- ✅ Pre-built greeting (skips Claude for first response)
- ✅ Claude streaming (sentence-by-sentence delivery)
- ✅ ElevenLabs WebSocket TTS (pre-connected)
- ✅ Deepgram STT (pre-connected)
- ✅ Haiku as default model (faster than Sonnet)

**Current latency:** ~600ms time-to-first-audio (after greeting)

**Target:** ~300-400ms time-to-first-audio

---

## Optimization 1: Pre-warm Claude Connection

### Why it wasn't done yet
Initial focus was on streaming architecture (bigger win). HTTP keep-alive is a smaller optimization.

### What it does
Reuses the HTTPS connection to Anthropic across multiple requests instead of opening a new TCP connection each time.

### Implementation

**File:** `pipelines/v1-advanced.js`

```javascript
import { Agent } from 'https';

// Create a keep-alive agent for Claude connections
const claudeAgent = new Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,  // Keep connection alive for 30s
  maxSockets: 5,          // Max concurrent connections
  timeout: 60000          // Socket timeout
});

// Pass to Anthropic client
const anthropic = new Anthropic({
  httpAgent: claudeAgent
});
```

### Expected savings
- **First request of call:** No change (still needs initial connection)
- **Subsequent requests:** ~50-100ms saved per utterance

### Checklist
- [ ] Create keep-alive agent in `v1-advanced.js`
- [ ] Pass agent to Anthropic client
- [ ] Test connection reuse across utterances
- [ ] Add logging to confirm keep-alive is working

---

## Optimization 2: Pre-fetch Senior Memories

### Why it wasn't done yet
Memory search was designed as on-demand (triggered by keywords). Pre-fetching is a new optimization.

### What it does
When a call starts, immediately fetch the senior's most important memories so they're ready when needed.

### Implementation

**File:** `pipelines/v1-advanced.js`

```javascript
// In constructor or call start
async prefetchMemories(seniorId) {
  if (!seniorId) return;

  try {
    // Fetch top memories by importance (not query-based)
    this.prefetchedMemories = await memoryService.getTopMemories(seniorId, 5);
    console.log(`[V1] Pre-fetched ${this.prefetchedMemories.length} memories`);
  } catch (error) {
    console.error('[V1] Memory prefetch failed:', error.message);
    this.prefetchedMemories = [];
  }
}
```

**File:** `services/memory.js` (new method)

```javascript
async getTopMemories(seniorId, limit = 5) {
  const result = await db.query(`
    SELECT content, type, importance, created_at
    FROM memories
    WHERE senior_id = $1
    ORDER BY importance DESC, created_at DESC
    LIMIT $2
  `, [seniorId, limit]);

  return result.rows;
}
```

### Expected savings
- **When memory is needed:** ~100ms saved (already in memory)
- **Most calls:** Pre-fetched memories injected into first real response

### Checklist
- [ ] Add `getTopMemories()` to `services/memory.js`
- [ ] Add `prefetchMemories()` to V1 session
- [ ] Call prefetch on session start (parallel with greeting)
- [ ] Inject pre-fetched memories into system prompt
- [ ] Fall back to search if prefetch missed relevant memory

---

## Optimization 3: Cache Common Responses

### Why it wasn't done yet
Requires careful design - responses must still feel personal, not robotic.

### What it does
Cache responses to common exchanges like "How are you?" so Claude doesn't need to generate them.

### Implementation

**File:** `pipelines/response-cache.js` (new file)

```javascript
// Common patterns and cached response templates
const CACHED_RESPONSES = {
  // Pattern → Response generator (includes personalization)
  'how_are_you': (senior) => [
    `I'm doing wonderfully, thank you for asking! More importantly, how are you doing today, ${senior.name}?`,
    `Oh, I'm just fine! It's so nice to hear from you. How has your day been?`,
    `I'm great, thanks! I've been looking forward to our chat. How are you feeling today?`
  ],

  'good_morning': (senior) => [
    `Good morning, ${senior.name}! I hope you slept well. What's on your mind today?`,
    `Good morning! It's lovely to hear your voice. Did you have a good night's rest?`
  ],

  'thank_you': (senior) => [
    `You're very welcome! Is there anything else you'd like to talk about?`,
    `Of course! I'm always happy to help. What else is on your mind?`
  ]
};

// Quick pattern matching
const PATTERNS = [
  { regex: /^(how are you|how're you|how you doing)/i, key: 'how_are_you' },
  { regex: /^good morning/i, key: 'good_morning' },
  { regex: /^(thank you|thanks)/i, key: 'thank_you' }
];

export function getCachedResponse(userMessage, senior) {
  const text = userMessage.trim().toLowerCase();

  for (const { regex, key } of PATTERNS) {
    if (regex.test(text)) {
      const options = CACHED_RESPONSES[key](senior);
      return options[Math.floor(Math.random() * options.length)];
    }
  }

  return null; // No cache hit, use Claude
}
```

### When NOT to cache
- If Quick Observer detects health/emotion signals
- If conversation has context that needs addressing
- If user asked a real question

### Expected savings
- **Cache hit:** ~500-600ms saved (skip Claude entirely)
- **Frequency:** ~10-20% of utterances are simple exchanges

### Checklist
- [ ] Create `pipelines/response-cache.js`
- [ ] Define common patterns and responses
- [ ] Add personalization (senior name, time of day)
- [ ] Integrate into V1 pipeline (check before Claude)
- [ ] Skip cache if observer signals are present
- [ ] Add variety to prevent repetitive responses
- [ ] Log cache hits for monitoring

---

## Optimization 4: Dynamic Model Routing

### Why it wasn't done yet
Haiku default was just implemented. Dynamic routing is the natural next step.

### What it does
Observers recommend when to upgrade from Haiku to Sonnet based on conversation context.

### Full spec
See [DYNAMIC_MODEL_ROUTING.md](DYNAMIC_MODEL_ROUTING.md)

### Checklist
- [ ] Add `modelRecommendation` output to `quick-observer.js`
- [ ] Add `modelRecommendation` output to `fast-observer.js`
- [ ] Add `modelRecommendation` output to `observer-agent.js`
- [ ] Create `selectModelConfig()` function in `v1-advanced.js`
- [ ] Integrate model selection into streaming path
- [ ] Add logging for model selection decisions

---

## Optimization 5: Parallel Initialization

### Current state
Some initialization already runs in parallel, but can be improved.

### What it does
Run all startup tasks concurrently when call connects.

### Implementation

```javascript
// On call connect - run ALL in parallel
async onCallConnect(seniorId) {
  const [memories, ttsConnection, greeting] = await Promise.all([
    this.prefetchMemories(seniorId),           // ~100ms
    this.ttsAdapter.connect(),                  // ~150ms (already done)
    this.getPrebuiltGreeting(seniorId)         // ~0ms (already cached)
  ]);

  // Greeting plays immediately while other setup completes
  this.playGreeting(greeting);
}
```

### Checklist
- [ ] Audit current initialization sequence
- [ ] Move memory prefetch to parallel init
- [ ] Ensure greeting plays immediately (don't wait for other init)
- [ ] Add timing logs for each init step

---

## Optimization 6: Speculative TTS

### What it does
Start TTS generation before Claude finishes the full sentence, using the first few words.

### Why it's risky
If Claude changes direction, we waste TTS resources. Good for simple responses.

### Implementation (future)

```javascript
// When Claude starts streaming, immediately send first clause to TTS
stream.on('text', (text) => {
  this.partialText += text;

  // If we have a natural pause point and haven't started TTS yet
  if (!this.ttsStarted && this.partialText.match(/^[\w\s]{10,}[,;:]/)) {
    this.ttsAdapter.speakPartial(this.partialText);
    this.ttsStarted = true;
  }
});
```

### Expected savings
- ~100-200ms (TTS starts before sentence complete)

### Checklist
- [ ] Identify safe speculation points (first clause)
- [ ] Implement partial TTS trigger
- [ ] Handle Claude direction changes gracefully
- [ ] A/B test to measure actual improvement

---

## Implementation Priority

| Optimization | Effort | Impact | Priority |
|-------------|--------|--------|----------|
| Pre-warm Claude connection | Low | ~50-100ms | 1 |
| Pre-fetch memories | Medium | ~100ms | 2 |
| Dynamic model routing | Medium | Quality + context | 3 |
| Cache common responses | Medium | ~500ms (10-20% of turns) | 4 |
| Parallel initialization | Low | ~50ms | 5 |
| Speculative TTS | High | ~100-200ms | 6 (future) |

---

## Expected Final Latency

| Stage | Current | After Optimizations |
|-------|---------|-------------------|
| Greeting | ~400ms | ~400ms (unchanged) |
| Normal response | ~600ms | ~400-450ms |
| Cache hit | ~600ms | ~100ms |
| Complex response (Sonnet) | N/A | ~800ms |

**Target achieved:** 300-450ms for most responses

---

## Files to Modify

| File | Changes |
|------|---------|
| `pipelines/v1-advanced.js` | Keep-alive agent, memory prefetch, model selection |
| `pipelines/response-cache.js` | New file for cached responses |
| `pipelines/quick-observer.js` | Add `modelRecommendation` output |
| `pipelines/fast-observer.js` | Add `modelRecommendation` output |
| `pipelines/observer-agent.js` | Add `modelRecommendation` output |
| `services/memory.js` | Add `getTopMemories()` method |

---

*Last updated: January 2026*
