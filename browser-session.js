import { createClient } from '@deepgram/sdk';
import Anthropic from '@anthropic-ai/sdk';
import { ElevenLabsAdapter } from './adapters/elevenlabs.js';
import { memoryService } from './services/memory.js';

const anthropic = new Anthropic();

const MODEL = 'claude-sonnet-4-20250514';

const buildSystemPrompt = (senior, memoryContext) => {
  let prompt = `You are Donna, a warm and caring AI companion for elderly individuals.

Your personality:
- Speak slowly and clearly
- Be patient and understanding
- Show genuine interest in their day and wellbeing
- Ask follow-up questions to keep the conversation going

CRITICAL: Keep responses VERY SHORT - 1-2 sentences MAX. This is a phone call, not a letter.
- Answer briefly, then ask ONE simple follow-up question
- Never give multiple topics or long explanations in one turn`;

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

  prompt += `\n\nUse this context naturally in conversation. Reference past topics when relevant but don't force it.`;

  return prompt;
};

/**
 * Browser Session using V1 pipeline (Claude Sonnet + Deepgram + ElevenLabs)
 * Audio format: Browser sends PCM 16-bit 16kHz, receives PCM 24kHz
 */
export class BrowserSession {
  constructor(browserWs, senior = null, memoryContext = null) {
    this.browserWs = browserWs;
    this.senior = senior;
    this.memoryContext = memoryContext;
    this.isConnected = false;
    this.conversationLog = [];

    // Deepgram STT
    this.deepgram = null;
    this.dgConnection = null;
    this.dgConnected = false;
    this.currentTranscript = '';

    // ElevenLabs TTS
    this.tts = new ElevenLabsAdapter();

    // Processing state
    this.isProcessing = false;
    this.isSpeaking = false;

    // Silence detection
    this.lastAudioTime = Date.now();
    this.silenceThreshold = 1500;
    this.silenceCheckInterval = null;
  }

  async connect() {
    console.log(`[Browser] Starting session for ${this.senior?.name || 'unknown'} (Claude Sonnet + Deepgram + ElevenLabs)`);
    this.isConnected = true;

    // Connect Deepgram for STT
    await this.connectDeepgram();

    // Start silence detection
    this.startSilenceDetection();

    // Send greeting
    const greetingText = this.senior?.name
      ? `Hello ${this.senior.name}! It's Donna. How are you doing today?`
      : `Hello! It's Donna. How are you doing today?`;

    this.sendToBrowser({ type: 'status', message: 'Connected to Donna!', state: 'ready' });

    // Log and speak greeting
    this.conversationLog.push({
      role: 'assistant',
      content: greetingText,
      timestamp: new Date().toISOString()
    });

    await this.speakText(greetingText);
    this.sendToBrowser({ type: 'transcript', speaker: 'donna', text: greetingText });
    this.sendToBrowser({ type: 'status', message: 'Your turn to speak...', state: 'listening' });
  }

