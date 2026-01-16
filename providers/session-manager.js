/**
 * Session Manager
 * Orchestrates voice provider, memory provider, and telephony
 * This is the main integration point - handles the full call lifecycle
 */

import { getVoiceProvider, getMemoryProvider } from './index.js';
import { base64MulawToBase64Pcm16k, base64Pcm24kToBase64Mulaw8k } from '../audio-utils.js';

// Topics that warrant memory lookup
const MEMORY_TRIGGER_PATTERNS = [
  // Health-related
  /\b(doctor|hospital|medicine|medication|pill|appointment|pain|feeling|sick|health)\b/i,
  // People/relationships
  /\b(son|daughter|wife|husband|grandchild|friend|neighbor|family|visit|called)\b/i,
  // Activities/events
  /\b(birthday|anniversary|holiday|trip|went|visited|remember|forgot|yesterday|last week)\b/i,
  // Emotional states
  /\b(worried|happy|sad|lonely|scared|excited|miss|love)\b/i,
  // Questions about past
  /\b(did i|have i|when did|last time|before|used to)\b/i,
];

export class SessionManager {
  constructor(config = {}) {
    this.config = config;
    this.twilioWs = config.twilioWs;
    this.streamSid = config.streamSid;
    this.senior = config.senior;

    this.voiceProvider = null;
    this.memoryProvider = getMemoryProvider();
    this.memoriesExtracted = false;

    // Memory retrieval state
    this.recentUtterances = [];        // Buffer recent speech for context
    this.lastMemoryLookup = 0;         // Timestamp of last lookup
    this.memoryLookupCooldown = 15000; // 15 seconds between lookups
    this.injectedMemories = new Set(); // Track what we've already injected
  }

  async initialize() {
    // Load memory context
    let memoryContext = null;
    if (this.senior?.id) {
      try {
        memoryContext = await this.memoryProvider.buildContext(this.senior.id);
        console.log(`[Session:${this.streamSid}] Loaded memory context (${memoryContext?.length || 0} chars)`);
      } catch (error) {
        console.error(`[Session:${this.streamSid}] Failed to load memories:`, error);
      }
    }

    // Create and initialize voice provider
    this.voiceProvider = getVoiceProvider({
      apiKey: process.env.GOOGLE_API_KEY,
    });

    // Set up callbacks
    this.voiceProvider.onTranscript = (role, text) => {
      console.log(`[Session:${this.streamSid}] ${role}: "${text}"`);

      // Dynamic memory retrieval on user speech
      if (role === 'user' && this.senior?.id) {
        this._handleUserSpeech(text);
      }
    };

    this.voiceProvider.onAudio = (audioBase64) => {
      this._sendAudioToTwilio(audioBase64);
    };

    this.voiceProvider.onError = (error) => {
      console.error(`[Session:${this.streamSid}] Voice error:`, error);
    };

    // Initialize with context
    await this.voiceProvider.initialize({
      senior: this.senior,
      memories: memoryContext,
    });

    // Send greeting
    const greetingPrompt = this.senior
      ? `Greet ${this.senior.name} warmly by name. You're their AI companion Donna calling to check in. Keep it brief - just say hi.`
      : 'Say a brief, warm greeting. You are Donna, an AI companion.';

    this.voiceProvider.sendText(greetingPrompt);

    console.log(`[Session:${this.streamSid}] Initialized for ${this.senior?.name || 'unknown'}`);
  }

  /**
   * Handle incoming audio from Twilio
   */
  handleTwilioAudio(base64Mulaw) {
    if (!this.voiceProvider) return;

    try {
      // Convert mulaw 8kHz to PCM 16kHz for voice provider
      const pcmBase64 = base64MulawToBase64Pcm16k(base64Mulaw);
      this.voiceProvider.sendAudio(pcmBase64);
    } catch (error) {
      console.error(`[Session:${this.streamSid}] Audio conversion error:`, error);
    }
  }

