# V0/V1 Parallel Pipeline Design

## Goal
Run both pipelines in parallel with a selector to choose which one to use per call.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Admin Dashboard                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Default Pipeline: [v0 - Gemini Native ▼]               │    │
│  │                    [v1 - Advanced (Claude + Observer)]   │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    /api/call Endpoint                            │
│                                                                  │
│  if (pipeline === 'v0') {                                       │
│    → GeminiLiveSession (current)                                │
│  } else if (pipeline === 'v1') {                                │
│    → AdvancedPipeline (new)                                     │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│   V0: GeminiLiveSession │     │   V1: AdvancedPipeline  │
│                         │     │                         │
│   Twilio Audio          │     │   Twilio Audio          │
│        ↓↑               │     │        ↓                │
│   Gemini 2.5 Native     │     │   Deepgram STT          │
│   (Audio in, Audio out) │     │        ↓                │
│                         │     │   Claude + Observer     │
│   Current: WORKING      │     │        ↓                │
│                         │     │   ElevenLabs TTS        │
│                         │     │        ↓                │
│                         │     │   Audio out to Twilio   │
└─────────────────────────┘     └─────────────────────────┘
```

## Implementation Plan

### Phase 1: Infrastructure (No breaking changes)

1. **Add pipeline config to database**
   - Add `defaultPipeline` column to settings or use env var
   - Options: 'v0' (default), 'v1'

2. **Update admin UI**
   - Add dropdown in header to select default pipeline
   - Show current pipeline on call trigger buttons

3. **Update /api/call endpoint**
   - Accept optional `pipeline` param
   - Default to configured pipeline

### Phase 2: V1 Pipeline Module

Create new files (don't modify existing):

```
/pipelines/
  v0-gemini.js          # Move GeminiLiveSession here (or import from current)
  v1-advanced.js        # New advanced pipeline
  observer-agent.js     # Observer Agent module

/adapters/
  elevenlabs.js         # ElevenLabs TTS adapter
  anthropic.js          # Claude adapter (if not using OpenAI)
```

### Phase 3: V1 Pipeline Components

**v1-advanced.js** orchestrates:
1. Receive Twilio audio → Deepgram STT
2. Transcription → Claude (with context + observer input)
3. Response → ElevenLabs TTS
4. Audio → back to Twilio

**observer-agent.js** runs in parallel:
- Analyzes each exchange
- Returns signals: engagement, emotion, reminder timing, concerns
- Feeds into Claude's next response

### Phase 4: Testing

- Test v0 still works (regression)
- Test v1 end-to-end
- Compare latency/quality

## File Changes

| File | Change |
|------|--------|
| `index.js` | Add pipeline routing logic |
| `public/admin.html` | Add pipeline dropdown |
| `pipelines/v1-advanced.js` | NEW - Advanced pipeline |
| `pipelines/observer-agent.js` | NEW - Observer agent |
| `adapters/elevenlabs.js` | NEW - TTS adapter |

## Environment Variables (New)

```
DEFAULT_PIPELINE=v0              # v0 or v1
ELEVENLABS_API_KEY=...          # For v1 TTS
ANTHROPIC_API_KEY=...           # For v1 Claude (optional, can use OpenAI)
```

## Risk Mitigation

1. **V0 stays untouched** - Only add new files, route at entry point
2. **Gradual rollout** - Default to v0, opt-in to v1
3. **Fallback** - If v1 fails, can manually switch back to v0

## Success Criteria

- [x] V0 continues working exactly as before
- [x] V1 can be selected from admin dropdown
- [x] V1 calls use Claude + Observer + ElevenLabs
- [ ] Observer signals visible in call logs (logs to console)
- [ ] No performance regression on v0 (needs testing)

## Implementation Status: COMPLETE (2026-01-18)

Files created:
- `pipelines/observer-agent.js` - Observer Agent module
- `pipelines/v1-advanced.js` - V1 Advanced Pipeline
- `adapters/elevenlabs.js` - ElevenLabs TTS adapter

Files modified:
- `index.js` - Pipeline routing logic
- `public/admin.html` - Pipeline selector dropdown
