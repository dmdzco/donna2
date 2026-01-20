# Donna V1 Pipeline: Streaming + Multi-Layer Observer Architecture

> **Use this as context for Claude CLI or any AI assistant implementing this feature.**

## Overview

Implement a low-latency voice AI pipeline for Donna, an AI companion for elderly users. Target: ~400ms time-to-first-audio while enabling deep conversation analysis and tool use.

## Current Problem

The V1 pipeline (`pipelines/v1-advanced.js`) has ~1.5s latency because everything is blocking:
1. Wait for full Claude response (~800ms)
2. Wait for full ElevenLabs TTS audio (~400ms)
3. Observer/memory results arrive AFTER response, only affecting NEXT turn

## Solution: Two Key Changes

### 1. STREAMING PIPELINE (Biggest latency win)

Replace blocking calls with streaming:

```
BEFORE (Blocking):
User → [wait 800ms for full Claude] → [wait 400ms for full TTS] → User hears (1400ms)

AFTER (Streaming):
User → Claude streams tokens → Buffer sentences → TTS streams audio → User hears (400ms)
```

**Implementation:**

```javascript
// Change from:
const response = await anthropic.messages.create({ ... });
const audio = await tts.textToSpeech(response.text);

// To:
const stream = await anthropic.messages.stream({ ... });
for await (const event of stream) {
  if (event.type === 'content_block_delta') {
    sentenceBuffer += event.delta.text;
    if (isCompleteSentence(sentenceBuffer)) {
      tts.streamText(sentenceBuffer);  // ElevenLabs WebSocket
      sentenceBuffer = '';
    }
  }
}
```

**ElevenLabs WebSocket streaming** sends text chunks and receives audio chunks in real-time:
- URL: `wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input?model_id=eleven_turbo_v2_5`
- Send: `{ text: "Hello," }` → Receive: audio chunk → Send to Twilio immediately
- Optimized `chunk_length_schedule: [120, 160, 250, 290]` for low latency

### 2. MULTI-LAYER OBSERVER (Deep thinking without blocking)

Four layers running at different times:

```
User speaks: "My daughter visited yesterday"
                    │
    ┌───────────────┼───────────────┬───────────────┐
    ▼               ▼               ▼               ▼
 LAYER 1         LAYER 2         LAYER 3         LAYER 4
 INSTANT         FAST            DEEP            POST-TURN
 (0ms)           (~300ms)        (~1s)           (after response)
    │               │               │               │
    ▼               ▼               ▼               ▼
 Affects         Cache for       Cache for       Background
 CURRENT turn    next turn       next turn       processing
```

**Layer 1: Instant (0ms)** - Regex patterns, affects CURRENT response
```javascript
// pipelines/quick-observer.js
export function quickAnalyze(userText, conversationLog) {
  const signals = {
    healthMentioned: /\b(dizzy|pain|tired|doctor|medicine|fell)\b/i.test(userText),
    familyMentioned: /\b(daughter|son|grandchild|family)\b/i.test(userText),
    negativeEmotion: /\b(lonely|sad|worried|scared)\b/i.test(userText),
    positiveEmotion: /\b(happy|great|wonderful|excited)\b/i.test(userText),
    askedQuestion: userText.includes('?'),
    shortResponse: userText.split(/\s+/).length < 4,
    timeReference: /\b(yesterday|last week|remember|before)\b/i.test(userText),
  };

  let guidance = '';
  if (signals.healthMentioned) guidance += '\n- Health mentioned: respond with care';
  if (signals.negativeEmotion) guidance += '\n- Be extra warm and supportive';
  if (signals.shortResponse && conversationLog.length > 4) {
    guidance += '\n- Short response: try to re-engage with a question';
  }
  if (signals.askedQuestion) guidance += '\n- Answer their question directly';

  return { signals, guidance };
}
```

**Layer 2: Fast (~300ms)** - Haiku + parallel tools, may inject if ready
```javascript
// pipelines/fast-observer.js
export async function fastAnalyzeWithTools(userText, seniorId, conversationLog) {
  const [sentiment, memories, webSearch] = await Promise.all([
    analyzeWithHaiku(userText),           // ~100ms
    memoryService.search(seniorId, userText, 3, 0.65),  // ~100ms
    shouldSearchWeb(userText) ? webSearch(userText) : null
  ]);
  return { sentiment, memories, webSearch };
}

function shouldSearchWeb(text) {
  return /\b(news|weather|what's happening|today|current)\b/i.test(text);
}
```

