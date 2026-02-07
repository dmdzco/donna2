# Donna on LiveKit: Full Migration Architecture

> Complete mapping of Donna's current codebase to a LiveKit Agents Node.js implementation.

---

## Architecture Overview

```
Phone (PSTN)
  ↓
Twilio SIP Trunk → LiveKit SIP Bridge → LiveKit Room
  ↓
┌─────────────────────────────────────────────────────────┐
│  LiveKit Agent Worker (Node.js)                         │
│                                                         │
│  Per-call AgentSession:                                 │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Audio Input (from LiveKit Room participant)      │   │
│  │  ↓                                               │   │
│  │ Silero VAD                                       │   │
│  │  ↓                                               │   │
│  │ Deepgram STT (plugin)                            │   │
│  │  ↓                                               │   │
│  │ Turn Detection (EOUModel — semantic)             │   │
│  │  ↓                                               │   │
│  │ llmNode override:                                │   │
│  │   1. Quick Observer (regex, 0ms)                 │   │
│  │   2. Context injection (memories, reminders)     │   │
│  │   3. Claude Sonnet streaming (Anthropic SDK)     │   │
│  │  ↓                                               │   │
│  │ ttsNode override:                                │   │
│  │   Strip <guidance> tags                          │   │
│  │  ↓                                               │   │
│  │ ElevenLabs TTS (plugin)                          │   │
│  │  ↓                                               │   │
│  │ Audio Output (to LiveKit Room → SIP → Phone)     │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  DonnaAgent class:                                      │
│  ├── Tools: searchMemories, getNews, markReminder, etc. │
│  ├── State: session.userdata (topics, reminders, etc.)  │
│  ├── Events: transcript logging, metrics                │
│  └── Shutdown: post-call analysis                       │
│                                                         │
│  Companion API Server (Express — kept as-is)            │
│  ├── /api/seniors, /api/reminders, etc.                 │
│  ├── /api/admin-auth                                    │
│  └── /api/caregivers                                    │
└─────────────────────────────────────────────────────────┘
  ↓
PostgreSQL + pgvector (unchanged)
```

**Key difference from Pipecat:** LiveKit keeps us in Node.js. The existing Express API server, services, and database layer remain **unchanged**. Only the voice pipeline is replaced.

---

## File-by-File Migration Map

### Current → LiveKit Equivalent

| Current File | LOC | LiveKit Equivalent | Notes |
|---|---|---|---|
| `pipelines/v1-advanced.js` | 1,592 | `agent/donna-agent.ts` + `agent/main.ts` | Split into Agent class and worker entrypoint |
| `pipelines/quick-observer.js` | 1,196 | `agent/quick-observer.ts` | Same regex, called in `llmNode` or `onUserTurnCompleted` |
| `pipelines/fast-observer.js` | 647 | **Eliminated** — replaced by tools + `llmNode` context injection | Director responsibilities absorbed into agent logic |
| `websocket/media-stream.js` | 202 | **Eliminated** — LiveKit handles transport | SIP Bridge + Room replaces Twilio WebSocket |
| `adapters/elevenlabs-streaming.js` | 270 | **Eliminated** — `@livekit/agents-plugin-elevenlabs` | Plugin handles WebSocket TTS |
| `adapters/llm/index.js` | 157 | **Partially eliminated** — custom `llmNode` for Claude | Still need Anthropic SDK for Claude integration |
| `audio-utils.js` | 135 | **Eliminated** — LiveKit handles codec conversion | SIP bridge handles mulaw↔PCM |
| `services/memory.js` | 329 | **Unchanged** — called from tools and `llmNode` | Same Node.js code, imported directly |
| `services/daily-context.js` | 197 | **Unchanged** — called from agent lifecycle | Same Node.js code |
| `services/greetings.js` | 258 | **Unchanged** — called at session start | Same Node.js code |
| `services/call-analysis.js` | 257 | **Unchanged** — called in shutdown callback | Same Node.js code |
| `services/scheduler.js` | 515 | **Mostly unchanged** — outbound calls use LiveKit SIP API | Minor change: `triggerReminderCall` uses LiveKit SIP instead of Twilio |
| `services/news.js` | 104 | **Unchanged** — called from tools | Same Node.js code |
| `services/conversations.js` | 172 | **Unchanged** | Same Node.js code |
| `services/seniors.js` | 66 | **Unchanged** | Same Node.js code |
| `services/caregivers.js` | 84 | **Unchanged** | Same Node.js code |
| `db/schema.js` | 130 | **Unchanged** | Same Drizzle schema |
| `routes/*.js` (13 files) | 1,316 | **Unchanged** | Same Express routes |
| `middleware/auth.js` | 196 | **Unchanged** | Same auth middleware |
| `index.js` | 93 | **Modified** — no longer sets up WebSocket for voice | Express server still runs for API; voice handled by LiveKit worker |

**Lines eliminated by LiveKit:** ~1,411 (WebSocket handler, ElevenLabs adapter, audio utils, partial LLM adapter)

