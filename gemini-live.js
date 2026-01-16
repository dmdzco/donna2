import { GoogleGenAI, Modality } from '@google/genai';
import { createClient } from '@deepgram/sdk';
import { base64MulawToBase64Pcm16k, base64Pcm24kToBase64Mulaw8k } from './audio-utils.js';
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

  prompt += `\n\nUse this context naturally in conversation. Reference past topics when relevant but don't force it.`;

  return prompt;
};

// Topics that warrant memory lookup
const MEMORY_TRIGGERS = /\b(remember|forgot|last time|yesterday|doctor|medicine|son|daughter|grandchild|friend|family|birthday|visit|told you|mentioned|we talked)\b/i;

export class GeminiLiveSession {
  constructor(twilioWs, streamSid, senior = null, memoryContext = null) {
    this.twilioWs = twilioWs;
    this.streamSid = streamSid;
    this.senior = senior;
    this.memoryContext = memoryContext;
    this.geminiSession = null;
    this.ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
    this.isConnected = false;
    this.conversationLog = []; // Track conversation for memory extraction
    this.memoriesExtracted = false; // Prevent double extraction

    // Mid-conversation memory retrieval state
    this.lastMemoryCheck = 0;
    this.memoryCheckCooldown = 20000; // 20 seconds between checks
    this.injectedMemoryIds = new Set(); // Don't repeat memories

    // Transcription buffering (Gemini sends word-by-word)
    this.outputBuffer = '';
    this.inputBuffer = '';

    // Deepgram STT for user speech transcription
    this.deepgram = null;
    this.dgConnection = null;
    this.dgConnected = false;
  }

