# Donna Documentation

AI-powered senior companion assistant with voice calls.

## Current Version: v4.0 (Pipecat Migration + Conversation Director)

## Task Tracking

**[Todo Dashboard](todos/_dashboard.md)** - Single source of truth for all tasks

| Domain | Link | Description |
|--------|------|-------------|
| Dashboard | [_dashboard.md](todos/_dashboard.md) | Progress overview, priority queue |
| Security | [security.md](todos/security.md) | Infrastructure hardening by priority tier |
| Architecture | [architecture.md](todos/architecture.md) | 7 cleanup phases with dependencies |
| Product | [product.md](todos/product.md) | Features by category (planned + suggested) |

---

## Documentation Index

### Architecture

- **[Pipecat Architecture](../pipecat/docs/ARCHITECTURE.md)** — Authoritative pipeline reference (directory structure, tech stack, all components)
- **[Architecture Overview](architecture/OVERVIEW.md)** — High-level system architecture with diagrams
- **[Conversation Director Spec](CONVERSATION_DIRECTOR_SPEC.md)** — Detailed Director specification with examples

### Product Reference

- **[Product Plan](PRODUCT_PLAN.md)** — Feature descriptions, architecture diagrams, business model

### Migration

- **[Pipecat Migration Plan (Reviewed)](plans/2026-02-05-pipecat-migration-REVIEWED.md)** — Authoritative migration plan with 18 critical corrections
- **[Donna on Pipecat](DONNA_ON_PIPECAT.md)** — Pipecat migration architecture mapping
- **[Voice AI Framework Analysis](VOICE_AI_FRAMEWORK_ANALYSIS.md)** — Pipecat vs LiveKit comparison + architectural gap analysis
- **[Architecture Assessment](ARCHITECTURE_ASSESSMENT.md)** — Production readiness grades (Jan 2026, pre-security hardening)

### Deployment

- **[Deployment Guide](guides/DEPLOYMENT_PLAN.md)** — Railway deployment instructions

### Plans (February 2026)

- **[Security Hardening](plans/2026-02-05-security-hardening.md)** — 9 vulnerabilities, 4 workstreams
- **[Admin Dashboard Rewrite](plans/2026-02-05-admin-dashboard-rewrite.md)** — Admin v2 implementation plan
- **[Multi-Senior Management](plans/2026-02-05-multi-senior-management.md)** — Multi-senior system design

### Roadmap

- **[Next Steps](NEXT_STEPS.md)** — Recently completed + upcoming work

---

## Quick Reference

### Key Files (Pipecat)

| Feature | File |
|---------|------|
| Pipeline assembly | `pipecat/bot.py` |
| Call phases + system prompts | `pipecat/flows/nodes.py` |
| LLM tools | `pipecat/flows/tools.py` |
| Quick Observer (Layer 1) | `pipecat/processors/quick_observer.py` |
| Conversation Director (Layer 2) | `pipecat/processors/conversation_director.py` |
| Director LLM analysis | `pipecat/services/director_llm.py` |
| Goodbye Gate | `pipecat/processors/goodbye_gate.py` |
| Conversation Tracker | `pipecat/processors/conversation_tracker.py` |
| Guidance Stripper | `pipecat/processors/guidance_stripper.py` |
| Post-Call Analysis | `pipecat/services/call_analysis.py` |
| Memory System | `pipecat/services/memory.py` |
| Scheduler | `pipecat/services/scheduler.py` |
| Context Cache | `pipecat/services/context_cache.py` |
| Admin Dashboard | `apps/admin-v2/` |
| Consumer App | `apps/consumer/` |

### Architecture Layers

| Layer | Name | Model | Latency |
|-------|------|-------|---------|
| 1 | Quick Observer | Regex (252 patterns) | 0ms |
| Gate | Goodbye Gate | Timer | 4s grace period |
| 2 | Conversation Director | Gemini 3 Flash | ~150ms |
| Post-Call | Analysis + Memory | Gemini Flash + GPT-4o-mini | After call |

### Tech Stack

| Component | Technology |
|-----------|------------|
| Voice AI | Claude Sonnet 4.5 (streaming) |
| Director | Gemini 3 Flash |
| TTS | ElevenLabs (turbo_v2_5) |
| STT | Deepgram Nova 3 |
| Database | Neon PostgreSQL + pgvector |
| Pipeline | Pipecat v0.0.101+ (Python 3.12) |
| Hosting | Railway (Pipecat + Node.js) + Vercel (frontends) |

## External Resources

- [Twilio Docs](https://www.twilio.com/docs)
- [Anthropic Claude Docs](https://docs.anthropic.com)
- [Google AI Docs](https://ai.google.dev/docs)
- [ElevenLabs Docs](https://elevenlabs.io/docs)
- [Deepgram Docs](https://developers.deepgram.com)
- [Pipecat Docs](https://docs.pipecat.ai)
- [Railway Docs](https://docs.railway.app)
- [Neon Database Docs](https://neon.tech/docs)

---

*Last updated: February 2026 — v4.0 Pipecat Migration*