**Layer 3: Deep (~1s)** - Current Sonnet observer, runs in background, results for next turn

**Layer 4: Post-Turn** - After response sent, run complex tool chains
```javascript
// pipelines/post-turn-agent.js
async function postTurnExecution(userText, seniorId, quickSignals) {
  // Non-blocking, runs after user gets response
  if (quickSignals.healthMentioned) {
    await extractHealthConcern(userText, seniorId);
  }
  if (detectsFutureTopic(userText)) {
    await prefetchContext(topic, seniorId);
  }
}
```

## Key Principle: NEVER BLOCK FOR TOOLS

```
WRONG:  User → wait for tools → generate response → TTS (adds 500ms+)
RIGHT:  User → generate with cached context → TTS
        Background: run tools → cache for next turn
BETTER: User → start tools in parallel → generate response
        If tools finish in time, inject. If not, use next turn.
```

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `adapters/elevenlabs-streaming.js` | WebSocket TTS adapter |
| `pipelines/quick-observer.js` | Layer 1 regex patterns |
| `pipelines/fast-observer.js` | Layer 2 Haiku + parallel tools |
| `pipelines/post-turn-agent.js` | Layer 4 background execution |
| `pipelines/v1-advanced.js` | Modify to use streaming + layers |

## Complete Streaming Pipeline Example

```javascript
// pipelines/v1-streaming.js
import Anthropic from '@anthropic-ai/sdk';
import { ElevenLabsStreamingTTS } from '../adapters/elevenlabs-streaming.js';
import { quickAnalyze } from './quick-observer.js';
import { fastAnalyzeWithTools } from './fast-observer.js';
import { pcm24kToMulaw8k } from '../audio-utils.js';

const anthropic = new Anthropic();

export class V1StreamingSession {
  constructor(twilioWs, streamSid, senior, memoryContext) {
    this.twilioWs = twilioWs;
    this.streamSid = streamSid;
    this.senior = senior;
    this.memoryContext = memoryContext;
    this.conversationLog = [];
    this.cachedToolResults = null;

    this.tts = new ElevenLabsStreamingTTS();
    this.tts.onAudioChunk = (pcmChunk) => {
      const mulawChunk = pcm24kToMulaw8k(pcmChunk);
      this.sendToTwilio(mulawChunk);
    };
  }

  async processUserUtterance(text) {
    this.conversationLog.push({ role: 'user', content: text });

    // Layer 1: Instant analysis (0ms)
    const { signals, guidance } = quickAnalyze(text, this.conversationLog);

    // Layer 2: Start parallel tools (don't await yet)
    const toolsPromise = fastAnalyzeWithTools(text, this.senior?.id, this.conversationLog);

    // Connect TTS WebSocket
    await this.tts.connect();

    // Build system prompt with Layer 1 guidance + cached Layer 2/3 results
    const systemPrompt = this.buildSystemPrompt(guidance, this.cachedToolResults);

    // Stream LLM response directly to TTS
    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      system: systemPrompt,
      messages: this.conversationLog.slice(-20),
    });

    let fullResponse = '';
    let sentenceBuffer = '';

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const chunk = event.delta.text;
        fullResponse += chunk;
        sentenceBuffer += chunk;

        // Stream complete phrases to TTS immediately
        if (this.shouldFlushToTTS(sentenceBuffer)) {
          this.tts.streamText(sentenceBuffer);
          sentenceBuffer = '';
        }
      }
    }

    // Flush remaining text
    if (sentenceBuffer) {
      this.tts.streamText(sentenceBuffer);
    }
    this.tts.flush();

    // Log response
    this.conversationLog.push({ role: 'assistant', content: fullResponse });

    // Layer 2 finished in background - cache for next turn
    this.cachedToolResults = await toolsPromise;

    // Layer 4: Post-turn execution (non-blocking)
    this.runPostTurnExecution(text, signals);
  }

  shouldFlushToTTS(text) {
    return /[.!?,;:]$/.test(text) || text.split(' ').length >= 6;
  }

  buildSystemPrompt(guidance, cachedTools) {
    let prompt = `You are Donna, a warm AI companion for elderly individuals.
