import { createClient } from '@deepgram/sdk';
import Anthropic from '@anthropic-ai/sdk';
import { ObserverAgent } from './observer-agent.js';
import { ElevenLabsAdapter } from '../adapters/elevenlabs.js';
import { pcm24kToMulaw8k } from '../audio-utils.js';
import { memoryService } from '../services/memory.js';

const anthropic = new Anthropic();

const buildSystemPrompt = (senior, memoryContext, reminderPrompt = null, observerSignal = null) => {
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

  // Inject observer guidance if available
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

    // Silence detection for turn-taking
    this.lastAudioTime = Date.now();
    this.silenceThreshold = 1500; // 1.5s of silence = end of turn
    this.silenceCheckInterval = null;
  }

  async connect() {
    console.log(`[V1][${this.streamSid}] Starting advanced pipeline for ${this.senior?.name || 'unknown'}`);
    this.isConnected = true;

    // Connect Deepgram STT
    await this.connectDeepgram();

    // Start silence detection
    this.startSilenceDetection();

    // Start observer check interval (every 30 seconds)
    this.observerCheckInterval = setInterval(() => this.runObserver(), 30000);

    // Send initial greeting
    await this.generateAndSendResponse(
      this.senior
        ? `Greet ${this.senior.name} warmly by name. You're their AI companion Donna calling to check in. Keep it brief - just say hi.`
        : 'Say a brief, warm greeting. You are Donna, an AI companion.'
    );
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

    // Generate and send response
    await this.generateAndSendResponse(text);

    // Process any pending utterances
    if (this.pendingUtterances.length > 0) {
      const next = this.pendingUtterances.shift();
      await this.processUserUtterance(next);
    }
  }

  async generateAndSendResponse(userMessage) {
    this.isProcessing = true;

    try {
      // Build system prompt with observer signal
      const systemPrompt = buildSystemPrompt(
        this.senior,
        this.memoryContext,
        this.reminderPrompt,
        this.lastObserverSignal
      );

      // Build messages array
      const messages = this.conversationLog
        .slice(-10) // Keep last 10 exchanges for context
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

      // Send to Twilio in chunks (Twilio expects small packets)
      const chunkSize = 640; // ~80ms of audio at 8kHz
      for (let i = 0; i < mulawBuffer.length; i += chunkSize) {
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
        }
      }

      console.log(`[V1][${this.streamSid}] Sent ${mulawBuffer.length} bytes of audio`);

    } catch (error) {
      console.error(`[V1][${this.streamSid}] TTS failed:`, error.message);
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