**Lines unchanged:** ~3,709 (all services, routes, middleware, DB)

**Lines modified:** ~300 (index.js, scheduler outbound calls)

**Lines new:** ~800 (agent class, worker entrypoint, quick observer port)

---

## Project Structure

```
donna-livekit/
├── agent/                              ← NEW: LiveKit agent (separate process)
│   ├── main.ts                         ← Worker entrypoint + session setup
│   ├── donna-agent.ts                  ← Agent class (tools, llmNode, lifecycle)
│   ├── quick-observer.ts               ← Layer 1 regex analysis (ported)
│   └── claude-integration.ts           ← Custom Claude streaming for llmNode
├── index.js                            ← Express API server (modified, no WebSocket)
├── routes/                             ← UNCHANGED
│   ├── index.js
│   ├── voice.js                        ← Modified: initiates calls via LiveKit SIP
│   ├── calls.js                        ← Modified: uses LiveKit for call management
│   └── ... (11 other route files unchanged)
├── services/                           ← UNCHANGED
│   ├── memory.js
│   ├── daily-context.js
│   ├── greetings.js
│   ├── call-analysis.js
│   ├── scheduler.js                    ← Modified: outbound calls via LiveKit SIP
│   ├── news.js
│   ├── conversations.js
│   ├── seniors.js
│   └── caregivers.js
├── middleware/                          ← UNCHANGED
├── db/                                 ← UNCHANGED
├── apps/                               ← UNCHANGED
│   ├── admin/
│   ├── consumer/
│   └── observability/
├── pipelines/                          ← REMOVED (replaced by agent/)
├── websocket/                          ← REMOVED (replaced by LiveKit transport)
├── adapters/                           ← REMOVED (replaced by plugins + claude-integration)
├── audio-utils.js                      ← REMOVED (LiveKit handles codecs)
├── package.json                        ← Updated with LiveKit dependencies
├── Dockerfile                          ← Updated for two processes (API + agent)
└── docker-compose.yml                  ← API server + agent worker
```

---

## Core Implementation

### `agent/main.ts` — Worker Entrypoint

