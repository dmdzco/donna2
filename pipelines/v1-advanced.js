import { createClient } from '@deepgram/sdk';
import Anthropic from '@anthropic-ai/sdk';
import { ObserverAgent } from './observer-agent.js';
import { ElevenLabsAdapter } from '../adapters/elevenlabs.js';
import { ElevenLabsStreamingTTS } from '../adapters/elevenlabs-streaming.js';
import { pcm24kToMulaw8k } from '../audio-utils.js';
import { memoryService } from '../services/memory.js';
import { quickAnalyze } from './quick-observer.js';
import { fastAnalyzeWithTools, formatFastObserverGuidance } from './fast-observer.js';

const anthropic = new Anthropic();

// Feature flag for streaming - set to false for rollback
const V1_STREAMING_ENABLED = process.env.V1_STREAMING_ENABLED !== 'false';

console.log(`[V1] Streaming enabled: ${V1_STREAMING_ENABLED}, ELEVENLABS_API_KEY: ${process.env.ELEVENLABS_API_KEY ? 'set' : 'NOT SET'}`);

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

const buildSystemPrompt = (senior, memoryContext, reminderPrompt = null, observerSignal = null, dynamicMemoryContext = null, quickObserverGuidance = null, fastObserverGuidance = null) => {
  let prompt = `You are Donna, a warm and caring AI companion for elderly individuals.

Your personality:
- Speak slowly and clearly
- Be patient and understanding
- Show genuine interest in their day and wellbeing
- Ask follow-up questions to keep the conversation going
- Keep responses SHORT (1-2 sentences) - this is a phone call
- Be conversational and natural`;

  if (senior) {
    prompt += `\n\nYou are speaking with ${senior.name}.`;
    if (senior.interests?.length) {
      prompt += ` They enjoy: ${senior.interests.join(', ')}.`;
    }
    if (senior.medicalNotes) {
      prompt += ` Health notes: ${senior.medicalNotes}`;
    }
  }

  if (memoryContext) {
    prompt += `\n\n${memoryContext}`;
  }

  if (reminderPrompt) {
    prompt += reminderPrompt;
  }

  // Inject quick observer guidance (Layer 1 - instant regex analysis)
  if (quickObserverGuidance) {
    prompt += `\n\n[INSTANT GUIDANCE - respond to this NOW]\n${quickObserverGuidance}`;
  }

  // Inject fast observer guidance (Layer 2 - Haiku analysis from previous turn)
  if (fastObserverGuidance) {
    prompt += `\n\n[CONTEXT FROM ANALYSIS]\n${fastObserverGuidance}`;
  }

  // Inject observer guidance if available (Layer 3 - deep analysis)
  if (observerSignal) {
    prompt += `\n\n[OBSERVER GUIDANCE - use naturally, don't mention explicitly]`;
    if (observerSignal.engagement_level === 'low') {
      prompt += `\n- Senior seems less engaged. Try to draw them into conversation.`;
    }
    if (observerSignal.emotional_state && observerSignal.emotional_state !== 'unknown') {
      prompt += `\n- Emotional state: ${observerSignal.emotional_state}`;
    }
    if (observerSignal.should_deliver_reminder && observerSignal.reminder_to_deliver) {
      prompt += `\n- Now is a good time to mention their reminder: ${observerSignal.reminder_to_deliver}`;
    }
    if (observerSignal.suggested_topic) {
      prompt += `\n- Topic suggestion: ${observerSignal.suggested_topic}`;
    }
    if (observerSignal.should_end_call) {
      prompt += `\n- Consider wrapping up the call naturally. ${observerSignal.end_call_reason || ''}`;
    }
  }

  // Add dynamic memories found from user's current message
  if (dynamicMemoryContext) {
    prompt += dynamicMemoryContext;
  }

  prompt += `\n\nUse this context naturally in conversation. Reference past topics when relevant but don't force it.`;

  return prompt;
};

/**
 * V1 Advanced Pipeline Session
 * Uses: Deepgram STT → Claude + Observer → ElevenLabs TTS
 */
