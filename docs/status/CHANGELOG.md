# Changelog

All notable changes to the Donna project.

> **Note:** This changelog documents the original complex architecture build. The project is now being rebuilt incrementally - see [INCREMENTAL_BUILD_GUIDE.md](../INCREMENTAL_BUILD_GUIDE.md).

---

## [0.1.0] - Current

### Milestone 1 - Hello World
- Simple Express server with Twilio webhook
- Health check endpoint
- Railway deployment ready
- Starting point for incremental build

---

## Previous Architecture Reference

The entries below document what was built in the original complex architecture. These features will be rebuilt incrementally through Milestones 7-15.

---

## [0.3.0] - 2026-01-14

### Added - Phase 3: AI Enhancement & Semantic Search

**AI Enhancement Modules:**
- Observer Agent - Real-time conversation quality analysis (14 tests)
- Memory & Context - Long-term memory with pgvector semantic search (23 tests)
- Analytics Engine - Usage metrics and caregiver insights (14 tests)

**OpenAI Embedding Adapter:**
- Text embedding generation using text-embedding-3-small (8 tests)
- Batch embedding support (up to 2048 texts)
- 1536-dimensional vectors for semantic similarity

**Semantic Search Features:**
- pgvector PostgreSQL extension for vector similarity
- Automatic embedding generation when storing memories
- Cosine similarity search for intelligent memory retrieval
- Topic-based context building for personalized conversations

**Database Extensions:**
- Added `memories` table with vector embedding column
- Added `analytics_events` table for event tracking
- pgvector extension support

**Tests:** 59/59 passing (Phase 3) | 170/170 total
**Git Commits:**
- `b7d8187` - feat: Add pgvector semantic search with OpenAI embeddings
- `fadf6a2` - feat: Complete Phase 3 - AI Enhancement & Intelligence

---

## [0.2.0] - 2026-01-14

### Added - Phase 2: Infrastructure Migration & Data Management

**Phase 2A - Infrastructure Migration:**
- Drizzle ORM integration (type-safe database queries)
- Neon database configuration (serverless PostgreSQL)
- Clerk authentication setup (managed auth service)
- Upstash Redis for serverless job queue
- DI container updated for all Phase 2 modules

**Phase 2B - Business Modules:**
- Reminder Management module - CRUD for medication/appointment reminders (17 tests)
- Scheduler Service module - BullMQ job scheduling with retry logic (14 tests)
- Cloud Storage Storage Adapter - Audio file storage (7 tests)

**Stack Changes:**
- Database: PostgreSQL → Neon + Drizzle ORM
- Auth: Custom JWT → Clerk (managed service)
- Storage: Planned S3 → Cloud Storage
- Queue: Planned Redis → Upstash Redis (serverless)
- Hosting: Self-hosted → Railway

**Impact:**
- Removed User Management module from Phase 2 (Clerk handles it)
- Improved type safety with Drizzle ORM
- Simplified deployment with Railway

**Tests:** 38/38 passing (Phase 2)
**Git Commit:** `497f0d7`

---

## [0.1.0] - 2026-01-14

### Added - Phase 1: Voice Communication Infrastructure

**Adapters (3):**
- Deepgram Adapter (Speech-to-Text) - 5 tests passing
- ElevenLabs Adapter (Text-to-Speech) - 9 tests passing
- Twilio Adapter (Phone Calls) - 12 tests passing

**Modules (3):**
- Voice Pipeline (STT/TTS orchestration) - 10 tests passing
- Conversation Manager (conversation storage) - 23 tests passing
- Call Orchestrator (call lifecycle) - 14 tests passing

**Infrastructure:**
- Dependency injection container updated
- All Phase 1 modules registered
- Environment variables documented
- Web-based test UI created at `/test/test-phase1.html`
- Test API routes at `/api/test/phase1/*`

**Testing:**
- Total: 73/73 tests passing (100% coverage)
- All tests use mocks (no API keys required)
- Unit tests for all adapters and modules

**Documentation:**
- Created `PHASE1_COMPLETE.md` with detailed summary
- Updated `ARCHITECTURE.md` with Phase 1 status
- Updated `CLAUDE.md` with module map

**Git Commits:**
- `600cb6f` - feat: Complete Phase 1 implementation (25 files, 12,774 lines)
- `b720cda` - docs: Add Phase 1 completion summary
- `e4c3b6a` - docs: Update architecture with completion status

---

## [0.0.2] - 2026-01-13

### Added - Architecture V2 Foundation

**From Previous Work:**
- Monorepo scaffolding with Turborepo
- Database schema and migrations
- Senior Profiles module (CRUD operations)
- LLM Conversation engine (Claude integration)
- Skills System (pluggable skills: news, companionship)
- Anthropic adapter (Claude AI)
- Core API endpoints (auth, seniors, reminders, conversations, voice)
- Web portal scaffolding (Next.js)
- Conversation and Observer agents
- Personalized news service

**Architecture:**
- Modular architecture with dependency injection
- Interface-first design
- Repository pattern for data access
- Adapter pattern for external services

---

## [0.0.1] - 2026-01-13

### Added - Initial Project Setup

**Project Structure:**
- Turborepo monorepo setup
- Apps: web (Next.js), api (Express)
- Packages: shared types
- Database migrations structure
- Initial README and documentation

**Tech Stack:**
- Frontend: Next.js 14, React, TypeScript, Tailwind
- Backend: Express, TypeScript, PostgreSQL
- Voice/AI: Twilio, Deepgram, Claude, ElevenLabs
- Infrastructure: Turborepo, planned Docker support

---

## Release Notes

### Version 0.3.0 - "AI Intelligence"
Complete AI enhancement with semantic memory search, conversation analysis, and analytics.

### Version 0.2.0 - "Serverless Foundation"
Modern serverless stack upgrade preparing for scalable deployment on Railway.

### Version 0.1.0 - "Voice Infrastructure"
Complete voice communication system with phone calls, speech processing, and conversation management.

### Version 0.0.2 - "Architecture V2"
Modular architecture with dependency injection and interface-driven design.

### Version 0.0.1 - "Genesis"
Initial project setup and scaffolding.

---

## Test Summary

| Version | Phase | Tests Added | Total Tests |
|---------|-------|-------------|-------------|
| 0.3.0 | Phase 3 | 59 | 170 |
| 0.2.0 | Phase 2 | 38 | 111 |
| 0.1.0 | Phase 1 | 73 | 73 |

---

## Additional Documentation

For more details, see:
- [Phase 1 Complete](PHASE1_COMPLETE.md) - Voice infrastructure details
- [Phase 2 Complete](PHASE2_COMPLETE.md) - Infrastructure migration details
- [Phase 3 Complete](PHASE3_COMPLETE.md) - AI enhancement details
- [System Architecture](../architecture/OVERVIEW.md) - Complete architecture reference

---

**Legend:**
- ✅ Complete
- 🚧 In Progress
- ⏳ Planned
- 📋 Future