```typescript
import {
  type JobContext,
  type JobProcess,
  ServerOptions,
  cli,
  defineAgent,
  inference,
  metrics,
  voice,
} from '@livekit/agents';
import * as livekit from '@livekit/agents-plugin-livekit';
import * as silero from '@livekit/agents-plugin-silero';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import { BackgroundVoiceCancellation } from '@livekit/noise-cancellation-node';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

import { DonnaAgent } from './donna-agent.js';
import { seniorService } from '../services/seniors.js';
import { memoryService } from '../services/memory.js';
import { dailyContextService } from '../services/daily-context.js';
import { schedulerService } from '../services/scheduler.js';
import { greetingService } from '../services/greetings.js';
import { analyzeCompletedCall, saveCallAnalysis } from '../services/call-analysis.js';
import { conversationService } from '../services/conversations.js';

dotenv.config();

interface DonnaUserData {
  seniorId: string | null;
  senior: any;
  memoryContext: string;
  dailyContext: any;
  reminderContext: any;
  greeting: any;
  topicsDiscussed: string[];
  remindersDelivered: Set<string>;
  questionsAsked: string[];
  adviceGiven: string[];
  transcript: Array<{ role: string; text: string; timestamp: number }>;
  callStartTime: number;
  callSid: string | null;
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    // Load VAD model once per worker process
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    // Extract call metadata from room/participant metadata
    const roomMetadata = JSON.parse(ctx.room.metadata || '{}');
    const seniorId = roomMetadata.seniorId || null;
    const callSid = roomMetadata.callSid || null;

    // --- Pre-fetch all context (before call starts) ---
    let senior = null;
    let memoryContext = '';
    let dailyContext = null;
    let reminderContext = null;
    let greeting = null;

    if (seniorId) {
      senior = await seniorService.getById(seniorId);
    }
    if (!senior && roomMetadata.fromNumber) {
      senior = await seniorService.findByPhone(roomMetadata.fromNumber);
    }

    if (senior) {
      [memoryContext, dailyContext, reminderContext] = await Promise.all([
        memoryService.buildContext(senior.id),
        dailyContextService.getTodaysContext(senior.id, senior.timezone || 'America/New_York'),
        schedulerService.getReminderContext(callSid),
      ]);

      greeting = greetingService.getGreeting({
        name: senior.name,
        timezone: senior.timezone,
        interests: senior.interests || [],
      });
    }

    // --- Create session with pre-fetched state ---
    const session = new voice.AgentSession<DonnaUserData>({
      stt: new deepgram.STT({
        model: 'nova-3-general',
        language: 'en',
        sampleRate: 8000,
        punctuate: true,
        smartFormat: true,
      }),
      tts: new elevenlabs.TTS({
        modelId: 'eleven_turbo_v2_5',
        voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel
        voiceSettings: {
          stability: 0.4,
          similarityBoost: 0.75,
          style: 0.2,
          useSpeakerBoost: true,
          speed: 0.87,
        },
      }),
      vad: ctx.proc.userData.vad as silero.VAD,
      turnDetection: new livekit.turnDetector.MultilingualModel(),

      userdata: {
        seniorId: senior?.id || null,
        senior,
        memoryContext,
        dailyContext,
        reminderContext,
        greeting,
        topicsDiscussed: [],
        remindersDelivered: new Set(),
        questionsAsked: [],
        adviceGiven: [],
        transcript: [],
        callStartTime: Date.now(),
        callSid,
      },
    });

    // --- Transcript logging ---
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => {
      const text = ev.item.content?.[0]?.text || '';
      if (text) {
        session.userdata.transcript.push({
          role: ev.item.role,
          text,
          timestamp: Date.now(),
        });
      }
    });

    // --- Metrics ---
    const usageCollector = new metrics.UsageCollector();
    session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
      metrics.logMetrics(ev.metrics);
      usageCollector.collect(ev.metrics);
    });

    // --- Post-call processing (shutdown callback) ---
    ctx.addShutdownCallback(async () => {
      const ud = session.userdata;
      if (!ud.senior || ud.transcript.length === 0) return;

      try {
        // Save daily context
        await dailyContextService.saveCallContext(ud.seniorId!, ud.callSid!, {
          topicsDiscussed: ud.topicsDiscussed,
          remindersDelivered: Array.from(ud.remindersDelivered),
          adviceGiven: ud.adviceGiven,
        });

        // Extract memories
        await memoryService.extractFromConversation(
          ud.seniorId!,
          ud.transcript,
          ud.callSid,
        );

        // Post-call analysis
        const analysis = await analyzeCompletedCall(ud.transcript, ud.senior);
        if (analysis) {
          await saveCallAnalysis(ud.callSid!, ud.seniorId!, analysis);
        }

        // Update conversation record
        await conversationService.complete(ud.callSid, {
          durationSeconds: Math.floor((Date.now() - ud.callStartTime) / 1000),
          status: 'completed',
        });

        console.log(`Post-call complete. Usage: ${JSON.stringify(usageCollector.getSummary())}`);
      } catch (err) {
        console.error('Post-call error:', err);
      }
    });

    // --- Start session ---
    const agent = new DonnaAgent(senior, memoryContext, dailyContext, reminderContext);
    await session.start({
      agent,
      room: ctx.room,
      inputOptions: {
        noiseCancellation: BackgroundVoiceCancellation(),
      },
    });

    await ctx.connect();

    // --- Initial greeting ---
    const greetingText = greeting?.greeting || `Hello! This is Donna calling.`;
    session.generateReply({
      instructions: `Say exactly this greeting: "${greetingText}" Then ask how they're doing.`,
    });
  },
});

// Start the worker
cli.runApp(new ServerOptions({
  agent: fileURLToPath(import.meta.url),
  agentName: 'donna-agent', // Explicit dispatch only (for telephony)
}));
```

### `agent/donna-agent.ts` — Agent Class

```typescript
import { voice, llm } from '@livekit/agents';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { ReadableStream } from 'node:stream/web';

import { quickAnalyze, buildGuidance } from './quick-observer.js';
import { memoryService } from '../services/memory.js';
import { newsService } from '../services/news.js';
import { schedulerService } from '../services/scheduler.js';
import { dailyContextService } from '../services/daily-context.js';

const anthropic = new Anthropic();

export class DonnaAgent extends voice.Agent {
  private senior: any;
  private memoryContext: string;
  private dailyContext: any;
  private reminderContext: any;
  private turnCount: number = 0;