  async connect() {
    const systemPrompt = buildSystemPrompt(this.senior, this.memoryContext);
    console.log(`[${this.streamSid}] System prompt built for ${this.senior?.name || 'unknown caller'}`);

    try {
      this.geminiSession = await this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Aoede'  // Natural female voice
              }
            }
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
            console.log(`[${this.streamSid}] Connected to Gemini Live API`);
            this.isConnected = true;
          },
          onmessage: (message) => {
            this.handleGeminiMessage(message);
          },
          onerror: (error) => {
            console.error(`[${this.streamSid}] Gemini error:`, error.message);
          },
          onclose: (event) => {
            console.log(`[${this.streamSid}] Gemini connection closed:`, event.reason);
            this.isConnected = false;
          }
        }
      });

      // Send greeting after session is established
      const greetingPrompt = this.senior
        ? `Greet ${this.senior.name} warmly by name. You're their AI companion Donna calling to check in. Keep it brief - just say hi.`
        : 'Say a brief, warm greeting. You are Donna, an AI companion.';

      this.geminiSession.sendClientContent({
        turns: [{
          role: 'user',
          parts: [{ text: greetingPrompt }]
        }],
        turnComplete: true
      });
      console.log(`[${this.streamSid}] Sent greeting prompt for ${this.senior?.name || 'unknown'}`);

      // Initialize Deepgram for user speech transcription
      await this.connectDeepgram();

    } catch (error) {
      console.error(`[${this.streamSid}] Failed to connect to Gemini:`, error);
      throw error;
    }
  }

  async connectDeepgram() {
    if (!process.env.DEEPGRAM_API_KEY) {
      console.log(`[${this.streamSid}] DEEPGRAM_API_KEY not set, skipping STT`);
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
        interim_results: false, // Only final results for memory triggers
      });

      this.dgConnection.on('open', () => {
        console.log(`[${this.streamSid}] Deepgram connected`);
        this.dgConnected = true;
      });

      this.dgConnection.on('Results', (data) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        if (transcript && data.is_final) {
          console.log(`[${this.streamSid}] User (Deepgram): "${transcript}"`);

          // Log to conversation for end-of-call memory extraction
          this.conversationLog.push({
            role: 'user',
            content: transcript,
            timestamp: new Date().toISOString()
          });

          // Check for relevant memories to inject into Gemini
          this.checkForRelevantMemories(transcript);
        }
      });

      this.dgConnection.on('error', (error) => {
        console.error(`[${this.streamSid}] Deepgram error:`, error.message);
        this.dgConnected = false;
        this.dgConnection = null;
      });

      this.dgConnection.on('close', () => {
        console.log(`[${this.streamSid}] Deepgram connection closed`);
        this.dgConnected = false;
      });

    } catch (error) {
      console.error(`[${this.streamSid}] Failed to connect Deepgram:`, error.message);
      // Graceful degradation - continue without STT
      this.dgConnection = null;
      this.dgConnected = false;
    }
  }

  handleGeminiMessage(message) {
    // Log full message structure for debugging
    console.log(`[${this.streamSid}] Gemini message:`, JSON.stringify(message).substring(0, 500));

    // Buffer user's speech transcription (comes word-by-word)
    const inputTranscription = message.serverContent?.inputTranscription?.text ||
                                message.inputTranscription?.text;
    if (inputTranscription) {
      this.inputBuffer += inputTranscription;
    }

    // Buffer model's speech transcription (comes word-by-word)
    const outputTranscription = message.serverContent?.outputTranscription?.text ||
                                 message.outputTranscription?.text;
    if (outputTranscription) {
      this.outputBuffer += outputTranscription;
    }

    // Handle audio response from Gemini - check various possible structures
    const parts = message.serverContent?.modelTurn?.parts ||
                  message.modelTurn?.parts ||
                  message.parts;

    if (parts) {
      for (const part of parts) {
        // Check for audio data in various formats
        const audioData = part.inlineData?.data || part.audio?.data || part.data;
        const mimeType = part.inlineData?.mimeType || part.audio?.mimeType || part.mimeType;

        if (audioData) {
          console.log(`[${this.streamSid}] Got audio chunk, mimeType: ${mimeType}, size: ${audioData.length}`);

          try {
            // Convert PCM 24kHz to mulaw 8kHz for Twilio
            const mulawBase64 = base64Pcm24kToBase64Mulaw8k(audioData);

            // Send audio to Twilio
            if (this.twilioWs.readyState === 1) { // WebSocket.OPEN
              this.twilioWs.send(JSON.stringify({
                event: 'media',
                streamSid: this.streamSid,
                media: {
                  payload: mulawBase64
                }
              }));
              console.log(`[${this.streamSid}] Sent audio to Twilio`);
            }
          } catch (error) {
            console.error(`[${this.streamSid}] Audio conversion error:`, error);
          }
        }
      }
    }

    // Handle turn complete - flush buffers and save complete utterances
    if (message.serverContent?.turnComplete || message.turnComplete) {
      // Save buffered user input
      if (this.inputBuffer.trim()) {
        const userText = this.inputBuffer.trim();
        console.log(`[${this.streamSid}] User said: "${userText}"`);
        this.conversationLog.push({
          role: 'user',
          content: userText,
          timestamp: new Date().toISOString()
        });
        // Check for relevant memories
        this.checkForRelevantMemories(userText);
        this.inputBuffer = '';
      }

      // Save buffered assistant output
      if (this.outputBuffer.trim()) {
        const assistantText = this.outputBuffer.trim();
        console.log(`[${this.streamSid}] Donna said: "${assistantText}"`);
        this.conversationLog.push({
          role: 'assistant',
          content: assistantText,
          timestamp: new Date().toISOString()
        });
        this.outputBuffer = '';
      }

      console.log(`[${this.streamSid}] Turn complete`);
    }
  }

  sendAudio(base64Mulaw) {
    if (!this.isConnected || !this.geminiSession) {
      return;
    }

    try {
      // Convert mulaw 8kHz to PCM 16kHz for Gemini
      const pcmBase64 = base64MulawToBase64Pcm16k(base64Mulaw);

      this.geminiSession.sendRealtimeInput({
        audio: {
          data: pcmBase64,
          mimeType: 'audio/pcm;rate=16000'
        }
      });

      // Send raw mulaw to Deepgram for transcription (no conversion needed)
      if (this.dgConnected && this.dgConnection) {
        const mulawBuffer = Buffer.from(base64Mulaw, 'base64');
        this.dgConnection.send(mulawBuffer);
      }
    } catch (error) {
      console.error(`[${this.streamSid}] Error sending audio:`, error);
    }
  }

  // Check for relevant memories based on user speech
  async checkForRelevantMemories(userText) {
    // Skip if no senior or not connected
    if (!this.senior?.id || !this.isConnected || !this.geminiSession) return;

    // Check cooldown
    const now = Date.now();
    if (now - this.lastMemoryCheck < this.memoryCheckCooldown) return;

    // Check if text contains trigger words
    if (!MEMORY_TRIGGERS.test(userText)) return;

    console.log(`[${this.streamSid}] Memory trigger detected: "${userText.substring(0, 50)}..."`);
    this.lastMemoryCheck = now;

    try {
      // Search for relevant memories
      const relevant = await memoryService.search(this.senior.id, userText, 3, 0.6);

      // Filter out already-injected memories
      const newMemories = relevant.filter(m => !this.injectedMemoryIds.has(m.id));

      if (newMemories.length > 0) {
        // Mark as injected
        newMemories.forEach(m => this.injectedMemoryIds.add(m.id));

        // Format memories for context
        const context = newMemories.map(m => m.content).join('. ');
        console.log(`[${this.streamSid}] Injecting ${newMemories.length} memories: "${context.substring(0, 100)}..."`);

        // Inject as context hint to Gemini
        this.geminiSession.sendClientContent({
          turns: [{
            role: 'user',
            parts: [{ text: `[Context from previous conversations: ${context}. Use this naturally if relevant, don't announce it.]` }]
          }],
          turnComplete: false // Don't force immediate response
        });
      }
    } catch (error) {
      console.error(`[${this.streamSid}] Memory lookup failed:`, error.message);
    }
  }

  // Get the conversation transcript as a string
  getTranscript() {
    return this.conversationLog
      .map(entry => `${entry.role}: ${entry.content}`)
      .join('\n');
  }

  // Get the raw conversation log
  getConversationLog() {
    return this.conversationLog;
  }

  // Get senior ID if available
  getSeniorId() {
    return this.senior?.id || null;
  }

  // Extract memories from conversation (called when session ends)
  async extractMemories() {
    // Prevent double extraction
    if (this.memoriesExtracted) {
      console.log(`[${this.streamSid}] Memories already extracted, skipping`);
      return;
    }

    if (!this.senior?.id || this.conversationLog.length === 0) {
      console.log(`[${this.streamSid}] No senior or conversation to extract memories from`);
      return;
    }

    const transcript = this.getTranscript();
    if (transcript.length < 50) {
      console.log(`[${this.streamSid}] Transcript too short for memory extraction`);
      return;
    }

    this.memoriesExtracted = true;
    console.log(`[${this.streamSid}] Extracting memories from ${this.conversationLog.length} messages`);

    try {
      await memoryService.extractFromConversation(
        this.senior.id,
        transcript,
        this.streamSid // Use streamSid as conversation reference
      );
    } catch (error) {
      console.error(`[${this.streamSid}] Failed to extract memories:`, error);
    }
  }

  async close() {
    // Extract memories before closing
    await this.extractMemories();

    // Close Deepgram connection
    if (this.dgConnection) {
      try {
        this.dgConnection.finish();
      } catch (error) {
        // Ignore close errors
      }
      this.dgConnection = null;
      this.dgConnected = false;
    }

    // Close Gemini connection
    if (this.geminiSession) {
      try {
        this.geminiSession.close();
      } catch (error) {
        // Ignore close errors
      }
    }
    this.isConnected = false;

    console.log(`[${this.streamSid}] Session closed. Transcript length: ${this.conversationLog.length} messages`);
  }
}
