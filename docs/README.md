# Donna Documentation

Complete documentation for the Donna AI companion system.

**Status:** All Phases Complete | 170/170 Tests Passing | Production Ready

## Documentation Index

### Getting Started
- [Main README](../README.md) - Project overview and quick start
- [Project Summary](status/PROJECT_SUMMARY.md) - Complete project overview

### Architecture
- [System Architecture](architecture/OVERVIEW.md) - Complete technical architecture and design
- [Module Reference](architecture/MODULES.md) - Detailed module documentation

### Development Guides
- [API Route Usage](guides/ROUTE_USAGE.md) - How to use API routes and modules
- [Deployment Plan](guides/DEPLOYMENT_PLAN.md) - Deploy to Vercel, Railway, etc.

### Project Status
- [Phase 1 Complete](status/PHASE1_COMPLETE.md) - Voice communication infrastructure (73 tests)
- [Phase 2 Complete](status/PHASE2_COMPLETE.md) - Infrastructure migration & data management (38 tests)
- [Phase 3 Complete](status/PHASE3_COMPLETE.md) - AI enhancement & intelligence (59 tests)
- [Remaining Work](status/REMAINING_WORK.md) - Optional improvements
- [Changelog](status/CHANGELOG.md) - Version history and updates

---

## Quick Navigation

**Current Status:** All Phases Complete | Production Ready

| Document | Use When... |
|----------|-------------|
| [System Architecture](architecture/OVERVIEW.md) | Understanding the overall system design |
| [Module Reference](architecture/MODULES.md) | Building a new module or understanding existing ones |
| [API Route Usage](guides/ROUTE_USAGE.md) | Working with API endpoints |
| [Deployment Plan](guides/DEPLOYMENT_PLAN.md) | Deploying to production |
| [Project Summary](status/PROJECT_SUMMARY.md) | Getting a complete project overview |

---

## Module & Adapter Summary

### Business Modules (11)
| Module | Phase | Tests | Purpose |
|--------|-------|-------|---------|
| Senior Profiles | 1 | - | CRUD for senior profiles |
| LLM Conversation | 1 | - | Claude conversation engine |
| Skills System | 1 | - | Pluggable skills (news, chat) |
| Voice Pipeline | 1 | 10 | STT/TTS orchestration |
| Conversation Manager | 1 | 23 | Conversation storage |
| Call Orchestrator | 1 | 14 | Call lifecycle management |
| Reminder Management | 2 | 17 | Medication/appointment reminders |
| Scheduler Service | 2 | 14 | BullMQ job scheduling |
| Observer Agent | 3 | 14 | Conversation quality analysis |
| Memory & Context | 3 | 23 | Long-term memory with pgvector |
| Analytics Engine | 3 | 14 | Usage metrics & insights |

### External Adapters (6)
| Adapter | Tests | Purpose |
|---------|-------|---------|
| Anthropic | - | Claude AI integration |
| Deepgram | 5 | Speech-to-Text |
| ElevenLabs | 9 | Text-to-Speech |
| Twilio | 12 | Phone call gateway |
| Vercel Blob | 7 | Audio file storage |
| OpenAI | 8 | Embeddings for semantic search |

**Total: 170 tests passing (100%)**

---

## External Resources

- [Drizzle ORM Docs](https://orm.drizzle.team)
- [Neon Database Docs](https://neon.tech/docs)
- [Clerk Authentication Docs](https://clerk.com/docs)
- [Vercel Docs](https://vercel.com/docs)
- [pgvector Docs](https://github.com/pgvector/pgvector)
- [OpenAI Embeddings Docs](https://platform.openai.com/docs/guides/embeddings)