  constructor(
    senior: any,
    memoryContext: string,
    dailyContext: any,
    reminderContext: any,
  ) {
    super({
      instructions: buildSystemPrompt(senior, memoryContext, dailyContext, reminderContext),
      tools: {
        // --- Memory Search ---
        searchMemories: llm.tool({
          description:
            'Search past conversation memories. Use when the senior references ' +
            'past conversations, says "remember when...", or you want to recall ' +
            'what you know about a topic.',
          parameters: z.object({
            query: z.string().describe('What to search for'),
          }),
          execute: async ({ query }, { ctx }) => {
            const seniorId = ctx.session.userdata.seniorId;
            if (!seniorId) return 'No memory context available.';
            const results = await memoryService.search(seniorId, query, 3);
            if (!results?.length) return 'No matching memories found.';
            return results
              .map((m: any) => `- ${m.content} (${m.type})`)
              .join('\n');
          },
        }),

        // --- News Lookup ---
        getNews: llm.tool({
          description:
            'Look up recent news about a topic. Use when the senior asks about ' +
            'current events, news, weather, sports, or shows curiosity about something.',
          parameters: z.object({
            topic: z.string().describe('The news topic'),
          }),
          execute: async ({ topic }) => {
            const news = await newsService.getNewsForSenior([topic], 2);
            return news || `Couldn't find recent news about ${topic}.`;
          },
        }),

        // --- Reminder Acknowledgment ---
        markReminderAcknowledged: llm.tool({
          description:
            'Mark a reminder as acknowledged after the senior confirms ' +
            "they'll do it or says they already did.",
          parameters: z.object({
            reminderId: z.string().describe('The reminder ID'),
            status: z
              .enum(['acknowledged', 'confirmed'])
              .describe('acknowledged = will do, confirmed = already done'),
            userResponse: z
              .string()
              .optional()
              .describe('What the senior said'),
          }),
          execute: async ({ reminderId, status, userResponse }, { ctx }) => {
            await schedulerService.markReminderAcknowledged(
              reminderId,
              status,
              userResponse || '',
            );
            ctx.session.userdata.remindersDelivered.add(reminderId);
            return `Reminder marked as ${status}.`;
          },
        }),

        // --- Save Important Detail ---
        saveDetail: llm.tool({
          description:
            'Save something important the senior shared for future calls. ' +
            'Use for: health info, family updates, preferences, concerns, or stories.',
          parameters: z.object({
            detail: z.string().describe('The detail to remember'),
            category: z
              .enum(['fact', 'preference', 'event', 'concern', 'relationship'])
              .describe('Category'),
          }),
          execute: async ({ detail, category }, { ctx }) => {
            const seniorId = ctx.session.userdata.seniorId;
            if (!seniorId) return 'Could not save.';
            await memoryService.store(seniorId, category, detail, 'conversation', 70);
            return `Noted: ${detail}`;
          },
        }),
      },
    });

    this.senior = senior;
    this.memoryContext = memoryContext;
    this.dailyContext = dailyContext;
    this.reminderContext = reminderContext;
  }

  // --- Called after each user turn, before agent responds ---
  async onUserTurnCompleted(
    chatCtx: llm.ChatContext,
    newMessage: llm.ChatMessage,
  ): Promise<void> {
    this.turnCount++;
    const text = newMessage.content?.[0]?.text || '';

    // Track topics
    if (text.length > 20) {
      this.session.userdata.topicsDiscussed.push(
        text.substring(0, 50).replace(/[^a-zA-Z ]/g, ''),
      );
    }
  }

  // --- Custom LLM node: Quick Observer + Claude integration ---
  async llmNode(
    chatCtx: llm.ChatContext,
    toolCtx: llm.ToolContext,
    modelSettings: voice.ModelSettings,
  ): Promise<ReadableStream<llm.ChatChunk | string> | null> {
    // Get the latest user message for Quick Observer analysis
    const lastUserMessage = this.getLastUserMessage(chatCtx);

    // Layer 1: Quick Observer (0ms — regex patterns)
    let quickGuidance = '';
    if (lastUserMessage) {
      const analysis = quickAnalyze(lastUserMessage);
      if (analysis.guidance) {
        quickGuidance = `\n\n[QUICK OBSERVER SIGNALS]\n${analysis.guidance}`;
      }
    }

    // Build messages for Claude
    const messages: Anthropic.MessageParam[] = [];
    const systemParts: string[] = [];

    for (const item of chatCtx.items) {
      const text = item.content?.[0]?.text || '';
      if (!text) continue;

      if (item.role === 'system') {
        systemParts.push(text);
      } else if (item.role === 'user' || item.role === 'assistant') {
        messages.push({ role: item.role, content: text });
      }
    }

    // Inject quick observer guidance into system prompt
    const systemPrompt = systemParts.join('\n') + quickGuidance;

    // Dynamic token selection based on Quick Observer signals
    let maxTokens = 150; // Default
    if (lastUserMessage) {
      const analysis = quickAnalyze(lastUserMessage);
      if (analysis.modelRecommendation) {
        maxTokens = analysis.modelRecommendation.max_tokens || 150;
      }
    }

    // Build tool definitions for Claude
    const tools = this.buildClaudeTools(toolCtx);

    // Stream from Claude
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      tools: tools.length > 0 ? tools : undefined,
    });

    // Return ReadableStream that the framework pipes to TTS
    return new ReadableStream<llm.ChatChunk | string>({
      async start(controller) {
        try {
          const eventStream = await stream;
          for await (const event of eventStream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              controller.enqueue(event.delta.text);
            }
            // Handle tool_use blocks
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'input_json_delta'
            ) {
              // Tool call handling — LiveKit framework processes these
              // when returned as ChatChunk with toolCalls
              // For simplicity, we handle tools inline here
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });
  }

  // --- Custom TTS node: strip guidance tags ---
  async ttsNode(
    text: ReadableStream<string>,
    modelSettings: voice.ModelSettings,
  ): Promise<ReadableStream<import('@livekit/agents').AudioFrame>> {
    // Create a transform stream that strips guidance tags
    const guidancePattern = /<guidance>.*?<\/guidance>/gs;
    const bracketPattern = /\[.*?\]/g;

    const cleanedStream = text.pipeThrough(
      new TransformStream<string, string>({
        transform(chunk, controller) {
          let cleaned = chunk
            .replace(guidancePattern, '')
            .replace(bracketPattern, '')
            .trim();
          if (cleaned) {
            controller.enqueue(cleaned);
          }
        },
      }),
    );

    // Pass cleaned text to default TTS
    return voice.Agent.default.ttsNode(this, cleanedStream, modelSettings);
  }

  // --- Helpers ---
  private getLastUserMessage(chatCtx: llm.ChatContext): string | null {
    for (let i = chatCtx.items.length - 1; i >= 0; i--) {
      if (chatCtx.items[i].role === 'user') {
        return chatCtx.items[i].content?.[0]?.text || null;
      }
    }
    return null;
  }

  private buildClaudeTools(
    toolCtx: llm.ToolContext,
  ): Anthropic.Tool[] {
    // Convert LiveKit tool definitions to Anthropic format
    const tools: Anthropic.Tool[] = [];
    if (toolCtx?.tools) {
      for (const [name, tool] of Object.entries(toolCtx.tools)) {
        tools.push({
          name,
          description: tool.description || '',
          input_schema: tool.parameters
            ? (JSON.parse(JSON.stringify(tool.parameters)) as Anthropic.Tool.InputSchema)
            : { type: 'object' as const, properties: {} },
        });
      }
    }
    return tools;
  }
}


