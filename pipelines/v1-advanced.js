import { createClient } from '@deepgram/sdk';
import { ElevenLabsAdapter } from '../adapters/elevenlabs.js';
import { ElevenLabsStreamingTTS } from '../adapters/elevenlabs-streaming.js';
import { pcm24kToMulaw8k } from '../audio-utils.js';
import { memoryService } from '../services/memory.js';
import { schedulerService } from '../services/scheduler.js';
import { contextCacheService } from '../services/context-cache.js';
import { quickAnalyze } from './quick-observer.js';
import { runDirectorPipeline, formatDirectorGuidance } from './fast-observer.js';
import { getAdapter, isModelAvailable } from '../adapters/llm/index.js';
import { analyzeCompletedCall, saveCallAnalysis, getHighSeverityConcerns } from '../services/call-analysis.js';
import { conversationService } from '../services/conversations.js';

// Feature flag for streaming - set to false for rollback
const V1_STREAMING_ENABLED = process.env.V1_STREAMING_ENABLED !== 'false';

// Model configuration
const VOICE_MODEL = process.env.VOICE_MODEL || 'claude-sonnet';  // Main voice model
const DEFAULT_MAX_TOKENS = 100;

// Log available models
console.log(`[V1] Streaming enabled: ${V1_STREAMING_ENABLED}, ELEVENLABS_API_KEY: ${process.env.ELEVENLABS_API_KEY ? 'set' : 'NOT SET'}`);
console.log(`[V1] Voice model: ${VOICE_MODEL} (${isModelAvailable(VOICE_MODEL) ? 'available' : 'NOT AVAILABLE'})`);
/**
 * Select model and token count based on Director + Quick Observer
 * Director provides comprehensive analysis; Quick Observer provides instant signals
 *
 * @param {object|null} quickResult - Layer 1 quick observer result (instant)
 * @param {object|null} directorResult - Layer 2 director result (from parallel/previous turn)
 * @returns {object} { model, max_tokens, reason }
 */
function selectModelConfig(quickResult, directorResult) {
  let config = {
    model: VOICE_MODEL,
    max_tokens: DEFAULT_MAX_TOKENS,
    reason: 'default'
  };

  // Director's recommendation takes priority (most comprehensive)
  if (directorResult?.model_recommendation || directorResult?.modelRecommendation) {
    const rec = directorResult.model_recommendation || directorResult.modelRecommendation;
    config.max_tokens = rec.max_tokens || DEFAULT_MAX_TOKENS;
    config.reason = rec.reason || 'director';
    // Note: We always use VOICE_MODEL, but director influences tokens
  }

  // Quick observer can escalate tokens if it detects urgent signals
  if (quickResult?.modelRecommendation?.max_tokens) {
    config.max_tokens = Math.max(config.max_tokens, quickResult.modelRecommendation.max_tokens);
    if (config.reason === 'default') {
      config.reason = quickResult.modelRecommendation.reason || 'quick_observer';
    }
  }

  return config;
}

/**
 * Detect sentence boundaries for TTS streaming
 * Returns true if the buffer ends with a complete sentence
 */
function isCompleteSentence(text) {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Check for sentence-ending punctuation
  const endsWithPunctuation = /[.!?]$/.test(trimmed);
  if (!endsWithPunctuation) return false;

  // Avoid splitting on abbreviations (Mr., Mrs., Dr., etc.)
  const abbreviations = /\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|inc|ltd)\.\s*$/i;
  if (abbreviations.test(trimmed)) return false;

  // Avoid splitting on single letters followed by period (initials)
  if (/\b[A-Z]\.\s*$/.test(trimmed)) return false;

  return true;
}

/**
 * Extract complete sentences from buffer
 * Returns { complete: string[], remaining: string }
 */
function extractCompleteSentences(buffer) {
  const sentences = [];
  let remaining = buffer;

  // Split on sentence boundaries while preserving the delimiter
  const parts = buffer.split(/(?<=[.!?])\s+/);

  // Check each part to see if it's a complete sentence
  for (let i = 0; i < parts.length - 1; i++) {
    if (isCompleteSentence(parts[i])) {
      sentences.push(parts[i]);
    } else if (sentences.length > 0) {
      // Append to previous sentence if not complete
      sentences[sentences.length - 1] += ' ' + parts[i];
    } else {
      sentences.push(parts[i]);
    }
  }

  // Last part is the remaining buffer
  remaining = parts[parts.length - 1] || '';

  // If we found complete sentences, update remaining
  if (sentences.length > 0) {
    remaining = parts[parts.length - 1] || '';
  } else {
    remaining = buffer;
  }

  return { complete: sentences, remaining };
}

