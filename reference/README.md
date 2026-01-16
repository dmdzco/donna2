# Reference Architecture (Phase C)

> **DO NOT USE THIS CODE FOR INITIAL DEVELOPMENT**
>
> This folder contains the full complex architecture that will be built in **Phase C (Milestones 11-15)**. Start with the simple implementation in the root `index.js` and follow the [INCREMENTAL_BUILD_GUIDE.md](../docs/INCREMENTAL_BUILD_GUIDE.md).

## What's Here

This reference implementation includes:

### Business Modules (`modules/`)
| Module | Purpose | Milestone |
|--------|---------|-----------|
| senior-profiles | CRUD for senior profiles | 7 |
| reminder-management | Medication/appointment reminders | 8 |
| scheduler-service | Automated call scheduling | 9 |
| conversation-manager | Conversation storage | 11 |
| call-orchestrator | Call lifecycle management | 11 |
| voice-pipeline | Deepgram STT + ElevenLabs TTS | 11 |
| llm-conversation | Claude conversation engine | 11 |
| skills-system | Pluggable skills (news, chat) | 11 |
| observer-agent | Conversation quality analysis | 12 |
| memory-context | Long-term memory with pgvector | 13 |
| analytics-engine | Usage metrics & insights | 14 |

### External Adapters (`adapters/`)
| Adapter | Purpose | Milestone |
|---------|---------|-----------|
| anthropic | Claude AI integration | 11 |
| deepgram | Speech-to-Text | 11 |
| elevenlabs | Text-to-Speech | 11 |
| twilio | Phone call gateway | 1 (simplified) |
| storage | Audio file storage | 10 |
| openai | Embeddings for semantic search | 13 |

### Infrastructure (`config/`, `database/`)
- Dependency injection container
- Drizzle ORM schemas
- Database migrations

### Apps (`apps/`)
- Express API server with full routes
- Test UI pages

## When to Use This

Reference this code when you reach the corresponding milestone:

- **Milestone 7-10**: Look at `database/`, `modules/reminder-management/`, `modules/scheduler-service/`
- **Milestone 11**: Look at `adapters/`, `modules/voice-pipeline/`, `modules/call-orchestrator/`, `config/`
- **Milestone 12-14**: Look at `modules/observer-agent/`, `modules/memory-context/`, `modules/analytics-engine/`

## Architecture Patterns

This implementation uses:
- **Interface-first design** - All modules depend on interfaces
- **Dependency injection** - Loose coupling via DonnaContainer
- **Repository pattern** - Separate data access from business logic
- **Adapter pattern** - Wrap external SDKs behind interfaces

See [docs/architecture/OVERVIEW.md](../docs/architecture/OVERVIEW.md) for full details.

## Do NOT

- Copy this code directly into the root project
- Try to run this code as-is (dependencies are different)
- Use this for Milestones 1-6 (use Gemini native voice instead)

## DO

- Read the code to understand patterns
- Adapt concepts for your current milestone
- Reference the test files to understand expected behavior
