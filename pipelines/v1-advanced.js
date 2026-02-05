import { createClient } from '@deepgram/sdk';
import twilio from 'twilio';
import { ElevenLabsAdapter } from '../adapters/elevenlabs.js';
import { ElevenLabsStreamingTTS } from '../adapters/elevenlabs-streaming.js';
import { pcm24kToMulaw8k } from '../audio-utils.js';
import { memoryService } from '../services/memory.js';
import { schedulerService } from '../services/scheduler.js';
import { contextCacheService } from '../services/context-cache.js';
import { greetingService } from '../services/greetings.js';
import { quickAnalyze } from './quick-observer.js';
import { runDirectorPipeline, formatDirectorGuidance } from './fast-observer.js';
import { getAdapter, isModelAvailable } from '../adapters/llm/index.js';
import { analyzeCompletedCall, saveCallAnalysis, getHighSeverityConcerns } from '../services/call-analysis.js';
import { conversationService } from '../services/conversations.js';
import { dailyContextService } from '../services/daily-context.js';

// Twilio client for programmatic call ending
const twilioClient = (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

// Feature flag for streaming - set to false for rollback
const V1_STREAMING_ENABLED = process.env.V1_STREAMING_ENABLED !== 'false';

// Model configuration
const VOICE_MODEL = process.env.VOICE_MODEL || 'claude-sonnet';  // Main voice model
const DEFAULT_MAX_TOKENS = 150;

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
 * Strip <guidance> tags and their content from text
 * These are private instructions that should not be spoken aloud
 */
function stripGuidanceTags(text) {
  // Remove complete guidance blocks
  let cleaned = text.replace(/<guidance>[\s\S]*?<\/guidance>/gi, '');

  // Also remove any partial opening tag at the end (streaming edge case)
  cleaned = cleaned.replace(/<guidance>[\s\S]*$/gi, '');

  // Remove any orphaned closing tags
  cleaned = cleaned.replace(/<\/guidance>/gi, '');

  // Clean up extra whitespace left behind
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  return cleaned;
}

/**
 * Check if text contains an unclosed guidance tag (still streaming)
 */
function hasUnclosedGuidanceTag(text) {
  const openCount = (text.match(/<guidance>/gi) || []).length;
  const closeCount = (text.match(/<\/guidance>/gi) || []).length;
  return openCount > closeCount;
}

/**
 * Build system prompt - full context, adapters handle any quirks
 */
const buildSystemPrompt = (senior, memoryContext, reminderPrompt = null, observerSignal = null, dynamicMemoryContext = null, quickObserverGuidance = null, directorGuidance = null, previousCallsSummary = null, newsContext = null, deliveredReminders = [], conversationTracking = null, todaysContext = null) => {
  let prompt = `You are Donna, a warm and caring AI voice companion making a phone call to an elderly person. Your primary goal is to understand the person's spoken words, even if the speech-to-text transcription contains errors. Your responses will be converted to speech using a text-to-speech system, so your output must be plain, natural-sounding text.

CRITICAL - YOUR OUTPUT IS SPOKEN ALOUD:
- Output ONLY the exact words Donna speaks
- Your entire response will be converted to audio - every character will be spoken
- NEVER include tags, thinking, reasoning, XML, or any markup in your output
- NEVER include stage directions like "laughs", "pauses", "speaks with empathy"
- NEVER include action descriptions, internal thoughts, or formatting like bullet points
- Respond in plain text only - no special characters, asterisks, or symbols that don't belong in speech
- Your response should sound natural and conversational when read aloud

SPEECH-TO-TEXT AWARENESS:
- The person's words come through speech-to-text which may contain errors
- Silently correct for likely transcription errors - focus on intended meaning, not literal text
- If a word sounds like another word in context, infer and correct without mentioning the error
- For example, if transcription says "I need to go to the doctor too morrow" understand it as "I need to go to the doctor tomorrow"
- If you truly cannot understand what they said, warmly ask them to repeat: "I'm sorry, could you say that again for me?"

RESPONSE FORMAT:
- 1-2 sentences MAX - keep it short and direct
- Answer briefly, then ask ONE follow-up question
- NEVER say "dear" or "dearie"
- Just speak naturally as Donna would
- Prioritize clarity and accuracy in every response

CONVERSATION BALANCE - INTEREST USAGE:
- Do NOT lead every conversation with their stored interests
- Let interests emerge naturally from what they share
- If they mention something, THEN connect it to a known interest
- Vary which interests you reference - don't always ask about the same ones
- Sometimes just listen and respond without bringing up interests at all
- Interests are context to help you relate, not a checklist to cover

CONVERSATION BALANCE - QUESTION FREQUENCY:
- Avoid asking more than 2 questions in a row - it feels like an interrogation
- After 2 questions, share an observation, story, or react to what they said
- Match their energy: if they're talkative, ask fewer questions and listen more
- If they give short answers, try ONE open-ended question, then share something yourself
- Conversation is a dance - balance questions with statements and reactions`;

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

  // Same-day cross-call context
  if (todaysContext) {
    prompt += `\n\n${todaysContext}`;
  }

  if (memoryContext) {
    prompt += `\n\n${memoryContext}`;
  }

  if (reminderPrompt) {
    prompt += reminderPrompt;
  }

  // Inform about already-delivered reminders to prevent repetition
  if (deliveredReminders.length > 0) {
    prompt += `\n\nREMINDERS ALREADY DELIVERED THIS CALL (do NOT repeat these):`;
    prompt += `\n${deliveredReminders.map(r => `- ${r}`).join('\n')}`;
    prompt += `\nIf they bring up a delivered reminder again, say something like "As I mentioned earlier..." instead of repeating the full reminder.`;
  }

  if (conversationTracking) {
    prompt += `\n\n${conversationTracking}`;
  }

  // Always inject memories (short facts)
  if (dynamicMemoryContext) {
    prompt += `\n\n${dynamicMemoryContext}`;
  }

  // Inject news/current events context (from web search)
  if (newsContext) {
    prompt += `\n\n${newsContext}`;
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

    // Track delivered reminders as a Set for deduplication
    this.deliveredReminderSet = new Set();

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
    this.todaysContext = null; // Same-day cross-call context

    // Per-call metrics accumulation
    this.turnMetrics = [];

    // In-call conversation tracking (prevent repetition)
    this.topicsDiscussed = [];      // Topics that came up (e.g., "gardening", "grandkids")
    this.questionsAsked = [];       // Questions Donna asked
    this.adviceGiven = [];          // Advice/suggestions Donna provided
    this.storiesShared = [];        // Facts or anecdotes Donna mentioned

    // Silence detection for turn-taking
    this.lastAudioTime = Date.now();
    this.silenceThreshold = 1500; // 1.5s of silence = end of turn
    this.silenceCheckInterval = null;

    // Graceful call ending state
    this.seniorSaidGoodbye = false;   // Senior said goodbye
    this.donnaSaidGoodbye = false;    // Donna responded with goodbye
    this.callEndingInitiated = false; // Call termination timer started
    this.callEndTimer = null;         // Timer for post-goodbye silence
    this.callTerminationReason = null; // Why the call ended
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

    // If call ending was initiated and senior speaks again, cancel it
    if (this.callEndingInitiated) {
      console.log(`[V1][${this.streamSid}] Senior spoke during call ending - cancelling auto-hangup`);
      this.cancelCallEnding();
    }
  }

  /**
   * Initiate graceful call ending after mutual goodbyes
   * Waits for a period of silence before terminating the call via Twilio
   */
  initiateCallEnding() {
    if (this.callEndingInitiated) return;

    this.callEndingInitiated = true;
    const silenceWait = 4000; // 4 seconds of silence after Donna's goodbye

    console.log(`[V1][${this.streamSid}] Call ending initiated - waiting ${silenceWait}ms for silence`);

    this.callEndTimer = setTimeout(async () => {
      // Double-check that the senior hasn't spoken since we started waiting
      const silenceSinceLastAudio = Date.now() - this.lastAudioTime;
      if (silenceSinceLastAudio < 2000) {
        console.log(`[V1][${this.streamSid}] Recent audio detected (${silenceSinceLastAudio}ms ago), cancelling auto-hangup`);
        this.callEndingInitiated = false;
        return;
      }

      await this.terminateCall('mutual_goodbye');
    }, silenceWait);
  }

  /**
   * Cancel a pending call ending (e.g., if senior speaks again)
   */
  cancelCallEnding() {
    if (this.callEndTimer) {
      clearTimeout(this.callEndTimer);
      this.callEndTimer = null;
    }
    this.callEndingInitiated = false;
    // Reset goodbye state since conversation is continuing
    this.seniorSaidGoodbye = false;
    this.donnaSaidGoodbye = false;
  }

  /**
   * Terminate the call via Twilio REST API
   * @param {string} reason - Why the call is ending
   */
  async terminateCall(reason) {
    this.callTerminationReason = reason;
    console.log(`[V1][${this.streamSid}] Terminating call (reason: ${reason}, callSid: ${this.callSid})`);

    if (!this.callSid) {
      console.log(`[V1][${this.streamSid}] No callSid available, cannot terminate via Twilio`);
      return;
    }

    if (!twilioClient) {
      console.log(`[V1][${this.streamSid}] Twilio client not configured, cannot terminate call`);
      return;
    }

    try {
      await twilioClient.calls(this.callSid).update({ status: 'completed' });
      console.log(`[V1][${this.streamSid}] Call terminated successfully via Twilio API`);
    } catch (error) {
      console.error(`[V1][${this.streamSid}] Failed to terminate call via Twilio:`, error.message);
    }
  }

  /**
   * Check if Donna's response contains goodbye language
   * Used to detect when Donna has said her goodbye so we can start the silence timer
   */
  checkDonnaGoodbye(responseText) {
    const goodbyePattern = /\b(goodbye|bye|goodnight|take care|talk to you (later|soon|tomorrow|next time)|see you|have a (good|great|nice|lovely|wonderful) (day|night|evening|afternoon)|until (next time|tomorrow))\b/i;
    return goodbyePattern.test(responseText);
  }

  /**
   * Generate personalized greeting using the greeting rotation service
   * Falls back to this when no cached greeting is available
   */
  async generateGreeting() {
    // If no senior context, use simple greeting
    if (!this.senior) {
      return `Hello! It's Donna calling to check in. How are you doing today?`;
    }

    // Fetch recent memories and last call summary in parallel
    let recentMemories = [];
    let lastCallSummary = null;

    if (this.senior?.id) {
      try {
        const [memories, summaries] = await Promise.all([
          memoryService.getRecent(this.senior.id, 10),
          conversationService.getRecentSummaries(this.senior.id, 1),
        ]);
        recentMemories = memories;
        lastCallSummary = summaries || null;
        console.log(`[V1][${this.streamSid}] Greeting context: ${recentMemories.length} memories, lastCall=${lastCallSummary ? 'yes' : 'no'}`);
      } catch (e) {
        console.error(`[V1][${this.streamSid}] Greeting context fetch error:`, e.message);
      }
    }

    const { greeting, period, templateIndex, selectedInterest } = greetingService.getGreeting({
      seniorName: this.senior.name,
      timezone: this.senior.timezone,
      interests: this.senior.interests,
      lastCallSummary,
      recentMemories,
      seniorId: this.senior.id,
    });

    console.log(`[V1][${this.streamSid}] Generated greeting: period=${period}, template=${templateIndex}, interest=${selectedInterest || 'none'}`);
    return greeting;
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

    // Load same-day cross-call context
    if (this.senior?.id) {
      try {
        this.todaysContext = await dailyContextService.getTodaysContext(
          this.senior.id,
          this.senior.timezone
        );
        if (this.todaysContext?.previousCallCount > 0) {
          console.log(`[V1][${this.streamSid}] Same-day context: ${this.todaysContext.previousCallCount} previous calls today, ${this.todaysContext.remindersDelivered?.length || 0} reminders already delivered`);
        }
      } catch (e) {
        console.log(`[V1][${this.streamSid}] Could not load today's context: ${e.message}`);
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
   * Track a reminder as delivered (deduplicated)
   * @param {string} reminderKey - Reminder title or ID
   * @param {string} source - How it was detected ('director', 'acknowledgment', 'response')
   */
  markReminderDelivered(reminderKey, source = 'unknown') {
    if (!reminderKey || this.deliveredReminderSet.has(reminderKey)) return;

    this.deliveredReminderSet.add(reminderKey);
    this.callState.remindersDelivered.push(reminderKey);

    const turnNumber = this.conversationLog.length;
    console.log(`[V1][${this.streamSid}] Reminder delivered: "${reminderKey}" (source: ${source}, turn: ${turnNumber})`);
  }

  /**
   * Update call state timing
   */
  updateCallState() {
    this.callState.minutesElapsed = (Date.now() - this.callState.startTime) / 60000;
  }

  /**
   * Extract conversation elements from Donna's response and user message
   * Used for in-call repetition prevention
   */
  extractConversationElements(responseText, userMessage) {
    const questions = [];
    const advice = [];
    const topics = [];

    // Extract questions from Donna's response (sentences ending in ?)
    if (responseText) {
      const questionMatches = responseText.match(/[^.!?]*\?/g);
      if (questionMatches) {
        for (const q of questionMatches) {
          const trimmed = q.trim();
          // Keep short summary (max 5 words from the question)
          const words = trimmed.split(/\s+/).slice(0, 5).join(' ');
          if (words) questions.push(words);
        }
      }

      // Extract advice phrases from Donna's response
      const advicePattern = /(?:you should|try to|don't forget to|make sure to|remember to|how about)[^.!?]*/gi;
      const adviceMatches = responseText.match(advicePattern);
      if (adviceMatches) {
        for (const a of adviceMatches) {
          const words = a.trim().split(/\s+/).slice(0, 5).join(' ');
          if (words) advice.push(words);
        }
      }
    }

    // Extract topic keywords from user message
    if (userMessage) {
      const lower = userMessage.toLowerCase();
      // Common activity/topic words
      const topicPatterns = [
        /\b(garden(?:ing)?|plant(?:ing|s)?|flower(?:s)?)\b/i,
        /\b(cook(?:ing)?|bak(?:ing)?|recipe(?:s)?|dinner|lunch|breakfast)\b/i,
        /\b(walk(?:ing)?|exercise|yoga|swimming)\b/i,
        /\b(read(?:ing)?|book(?:s)?|newspaper)\b/i,
        /\b(church|prayer|service|bible)\b/i,
        /\b(tv|television|show(?:s)?|movie(?:s)?|watch(?:ing)?)\b/i,
        /\b(grandkid(?:s)?|grandchild(?:ren)?|grandson|granddaughter)\b/i,
        /\b(son|daughter|brother|sister|husband|wife|family)\b/i,
        /\b(doctor|hospital|appointment|medication|medicine|pill(?:s)?)\b/i,
        /\b(weather|rain(?:ing)?|snow(?:ing)?|sunny|cold|hot)\b/i,
        /\b(sleep(?:ing)?|nap|rest(?:ing)?|tired)\b/i,
        /\b(friend(?:s)?|neighbor(?:s)?|visitor(?:s)?|company)\b/i,
        /\b(pain|ache|hurt(?:ing)?|sore|dizzy|fall|fell)\b/i,
        /\b(bird(?:s)?|cat(?:s)?|dog(?:s)?|pet(?:s)?)\b/i,
        /\b(music|sing(?:ing)?|radio|song(?:s)?)\b/i,
        /\b(craft(?:s)?|knit(?:ting)?|sew(?:ing)?|puzzle(?:s)?)\b/i,
      ];

      for (const pattern of topicPatterns) {
        const match = lower.match(pattern);
        if (match) {
          topics.push(match[1]);
        }
      }
    }

    return { questions, advice, topics };
  }

  /**
   * Track conversation elements from Quick Observer signals
   */
  trackTopicsFromSignals(quickResult) {
    if (quickResult.healthSignals?.length > 0) {
      if (!this.topicsDiscussed.includes('health')) {
        this.topicsDiscussed.push('health');
      }
    }
    if (quickResult.familySignals?.length > 0) {
      if (!this.topicsDiscussed.includes('family')) {
        this.topicsDiscussed.push('family');
      }
    }
    if (quickResult.activitySignals?.length > 0) {
      for (const signal of quickResult.activitySignals) {
        const topic = String(signal).toLowerCase().split(/\s+/).slice(0, 2).join(' ');
        if (topic && !this.topicsDiscussed.includes(topic)) {
          this.topicsDiscussed.push(topic);
        }
      }
    }
    if (quickResult.emotionSignals?.length > 0) {
      const negatives = quickResult.emotionSignals.filter(e => e.valence === 'negative');
      if (negatives.length > 0 && !this.topicsDiscussed.includes('emotions')) {
        this.topicsDiscussed.push('emotions');
      }
    }
  }

  /**
   * Update tracking arrays with extracted elements, enforcing size limits
   */
  recordConversationElements(elements) {
    if (elements.questions?.length > 0) {
      this.questionsAsked.push(...elements.questions);
      if (this.questionsAsked.length > 8) {
        this.questionsAsked = this.questionsAsked.slice(-8);
      }
    }
    if (elements.advice?.length > 0) {
      this.adviceGiven.push(...elements.advice);
      if (this.adviceGiven.length > 8) {
        this.adviceGiven = this.adviceGiven.slice(-8);
      }
    }
    if (elements.topics?.length > 0) {
      for (const t of elements.topics) {
        if (!this.topicsDiscussed.includes(t)) {
          this.topicsDiscussed.push(t);
        }
      }
      if (this.topicsDiscussed.length > 10) {
        this.topicsDiscussed = this.topicsDiscussed.slice(-10);
      }
    }
  }

  /**
   * Get a formatted summary of conversation tracking for the system prompt
   */
  getConversationTrackingSummary() {
    const sections = [];

    if (this.topicsDiscussed.length > 0) {
      sections.push(`- Topics discussed: ${this.topicsDiscussed.join(', ')}`);
    }
    if (this.questionsAsked.length > 0) {
      sections.push(`- Questions you've asked: ${this.questionsAsked.join('; ')}`);
    }
    if (this.adviceGiven.length > 0) {
      sections.push(`- Advice you've given: ${this.adviceGiven.join('; ')}`);
    }

    if (sections.length === 0) return null;

    return `CONVERSATION SO FAR THIS CALL (avoid repeating):\n${sections.join('\n')}\nBuild on these topics rather than reintroducing them. Ask NEW questions.`;
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

  /**
   * Send a quick buffer response while waiting for web search
   * Used when user asks about news/weather/current events
   */
  async sendBufferResponse(bufferText = "Let me check on that for you...") {
    if (!process.env.ELEVENLABS_API_KEY) {
      console.log(`[V1][${this.streamSid}] ELEVENLABS_API_KEY not set, skipping buffer`);
      return;
    }

    const startTime = Date.now();
    console.log(`[V1][${this.streamSid}] Sending buffer response: "${bufferText}"`);

    try {
      const pcmBuffer = await this.tts.textToSpeech(bufferText);
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
      console.log(`[V1][${this.streamSid}] Buffer response sent in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error(`[V1][${this.streamSid}] Buffer response failed:`, error.message);
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
        endpointing: 300, // Faster turn detection (reduced from 500ms)
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

    // Quick Observer (Layer 1) - check if this needs web search (news/weather/etc)
    const quickCheck = quickAnalyze(text);
    const needsWebSearch = quickCheck.needsWebSearch;

    // Track goodbye signals from the senior
    if (quickCheck.goodbyeSignals?.length > 0) {
      const hasStrongGoodbye = quickCheck.goodbyeSignals.some(g => g.strength === 'strong');
      if (hasStrongGoodbye) {
        this.seniorSaidGoodbye = true;
        console.log(`[V1][${this.streamSid}] Senior goodbye detected: ${quickCheck.goodbyeSignals.map(g => g.signal).join(', ')}`);
      }
    }

    // Track news context for this turn
    let currentNewsContext = null;

    if (needsWebSearch) {
      // Buffer response pattern: send "let me check" while fetching news
      console.log(`[V1][${this.streamSid}] News intent detected (${quickCheck.newsSignals.join(', ')}), using buffer pattern`);

      // Send buffer response immediately (non-blocking feel)
      await this.sendBufferResponse("Let me check on that for you...");

      // Log buffer to conversation
      this.conversationLog.push({
        role: 'assistant',
        content: "Let me check on that for you...",
        timestamp: new Date().toISOString()
      });

      // Now await Director pipeline to get news results
      try {
        const directorResult = await runDirectorPipeline(
          text,
          this.conversationLog,
          this.senior?.id,
          this.senior,
          this.callState
        );

        this.lastDirectorResult = directorResult;
        const dir = directorResult.direction;
        console.log(`[V1][${this.streamSid}] Director (awaited): phase=${dir?.analysis?.call_phase}, news=${directorResult.currentEvents ? 'fetched' : 'none'}`);

        // Extract news context
        if (directorResult.currentEvents?.content) {
          currentNewsContext = directorResult.currentEvents.content;
          console.log(`[V1][${this.streamSid}] News context ready: ${currentNewsContext.substring(0, 100)}...`);
        }

        // Update memories from director's semantic search
        if (directorResult.memories?.length > 0) {
          const memoryText = directorResult.memories.map(m => `- ${m.content}`).join('\n');
          this.dynamicMemoryContext = `\n\nFrom previous conversations:\n${memoryText}`;
        }

        // Track reminder delivery
        if (dir?.reminder?.should_deliver && dir?.reminder?.which_reminder) {
          this.markReminderDelivered(dir.reminder.which_reminder, 'director');
        }
      } catch (e) {
        console.error(`[V1][${this.streamSid}] Director error (awaited):`, e.message);
      }
    } else {
      // Normal flow: Start Director in background (not awaited)
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
          this.markReminderDelivered(dir.reminder.which_reminder, 'director');
        }
      }).catch(e => {
        console.error(`[V1][${this.streamSid}] Director error:`, e.message);
      });
    }

    // Generate and send response (streaming or blocking based on feature flag)
    const useStreaming = V1_STREAMING_ENABLED && process.env.ELEVENLABS_API_KEY;
    console.log(`[V1][${this.streamSid}] Response mode: ${useStreaming ? 'STREAMING' : 'BLOCKING'}, newsContext: ${currentNewsContext ? 'yes' : 'no'}`);
    if (useStreaming) {
      await this.generateAndSendResponseStreaming(text, currentNewsContext);
    } else {
      await this.generateAndSendResponse(text, currentNewsContext);
    }

    // Process any pending utterances
    if (this.pendingUtterances.length > 0) {
      const next = this.pendingUtterances.shift();
      await this.processUserUtterance(next);
    }
  }

  async generateAndSendResponse(userMessage, newsContext = null) {
    this.isProcessing = true;
    this.wasInterrupted = false; // Reset interrupt flag
    const startTime = Date.now();

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

          // Also mark in in-call tracking to prevent re-delivery
          const reminderTitle = this.callState.pendingReminders?.[0]?.title;
          if (reminderTitle) {
            this.markReminderDelivered(reminderTitle, 'acknowledgment');
          }
        }
      }

      // Get Director guidance from previous turn (if available)
      const directorGuidance = this.lastDirectorResult?.direction
        ? formatDirectorGuidance(this.lastDirectorResult.direction)
        : null;

      // Track topics from Quick Observer signals
      this.trackTopicsFromSignals(quickResult);

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
        this.previousCallsSummary,
        newsContext,
        this.callState.remindersDelivered,
        this.getConversationTrackingSummary(),
        this.todaysContext ? dailyContextService.formatTodaysContext(this.todaysContext) : null
      );
      console.log(`[V1][${this.streamSid}] System prompt built: memory=${this.memoryContext ? this.memoryContext.length : 0} chars, news=${newsContext ? 'yes' : 'no'}, senior=${this.senior?.name || 'none'}, deliveredReminders=${this.callState.remindersDelivered.length}`);

      // Build messages array
      const messages = this.conversationLog
        .slice(-20) // Keep last 20 exchanges for better in-conversation memory
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
      const { text: responseText, usage } = await adapter.generate(systemPrompt, messages, {
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
        timestamp: new Date().toISOString(),
        metrics: {
          model: modelConfig.model,
          maxTokens: modelConfig.max_tokens,
          inputTokens: usage?.inputTokens || 0,
          outputTokens: usage?.outputTokens || 0,
          responseTime: Date.now() - startTime,
          tokenReason: modelConfig.reason,
        },
      });

      this.turnMetrics.push({
        inputTokens: usage?.inputTokens || 0,
        outputTokens: usage?.outputTokens || 0,
        responseTime: Date.now() - startTime,
        model: modelConfig.model,
      });

      // Track conversation elements for repetition prevention
      const elements = this.extractConversationElements(responseText, userMessage);
      this.recordConversationElements(elements);

      // Convert to speech and send to Twilio
      await this.textToSpeechAndSend(responseText);

      // Check if Donna said goodbye - if mutual, initiate call ending
      if (this.checkDonnaGoodbye(responseText)) {
        this.donnaSaidGoodbye = true;
        console.log(`[V1][${this.streamSid}] Donna goodbye detected in response`);
        if (this.seniorSaidGoodbye) {
          this.initiateCallEnding();
        }
      }

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
  async generateAndSendResponseStreaming(userMessage, newsContext = null) {
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

          // Also mark in in-call tracking to prevent re-delivery
          const reminderTitle = this.callState.pendingReminders?.[0]?.title;
          if (reminderTitle) {
            this.markReminderDelivered(reminderTitle, 'acknowledgment');
          }
        }
      }

      // Get Director guidance from PREVIOUS turn (if available)
      const directorGuidance = this.lastDirectorResult?.direction
        ? formatDirectorGuidance(this.lastDirectorResult.direction)
        : null;

      // Track topics from Quick Observer signals
      this.trackTopicsFromSignals(quickResult);

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
        this.previousCallsSummary,
        newsContext,
        this.callState.remindersDelivered,
        this.getConversationTrackingSummary(),
        this.todaysContext ? dailyContextService.formatTodaysContext(this.todaysContext) : null
      );
      console.log(`[V1][${this.streamSid}] System prompt: memory=${this.memoryContext ? this.memoryContext.length : 0} chars, news=${newsContext ? 'yes' : 'no'}, senior=${this.senior?.name || 'none'}, deliveredReminders=${this.callState.remindersDelivered.length}`);

      // Build messages array
      const messages = this.conversationLog
        .slice(-20) // Keep last 20 exchanges for better in-conversation memory
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
      let usage = null;
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
        const streamResult = await adapter.stream(
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

            // Don't process while inside an unclosed guidance tag (wait for it to complete)
            if (hasUnclosedGuidanceTag(textBuffer)) {
              return;
            }

            // Strip any guidance tags before extracting sentences
            const cleanedBuffer = stripGuidanceTags(textBuffer);

            // Extract complete sentences and send to TTS
            const { complete, remaining } = extractCompleteSentences(cleanedBuffer);
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
        fullResponse = streamResult.text;
        usage = streamResult.usage;
      } catch (error) {
        console.error(`[V1][${this.streamSid}] Streaming error:`, error.message);
      }

      // Send any remaining text (after stripping guidance tags)
      const cleanedRemaining = stripGuidanceTags(textBuffer);
      if (cleanedRemaining.trim() && !this.wasInterrupted) {
        this.streamingTts.streamText(cleanedRemaining);
      }

      // Flush TTS to generate final audio
      if (!this.wasInterrupted) {
        this.streamingTts.flush();
      }

      const totalTime = Date.now() - startTime;
      console.log(`[V1][${this.streamSid}] Response (streaming): "${fullResponse}" [${sentencesSent} sentences, ${totalTime}ms total]`);

      // Log to conversation
      if (fullResponse) {
        const totalTime = Date.now() - startTime;
        this.conversationLog.push({
          role: 'assistant',
          content: fullResponse,
          timestamp: new Date().toISOString(),
          metrics: {
            model: modelConfig.model,
            maxTokens: modelConfig.max_tokens,
            inputTokens: usage?.inputTokens || 0,
            outputTokens: usage?.outputTokens || 0,
            ttfa: firstTokenTime ? firstTokenTime - startTime : null,
            responseTime: totalTime,
            tokenReason: modelConfig.reason,
          },
        });

        this.turnMetrics.push({
          inputTokens: usage?.inputTokens || 0,
          outputTokens: usage?.outputTokens || 0,
          responseTime: totalTime,
          ttfa: firstTokenTime ? firstTokenTime - startTime : null,
          model: modelConfig.model,
        });

        // Track conversation elements for repetition prevention
        const elements = this.extractConversationElements(fullResponse, userMessage);
        this.recordConversationElements(elements);
      }

      // Wait a moment for final audio chunks before closing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check if Donna said goodbye - if mutual, initiate call ending
      if (fullResponse && this.checkDonnaGoodbye(fullResponse)) {
        this.donnaSaidGoodbye = true;
        console.log(`[V1][${this.streamSid}] Donna goodbye detected in streaming response`);
        if (this.seniorSaidGoodbye) {
          this.initiateCallEnding();
        }
      }

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

  getCallMetrics() {
    if (this.turnMetrics.length === 0) return null;

    const totalInputTokens = this.turnMetrics.reduce((s, m) => s + m.inputTokens, 0);
    const totalOutputTokens = this.turnMetrics.reduce((s, m) => s + m.outputTokens, 0);
    const avgResponseTime = Math.round(
      this.turnMetrics.reduce((s, m) => s + m.responseTime, 0) / this.turnMetrics.length
    );
    const ttfaValues = this.turnMetrics.filter(m => m.ttfa != null).map(m => m.ttfa);
    const avgTtfa = ttfaValues.length > 0
      ? Math.round(ttfaValues.reduce((s, v) => s + v, 0) / ttfaValues.length)
      : null;
    const modelsUsed = [...new Set(this.turnMetrics.map(m => m.model))];

    // Cost estimation (rough per-token pricing)
    // Claude Sonnet 4.5: $3/MTok input, $15/MTok output
    const inputCost = (totalInputTokens / 1_000_000) * 3;
    const outputCost = (totalOutputTokens / 1_000_000) * 15;
    const estimatedCost = Math.round((inputCost + outputCost) * 10000) / 10000;

    return {
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      avgResponseTime,
      avgTtfa,
      turnCount: this.turnMetrics.length,
      estimatedCost,
      modelsUsed,
    };
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

    // Save daily context for same-day cross-call memory
    if (this.senior?.id) {
      try {
        await dailyContextService.saveCallContext(this.senior.id, this.callSid, {
          topicsDiscussed: this.topicsDiscussed || [],
          remindersDelivered: [...this.callState.remindersDelivered],
          adviceGiven: this.adviceGiven || [],
          keyMoments: [],
          summary: null, // Filled later by post-call analysis
        });
        console.log(`[V1][${this.streamSid}] Saved daily context`);
      } catch (e) {
        console.error(`[V1][${this.streamSid}] Failed to save daily context:`, e.message);
      }
    }

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

    // Stop intervals and timers
    if (this.silenceCheckInterval) clearInterval(this.silenceCheckInterval);
    if (this.callEndTimer) clearTimeout(this.callEndTimer);

    // Log call termination reason
    const terminationReason = this.callTerminationReason || 'external';
    console.log(`[V1][${this.streamSid}] Call termination reason: ${terminationReason}`);

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
