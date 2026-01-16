import { Router } from 'express';
import type { Request, Response } from 'express';
import { DonnaContainer } from '@donna/config';
import type {
  ICallOrchestrator,
  IConversationManager,
  IVoicePipeline,
  ITwilioAdapter,
  IDeepgramAdapter,
  IElevenLabsAdapter,
} from '@donna/shared/interfaces';

const router = Router();

/**
 * Get system status - check which modules are initialized
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const container = (req.app.get('container') as DonnaContainer) || DonnaContainer.getInstance?.();

    if (!container) {
      return res.status(500).json({
        error: 'Container not initialized',
        modules: {},
      });
    }

    const modules = {
      CallOrchestrator: {
        ready: container.has('CallOrchestrator'),
        description: 'Manages phone call lifecycle',
      },
      ConversationManager: {
        ready: container.has('ConversationManager'),
        description: 'Stores conversation records',
      },
      VoicePipeline: {
        ready: container.has('VoicePipeline'),
        description: 'Speech-to-text and text-to-speech',
      },
      TwilioAdapter: {
        ready: container.has('TwilioAdapter'),
        description: 'Phone call gateway',
      },
      DeepgramAdapter: {
        ready: container.has('DeepgramAdapter'),
        description: 'Speech-to-text transcription',
      },
      ElevenLabsAdapter: {
        ready: container.has('ElevenLabsAdapter'),
        description: 'Text-to-speech synthesis',
      },
      SeniorProfiles: {
        ready: container.has('SeniorProfiles'),
        description: 'Senior profile management',
      },
    };

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      modules,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
      modules: {},
    });
  }
});

/**
 * Test Call Orchestrator - Initiate a call
 */
router.post('/call', async (req: Request, res: Response) => {
  try {
    const { seniorId, type } = req.body;

    if (!seniorId) {
      return res.status(400).json({ error: 'seniorId is required' });
    }

    const container = (req.app.get('container') as DonnaContainer) || DonnaContainer.getInstance?.();
    if (!container || !container.has('CallOrchestrator')) {
      return res.status(503).json({ error: 'CallOrchestrator not available' });
    }

    const callOrchestrator = container.get<ICallOrchestrator>('CallOrchestrator');

    const call = await callOrchestrator.initiateCall({
      seniorId,
      type: type || 'manual',
      reminderIds: req.body.reminderIds,
    });

    res.json({
      success: true,
      call: {
        id: call.id,
        callSid: call.callSid,
        status: call.status,
        seniorId: call.seniorId,
        startedAt: call.startedAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
      code: error.code,
    });
  }
});

/**
 * Test Conversation Manager - Get conversation history
 */
router.get('/conversations/:seniorId', async (req: Request, res: Response) => {
  try {
    const { seniorId } = req.params;

    const container = (req.app.get('container') as DonnaContainer) || DonnaContainer.getInstance?.();
    if (!container || !container.has('ConversationManager')) {
      return res.status(503).json({ error: 'ConversationManager not available' });
    }

    const conversationManager = container.get<IConversationManager>('ConversationManager');

    const conversations = await conversationManager.getHistory(seniorId, 10);

    res.json({
      success: true,
      count: conversations.length,
      conversations,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
      code: error.code,
    });
  }
});

/**
 * Test Conversation Manager - Create conversation
 */
router.post('/conversations', async (req: Request, res: Response) => {
  try {
    const { seniorId, type } = req.body;

    if (!seniorId) {
      return res.status(400).json({ error: 'seniorId is required' });
    }

    const container = (req.app.get('container') as DonnaContainer) || DonnaContainer.getInstance?.();
    if (!container || !container.has('ConversationManager')) {
      return res.status(503).json({ error: 'ConversationManager not available' });
    }

    const conversationManager = container.get<IConversationManager>('ConversationManager');

    const conversation = await conversationManager.create({
      seniorId,
      type: type || 'manual',
      reminderIds: req.body.reminderIds,
    });

    res.json({
      success: true,
      conversation,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
      code: error.code,
    });
  }
});

/**
 * Test Voice Pipeline - Text-to-Speech
 */
router.post('/tts', async (req: Request, res: Response) => {
  try {
    const { text, voiceId } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    const container = (req.app.get('container') as DonnaContainer) || DonnaContainer.getInstance?.();
    if (!container || !container.has('VoicePipeline')) {
      return res.status(503).json({ error: 'VoicePipeline not available' });
    }

    const voicePipeline = container.get<IVoicePipeline>('VoicePipeline');

    const audioBuffer = await voicePipeline.synthesize(text, { voiceId });

    res.json({
      success: true,
      audioSize: audioBuffer.length,
      text,
      message: 'Audio synthesized successfully (buffer not returned in test)',
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
      code: error.code,
    });
  }
});

/**
 * Test Voice Pipeline - Speech-to-Text
 */
router.post('/stt', async (req: Request, res: Response) => {
  try {
    // This would require multipart/form-data handling
    // For now, return a placeholder response
    res.json({
      success: false,
      message: 'STT requires audio file upload - not implemented in test endpoint yet',
      note: 'Use multer middleware for file upload support',
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
      code: error.code,
    });
  }
});

/**
 * Test Twilio Adapter - Initiate call
 */
router.post('/twilio', async (req: Request, res: Response) => {
  try {
    const { phoneNumber, webhookUrl } = req.body;

    if (!phoneNumber || !webhookUrl) {
      return res.status(400).json({ error: 'phoneNumber and webhookUrl are required' });
    }

    const container = (req.app.get('container') as DonnaContainer) || DonnaContainer.getInstance?.();
    if (!container || !container.has('TwilioAdapter')) {
      return res.status(503).json({ error: 'TwilioAdapter not available' });
    }

    const twilioAdapter = container.get<ITwilioAdapter>('TwilioAdapter');

    const callSid = await twilioAdapter.initiateCall(phoneNumber, '', webhookUrl);

    res.json({
      success: true,
      callSid,
      phoneNumber,
      webhookUrl,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
      code: error.code,
    });
  }
});

export default router;
