/**
 * Gemini Voice Provider
 * Implementation of VoiceProvider using Google Gemini Live API
 */

import { GoogleGenAI, Modality } from '@google/genai';
import { VoiceProvider } from './voice-provider.js';

export class GeminiVoiceProvider extends VoiceProvider {
  constructor(config = {}) {
    super(config);
    this.ai = new GoogleGenAI({ apiKey: config.apiKey || process.env.GOOGLE_API_KEY });
    this.session = null;
    this.isConnected = false;
    this.conversationLog = [];
    this.model = config.model || 'gemini-2.5-flash-native-audio-preview-12-2025';
    this.voice = config.voice || 'Aoede';
  }

  async initialize(context) {
    const { senior, memories, systemPrompt } = context;

    const fullPrompt = this._buildSystemPrompt(senior, memories, systemPrompt);

    this.session = await this.ai.live.connect({
      model: this.model,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: {
          parts: [{ text: fullPrompt }]
        },
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: this.voice
            }
          }
        },
        outputAudioTranscription: {}
      },
      callbacks: {
        onopen: () => {
          this.isConnected = true;
          console.log('[GeminiVoice] Connected');
        },
        onmessage: (message) => this._handleMessage(message),
        onerror: (error) => {
          console.error('[GeminiVoice] Error:', error.message);
          if (this.onError) this.onError(error);
        },
        onclose: (event) => {
          this.isConnected = false;
          console.log('[GeminiVoice] Disconnected:', event.reason);
        }
      }
    });

    return this.session;
  }

  _buildSystemPrompt(senior, memories, customPrompt) {
    let prompt = customPrompt || `You are Donna, a warm and caring AI companion for elderly individuals.

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

    if (memories) {
      prompt += `\n\n${memories}`;
    }

    prompt += `\n\nUse this context naturally in conversation. Reference past topics when relevant but don't force it.`;

    return prompt;
  }

  _handleMessage(message) {
    // Handle input transcription (user speech)
    const inputTranscription = message.serverContent?.inputTranscription?.text ||
                                message.inputTranscription?.text;
    if (inputTranscription) {
      const entry = {
        role: 'user',
        content: inputTranscription,
        timestamp: new Date().toISOString()
      };
      this.conversationLog.push(entry);
      if (this.onTranscript) this.onTranscript('user', inputTranscription);
    }

    // Handle output transcription (assistant speech)
    const outputTranscription = message.serverContent?.outputTranscription?.text ||
                                 message.outputTranscription?.text;
    if (outputTranscription) {
      const entry = {
        role: 'assistant',
        content: outputTranscription,
        timestamp: new Date().toISOString()
      };
      this.conversationLog.push(entry);
      if (this.onTranscript) this.onTranscript('assistant', outputTranscription);
    }

    // Handle audio output
    const parts = message.serverContent?.modelTurn?.parts ||
                  message.modelTurn?.parts ||
                  message.parts;

    if (parts) {
      for (const part of parts) {
        const audioData = part.inlineData?.data || part.audio?.data || part.data;
        if (audioData && this.onAudio) {
          this.onAudio(audioData);
        }
      }
    }
  }

  sendAudio(audioBase64) {
    if (!this.isConnected || !this.session) return;

    this.session.sendRealtimeInput({
      audio: {
        data: audioBase64,
        mimeType: 'audio/pcm;rate=16000'
      }
    });
  }

  sendText(text) {
    if (!this.isConnected || !this.session) return;

    this.session.sendClientContent({
      turns: [{
        role: 'user',
        parts: [{ text }]
      }],
      turnComplete: true
    });
  }

  injectContext(context) {
    // For Gemini, we inject context as internal guidance
    // This tells the model about relevant information without interrupting flow
    if (!this.isConnected || !this.session) return;

    // Frame as internal reminder that won't disrupt conversation
    const injection = `[Internal reminder for Donna - use naturally if relevant, don't announce: ${context}]`;

    this.session.sendClientContent({
      turns: [{
        role: 'user',
        parts: [{ text: injection }]
      }],
      turnComplete: false  // Don't force a response, let conversation flow
    });

    console.log('[GeminiVoice] Context injected');
  }

  getTranscript() {
    return this.conversationLog;
  }

  getTranscriptText() {
    return this.conversationLog
      .map(entry => `${entry.role}: ${entry.content}`)
      .join('\n');
  }

  async close() {
    if (this.session) {
      try {
        this.session.close();
      } catch (error) {
        // Ignore close errors
      }
    }
    this.isConnected = false;
  }
}
