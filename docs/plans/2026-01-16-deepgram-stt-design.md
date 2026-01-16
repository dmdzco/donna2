# Deepgram STT Integration Design

> **Status:** Approved
> **Date:** 2026-01-16
> **Goal:** Enable mid-conversation memory retrieval by adding Deepgram for user speech transcription

---

## Problem

Gemini's `inputAudioTranscription` is broken (SDK bug), blocking the memory trigger system that's already coded in `gemini-live.js`. Without user speech text, we can't:
- Detect memory triggers mid-call
- Search for relevant memories
- Inject context into Gemini for richer conversations

## Solution

Add Deepgram as a parallel STT service. Fork Twilio audio to both Gemini (for AI responses) and Deepgram (for transcription).

---

## Architecture

```
Twilio Audio (mulaw 8kHz)
        │
        ▼
┌─────────────────────────────────────────┐
│         GeminiLiveSession               │
│                                         │
│   sendAudio(base64Mulaw)                │
│         │                               │
│         ├──► Gemini (convert to PCM)    │
│         │         └──► AI responses     │
│         │                               │
│         └──► Deepgram (mulaw direct)    │
│                   └──► User text        │
│                          │              │
│                          ▼              │
│               checkForRelevantMemories()│
│                          │              │
│                          ▼              │
│               memoryService.search()    │
│                          │              │
│                          ▼              │
│               Inject into Gemini context│
│                                         │
└─────────────────────────────────────────┘
```

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Audio format for Deepgram | Mulaw direct (no conversion) | Simpler, less CPU. Deepgram nova-2 handles mulaw natively. |
| Where Deepgram lives | Inside `GeminiLiveSession` | Co-locates transcription with memory triggers. Single class owns session. |
| On Deepgram failure | Log and continue | Graceful degradation. Call continues, just no mid-call memory retrieval. |
| Interim results | Disabled (`interim_results: false`) | Only need final utterances for memory triggers. |

---

## Transcription & Memory Trigger Flow

```
Deepgram transcript arrives
        │
        ▼
   Is it final? ──No──► Ignore (don't act on partials)
        │
       Yes
        │
        ▼
   Log to conversationLog[]
        │
        ▼
   Check MEMORY_TRIGGERS regex
   (remember, doctor, daughter, family, etc.)
        │
        ▼
   Cooldown passed? (20s) ──No──► Skip search
        │
       Yes
        │
        ▼
   memoryService.search(seniorId, utterance)
        │
        ▼
   Filter already-injected memories (injectedMemoryIds Set)
        │
        ▼
   Inject via Gemini sendClientContent():
   "[Context from previous conversations: {memories}]"
   (turnComplete: false - don't interrupt)
```

---

## Mid-Call Memory Enrichment Example

**User says:** "My daughter Sarah visited yesterday"

**Memory search returns:**
- "Sarah is Margaret's daughter, lives in Boston"
- "Sarah has two kids: Emma (8) and Jack (5)"

**Injected context:**
```
[Context from previous conversations: Sarah is Margaret's
daughter from Boston. Has kids Emma (8) and Jack (5).]
```

**Gemini's enriched response:**
> "Oh wonderful! Did Emma and Jack come too? I remember you said Emma just turned 8!"

**Without this (current broken state):**
> "Oh that's nice. How was the visit?"

---

## Implementation Changes

### 1. Dependencies

```json
// package.json
"@deepgram/sdk": "^3.0.0"
```

### 2. Environment Variable

```bash
DEEPGRAM_API_KEY=your_key_here
```

### 3. `gemini-live.js` Changes

| Location | Change |
|----------|--------|
| Imports | Add `import { createClient } from '@deepgram/sdk'` |
| Constructor | Add `this.deepgram = null`, `this.dgConnection = null` |
| `connect()` | After Gemini connects, initialize Deepgram connection |
| `connect()` | Set up Deepgram event handlers |
| `sendAudio()` | Add: send raw mulaw to Deepgram (if connected) |
| `close()` | Add: close Deepgram connection |

### 4. Deepgram Connection Config

```javascript
this.dgConnection = this.deepgram.listen.live({
  model: 'nova-2',
  language: 'en-US',
  encoding: 'mulaw',
  sample_rate: 8000,
  channels: 1,
  punctuate: true,
  interim_results: false,
});
```

### 5. Deepgram Event Handlers

| Event | Action |
|-------|--------|
| `open` | Log "Deepgram connected" |
| `transcript` | If final, log to conversationLog, call `checkForRelevantMemories(text)` |
| `error` | Log error, set `this.dgConnection = null` |
| `close` | Log, set `this.dgConnection = null` |

---

## Testing Plan

### Manual Test

1. Set `DEEPGRAM_API_KEY` in environment
2. Start the server
3. Create a senior with memories about family
4. Call the senior's number
5. Say: "My daughter Sarah visited yesterday"
6. **Expected:** Donna responds with context about Sarah

### Log Verification

```
[streamSid] Deepgram connected
[streamSid] User (Deepgram): "My daughter Sarah visited yesterday"
[streamSid] Memory trigger detected: "daughter visited"
[streamSid] Injecting 2 memories
```

### Failure Scenarios

- Missing `DEEPGRAM_API_KEY` → Server starts with warning, calls work without STT
- Deepgram disconnects mid-call → Call continues, logged, no crash

---

*Design approved: 2026-01-16*