/**
 * Build system prompt - full context, adapters handle any quirks
 */
const buildSystemPrompt = (senior, memoryContext, reminderPrompt = null, observerSignal = null, dynamicMemoryContext = null, quickObserverGuidance = null, directorGuidance = null, previousCallsSummary = null) => {
  let prompt = `You are Donna, a warm and caring AI companion making a phone call to an elderly person.

RESPONSE FORMAT:
- 1-2 sentences MAX
- Answer briefly, then ask ONE follow-up question
- Output ONLY the exact words Donna speaks - no stage directions, actions, or descriptions
- NEVER output things like "laughs", "pauses", "speaks with empathy", or any action descriptions
- NEVER say "dear" or "dearie"
- <guidance> tags are PRIVATE instructions - follow them but NEVER speak them aloud`;

  if (senior) {
    const firstName = senior.name?.split(' ')[0] || senior.name;
    prompt += `\n\nYou are speaking with ${firstName}.`;
    if (senior.interests?.length) {
      prompt += ` They enjoy: ${senior.interests.join(', ')}.`;
    }
    if (senior.medicalNotes) {
      prompt += ` Health notes: ${senior.medicalNotes}`;
    }
  }

  // Previous call summaries for continuity
  if (previousCallsSummary) {
    prompt += `\n\nRecent calls:\n${previousCallsSummary}`;
  }

  if (memoryContext) {
    prompt += `\n\n${memoryContext}`;
  }

  if (reminderPrompt) {
    prompt += reminderPrompt;
  }

  // Always inject memories (short facts)
  if (dynamicMemoryContext) {
    prompt += `\n\n${dynamicMemoryContext}`;
  }

  // Build guidance parts
  const guidanceParts = [];

  // Quick observer guidance (instant regex-based)
  if (quickObserverGuidance) {
    guidanceParts.push(quickObserverGuidance);
  }

  // Director guidance (comprehensive AI-based from Layer 2)
  // Can be a string (formatted guidance) or object with .guidance property
  if (directorGuidance) {
    if (typeof directorGuidance === 'string') {
      guidanceParts.push(directorGuidance);
    } else if (directorGuidance.guidance) {
      guidanceParts.push(directorGuidance.guidance);
    }
  }

  // Always include guidance - adapters handle formatting
  if (guidanceParts.length > 0) {
    prompt += `\n\n<guidance>\n${guidanceParts.join('\n')}\n</guidance>`;
  }

  return { prompt };
};

/**
 * V1 Advanced Pipeline Session
 * Uses: Deepgram STT → Quick Observer + Conversation Director → Claude → ElevenLabs TTS
 */
export class V1AdvancedSession {
  constructor(twilioWs, streamSid, senior = null, memoryContext = null, reminderPrompt = null, pendingReminders = [], currentDelivery = null, preGeneratedGreeting = null, callType = 'check-in', callSid = null) {
    this.twilioWs = twilioWs;
    this.streamSid = streamSid;
    this.callSid = callSid; // Twilio call SID for database lookups
    this.senior = senior;
    this.memoryContext = memoryContext;
    this.reminderPrompt = reminderPrompt;
    this.preGeneratedGreeting = preGeneratedGreeting;

    // Log what context was received
    console.log(`[V1][${streamSid}] Session created: senior=${senior?.name || 'none'}, memory=${memoryContext ? memoryContext.length + ' chars' : 'none'}, greeting=${preGeneratedGreeting ? 'ready' : 'will generate'}`);
    this.isConnected = false;
    this.conversationLog = [];
    this.memoriesExtracted = false;

    // Call state tracking (for Conversation Director)
    this.callState = {
      startTime: Date.now(),
      minutesElapsed: 0,
      maxDuration: 10, // Default 10 minutes
      callType: callType, // 'check-in', 'reminder', 'scheduled'
      pendingReminders: pendingReminders || [],
      remindersDelivered: [],
    };

    // Reminder acknowledgment tracking
    this.currentDelivery = currentDelivery; // Delivery record for acknowledgment tracking
    this.reminderAcknowledged = false;      // Track if acknowledgment was detected

    // STT (Deepgram)
    this.deepgram = null;
    this.dgConnection = null;
    this.dgConnected = false;
    this.currentTranscript = '';

    // TTS (ElevenLabs)
    this.tts = new ElevenLabsAdapter();
    this.streamingTts = null; // Streaming TTS instance (created per response)

    // Conversation Director cache (Layer 2 results from previous turn)
    this.lastDirectorResult = null;
    this.pendingDirector = null; // Promise for in-flight analysis

    // Processing state
    this.isProcessing = false;
    this.pendingUtterances = [];
    this.isSpeaking = false; // Track if Donna is currently speaking
    this.wasInterrupted = false; // Track if user interrupted during response generation
    this.dynamicMemoryContext = null; // Real-time memory search results

    // Silence detection for turn-taking
    this.lastAudioTime = Date.now();
    this.silenceThreshold = 1500; // 1.5s of silence = end of turn
    this.silenceCheckInterval = null;
  }

