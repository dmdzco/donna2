# V1 Pipeline Latency Optimization Plan

## Current State

```
User speaks → [Deepgram STT] → [Claude] → [ElevenLabs] → User hears
              ~200-400ms        ~600-1000ms   ~300-500ms

Total: 1.1 - 1.9 seconds (+ network overhead)
```

**Goal**: Reduce V1 latency from ~1.5s to <600ms

---

## Phase 1: Quick Wins (Expected: 1.5s → ~800ms)

### 1.1 Switch to Claude Haiku
**File**: `pipelines/v1-advanced.js`
```javascript
// Change from:
model: 'claude-sonnet-4-20250514',

// Change to:
model: 'claude-3-5-haiku-20241022',
max_tokens: 100,  // Reduce from 150
```

| Model | Latency | Quality |
|-------|---------|---------|
| Sonnet | ~800ms | Best |
| Haiku | ~250ms | Good |

**Saves**: 400-600ms

### 1.2 Tune Deepgram Endpointing
**File**: `pipelines/v1-advanced.js`
```javascript
// Change from:
endpointing: 500,
utterance_end_ms: 1000,

// Change to:
endpointing: 300,
utterance_end_ms: 600,
```

**Saves**: 200-400ms
**Trade-off**: May cut off slow speakers

### 1.3 Use ElevenLabs Streaming TTS
**File**: `pipelines/v1-advanced.js`
```javascript
// Change from:
async textToSpeechAndSend(text) {
  const pcmBuffer = await this.tts.textToSpeech(text);
  const mulawBuffer = pcm24kToMulaw8k(pcmBuffer);
  // Send all at once...
}

// Change to:
async textToSpeechAndSend(text) {
  await this.tts.textToSpeechStream(text, (chunk) => {
    const mulawChunk = pcm24kToMulaw8k(chunk);
    if (this.twilioWs.readyState === 1) {
      this.twilioWs.send(JSON.stringify({
        event: 'media',
        streamSid: this.streamSid,
        media: { payload: mulawChunk.toString('base64') }
      }));
    }
  });
}
```

**Saves**: 200-300ms

---

## Phase 2: Streaming Pipeline (Expected: ~800ms → ~500ms)

### 2.1 Stream Claude Responses
**File**: `pipelines/v1-advanced.js`
```javascript
async generateAndSendResponse(userMessage) {
  const stream = await anthropic.messages.stream({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 100,
    system: systemPrompt,
    messages,
  });

  let buffer = '';
  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      buffer += event.delta.text;

      // Start TTS when we hit sentence end
      const sentenceMatch = buffer.match(/^(.+?[.!?])\s*/);
      if (sentenceMatch) {
        this.streamTTS(sentenceMatch[1]);  // Don't await!
        buffer = buffer.slice(sentenceMatch[0].length);
      }
    }
  }

  // Handle remaining buffer
  if (buffer.trim()) {
    await this.streamTTS(buffer);
  }
}
```

**Saves**: 300-500ms (TTS starts while LLM still generating)

### 2.2 WebSocket to ElevenLabs
**File**: `adapters/elevenlabs.js`
```javascript
// Add WebSocket streaming method
async connectWebSocket() {
  this.ws = new WebSocket(
    `wss://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream-input?model_id=eleven_turbo_v2_5`
  );

  this.ws.on('open', () => {
    this.ws.send(JSON.stringify({
      text: ' ',  // Prime the connection
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      xi_api_key: this.apiKey,
    }));
  });
}

sendTextChunk(text) {
  if (this.ws?.readyState === 1) {
    this.ws.send(JSON.stringify({ text }));
  }
}

onAudioChunk(callback) {
  this.ws.on('message', (data) => {
    callback(Buffer.from(data));
  });
}
```

**Saves**: 100-200ms (eliminates HTTP overhead)

### 2.3 Parallel Observer (Non-blocking)
**File**: `pipelines/v1-advanced.js`
```javascript
// Change from:
this.observerCheckInterval = setInterval(() => this.runObserver(), 30000);

// Change to:
this.observerCheckInterval = setInterval(() => {
  // Fire and forget - never block conversation
  this.runObserver().catch(e => console.error('Observer error:', e));
}, 30000);
```

---

## Phase 3: Alternative Providers (Expected: ~500ms → ~350ms)

### 3.1 Cartesia TTS (Fastest)
**New file**: `adapters/cartesia.js`
```javascript
const CARTESIA_API_URL = 'https://api.cartesia.ai/tts/bytes';

export class CartesiaAdapter {
  constructor(apiKey = process.env.CARTESIA_API_KEY) {
    this.apiKey = apiKey;
    this.voiceId = 'a0e99841-438c-4a64-b679-ae501e7d6091'; // Warm female
  }

  async textToSpeech(text) {
    const response = await fetch(CARTESIA_API_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': this.apiKey,
        'Cartesia-Version': '2024-06-10',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: 'sonic-english',
        transcript: text,
        voice: { mode: 'id', id: this.voiceId },
        output_format: {
          container: 'raw',
          encoding: 'pcm_mulaw',
          sample_rate: 8000
        },
      }),
    });

    return Buffer.from(await response.arrayBuffer());
  }
}
```

**Latency**: ~50-100ms (vs ElevenLabs ~300-500ms)
**Trade-off**: Different voice options

### 3.2 Deepgram TTS (Same Provider)
**New file**: `adapters/deepgram-tts.js`
```javascript
export class DeepgramTTSAdapter {
  constructor(apiKey = process.env.DEEPGRAM_API_KEY) {
    this.apiKey = apiKey;
    this.model = 'aura-asteria-en'; // Warm female
  }

  async textToSpeech(text) {
    const response = await fetch(
      `https://api.deepgram.com/v1/speak?model=${this.model}&encoding=mulaw&sample_rate=8000`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      }
    );