  /**
   * Send audio back to Twilio
   */
  _sendAudioToTwilio(pcmBase64) {
    if (!this.twilioWs || this.twilioWs.readyState !== 1) return;

    try {
      // Convert PCM 24kHz to mulaw 8kHz for Twilio
      const mulawBase64 = base64Pcm24kToBase64Mulaw8k(pcmBase64);

      this.twilioWs.send(JSON.stringify({
        event: 'media',
        streamSid: this.streamSid,
        media: {
          payload: mulawBase64
        }
      }));
    } catch (error) {
      console.error(`[Session:${this.streamSid}] Error sending to Twilio:`, error);
    }
  }

  /**
   * Check if text contains topics that warrant memory lookup
   */
  _shouldTriggerMemoryLookup(text) {
    return MEMORY_TRIGGER_PATTERNS.some(pattern => pattern.test(text));
  }

  /**
   * Handle user speech - smart memory retrieval
   */
  async _handleUserSpeech(text) {
    // Add to recent utterances buffer (keep last 3)
    this.recentUtterances.push(text);
    if (this.recentUtterances.length > 3) {
      this.recentUtterances.shift();
    }

    // Check cooldown - don't spam memory lookups
    const now = Date.now();
    if (now - this.lastMemoryLookup < this.memoryLookupCooldown) {
      return;
    }

    // Check if this utterance contains trigger topics
    if (!this._shouldTriggerMemoryLookup(text)) {
      return;
    }

    console.log(`[Session:${this.streamSid}] Memory trigger detected in: "${text.substring(0, 50)}..."`);
    this.lastMemoryLookup = now;

    try {
      // Use combined recent context for better semantic search
      const searchContext = this.recentUtterances.join(' ');

      const relevant = await this.memoryProvider.search(
        this.senior.id,
        searchContext,
        { limit: 3, minSimilarity: 0.65 }
      );

      // Filter out already-injected memories
      const newMemories = relevant.filter(m => !this.injectedMemories.has(m.id));

      if (newMemories.length > 0) {
        // Mark as injected
        newMemories.forEach(m => this.injectedMemories.add(m.id));

        // Build natural context injection
        const context = this._formatMemoriesForInjection(newMemories);
        console.log(`[Session:${this.streamSid}] Injecting ${newMemories.length} memories`);
        this.voiceProvider.injectContext(context);
      }
    } catch (error) {
      console.error(`[Session:${this.streamSid}] Memory retrieval failed:`, error);
    }
  }

  /**
   * Format memories for natural injection into conversation
   */
  _formatMemoriesForInjection(memories) {
    const parts = memories.map(m => {
      switch (m.type) {
        case 'preference':
          return `They previously mentioned they ${m.content}`;
        case 'event':
          return `Remember: ${m.content}`;
        case 'concern':
          return `They've expressed concern about: ${m.content}`;
        case 'relationship':
          return `About their relationships: ${m.content}`;
        case 'fact':
        default:
          return m.content;
      }
    });
    return parts.join('. ');
  }

  /**
   * Get conversation transcript
   */
  getTranscript() {
    return this.voiceProvider?.getTranscript() || [];
  }

  getTranscriptText() {
    return this.voiceProvider?.getTranscriptText() || '';
  }

  /**
   * Extract memories from conversation (call at end of session)
   */
  async extractMemories() {
    if (this.memoriesExtracted) return;
    if (!this.senior?.id) return;

    const transcript = this.getTranscriptText();
    if (transcript.length < 50) {
      console.log(`[Session:${this.streamSid}] Transcript too short for extraction`);
      return;
    }

    this.memoriesExtracted = true;
    console.log(`[Session:${this.streamSid}] Extracting memories...`);

    try {
      await this.memoryProvider.extractFromTranscript(
        this.senior.id,
        transcript,
        this.streamSid
      );
    } catch (error) {
      console.error(`[Session:${this.streamSid}] Memory extraction failed:`, error);
    }
  }

  /**
   * Close the session
   */
  async close() {
    await this.extractMemories();

    if (this.voiceProvider) {
      await this.voiceProvider.close();
    }

    console.log(`[Session:${this.streamSid}] Closed`);
  }
}
