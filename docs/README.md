# Donna Documentation

AI-powered senior companion assistant with voice calls.

## Current Version: v3.1 (Conversation Director)

## Documentation Index

### Architecture

- **[Architecture Overview](architecture/OVERVIEW.md)** - Complete system architecture with diagrams
- **[Architecture Details](ARCHITECTURE.md)** - Technical deep-dive with layer details
- **[Conversation Director Spec](CONVERSATION_DIRECTOR_SPEC.md)** - Proactive call guidance system

### Roadmap & Planning

- **[Next Steps](NEXT_STEPS.md)** - Roadmap and recently completed features
- **[Product Plan](PRODUCT_PLAN.md)** - Full feature list with status
- **[Latency Optimization](LATENCY_OPTIMIZATION_PLAN.md)** - Performance improvements

### Configuration & Deployment

- **[Dynamic Token Routing](DYNAMIC_MODEL_ROUTING.md)** - Token selection based on context
- **[Deployment Guide](guides/DEPLOYMENT_PLAN.md)** - Railway deployment instructions

### Design Documents

- **[plans/](plans/)** - Historical design documents for major features

### Historical Reference

- [Streaming Observer Spec](STREAMING_OBSERVER_SPEC.md) - Original streaming + 4-layer design (superseded)
- [Module Reference](architecture/MODULES.md) - Proposed modular architecture (not implemented)

## Quick Reference

### Key Files

| Feature | File |
|---------|------|
| Main pipeline | `pipelines/v1-advanced.js` |
| Conversation Director | `pipelines/fast-observer.js` |
| Quick Observer | `pipelines/quick-observer.js` |
| Post-Call Analysis | `services/call-analysis.js` |
| Token Selection | `v1-advanced.js` (selectModelConfig) |
| Admin Dashboard | `apps/admin/` (React) |
| Provider Abstractions | `providers/` |
| Context Cache | `services/context-cache.js` |
| Memory System | `services/memory.js` |
| Scheduler | `services/scheduler.js` |

### Architecture Layers

| Layer | Name | Model | Latency |
|-------|------|-------|---------|
| 1 | Quick Observer | Regex (730+ patterns) | 0ms |
| 2 | Conversation Director | Gemini 3 Flash | ~150ms |
| Post-Call | Analysis + Memory | Gemini Flash + GPT-4o-mini | After call |

### Tech Stack

| Component | Technology |
|-----------|------------|
| Voice AI | Claude Sonnet 4.5 (streaming) |
| Director | Gemini 3 Flash |
| TTS | ElevenLabs WebSocket |
| STT | Deepgram Nova 2 |
| Database | Neon PostgreSQL + pgvector |
| Hosting | Railway |

## External Resources

- [Twilio Docs](https://www.twilio.com/docs)
- [Anthropic Claude Docs](https://docs.anthropic.com)
- [Google AI Docs](https://ai.google.dev/docs)
- [ElevenLabs Docs](https://elevenlabs.io/docs)
- [Deepgram Docs](https://developers.deepgram.com)
- [Railway Docs](https://docs.railway.app)
- [Neon Database Docs](https://neon.tech/docs)

---

*Last updated: January 2026 - v3.1*