  /**
   * Stop current audio playback (barge-in support)
   */
  interruptSpeech() {
    console.log(`[V1][${this.streamSid}] Interrupting speech (barge-in)`);
    this.isSpeaking = false;
    this.wasInterrupted = true;

    // Clear any pending utterances - user interrupted, start fresh
    this.pendingUtterances = [];
    this.currentTranscript = '';

    // Terminate streaming TTS if active
    if (this.streamingTts) {
      this.streamingTts.terminate();
      this.streamingTts = null;
    }

    // Send clear event to Twilio to stop audio playback
    if (this.twilioWs.readyState === 1) {
      this.twilioWs.send(JSON.stringify({
        event: 'clear',
        streamSid: this.streamSid
      }));
    }
  }

  /**
   * Generate personalized greeting using Claude with full context
   */
  async generateGreeting() {
    const firstName = this.senior?.name?.split(' ')[0];

    // If no senior context, use simple greeting
    if (!this.senior) {
      return `Hello! It's Donna calling to check in. How are you doing today?`;
    }

    // Run quick memory search for greeting context
    let recentMemories = [];
    if (this.senior?.id) {
      try {
        recentMemories = await memoryService.getRecent(this.senior.id, 5);
        console.log(`[V1][${this.streamSid}] Greeting context: ${recentMemories.length} recent memories`);
      } catch (e) {
        console.error(`[V1][${this.streamSid}] Memory fetch error:`, e.message);
      }
    }

    // Build greeting prompt with full context
    const greetingPrompt = `You are Donna, calling ${firstName} to check in.

CONTEXT:
- Interests: ${this.senior.interests?.join(', ') || 'unknown'}
${this.memoryContext ? `\n${this.memoryContext}` : ''}
${recentMemories.length > 0 ? `\nRecent memories:\n${recentMemories.map(m => `- ${m.content}`).join('\n')}` : ''}

Generate a warm, personalized greeting (1-2 sentences). Reference something specific from their life - a hobby, recent event, or something you remember about them. End with a question.

RESPOND WITH ONLY THE GREETING TEXT - nothing else.`;

    try {
      const adapter = getAdapter(VOICE_MODEL);
      const greeting = await adapter.generate(greetingPrompt, [], { maxTokens: 100, temperature: 0.8 });
      console.log(`[V1][${this.streamSid}] Generated greeting: "${greeting.substring(0, 50)}..."`);
      return greeting.trim();
    } catch (error) {
      console.error(`[V1][${this.streamSid}] Greeting generation error:`, error.message);
      return `Hello ${firstName}! It's Donna calling to check in. How are you doing today?`;
    }
  }

  async connect() {
    console.log(`[V1][${this.streamSid}] Starting advanced pipeline for ${this.senior?.name || 'unknown'}`);
    this.isConnected = true;

    // Check for cached context first (pre-fetched at 5 AM local time)
    this.previousCallsSummary = null;
    let cachedGreeting = null;

    if (this.senior?.id) {
      const cached = contextCacheService.getCache(this.senior.id);

      if (cached) {
        // Use cached data
        this.previousCallsSummary = cached.summaries;
        cachedGreeting = cached.greeting;
        // Also use cached memory context if not already provided
        if (!this.memoryContext && cached.memoryContext) {
          this.memoryContext = cached.memoryContext;
        }
        console.log(`[V1][${this.streamSid}] Using cached context (age: ${Math.round((Date.now() - cached.cachedAt) / 60000)} min)`);
      } else {
        // Fall back to loading summaries fresh
        try {
          const summaries = await conversationService.getRecentSummaries(this.senior.id, 3);
          if (summaries) {
            this.previousCallsSummary = summaries;
            console.log(`[V1][${this.streamSid}] Loaded previous call summaries (not cached)`);
          }
        } catch (e) {
          console.log(`[V1][${this.streamSid}] Could not load previous summaries: ${e.message}`);
        }
      }
    }

    // Use pre-generated greeting > cached greeting > generate fresh
    const greetingText = this.preGeneratedGreeting || cachedGreeting || await this.generateGreeting();
    if (this.preGeneratedGreeting) {
      console.log(`[V1][${this.streamSid}] Using pre-generated greeting`);
    } else if (cachedGreeting) {
      console.log(`[V1][${this.streamSid}] Using cached greeting`);
    }

    // Log greeting to conversation
    this.conversationLog.push({
      role: 'assistant',
      content: greetingText,
      timestamp: new Date().toISOString()
    });

    // Run Deepgram connection AND greeting TTS in parallel
    await Promise.all([
      this.connectDeepgram(),
      this.sendPrebuiltGreeting(greetingText)
    ]);

    // Clear any transcript that accumulated during greeting and reset timer
    // This prevents silence detection from triggering on stale/noise transcripts
    this.currentTranscript = '';
    this.lastAudioTime = Date.now();

    // Start silence detection
    this.startSilenceDetection();
  }