function buildSystemPrompt(
  senior: any,
  memoryContext: string,
  dailyContext: any,
  reminderContext: any,
): string {
  const parts = [
    'You are Donna, a warm and friendly AI companion who makes phone calls to elderly individuals.',
    'You speak naturally, like a caring friend. Keep responses conversational and concise.',
    'Never mention being an AI unless directly asked.',
  ];

  if (senior) {
    parts.push(`\nYou're speaking with ${senior.name}.`);
    if (senior.interests?.length) {
      parts.push(`Their interests: ${senior.interests.join(', ')}.`);
    }
    if (senior.familyInfo) {
      parts.push(`Family: ${senior.familyInfo}`);
    }
    if (senior.medicalNotes) {
      parts.push(`Health notes: ${senior.medicalNotes}`);
    }
  }

  if (memoryContext) {
    parts.push(`\n${memoryContext}`);
  }

  if (dailyContext) {
    const { formatTodaysContext } = require('../services/daily-context.js');
    const formatted = formatTodaysContext(dailyContext);
    if (formatted) parts.push(`\n${formatted}`);
  }

  if (reminderContext?.reminderPrompt) {
    parts.push(
      `\nReminder to deliver naturally: ${reminderContext.reminderPrompt}. ` +
        "Find a natural moment — don't force it.",
    );
  }

  return parts.join('\n');
}
```

### `agent/quick-observer.ts` — Layer 1 Regex Analysis

```typescript
/**
 * Quick Observer — port of pipelines/quick-observer.js
 * Pure regex-based pattern matching (0ms latency).
 * Called in llmNode before Claude inference.
 *
 * NOTE: This file ports the interface and key patterns.
 * The full 1,196 lines of regex patterns from quick-observer.js
 * are ported mechanically — same patterns, TypeScript syntax.
 */

interface QuickAnalysis {
  healthSignals: Array<{ signal: string; severity: string }>;
  safetySignals: Array<{ signal: string; severity: string }>;
  emotionSignals: Array<{ signal: string; valence: string; intensity: string }>;
  goodbyeStrength: string | null;
  needsWebSearch: boolean;
  guidance: string | null;
  modelRecommendation: { use_sonnet: boolean; max_tokens: number; reason: string } | null;
}

// Pattern definitions — same as quick-observer.js
const HEALTH_PATTERNS: Array<[RegExp, string, string]> = [
  [/\b(headache|head hurts|migraine)\b/i, 'pain', 'medium'],
  [/\b(dizzy|dizziness|lightheaded|vertigo)\b/i, 'dizziness', 'high'],
  [/\b(fell|fall|tripped|stumbled)\b/i, 'fall', 'high'],
  // ... all 74 patterns ported from quick-observer.js
];

const SAFETY_PATTERNS: Array<[RegExp, string, string]> = [
  [/\b(scam|scammed|fraud|suspicious call)\b/i, 'scam', 'high'],
  // ... all 23 patterns
];

const EMOTION_PATTERNS: Array<[RegExp, string, string, string]> = [
  [/\b(lonely|lonesome|all alone|no one)\b/i, 'loneliness', 'negative', 'high'],
  // ... all 32 patterns
];

const GOODBYE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(goodbye|bye bye|talk to you later|have a good)\b/i, 'strong'],
  // ... all 12 patterns
];