export class V1AdvancedSession {
  constructor(twilioWs, streamSid, senior = null, memoryContext = null, reminderPrompt = null, pendingReminders = []) {
    this.twilioWs = twilioWs;
    this.streamSid = streamSid;
    this.senior = senior;
    this.memoryContext = memoryContext;
    this.reminderPrompt = reminderPrompt;
    this.isConnected = false;
    this.conversationLog = [];
    this.memoriesExtracted = false;

    // STT (Deepgram)
    this.deepgram = null;
    this.dgConnection = null;
    this.dgConnected = false;
    this.currentTranscript = '';

    // TTS (ElevenLabs)
    this.tts = new ElevenLabsAdapter();
    this.streamingTts = null; // Streaming TTS instance (created per response)

    // Fast observer cache (Layer 2 results from previous turn)
    this.lastFastObserverResult = null;
    this.pendingFastObserver = null; // Promise for in-flight analysis

    // Observer Agent
    this.observer = new ObserverAgent(
      senior?.name || 'the senior',
      pendingReminders,
      15 // max call duration in minutes
    );
    this.lastObserverSignal = null;
    this.observerCheckInterval = null;

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

  async connect() {
    console.log(`[V1][${this.streamSid}] Starting advanced pipeline for ${this.senior?.name || 'unknown'}`);
    this.isConnected = true;

    // Connect Deepgram STT
    await this.connectDeepgram();

    // Start silence detection
    this.startSilenceDetection();

    // Backup observer check (every 60s) - main updates happen on each utterance
    this.observerCheckInterval = setInterval(() => this.runObserver(), 60000);

    // Send initial greeting (use streaming if enabled)
    const greetingPrompt = this.senior
      ? `Greet ${this.senior.name} warmly by name. You're their AI companion Donna calling to check in. Keep it brief - just say hi.`
      : 'Say a brief, warm greeting. You are Donna, an AI companion.';

    if (V1_STREAMING_ENABLED && process.env.ELEVENLABS_API_KEY) {
      await this.generateAndSendResponseStreaming(greetingPrompt);
    } else {
      await this.generateAndSendResponse(greetingPrompt);
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

    console.log(`[V1][${this.streamSid}] Processing: "${text}"`);

    // Start Layer 2 (fast observer) analysis in parallel - results used in NEXT turn
    // Don't await - this runs in background
    this.pendingFastObserver = fastAnalyzeWithTools(
      text,
      this.conversationLog,
      this.senior?.id
    ).then(result => {
      this.lastFastObserverResult = result;
      console.log(`[V1][${this.streamSid}] Fast observer complete: sentiment=${result.sentiment?.sentiment}, memories=${result.memories?.length || 0}`);
    }).catch(e => {
      console.error(`[V1][${this.streamSid}] Fast observer error:`, e.message);
    });

    // Run Layer 3 observer and memory search in parallel (non-blocking, for deep analysis)
    this.runObserverAndMemorySearch(text);

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

  /**
   * Run observer analysis and memory search in parallel
   * Results are stored for next response, doesn't block current response
   */
  async runObserverAndMemorySearch(userText) {
    if (!this.senior?.id) return;

    try {
      // Run both in parallel
      const [observerResult, memoryResults] = await Promise.all([
        this.observer.analyze(this.conversationLog).catch(e => {
          console.error(`[V1][${this.streamSid}] Observer error:`, e.message);
          return null;
        }),
        memoryService.search(this.senior.id, userText, 3, 0.65).catch(e => {
          console.error(`[V1][${this.streamSid}] Memory search error:`, e.message);
          return [];
        })
      ]);

      // Update observer signal
      if (observerResult) {
        this.lastObserverSignal = observerResult;
        console.log(`[V1][${this.streamSid}] Observer: engagement=${observerResult.engagement_level}, emotion=${observerResult.emotional_state}`);
        if (observerResult.concerns?.length > 0) {
          console.log(`[V1][${this.streamSid}] CONCERNS:`, observerResult.concerns);
        }
      }

      // Inject relevant memories into context
      if (memoryResults && memoryResults.length > 0) {
        const memoryText = memoryResults.map(m => `- ${m.content}`).join('\n');
        this.dynamicMemoryContext = `\n\n[RELEVANT MEMORIES - use naturally]\n${memoryText}`;
        console.log(`[V1][${this.streamSid}] Found ${memoryResults.length} relevant memories`);
      } else {
        this.dynamicMemoryContext = null;
      }

    } catch (error) {
      console.error(`[V1][${this.streamSid}] Observer/memory error:`, error.message);
    }
  }

  async generateAndSendResponse(userMessage) {
    this.isProcessing = true;
    this.wasInterrupted = false; // Reset interrupt flag

    try {
      // Build system prompt with observer signal and dynamic memories
      const systemPrompt = buildSystemPrompt(
        this.senior,
        this.memoryContext,
        this.reminderPrompt,
        this.lastObserverSignal,
        this.dynamicMemoryContext
      );

      // Build messages array
      const messages = this.conversationLog
        .slice(-20) // Keep last 20 exchanges for context
        .map(entry => ({
          role: entry.role,
          content: entry.content
        }));

      // Add current message if not from greeting
      if (userMessage && !userMessage.includes('Greet') && !userMessage.includes('greeting')) {
        messages.push({ role: 'user', content: userMessage });
      }

      // Generate response with Claude
      console.log(`[V1][${this.streamSid}] Calling Claude...`);
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150, // Keep responses short for phone call
        system: systemPrompt,
        messages: messages.length > 0 ? messages : [{ role: 'user', content: userMessage }],
      });

      // Check if interrupted during Claude call - skip TTS if so
      if (this.wasInterrupted) {
        console.log(`[V1][${this.streamSid}] Interrupted during generation, skipping TTS`);
        return;
      }

      const responseText = response.content[0].type === 'text'
        ? response.content[0].text
        : '';

      console.log(`[V1][${this.streamSid}] Claude: "${responseText}"`);

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
      const quickGuidance = quickResult.guidance;

      if (quickGuidance) {
        console.log(`[V1][${this.streamSid}] Quick observer: ${quickResult.healthSignals.length} health, ${quickResult.emotionSignals.length} emotion signals`);
      }

      // Get Layer 2 results from PREVIOUS turn (if available)
      const fastGuidance = this.lastFastObserverResult
        ? formatFastObserverGuidance(this.lastFastObserverResult)
        : null;

      // Build system prompt with all observer layers
      const systemPrompt = buildSystemPrompt(
        this.senior,
        this.memoryContext,
        this.reminderPrompt,
        this.lastObserverSignal,
        this.dynamicMemoryContext,
        quickGuidance,
        fastGuidance
      );

      // Build messages array
      const messages = this.conversationLog
        .slice(-20)
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

      // Start Claude stream AND TTS connection in parallel
      console.log(`[V1][${this.streamSid}] Calling Claude (streaming)...`);
      const [stream] = await Promise.all([
        anthropic.messages.stream({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 150,
          system: systemPrompt,
          messages: messages.length > 0 ? messages : [{ role: 'user', content: userMessage }],
        }),
        this.streamingTts.connect()
      ]);

      let fullResponse = '';
      let textBuffer = '';
      let firstTokenTime = null;
      let sentencesSent = 0;

      // Process streaming tokens
      for await (const event of stream) {
        // Check for interruption
        if (this.wasInterrupted) {
          console.log(`[V1][${this.streamSid}] Interrupted during streaming`);
          break;
        }

        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          const text = event.delta.text;
          fullResponse += text;
          textBuffer += text;

          // Record first token time
          if (!firstTokenTime) {
            firstTokenTime = Date.now();
            console.log(`[V1][${this.streamSid}] First token: ${firstTokenTime - startTime}ms`);
          }

          // Extract complete sentences and send to TTS
          const { complete, remaining } = extractCompleteSentences(textBuffer);
          textBuffer = remaining;

          for (const sentence of complete) {
            if (sentence.trim()) {
              this.streamingTts.streamText(sentence + ' ');
              sentencesSent++;
            }
          }
        }
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
      console.log(`[V1][${this.streamSid}] Claude (streaming): "${fullResponse}" [${sentencesSent} sentences, ${totalTime}ms total]`);

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

  async runObserver() {
    if (this.conversationLog.length < 2) return; // Need some conversation first

    try {
      console.log(`[V1][${this.streamSid}] Running observer analysis...`);
      this.lastObserverSignal = await this.observer.analyze(this.conversationLog);
      console.log(`[V1][${this.streamSid}] Observer signal:`, JSON.stringify(this.lastObserverSignal));

      // Log concerns for caregiver
      if (this.lastObserverSignal.concerns?.length > 0) {
        console.log(`[V1][${this.streamSid}] CONCERNS:`, this.lastObserverSignal.concerns);
      }

    } catch (error) {
      console.error(`[V1][${this.streamSid}] Observer error:`, error.message);
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

    // Stop intervals
    if (this.observerCheckInterval) clearInterval(this.observerCheckInterval);
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
}
