# Donna - AI Senior Companion

AI-powered companion that provides elderly individuals with friendly phone conversations via real-time voice AI.

## Current Status: v2.0 (Production Ready)

**Working Features:**
- Real-time voice calls (Twilio + Gemini 2.5 Native Audio)
- Bidirectional audio streaming via WebSocket
- AI transcription of Donna's speech (output transcription)
- Senior profile management with database
- Memory storage with semantic embeddings (pgvector + OpenAI)
- Memory extraction from conversations
- Admin UI for managing seniors

**Known Limitation:**
- User speech transcription not available (Gemini SDK bug with native audio model)
- Mid-conversation memory retrieval blocked until user transcription is resolved
- **Planned Fix:** Deepgram integration for user speech transcription

## Quick Start

```bash
npm install
npm run dev
```

Test health:
```bash
curl http://localhost:3001/health
```

## Architecture

```
Phone Call → Twilio → WebSocket → Express Server
                                       ↓
                              Gemini 2.5 Native Audio
                              (Real-time voice AI)
                                       ↓
                              PostgreSQL + pgvector
                              (Memories & Profiles)
```

## Tech Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Voice AI** | Gemini 2.5 Flash Native Audio | Real-time conversation |
| **Phone** | Twilio | Calls + Media Streams |
| **Database** | Neon (PostgreSQL) | Profiles, conversations |
| **Embeddings** | pgvector + OpenAI | Semantic memory search |
| **Hosting** | Railway | Auto-deploy |

## Project Structure

```
donna/
├── index.js              # Main Express server + Twilio webhooks
├── gemini-live.js        # Gemini Live API session handler
├── audio-utils.js        # Audio format conversion (mulaw ↔ PCM)
├── services/
│   ├── memory.js         # Memory storage + semantic search
│   ├── seniors.js        # Senior profile management
│   └── conversations.js  # Conversation history
├── db/
│   ├── client.js         # Database connection
│   └── schema.js         # Drizzle ORM schema
├── public/
│   └── admin.html        # Admin UI
└── providers/            # Provider abstraction (future use)
    ├── voice-provider.js
    ├── memory-provider.js
    └── ...
```

## Environment Variables

```bash
# Required
PORT=3001
GOOGLE_API_KEY=your_gemini_key
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
DATABASE_URL=postgresql://...
OPENAI_API_KEY=...           # For embeddings

# Optional
GEMINI_API_KEY=...           # Alternative to GOOGLE_API_KEY
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/voice/answer` | POST | Twilio webhook for calls |
| `/voice/status` | POST | Call status updates |
| `/api/call` | POST | Initiate outbound call |
| `/api/seniors` | GET/POST | Manage senior profiles |
| `/api/seniors/:id/memories` | GET/POST | Manage memories |
| `/api/conversations` | GET | View conversation history |

## Memory System

**How it works:**
1. **Call Start**: Load relevant memories into system prompt
2. **During Call**: (Blocked) Trigger memory lookup on keywords
3. **Call End**: Extract facts/preferences from transcript, store with embeddings

**Memory Types:**
- `fact` - General information
- `preference` - Likes/dislikes
- `event` - Past events
- `concern` - Health/emotional concerns
- `relationship` - People in their life

## Deployment

**Railway (recommended):**
1. Push to GitHub
2. Connect repo on [railway.app](https://railway.app)
3. Add environment variables
4. Deploy

## Next Steps

1. **Deepgram Integration** - Add user speech transcription
2. **Mid-conversation Memory** - Enable memory lookup during calls
3. **Caregiver Portal** - Web dashboard for family members
4. **Scheduled Calls** - Automated daily check-ins

## Version History

- **v2.0** - Full voice calls with memory (current)
- **v1.0** - Basic Twilio integration

## License

Private - All rights reserved
