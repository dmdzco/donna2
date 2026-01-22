# Latency Optimization Plan

## Current State (January 2026)

**Achieved:**
- ✅ Pre-built greeting (skips Claude for first response)
- ✅ Claude streaming (sentence-by-sentence delivery)
- ✅ ElevenLabs WebSocket TTS (pre-connected)
- ✅ Deepgram STT (real-time, 500ms endpointing)
- ✅ Dynamic token routing (100-400 based on context)
- ✅ Conversation Director in parallel (~150ms)
- ✅ Sentence buffering with `<guidance>` tag stripping
- ✅ Barge-in support (interrupt detection)

**Current latency:** ~400-500ms time-to-first-audio (after greeting)

**Target achieved:** ✓ 300-500ms range

---

## Optimization 1: Pre-warm Claude Connection

### Status: DEFERRED

HTTP keep-alive provides marginal improvement (~50-100ms) compared to the gains already achieved with streaming. The Anthropic SDK handles connection management internally.

**Expected savings:** ~50-100ms per subsequent utterance
**Priority:** Low - streaming achieved bigger wins

---

## Optimization 2: Pre-fetch Senior Memories

### Status: ✅ IMPLEMENTED

Memories are now pre-fetched when calls start, especially for reminder calls.

**Implementation:**
- `services/scheduler.js` - `prefetchForPhone()` builds context before Twilio call
- `services/memory.js` - `buildContext()` fetches critical + recent + important memories
- `services/memory.js` - `getCritical()`, `getImportant()`, `getRecent()` methods
- Memory context injected into system prompt via `buildSystemPrompt()`

**Features implemented:**
- ✅ Pre-fetch on call start (parallel with greeting)
- ✅ Tiered memory injection (critical → contextual → background)
- ✅ Memory decay (30-day half-life)
- ✅ Recent access boost (+10 importance if accessed in last week)
- ✅ Deduplication (cosine > 0.9 blocks duplicate storage)

**Savings achieved:** ~100ms per turn (memories already in context)

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

## Optimization 4: Dynamic Token Routing

### Status: ✅ IMPLEMENTED

Token count is now dynamically selected based on conversation context.

**Implementation:**
- `pipelines/v1-advanced.js` - `selectModelConfig()` function
- `pipelines/quick-observer.js` - `modelRecommendation` output with severity-based tokens
- `pipelines/fast-observer.js` - `model_recommendation` in Director output

**Token selection logic:**
1. Director provides base `max_tokens` (100-400) based on call phase, emotion, engagement
2. Quick Observer can escalate for urgent signals (health, safety)
3. Final = `Math.max(director_tokens, quick_observer_tokens)`

**Token ranges by situation:**
| Situation | Tokens | Source |
|-----------|--------|--------|
| Normal | 100 | Default |
| Health mention | 150-180 | Quick Observer |
| Safety (high) | 200 | Quick Observer |
| Emotional support | 200-250 | Director |
| Low engagement | 200 | Director |
| Reminder delivery | 150 | Director |
| Call closing | 150 | Director |

**Model:** Single model (Claude Sonnet 4.5) - simplified from Haiku/Sonnet switching

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

## Implementation Status Summary

| Optimization | Status | Impact |
|-------------|--------|--------|
| Pre-built greeting | ✅ Done | Instant first response |
| Claude streaming | ✅ Done | ~200-300ms first token |
| ElevenLabs WebSocket | ✅ Done | ~100-150ms TTS |
| Sentence buffering | ✅ Done | Natural speech flow |
| Pre-fetch memories | ✅ Done | ~100ms saved |
| Dynamic token routing | ✅ Done | Right-sized responses |
| Conversation Director | ✅ Done | Quality + guidance |
| Pre-warm Claude | Deferred | Marginal gains |
| Cache common responses | Deferred | Complexity vs gain |
| Speculative TTS | Future | Requires careful design |

---

## Current Latency Achieved

| Stage | Latency | Notes |
|-------|---------|-------|
| Greeting | ~100ms | Pre-generated, cached |
| Normal response | ~400-500ms | After user stops |
| First turn (after greeting) | ~400ms | Claude streaming |
| Emotional response | ~500-600ms | More tokens (200-250) |
| Extended response | ~700-800ms | 300-400 tokens |

**Target achieved:** ✓ 400-500ms for most responses

---

## Files Implementing Optimizations

| File | Optimizations |
|------|---------------|
| `pipelines/v1-advanced.js` | Streaming, sentence buffer, barge-in, model selection |
| `pipelines/quick-observer.js` | Regex patterns, token recommendations |
| `pipelines/fast-observer.js` | Conversation Director, guidance, tokens |
| `adapters/elevenlabs-streaming.js` | WebSocket TTS |
| `services/memory.js` | Pre-fetch, decay, tiered injection |
| `services/scheduler.js` | Context pre-fetch for reminder calls |

---

## Future Optimizations

### Prompt Caching (Anthropic)
Cache static system prompt parts for 90% cost savings on input tokens.
- Add `cache_control: { type: "ephemeral" }` to static content blocks
- Estimated savings: ~$0.04/call → ~$1.20/mo per senior

### Alternative TTS Providers
| Provider | Latency | Quality | Status |
|----------|---------|---------|--------|
| ElevenLabs WS | ~150ms | Excellent | Current |
| Cartesia | ~50ms | Very Good | Future test |
| Deepgram TTS | ~100ms | Good | Future test |

---

*Last updated: January 2026 - v3.1*