    return Buffer.from(await response.arrayBuffer());
  }
}
```

**Latency**: ~100-200ms
**Benefit**: Already have Deepgram, no new API key needed

### 3.3 Gemini Flash (Text Mode) Instead of Claude
**File**: `pipelines/v1-advanced.js`
```javascript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const geminiModel = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash-exp',
  generationConfig: { maxOutputTokens: 100 }
});

async generateResponse(messages, systemPrompt) {
  const chat = geminiModel.startChat({
    history: messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    })),
    systemInstruction: systemPrompt,
  });

  const result = await chat.sendMessage(messages.at(-1).content);
  return result.response.text();
}
```

**Latency**: ~200-400ms (faster than Claude Haiku)
**Trade-off**: Different personality, may need prompt tuning

---

## Phase 4: Advanced Optimizations

### 4.1 Speculative Execution
```javascript
// Pre-generate likely responses while user is speaking
async onInterimTranscript(partial) {
  if (partial.length > 20 && !this.speculativePromise) {
    this.speculativePromise = this.generateResponse(partial);
    this.speculativeInput = partial;
  }
}

async onFinalTranscript(final) {
  if (this.speculativePromise &&
      this.similarity(this.speculativeInput, final) > 0.85) {
    return await this.speculativePromise;
  }
  return await this.generateResponse(final);
}

similarity(a, b) {
  const wordsA = a.toLowerCase().split(/\s+/);
  const wordsB = b.toLowerCase().split(/\s+/);
  const common = wordsA.filter(w => wordsB.includes(w)).length;
  return common / Math.max(wordsA.length, wordsB.length);
}
```

**Saves**: 200-400ms in best case
**Trade-off**: Wasted API calls if speculation wrong (~30% of time)

### 4.2 Filler Words (Immediate Feedback)
```javascript
const FILLERS = [
  "Mmhmm...",
  "I see...",
  "Oh...",
  "Right...",
];

async processUserUtterance(text) {
  // Send immediate filler
  const filler = FILLERS[Math.floor(Math.random() * FILLERS.length)];
  this.sendPrerecordedAudio(filler);  // Pre-cached audio

  // Then generate full response
  const response = await this.generateResponse(text);
  this.textToSpeechAndSend(response);
}
```

**Perceived latency**: Near-instant acknowledgment
**Trade-off**: May feel unnatural if overused

### 4.3 Response Caching
```javascript
// Cache common responses
const RESPONSE_CACHE = new Map();

async generateResponse(input) {
  const cacheKey = this.normalizeInput(input);

  if (RESPONSE_CACHE.has(cacheKey)) {
    return RESPONSE_CACHE.get(cacheKey);
  }

  const response = await this.callLLM(input);

  // Cache greetings, goodbyes, simple acknowledgments
  if (this.isCacheable(input)) {
    RESPONSE_CACHE.set(cacheKey, response);
  }

  return response;
}
```

### 4.4 Warm Connections
```javascript
// Keep API connections warm
class ConnectionPool {
  constructor() {
    this.anthropic = new Anthropic();
    this.elevenLabsWs = null;
    this.warmupInterval = null;
  }

  async warmup() {
    // Periodic ping to keep connections alive
    this.warmupInterval = setInterval(async () => {
      await this.anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }]
      }).catch(() => {});
    }, 30000);
  }
}
```

---

## Latency Comparison Summary

| Configuration | STT | LLM | TTS | Total |
|--------------|-----|-----|-----|-------|
| **Current V1** | 400ms | 800ms | 400ms | **~1.6s** |
| **Phase 1** (Haiku + tuned DG + stream) | 300ms | 300ms | 200ms | **~800ms** |
| **Phase 2** (Full streaming) | 250ms | 200ms* | 150ms* | **~500ms** |
| **Phase 3** (Cartesia + Gemini) | 250ms | 250ms | 80ms | **~400ms** |
| **V0 (Gemini Native)** | - | - | - | **~500ms** |

*Overlapped with streaming

---

## Implementation Checklist

### Phase 1: Quick Wins
- [ ] Switch Claude Sonnet → Haiku
- [ ] Reduce max_tokens to 100
- [ ] Tune Deepgram endpointing (300ms)
- [ ] Implement streaming TTS
- [ ] Test end-to-end latency

### Phase 2: Streaming Pipeline
- [ ] Implement Claude streaming
- [ ] Sentence detection for early TTS
- [ ] ElevenLabs WebSocket connection
- [ ] Make Observer non-blocking
- [ ] Benchmark improvements

### Phase 3: Alternative Providers
- [ ] Create Cartesia adapter
- [ ] Create Deepgram TTS adapter
- [ ] Test Gemini Flash text mode
- [ ] Compare voice quality vs latency
- [ ] Choose optimal combination

### Phase 4: Advanced
- [ ] Implement speculative execution
- [ ] Add filler word support
- [ ] Response caching for common phrases
- [ ] Connection warmup/pooling

---

## Environment Variables (New)

```bash
# Phase 3 alternatives
CARTESIA_API_KEY=...           # If using Cartesia TTS

# Configuration
V1_LLM_MODEL=haiku             # haiku, sonnet, or gemini
V1_TTS_PROVIDER=elevenlabs     # elevenlabs, cartesia, or deepgram
V1_DEEPGRAM_ENDPOINTING=300    # ms
```

---

## Risk Mitigation

1. **Quality regression**: A/B test with real users before switching
2. **Cut-off speech**: Add configurable endpointing per senior (slow speakers)
3. **Voice quality**: Keep ElevenLabs as option even if slower
4. **Streaming bugs**: Graceful fallback to non-streaming

---

*Created: January 18, 2026*
