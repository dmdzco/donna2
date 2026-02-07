import { Router } from 'express';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  const sessions = req.app.get('sessions');
  res.json({
    status: 'ok',
    version: '4.0',
    activeSessions: sessions.size,
    pipeline: 'pipecat + 2-layer-observer + gemini-director',
    features: ['pipecat-voice-pipeline', 'conversation-director', 'scheduled-reminders'],
  });
});

export default router;