Keep responses SHORT (1-2 sentences) - this is a phone call.`;

    if (this.senior?.name) prompt += `\n\nSpeaking with ${this.senior.name}.`;
    if (this.memoryContext) prompt += `\n\n${this.memoryContext}`;
    if (guidance) prompt += `\n\n[GUIDANCE]${guidance}`;
    if (cachedTools?.memories?.length) {
      prompt += `\n\n[RELEVANT MEMORIES]\n${cachedTools.memories.map(m => `- ${m.content}`).join('\n')}`;
    }
    return prompt;
  }

  sendToTwilio(mulawBuffer) {
    if (this.twilioWs.readyState === 1) {
      this.twilioWs.send(JSON.stringify({
        event: 'media',
        streamSid: this.streamSid,
        media: { payload: mulawBuffer.toString('base64') }
      }));
    }
  }

  async runPostTurnExecution(text, signals) {
    // Fire and forget - don't block
    if (signals.healthMentioned && this.senior?.id) {
      // Log health concern for caregiver
      console.log(`[CONCERN] Health mentioned: "${text}"`);
    }
  }
}
```

## ElevenLabs Streaming Adapter

```javascript
// adapters/elevenlabs-streaming.js
import WebSocket from 'ws';

export class ElevenLabsStreamingTTS {
  constructor(voiceId = 'EXAVITQu4vr4xnSDxMaL') {
    this.voiceId = voiceId;
    this.ws = null;
    this.onAudioChunk = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const url = `wss://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream-input?model_id=eleven_turbo_v2_5`;

      this.ws = new WebSocket(url, {
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }
      });

      this.ws.on('open', () => {
        this.ws.send(JSON.stringify({
          text: ' ',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          generation_config: { chunk_length_schedule: [120, 160, 250, 290] }
        }));
        resolve();
      });

      this.ws.on('message', (data) => {
        const msg = JSON.parse(data);
        if (msg.audio && this.onAudioChunk) {
          this.onAudioChunk(Buffer.from(msg.audio, 'base64'));
        }
      });

      this.ws.on('error', reject);
    });
  }

  streamText(text) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ text }));
    }
  }

  flush() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ text: '' }));
    }
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
```

## Latency Budget

| Component | Target |
|-----------|--------|
| Layer 1 (regex) | 0ms |
| Claude first token | 200ms |
| TTS first audio | 150ms |
| **Total time-to-first-audio** | **~400ms** |

## Integration Point

Modify `processUserUtterance()` in `pipelines/v1-advanced.js`:

1. Run Layer 1 `quickAnalyze()` synchronously (0ms)
2. Start Layer 2 `fastAnalyzeWithTools()` in parallel (don't await)
3. Start Claude streaming with Layer 1 guidance
4. Stream Claude tokens → sentence buffer → TTS WebSocket → Twilio
5. After response: await Layer 2, cache results, run Layer 4

## Alternative: Cartesia TTS (Fastest)

For absolute minimum latency (~50ms), consider Cartesia:

```javascript
import Cartesia from '@cartesia/cartesia-js';
const cartesia = new Cartesia({ apiKey: process.env.CARTESIA_API_KEY });

const response = await cartesia.tts.stream({
  model_id: 'sonic-english',
  voice: { mode: 'id', id: 'a0e99841-438c-4a64-b679-ae501e7d6091' },
  transcript: text,
  output_format: { container: 'raw', encoding: 'pcm_mulaw', sample_rate: 8000 }
});

for await (const chunk of response) {
  sendToTwilio(chunk);  // Already in mulaw format!
}
```

| TTS Provider | Latency | Quality |
|--------------|---------|---------|
| ElevenLabs REST | 400ms | Excellent |
| ElevenLabs WebSocket | 150ms | Excellent |
| Cartesia | 50ms | Very Good |
| Deepgram TTS | 100ms | Good |

---

*Copy this entire file as context for Claude CLI to implement the streaming + multi-layer observer architecture.*
