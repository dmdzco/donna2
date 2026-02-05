import { Router } from 'express';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  const sessions = req.app.get('sessions');
  res.json({
    status: 'ok',
    version: '3.0',
    activeSessions: sessions.size,
    pipeline: 'claude-streaming + 4-layer-observer + elevenlabs',
    features: ['dynamic-model-routing', 'post-turn-agent', 'streaming-tts'],
  });
});

export default router;
