import { GoogleGenAI, Modality } from '@google/genai';
import { memoryService } from './services/memory.js';

const buildSystemPrompt = (senior, memoryContext) => {
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

  prompt += `\n\nUse this context naturally in conversation. Reference past topics when relevant but don't force it.

CONVERSATION FLOW:
1. Start with a warm greeting using their name
2. Ask how they're doing today
3. After they respond, share ONE interesting news item from the context (if available)
   Example: "I heard something interesting today - [brief news]. What do you think about that?"
4. Let the conversation flow naturally from there

Keep the news mention brief and conversational. If they're not interested, move on gracefully.`;

  return prompt;
};

export class BrowserSession {
  constructor(browserWs, senior = null, memoryContext = null) {
    this.browserWs = browserWs;
    this.senior = senior;
    this.memoryContext = memoryContext;
    this.geminiSession = null;
    this.ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
    this.isConnected = false;
    this.conversationLog = [];
  }

  async connect() {
    const systemPrompt = buildSystemPrompt(this.senior, this.memoryContext);
    console.log(`[Browser] System prompt built for ${this.senior?.name || 'unknown caller'}`);

    try {
      this.geminiSession = await this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Aoede' }
            }
          }
        }
      });

      this.isConnected = true;
      console.log('[Browser] Connected to Gemini');

      // Handle Gemini responses
      this.geminiSession.on('message', (msg) => this.handleGeminiMessage(msg));

      // Send status to browser
      this.sendToBrowser({ type: 'status', message: 'Connected to Donna!', state: 'ready' });

    } catch (error) {
      console.error('[Browser] Failed to connect to Gemini:', error);
      this.sendToBrowser({ type: 'status', message: 'Failed to connect', state: 'error' });
      throw error;
    }
  }

  handleGeminiMessage(msg) {
    // Handle audio response
    if (msg.serverContent?.modelTurn?.parts) {
      for (const part of msg.serverContent.modelTurn.parts) {
        if (part.inlineData?.mimeType?.includes('audio')) {
          // Convert base64 PCM to binary and send to browser
          const audioData = Buffer.from(part.inlineData.data, 'base64');
          this.browserWs.send(audioData);
        }
      }
    }

    // Handle transcription
    if (msg.serverContent?.outputTranscription?.text) {
      const text = msg.serverContent.outputTranscription.text;
      this.conversationLog.push({ role: 'donna', text });
      this.sendToBrowser({ type: 'transcript', speaker: 'donna', text });
    }

    if (msg.serverContent?.inputTranscription?.text) {
      const text = msg.serverContent.inputTranscription.text;
      this.conversationLog.push({ role: 'user', text });
      this.sendToBrowser({ type: 'transcript', speaker: 'user', text });
    }

    // Handle turn complete
    if (msg.serverContent?.turnComplete) {
      this.sendToBrowser({ type: 'status', message: 'Your turn to speak...', state: 'listening' });
    }
  }

  sendToBrowser(data) {
    if (this.browserWs.readyState === 1) { // WebSocket.OPEN
      this.browserWs.send(JSON.stringify(data));
    }
  }

  // Receive audio from browser (16-bit PCM at 16kHz)
  sendAudio(pcmBuffer) {
    if (!this.geminiSession || !this.isConnected) return;

    try {
      // Convert Int16 PCM to base64
      const base64Audio = Buffer.from(pcmBuffer).toString('base64');

      this.geminiSession.sendRealtimeInput({
        media: {
          mimeType: 'audio/pcm;rate=16000',
          data: base64Audio
        }
      });
    } catch (error) {
      console.error('[Browser] Error sending audio:', error);
    }
  }

  async close() {
    console.log('[Browser] Closing session');
    this.isConnected = false;

    // Extract memories if we have a senior
    if (this.senior && this.conversationLog.length > 0) {
      try {
        const transcript = this.conversationLog
          .map(m => `${m.role === 'donna' ? 'Donna' : 'User'}: ${m.text}`)
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

    if (this.geminiSession) {
      try {
        this.geminiSession.close();
      } catch (error) {
        console.error('[Browser] Error closing Gemini:', error);
      }
    }
  }
}