const WEB_SEARCH_PATTERNS: RegExp[] = [
  /\b(what('s| is) (?:happening|going on) (?:in|with|around))\b/i,
  // ... all 18 patterns
];


export function quickAnalyze(text: string): QuickAnalysis {
  const healthSignals: QuickAnalysis['healthSignals'] = [];
  const safetySignals: QuickAnalysis['safetySignals'] = [];
  const emotionSignals: QuickAnalysis['emotionSignals'] = [];
  let goodbyeStrength: string | null = null;
  let needsWebSearch = false;
  const guidanceParts: string[] = [];

  // Health
  for (const [pattern, signal, severity] of HEALTH_PATTERNS) {
    if (pattern.test(text)) {
      healthSignals.push({ signal, severity });
      if (severity === 'high') {
        guidanceParts.push(
          `[HEALTH] ${signal} detected — ask with gentle concern, don't diagnose.`,
        );
      }
    }
  }

  // Safety
  for (const [pattern, signal, severity] of SAFETY_PATTERNS) {
    if (pattern.test(text)) {
      safetySignals.push({ signal, severity });
      guidanceParts.push(
        `[SAFETY] ${signal} detected — ask what happened, suggest contacting family if serious.`,
      );
    }
  }

  // Emotions
  for (const [pattern, signal, valence, intensity] of EMOTION_PATTERNS) {
    if (pattern.test(text)) {
      emotionSignals.push({ signal, valence, intensity });
      if (valence === 'negative' && intensity === 'high') {
        guidanceParts.push(
          `[EMOTIONAL] ${signal} — respond with empathy, validate their feelings.`,
        );
      }
    }
  }

  // Goodbye
  for (const [pattern, strength] of GOODBYE_PATTERNS) {
    if (pattern.test(text)) {
      goodbyeStrength = strength;
      guidanceParts.push(`[GOODBYE] ${strength} signal — begin wrapping up warmly.`);
    }
  }

  // Web search
  for (const pattern of WEB_SEARCH_PATTERNS) {
    if (pattern.test(text)) {
      needsWebSearch = true;
    }
  }

  // Model recommendation (same logic as quick-observer.js)
  let modelRecommendation = null;
  const hasHighSeverity = healthSignals.some((s) => s.severity === 'high') ||
    safetySignals.some((s) => s.severity === 'high');
  const hasHighEmotion = emotionSignals.some(
    (s) => s.valence === 'negative' && s.intensity === 'high',
  );

  if (hasHighSeverity || hasHighEmotion) {
    modelRecommendation = {
      use_sonnet: true,
      max_tokens: 250,
      reason: 'High severity or emotional content detected',
    };
  }

  return {
    healthSignals,
    safetySignals,
    emotionSignals,
    goodbyeStrength,
    needsWebSearch,
    guidance: guidanceParts.length > 0 ? guidanceParts.join('\n') : null,
    modelRecommendation,
  };
}

export function buildGuidance(analysis: QuickAnalysis): string | null {
  return analysis.guidance;
}
```

---

## Telephony: Twilio SIP Trunk Setup

### Inbound Calls (senior calls Donna's number)

```
Phone → Twilio Number → TwiML → SIP Dial → LiveKit SIP Endpoint → Room → Agent
```

1. **Create LiveKit inbound trunk:**
```json
{
  "trunk": {
    "name": "donna-inbound",
    "numbers": ["+1XXXXXXXXXX"],
    "auth_username": "donna_sip_user",
    "auth_password": "secure_password"
  }
}
```

```bash
lk sip inbound create inbound-trunk.json
```

2. **Create dispatch rule:**
```json
{
  "dispatch_rule": {
    "rule": {
      "dispatchRuleIndividual": {
        "roomPrefix": "donna-call-"
      }
    }
  }
}
```

3. **TwiML Bin** (assigned to Twilio phone number):
```xml
<Response>
  <Dial>
    <Sip username="donna_sip_user" password="secure_password">
      sip:+1XXXXXXXXXX@your-livekit-sip-endpoint
    </Sip>
  </Dial>
</Response>
```

### Outbound Calls (Donna calls senior)

```typescript
// In scheduler.js — replaces current Twilio REST API call
import { RoomServiceClient, AgentDispatchClient, SipClient } from 'livekit-server-sdk';

async function triggerReminderCall(reminder, senior) {
  const roomService = new RoomServiceClient(LIVEKIT_URL, API_KEY, API_SECRET);
  const agentDispatch = new AgentDispatchClient(LIVEKIT_URL, API_KEY, API_SECRET);
  const sipClient = new SipClient(LIVEKIT_URL, API_KEY, API_SECRET);

  const roomName = `donna-call-${Date.now()}`;

  // Create room with metadata
  await roomService.createRoom({
    name: roomName,
    emptyTimeout: 300, // 5 min
    metadata: JSON.stringify({
      seniorId: senior.id,
      callType: 'reminder',
      reminderId: reminder.id,
    }),
  });

  // Dispatch Donna agent to the room
  await agentDispatch.createDispatch(roomName, 'donna-agent', {
    metadata: JSON.stringify({
      seniorId: senior.id,
      reminderContext: reminder,
    }),
  });

  // Dial the senior's phone via SIP
  await sipClient.createSipParticipant(
    process.env.SIP_OUTBOUND_TRUNK_ID!,
    senior.phone,
    roomName,
    { participantIdentity: `caller_${senior.phone}` },
  );
}
```

---

## What Gets Eliminated vs. Kept

### Eliminated (handled by LiveKit)

| What | Current LOC | Replaced By |
|------|-------------|-------------|
| WebSocket handler + Twilio media stream | 202 | LiveKit SIP Bridge + Room |
| ElevenLabs WebSocket TTS adapter | 270 | `@livekit/agents-plugin-elevenlabs` |
| Deepgram connection management | ~60 | `@livekit/agents-plugin-deepgram` |
| Audio codec conversion | 135 | LiveKit SIP Bridge |
| Conversation Director (fast-observer) | 647 | Tools + `llmNode` context injection |
| Sentence buffering + streaming | ~200 | Built-in TTS streaming |
| Barge-in / interruption handling | ~80 | Built-in (VAD + word timestamps) |
| Silence detection | ~50 | Silero VAD + Turn Detection |
| **Total eliminated** | **~1,644** | |

### Unchanged (stays in Node.js)

| What | LOC | Why Unchanged |
|------|-----|---------------|
| All services (8 files) | 2,337 | Agent imports them directly — same process or same server |
| All routes (13 files) | 1,316 | Express API still serves admin, consumer, caregivers |
| Auth middleware | 196 | API auth unchanged |
| DB schema + client | 260 | Same database |
| React apps (admin, consumer, observability) | N/A | Frontend unchanged |
| **Total unchanged** | **~4,109** | |

### New (LiveKit-specific)

| What | Est. LOC | Purpose |
|------|----------|---------|
| `agent/main.ts` (worker + session) | ~200 | LiveKit worker entrypoint |
| `agent/donna-agent.ts` (agent class) | ~350 | Tools, llmNode, ttsNode, lifecycle |
| `agent/quick-observer.ts` | ~200 | Regex patterns (ported from JS) |
| `agent/claude-integration.ts` | ~50 | Anthropic SDK helpers |
| **Total new** | **~800** | |

---

## Key Architectural Decisions

### 1. Two-Process Architecture

Unlike Pipecat (single Python server), LiveKit requires:
- **Process 1: Express API server** — handles REST API, admin, consumer, webhooks
- **Process 2: LiveKit Agent worker** — handles voice calls, connects to LiveKit server

They share the same `services/` and `db/` code. In Docker:

```yaml
# docker-compose.yml
services:
  api:
    build: .
    command: node index.js
    ports: ["3001:3001"]
    env_file: .env

  agent:
    build: .
    command: node agent/main.js start
    env_file: .env
    depends_on: [api]
```

### 2. No Director — Same as Pipecat Approach

The Conversation Director is eliminated. Its responsibilities:
- **Call phase tracking** → Managed in `llmNode` via turn count and guidance injection
- **Topic management** → LLM handles naturally; `session.userdata.topicsDiscussed` prevents repetition
- **Reminder delivery** → LLM system prompt + tool for acknowledgment
- **Engagement monitoring** → Quick Observer detects low engagement

### 3. Claude Integration Is Custom

Since LiveKit has no Anthropic plugin for Node.js, the `llmNode` override calls the Anthropic SDK directly. This means:
- You own the full LLM integration (streaming, tool handling)
- You can optimize the Claude call (prompt caching, dynamic tokens)
- But: tool execution round-trips must be handled manually if using Claude tool_use

### 4. Semantic Turn Detection Is the Big Win

LiveKit's `MultilingualModel` turn detector understands when a sentence is complete vs. when the senior is pausing mid-thought. This is the single biggest UX improvement for elderly callers — no more cutting off seniors mid-pause.

### 5. Services Stay in Node.js — No Porting

Unlike Pipecat (which requires Python ports of all services), LiveKit keeps everything in Node.js. The agent worker imports services directly:

```typescript
// In donna-agent.ts — importing existing Node.js services
import { memoryService } from '../services/memory.js';
import { newsService } from '../services/news.js';
```

---

## Deployment Options

### Option A: LiveKit Cloud + Railway (Recommended for start)

- **LiveKit Cloud** hosts the agent worker ($500/mo Scale plan, or $50/mo Ship plan to start)
- **Railway** continues hosting the Express API server
- **Twilio SIP Trunk** connects to LiveKit Cloud's SIP endpoint

```bash
# Deploy agent to LiveKit Cloud
lk cloud secrets set ANTHROPIC_API_KEY=... DEEPGRAM_API_KEY=... DATABASE_URL=...
lk cloud deploy
```

### Option B: Self-Hosted (single server)

Run both processes on Railway:

```dockerfile
# Dockerfile with supervisor for two processes
FROM node:22-slim
WORKDIR /app
COPY . .
RUN npm ci && npm run build

# Install supervisor
RUN apt-get update && apt-get install -y supervisor

COPY supervisord.conf /etc/supervisor/conf.d/
CMD ["/usr/bin/supervisord"]
```

### Option C: LiveKit Cloud Phone Numbers (Drop Twilio)

LiveKit sells phone numbers directly ($1/mo, $0.01/min inbound):
- Fewer network hops (no Twilio SIP intermediary)
- Potentially lower telephony latency
- But: requires migrating phone numbers away from Twilio

---

## Comparison: LiveKit vs Current Architecture

| Dimension | Current (Custom Node.js) | LiveKit Agents |
|-----------|-------------------------|----------------|
| **Language** | JavaScript | TypeScript (stays in Node ecosystem) |
| **Transport** | Twilio WebSocket | LiveKit SIP → WebRTC |
| **VAD** | None (silence timer) | Silero VAD (built-in) |
| **Turn Detection** | Deepgram UtteranceEnd + 1.5s silence | Semantic EOUModel |
| **Interruption** | `isSpeaking` flag + Twilio `clear` | Word-level timestamps + context truncation |
| **STT** | Deepgram (manual WebSocket) | Deepgram (plugin, managed lifecycle) |
| **TTS** | ElevenLabs (manual WebSocket) | ElevenLabs (plugin, managed lifecycle) |
| **LLM** | Claude (via adapter) | Claude (custom `llmNode` via Anthropic SDK) |
| **Context Management** | Last 20 turns raw | `ChatContext` + manual management |
| **Scaling** | Single process (in-memory state) | Worker pool + job dispatch |
| **Services** | Direct imports | Direct imports (same Node.js code) |
| **API server** | Express (same process) | Express (separate process) |
| **Infrastructure** | Railway only | Railway + LiveKit Cloud (or self-hosted) |

---

## Migration Effort Estimate

| Phase | Work | Duration |
|-------|------|----------|
| **Phase 1: Agent skeleton** | main.ts, donna-agent.ts with basic Claude + tools | 2-3 days |
| **Phase 2: Quick Observer port** | Port regex patterns to TypeScript | 1 day |
| **Phase 3: Twilio SIP trunk** | Configure inbound/outbound SIP | 1-2 days |
| **Phase 4: Outbound calls** | Update scheduler to use LiveKit SIP API | 1 day |
| **Phase 5: Tool integration** | Wire up memory, news, reminders as tools | 1-2 days |
| **Phase 6: Two-process deployment** | Docker, Railway/LiveKit Cloud config | 1-2 days |
| **Phase 7: Integration testing** | End-to-end calls, tool execution, SIP quality | 3-5 days |
| **Phase 8: Senior testing** | Real calls with elderly users, tuning | 2-3 days |
| **Total** | | **12-18 days** |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| SIP telephony latency (+1-2s reported) | Seniors experience slow responses | Test early; use LiveKit Phone Numbers to skip Twilio hop; consider keeping Twilio WebSocket as fallback |
| No Claude plugin — custom `llmNode` | Must handle streaming, tool calls manually | Well-documented pattern; Anthropic SDK is mature |
| Node.js SDK active bugs (memory leaks, STT race conditions) | Production instability | Pin SDK version; monitor GitHub issues; have fallback to current pipeline |
| Two-process architecture complexity | More infrastructure to manage | Docker Compose; or LiveKit Cloud handles agent process |
| LiveKit Cloud cost ($500/mo Scale) | Higher infrastructure cost | Start with Ship plan ($50/mo); self-host if needed |
| No `RESET_WITH_SUMMARY` built-in | Context grows unbounded in long calls | Implement manual summarization in `llmNode` when turn count exceeds threshold |

---

## What LiveKit Gives That Pipecat Doesn't

| Feature | LiveKit | Pipecat |
|---------|---------|---------|
| **Stay in Node.js** | Yes | No (Python required) |
| **Existing services unchanged** | Yes (direct imports) | No (must port to Python) |
| **Semantic turn detection** | EOUModel (built-in) | Smart Turn (separate, less integrated) |
| **Noise cancellation** | `BackgroundVoiceCancellation()` built-in | Not built-in |
| **Worker scaling model** | Built-in job dispatch + load balancing | Manual (Fly.io VMs or Pipecat Cloud) |
| **Browser calls** | Native WebRTC rooms | Requires Daily transport or SmallWebRTC |
| **Context summarization** | Must implement yourself | `RESET_WITH_SUMMARY` built-in via Flows |
| **Call phase state machine** | Must implement yourself | Pipecat Flows (built-in) |
| **Claude support** | Custom `llmNode` (no plugin) | `AnthropicLLMService` (full plugin) |

---

*This document maps Donna's codebase to a LiveKit Agents Node.js implementation. The migration preserves all existing services, routes, and database code (~4,109 lines unchanged), eliminates ~1,644 lines of infrastructure code, and adds ~800 lines of LiveKit-specific integration.*
