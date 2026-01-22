# Donna Documentation

AI-powered senior companion assistant with voice calls.

## Current Version: v3.1 (Conversation Director)

## Documentation Index

### Architecture

- **[Architecture Overview](architecture/OVERVIEW.md)** - Complete system architecture with diagrams
- **[Conversation Director Spec](CONVERSATION_DIRECTOR_SPEC.md)** - Proactive call guidance system
- **[Architecture Details](ARCHITECTURE.md)** - Technical deep-dive

### Roadmap

- **[Next Steps](NEXT_STEPS.md)** - Roadmap and recently completed features

### Configuration

- **[Dynamic Token Routing](DYNAMIC_MODEL_ROUTING.md)** - Token selection based on context

### Historical Reference

- [Streaming Observer Spec](STREAMING_OBSERVER_SPEC.md) - Original streaming + 4-layer design
- [Module Reference](architecture/MODULES.md) - Future modular architecture

## Quick Reference

### Key Files

| Feature | File |
|---------|------|
| Main pipeline | `pipelines/v1-advanced.js` |
| Conversation Director | `pipelines/fast-observer.js` |
| Quick Observer | `pipelines/quick-observer.js` |
| Post-Turn Agent | `pipelines/post-turn-agent.js` |
| Post-Call Analysis | `services/call-analysis.js` |
| Token Selection | `v1-advanced.js` (selectModelConfig) |
| Admin Dashboard | `apps/admin/` (React) |
| Provider Abstractions | `providers/` |
| Context Cache | `services/context-cache.js` |

### Architecture Layers

| Layer | Name | Model | Latency |
|-------|------|-------|---------|
| 1 | Quick Observer | Regex | 0ms |
| 2 | Conversation Director | Gemini 3 Flash | ~150ms |
| 3 | Post-Turn Agent | Various | After response |
| Post-Call | Analysis | Gemini Flash | After call |

## External Resources

- [Twilio Docs](https://www.twilio.com/docs)
- [Anthropic Claude Docs](https://docs.anthropic.com)
- [Google AI Docs](https://ai.google.dev/docs)
- [Railway Docs](https://docs.railway.app)
- [Neon Database Docs](https://neon.tech/docs)