  /**
   * Update call state timing
   */
  updateCallState() {
    this.callState.minutesElapsed = (Date.now() - this.callState.startTime) / 60000;
  }

  /**
   * Send a pre-built greeting without calling Claude - instant response
   */
  async sendPrebuiltGreeting(greetingText) {
    if (!process.env.ELEVENLABS_API_KEY) {
      console.log(`[V1][${this.streamSid}] ELEVENLABS_API_KEY not set, skipping greeting`);
      return;
    }

    const startTime = Date.now();
    console.log(`[V1][${this.streamSid}] Sending pre-built greeting...`);

    try {
      // Use the regular TTS adapter for the greeting (simpler, still fast)
      const pcmBuffer = await this.tts.textToSpeech(greetingText);
      const mulawBuffer = pcm24kToMulaw8k(pcmBuffer);

      this.isSpeaking = true;

      // Send to Twilio in chunks
      const chunkSize = 3200;
      for (let i = 0; i < mulawBuffer.length; i += chunkSize) {
        if (!this.isSpeaking) break;

        const chunk = mulawBuffer.slice(i, i + chunkSize);
        if (this.twilioWs.readyState === 1) {
          this.twilioWs.send(JSON.stringify({
            event: 'media',
            streamSid: this.streamSid,
            media: { payload: chunk.toString('base64') }
          }));
        }
        await new Promise(resolve => setImmediate(resolve));
      }

      this.isSpeaking = false;
      console.log(`[V1][${this.streamSid}] Greeting sent in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error(`[V1][${this.streamSid}] Greeting failed:`, error.message);
      this.isSpeaking = false;
    }
  }

  async connectDeepgram() {
    if (!process.env.DEEPGRAM_API_KEY) {
      console.log(`[V1][${this.streamSid}] DEEPGRAM_API_KEY not set, STT disabled`);
      return;
    }

    try {
      this.deepgram = createClient(process.env.DEEPGRAM_API_KEY);

      this.dgConnection = this.deepgram.listen.live({
        model: 'nova-2',
        language: 'en-US',
        encoding: 'mulaw',
        sample_rate: 8000,
        channels: 1,
        punctuate: true,
        interim_results: true,
        endpointing: 500, // Faster turn detection
        utterance_end_ms: 1000,
      });

      this.dgConnection.on('open', () => {
        console.log(`[V1][${this.streamSid}] Deepgram connected`);
        this.dgConnected = true;
      });

      this.dgConnection.on('Results', (data) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        if (transcript) {
          // Barge-in: if user speaks while Donna is talking or processing, interrupt
          if ((this.isSpeaking || this.isProcessing) && transcript.length > 2) {
            this.interruptSpeech();
          }

          if (data.is_final) {
            console.log(`[V1][${this.streamSid}] User (final): "${transcript}"`);
            this.currentTranscript += ' ' + transcript;
          }
        }
      });

      this.dgConnection.on('UtteranceEnd', () => {
        // Deepgram detected end of utterance
        if (this.currentTranscript.trim()) {
          this.processUserUtterance(this.currentTranscript.trim());
          this.currentTranscript = '';
        }
      });

      this.dgConnection.on('error', (error) => {
        console.error(`[V1][${this.streamSid}] Deepgram error:`, error.message);
        this.dgConnected = false;
      });

      this.dgConnection.on('close', () => {
        console.log(`[V1][${this.streamSid}] Deepgram closed`);
        this.dgConnected = false;
      });

    } catch (error) {
      console.error(`[V1][${this.streamSid}] Deepgram connection failed:`, error.message);
    }
  }

  startSilenceDetection() {
    this.silenceCheckInterval = setInterval(() => {
      const silenceDuration = Date.now() - this.lastAudioTime;
      if (silenceDuration > this.silenceThreshold && this.currentTranscript.trim()) {
        // Silence detected, process pending transcript
        this.processUserUtterance(this.currentTranscript.trim());
        this.currentTranscript = '';
      }
    }, 500);
  }

  async processUserUtterance(text) {
    if (this.isProcessing) {
      this.pendingUtterances.push(text);
      return;
    }

    // Log to conversation
    this.conversationLog.push({
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    });

    // Update call state timing
    this.updateCallState();

    console.log(`[V1][${this.streamSid}] Processing: "${text}" (seniorId: ${this.senior?.id || 'none'}, ${this.callState.minutesElapsed.toFixed(1)}min)`);

    // Start Conversation Director (Layer 2) in parallel - results used for guidance
    // Don't await - this runs in background and results are used in NEXT turn or current if ready
    this.pendingDirector = runDirectorPipeline(
      text,
      this.conversationLog,
      this.senior?.id,
      this.senior,
      this.callState
    ).then(result => {
      this.lastDirectorResult = result;
      const dir = result.direction;
      console.log(`[V1][${this.streamSid}] Director: phase=${dir?.analysis?.call_phase}, engagement=${dir?.analysis?.engagement_level}, tone=${dir?.guidance?.tone}`);

      // Update memories from director's semantic search
      if (result.memories?.length > 0) {
        const memoryText = result.memories.map(m => `- ${m.content}`).join('\n');
        this.dynamicMemoryContext = `\n\nFrom previous conversations:\n${memoryText}`;
      }

      // Track reminder delivery if director said to deliver
      if (dir?.reminder?.should_deliver && dir?.reminder?.which_reminder) {
        this.callState.remindersDelivered.push(dir.reminder.which_reminder);
      }
    }).catch(e => {
      console.error(`[V1][${this.streamSid}] Director error:`, e.message);
    });

    // Generate and send response (streaming or blocking based on feature flag)
    const useStreaming = V1_STREAMING_ENABLED && process.env.ELEVENLABS_API_KEY;
    console.log(`[V1][${this.streamSid}] Response mode: ${useStreaming ? 'STREAMING' : 'BLOCKING'}`);
    if (useStreaming) {
      await this.generateAndSendResponseStreaming(text);
    } else {
      await this.generateAndSendResponse(text);
    }

    // Process any pending utterances
    if (this.pendingUtterances.length > 0) {
      const next = this.pendingUtterances.shift();
      await this.processUserUtterance(next);
    }
  }

  async generateAndSendResponse(userMessage) {
    this.isProcessing = true;
    this.wasInterrupted = false; // Reset interrupt flag

    try {
      // Layer 1: Quick Observer (0ms) - for post-turn processing
      const quickResult = quickAnalyze(userMessage, this.conversationLog.slice(-6));

      // Check for reminder acknowledgment
      if (this.currentDelivery && !this.reminderAcknowledged && quickResult.reminderResponse) {
        const { type, confidence } = quickResult.reminderResponse;
        console.log(`[V1][${this.streamSid}] Reminder response detected: ${type} (confidence: ${confidence})`);

        if (confidence >= 0.7) {
          this.reminderAcknowledged = true;
          await schedulerService.markReminderAcknowledged(
            this.currentDelivery.id,
            type, // 'acknowledged' or 'confirmed'
            userMessage
          );
          console.log(`[V1][${this.streamSid}] Marked reminder as ${type}`);
        }
      }

      // Get Director guidance from previous turn (if available)
      const directorGuidance = this.lastDirectorResult?.direction
        ? formatDirectorGuidance(this.lastDirectorResult.direction)
        : null;

      // Dynamic model selection based on Director + Quick Observer
      const modelConfig = selectModelConfig(quickResult, this.lastDirectorResult?.direction);

      // Get the adapter for the selected model
      const adapter = getAdapter(modelConfig.model);
      console.log(`[V1][${this.streamSid}] Model: ${modelConfig.model} (${modelConfig.reason}), tokens: ${modelConfig.max_tokens}`);

      // Build system prompt (full context - adapter handles quirks)
      const { prompt: systemPrompt } = buildSystemPrompt(
        this.senior,
        this.memoryContext,
        this.reminderPrompt,
        null, // observerSignal - replaced by Director
        this.dynamicMemoryContext,
        quickResult.guidance,
        directorGuidance,
        this.previousCallsSummary
      );
      console.log(`[V1][${this.streamSid}] System prompt built: memory=${this.memoryContext ? this.memoryContext.length : 0} chars, senior=${this.senior?.name || 'none'}`);

      // Build messages array
      const messages = this.conversationLog
        .slice(-10) // Keep last 20 exchanges for context
        .map(entry => ({
          role: entry.role,
          content: entry.content
        }));

      // Add current message if not from greeting
      if (userMessage && !userMessage.includes('Greet') && !userMessage.includes('greeting')) {
        messages.push({ role: 'user', content: userMessage });
      }

      // Generate response using adapter
      console.log(`[V1][${this.streamSid}] Calling ${adapter.getModelName()}...`);
      const responseText = await adapter.generate(systemPrompt, messages, {
        maxTokens: modelConfig.max_tokens,
      });

      // Check if interrupted during generation - skip TTS if so
      if (this.wasInterrupted) {
        console.log(`[V1][${this.streamSid}] Interrupted during generation, skipping TTS`);
        return;
      }

      console.log(`[V1][${this.streamSid}] Response: "${responseText}"`);

      // Log to conversation
      this.conversationLog.push({
        role: 'assistant',
        content: responseText,
        timestamp: new Date().toISOString()
      });

      // Convert to speech and send to Twilio
      await this.textToSpeechAndSend(responseText);

    } catch (error) {
      console.error(`[V1][${this.streamSid}] Response generation failed:`, error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Streaming response generation - reduces latency from ~1.5s to ~400ms
   * Uses: Quick Observer (0ms) → Claude Streaming → Sentence Buffer → WebSocket TTS
   */
  async generateAndSendResponseStreaming(userMessage) {
    this.isProcessing = true;
    this.wasInterrupted = false;
    const startTime = Date.now();

    try {
      // Layer 1: Quick Observer (0ms) - affects THIS response
      const quickResult = quickAnalyze(userMessage, this.conversationLog.slice(-6));

      if (quickResult.guidance) {
        console.log(`[V1][${this.streamSid}] Quick observer: ${quickResult.healthSignals.length} health, ${quickResult.emotionSignals.length} emotion signals`);
      }

      // Check for reminder acknowledgment
      if (this.currentDelivery && !this.reminderAcknowledged && quickResult.reminderResponse) {
        const { type, confidence } = quickResult.reminderResponse;
        console.log(`[V1][${this.streamSid}] Reminder response detected: ${type} (confidence: ${confidence})`);

        if (confidence >= 0.7) {
          this.reminderAcknowledged = true;
          await schedulerService.markReminderAcknowledged(
            this.currentDelivery.id,
            type, // 'acknowledged' or 'confirmed'
            userMessage
          );
          console.log(`[V1][${this.streamSid}] Marked reminder as ${type}`);
        }
      }

      // Get Director guidance from PREVIOUS turn (if available)
      const directorGuidance = this.lastDirectorResult?.direction
        ? formatDirectorGuidance(this.lastDirectorResult.direction)
        : null;

      // Dynamic model selection based on Director + Quick Observer
      const modelConfig = selectModelConfig(quickResult, this.lastDirectorResult?.direction);

      // Get the adapter for the selected model
      const adapter = getAdapter(modelConfig.model);
      console.log(`[V1][${this.streamSid}] Model: ${modelConfig.model} (${modelConfig.reason}), tokens: ${modelConfig.max_tokens}`);

      // Build system prompt (full context - adapter handles quirks)
      const { prompt: systemPrompt } = buildSystemPrompt(
        this.senior,
        this.memoryContext,
        this.reminderPrompt,
        null, // observerSignal - replaced by Director
        this.dynamicMemoryContext,
        quickResult.guidance,
        directorGuidance,
        this.previousCallsSummary
      );
      console.log(`[V1][${this.streamSid}] System prompt: memory=${this.memoryContext ? this.memoryContext.length : 0} chars, senior=${this.senior?.name || 'none'}`);

      // Build messages array
      const messages = this.conversationLog
        .slice(-10)
        .map(entry => ({
          role: entry.role,
          content: entry.content
        }));

      if (userMessage && !userMessage.includes('Greet') && !userMessage.includes('greeting')) {
        messages.push({ role: 'user', content: userMessage });
      }

      // Create streaming TTS connection
      this.streamingTts = new ElevenLabsStreamingTTS();
      this.streamingTts.onAudioChunk = (pcmBuffer) => {
        if (this.wasInterrupted) return;

        // Convert PCM 24kHz to mulaw 8kHz for Twilio
        const mulawBuffer = pcm24kToMulaw8k(pcmBuffer);

        // Send to Twilio
        if (this.twilioWs.readyState === 1) {
          this.twilioWs.send(JSON.stringify({
            event: 'media',
            streamSid: this.streamSid,
            media: {
              payload: mulawBuffer.toString('base64')
            }
          }));
        }
      };

      this.streamingTts.onError = (error) => {
        console.error(`[V1][${this.streamSid}] Streaming TTS error:`, error.message);
      };

      // Mark as speaking
      this.isSpeaking = true;

      // Start TTS connection first
      await this.streamingTts.connect();

      let fullResponse = '';
      let textBuffer = '';
      let firstTokenTime = null;
      let sentencesSent = 0;

      // Stream using adapter
      console.log(`[V1][${this.streamSid}] Calling ${adapter.getModelName()} (streaming)...`);

      const streamingTts = this.streamingTts;
      const streamSid = this.streamSid;
      const wasInterruptedRef = { value: false };

      // Check for interruption periodically
      const checkInterrupt = () => this.wasInterrupted;

      try {
        fullResponse = await adapter.stream(
          systemPrompt,
          messages,
          { maxTokens: modelConfig.max_tokens },
          async (text) => {
            if (checkInterrupt()) return;

            textBuffer += text;

            if (!firstTokenTime) {
              firstTokenTime = Date.now();
              console.log(`[V1][${streamSid}] First token: ${firstTokenTime - startTime}ms`);
            }

            // Extract complete sentences and send to TTS
            const { complete, remaining } = extractCompleteSentences(textBuffer);
            textBuffer = remaining;

            for (const sentence of complete) {
              if (sentence.trim() && !checkInterrupt()) {
                streamingTts.streamText(sentence + ' ');
                sentencesSent++;
                await new Promise(r => setTimeout(r, 200));
              }
            }
          }
        );
      } catch (error) {
        console.error(`[V1][${this.streamSid}] Streaming error:`, error.message);
      }

      // Send any remaining text
      if (textBuffer.trim() && !this.wasInterrupted) {
        this.streamingTts.streamText(textBuffer);
      }

      // Flush TTS to generate final audio
      if (!this.wasInterrupted) {
        this.streamingTts.flush();
      }

      const totalTime = Date.now() - startTime;
      console.log(`[V1][${this.streamSid}] Response (streaming): "${fullResponse}" [${sentencesSent} sentences, ${totalTime}ms total]`);

      // Log to conversation
      if (fullResponse) {
        this.conversationLog.push({
          role: 'assistant',
          content: fullResponse,
          timestamp: new Date().toISOString()
        });
      }

      // Wait a moment for final audio chunks before closing
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`[V1][${this.streamSid}] Streaming response failed:`, error.message);
    } finally {
      // Clean up streaming TTS
      if (this.streamingTts) {
        this.streamingTts.close();
        this.streamingTts = null;
      }
      this.isSpeaking = false;
      this.isProcessing = false;
    }
  }

  async textToSpeechAndSend(text) {
    if (!process.env.ELEVENLABS_API_KEY) {
      console.log(`[V1][${this.streamSid}] ELEVENLABS_API_KEY not set, TTS disabled`);
      return;
    }

    try {
      console.log(`[V1][${this.streamSid}] Converting to speech...`);

      // Get PCM audio from ElevenLabs (24kHz)
      const pcmBuffer = await this.tts.textToSpeech(text);

      // Convert to mulaw 8kHz for Twilio
      const mulawBuffer = pcm24kToMulaw8k(pcmBuffer);

      // Mark as speaking before sending audio
      this.isSpeaking = true;

      // Send to Twilio in chunks (Twilio expects small packets)
      // Use larger chunks and async to allow barge-in detection
      const chunkSize = 3200; // ~400ms of audio at 8kHz (larger chunks, fewer iterations)
      let bytesSent = 0;

      for (let i = 0; i < mulawBuffer.length; i += chunkSize) {
        // Allow event loop to process incoming Deepgram messages (barge-in detection)
        await new Promise(resolve => setImmediate(resolve));

        // Stop if interrupted by user (barge-in)
        if (!this.isSpeaking) {
          console.log(`[V1][${this.streamSid}] Speech interrupted after ${bytesSent} bytes`);
          break;
        }

        const chunk = mulawBuffer.slice(i, i + chunkSize);
        const base64Chunk = chunk.toString('base64');

        if (this.twilioWs.readyState === 1) {
          this.twilioWs.send(JSON.stringify({
            event: 'media',
            streamSid: this.streamSid,
            media: {
              payload: base64Chunk
            }
          }));
          bytesSent += chunk.length;
        }
      }

      if (this.isSpeaking) {
        console.log(`[V1][${this.streamSid}] Sent ${bytesSent} bytes of audio`);
      }
      this.isSpeaking = false;

    } catch (error) {
      console.error(`[V1][${this.streamSid}] TTS failed:`, error.message);
      this.isSpeaking = false;
    }
  }

  sendAudio(base64Mulaw) {
    if (!this.isConnected) return;

    this.lastAudioTime = Date.now();

    // Send to Deepgram for transcription
    if (this.dgConnected && this.dgConnection) {
      try {
        const mulawBuffer = Buffer.from(base64Mulaw, 'base64');
        this.dgConnection.send(mulawBuffer);
      } catch (error) {
        console.error(`[V1][${this.streamSid}] Audio send error:`, error.message);
      }
    }
  }

  getTranscript() {
    return this.conversationLog
      .map(entry => `${entry.role}: ${entry.content}`)
      .join('\n');
  }

  getConversationLog() {
    return this.conversationLog;
  }

  getSeniorId() {
    return this.senior?.id || null;
  }

  async extractMemories() {
    if (this.memoriesExtracted) return;
    if (!this.senior?.id || this.conversationLog.length === 0) return;

    const transcript = this.getTranscript();
    if (transcript.length < 50) return;

    this.memoriesExtracted = true;
    console.log(`[V1][${this.streamSid}] Extracting memories...`);

    try {
      await memoryService.extractFromConversation(
        this.senior.id,
        transcript,
        this.streamSid
      );
    } catch (error) {
      console.error(`[V1][${this.streamSid}] Memory extraction failed:`, error);
    }
  }

  async close() {
    console.log(`[V1][${this.streamSid}] Closing session...`);

    // Extract memories
    await this.extractMemories();

    // Clear context cache so next call gets fresh data with new memories
    if (this.senior?.id) {
      contextCacheService.clearCache(this.senior.id);
    }

    // Handle reminder delivery status if not acknowledged
    if (this.currentDelivery && !this.reminderAcknowledged) {
      console.log(`[V1][${this.streamSid}] Call ended without reminder acknowledgment`);
      await schedulerService.markCallEndedWithoutAcknowledgment(this.currentDelivery.id);
    }

    // Run post-call analysis (async - don't block close)
    this.runPostCallAnalysis().catch(err => {
      console.error(`[V1][${this.streamSid}] Post-call analysis failed:`, err.message);
    });

    // Stop intervals
    if (this.silenceCheckInterval) clearInterval(this.silenceCheckInterval);

    // Close streaming TTS if active
    if (this.streamingTts) {
      this.streamingTts.terminate();
      this.streamingTts = null;
    }

    // Close Deepgram
    if (this.dgConnection) {
      try {
        this.dgConnection.finish();
      } catch (e) { /* ignore */ }
      this.dgConnection = null;
    }

    this.isConnected = false;
    console.log(`[V1][${this.streamSid}] Session closed. ${this.conversationLog.length} messages`);
  }

  /**
   * Run post-call analysis (async batch job)
   * Generates summary, alerts, and analytics using Gemini Flash
   */
  async runPostCallAnalysis() {
    if (this.conversationLog.length < 4) {
      console.log(`[V1][${this.streamSid}] Skipping post-call analysis (too few messages)`);
      return;
    }

    console.log(`[V1][${this.streamSid}] Running post-call analysis...`);

    try {
      const analysis = await analyzeCompletedCall(
        this.conversationLog,
        this.senior
      );

      console.log(`[V1][${this.streamSid}] Post-call analysis: engagement=${analysis.engagement_score}/10, concerns=${analysis.concerns?.length || 0}`);

      // Save analysis to database (if table exists)
      if (this.senior?.id) {
        await saveCallAnalysis(
          this.streamSid, // Use streamSid as conversation ID
          this.senior.id,
          analysis
        );
      }

      // Save summary to conversation record for cross-call context
      if (analysis.summary && this.callSid) {
        await conversationService.updateSummary(this.callSid, analysis.summary);
      }

      // Check for high-severity concerns
      const highSeverity = getHighSeverityConcerns(analysis);
      if (highSeverity.length > 0) {
        console.log(`[V1][${this.streamSid}] HIGH SEVERITY CONCERNS:`, highSeverity);
        // TODO: Notify caregiver via SMS/email
      }

      return analysis;
    } catch (error) {
      console.error(`[V1][${this.streamSid}] Post-call analysis error:`, error.message);
      throw error;
    }
  }
}