  async connectDeepgram() {
    if (!process.env.DEEPGRAM_API_KEY) {
      console.log('[Browser] DEEPGRAM_API_KEY not set, STT disabled');
      return;
    }

    try {
      this.deepgram = createClient(process.env.DEEPGRAM_API_KEY);

      this.dgConnection = this.deepgram.listen.live({
        model: 'nova-2',
        language: 'en-US',
        encoding: 'linear16',  // PCM 16-bit from browser
        sample_rate: 16000,    // Browser sends 16kHz
        channels: 1,
        punctuate: true,
        interim_results: true,
        endpointing: 500,
        utterance_end_ms: 1000,
      });

      this.dgConnection.on('open', () => {
        console.log('[Browser] Deepgram connected');
        this.dgConnected = true;
      });

      this.dgConnection.on('Results', (data) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        if (transcript) {
          if (data.is_final) {
            console.log(`[Browser] User (final): "${transcript}"`);
            this.currentTranscript += ' ' + transcript;
            this.sendToBrowser({ type: 'transcript', speaker: 'user', text: transcript });
          }
        }
      });

      this.dgConnection.on('UtteranceEnd', () => {
        if (this.currentTranscript.trim()) {
          this.processUserUtterance(this.currentTranscript.trim());
          this.currentTranscript = '';
        }
      });

      this.dgConnection.on('error', (error) => {
        console.error('[Browser] Deepgram error:', error.message);
        this.dgConnected = false;
      });

      this.dgConnection.on('close', () => {
        console.log('[Browser] Deepgram closed');
        this.dgConnected = false;
      });

    } catch (error) {
      console.error('[Browser] Deepgram connection failed:', error.message);
    }
  }

  startSilenceDetection() {
    this.silenceCheckInterval = setInterval(() => {
      const silenceDuration = Date.now() - this.lastAudioTime;
      if (silenceDuration > this.silenceThreshold && this.currentTranscript.trim()) {
        this.processUserUtterance(this.currentTranscript.trim());
        this.currentTranscript = '';
      }
    }, 500);
  }

  async processUserUtterance(text) {
    if (this.isProcessing || !text) return;
    this.isProcessing = true;

    console.log(`[Browser] Processing: "${text}"`);
    this.sendToBrowser({ type: 'status', message: 'Thinking...', state: 'processing' });

    // Log user message
    this.conversationLog.push({
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    });

    try {
      // Build system prompt
      const systemPrompt = buildSystemPrompt(this.senior, this.memoryContext);

      // Build messages
      const messages = this.conversationLog.slice(-10).map(entry => ({
        role: entry.role,
        content: entry.content
      }));

      // Call Claude Sonnet
      console.log('[Browser] Calling Claude Sonnet');
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 100,
        system: systemPrompt,
        messages: messages,
      });

      const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
      console.log(`[Browser] Response: "${responseText}"`);

      // Log assistant response
      this.conversationLog.push({
        role: 'assistant',
        content: responseText,
        timestamp: new Date().toISOString()
      });

      // Speak response
      await this.speakText(responseText);
      this.sendToBrowser({ type: 'transcript', speaker: 'donna', text: responseText });
      this.sendToBrowser({ type: 'status', message: 'Your turn to speak...', state: 'listening' });

    } catch (error) {
      console.error('[Browser] Response generation failed:', error.message);
      this.sendToBrowser({ type: 'status', message: 'Sorry, I had trouble with that.', state: 'error' });
    } finally {
      this.isProcessing = false;
    }
  }

  async speakText(text) {
    if (!process.env.ELEVENLABS_API_KEY) {
      console.log('[Browser] ELEVENLABS_API_KEY not set, TTS disabled');
      return;
    }

    try {
      this.isSpeaking = true;
      this.sendToBrowser({ type: 'status', message: 'Speaking...', state: 'speaking' });

      // Get PCM audio from ElevenLabs (24kHz)
      const pcmBuffer = await this.tts.textToSpeech(text);

      // Send raw PCM to browser (it can play 24kHz)
      // Send in chunks for streaming feel
      const chunkSize = 4800; // ~100ms at 24kHz
      for (let i = 0; i < pcmBuffer.length; i += chunkSize) {
        if (!this.isSpeaking) break;
        const chunk = pcmBuffer.slice(i, i + chunkSize);
        this.browserWs.send(chunk);
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      this.isSpeaking = false;
    } catch (error) {
      console.error('[Browser] TTS failed:', error.message);
      this.isSpeaking = false;
    }
  }

  sendToBrowser(data) {
    if (this.browserWs.readyState === 1) {
      this.browserWs.send(JSON.stringify(data));
    }
  }

  // Receive audio from browser (16-bit PCM at 16kHz)
  sendAudio(pcmBuffer) {
    if (!this.dgConnected || !this.dgConnection) return;

    this.lastAudioTime = Date.now();

    try {
      // Send directly to Deepgram (configured for linear16 @ 16kHz)
      this.dgConnection.send(Buffer.from(pcmBuffer));
    } catch (error) {
      console.error('[Browser] Error sending audio to Deepgram:', error);
    }
  }

  async close() {
    console.log('[Browser] Closing session');
    this.isConnected = false;

    // Stop intervals
    if (this.silenceCheckInterval) clearInterval(this.silenceCheckInterval);

    // Extract memories
    if (this.senior && this.conversationLog.length > 2) {
      try {
        const transcript = this.conversationLog
          .map(m => `${m.role === 'assistant' ? 'Donna' : 'User'}: ${m.content}`)
          .join('\n');

        await memoryService.extractFromConversation(
          this.senior.id,
          transcript,
          `browser-${Date.now()}`
        );
      } catch (error) {
        console.error('[Browser] Error extracting memories:', error);
      }
    }

    // Close Deepgram
    if (this.dgConnection) {
      try {
        this.dgConnection.finish();
      } catch (e) { /* ignore */ }
      this.dgConnection = null;
    }

    console.log(`[Browser] Session closed. ${this.conversationLog.length} messages`);
  }
}
