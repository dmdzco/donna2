import { Router } from 'express';
import type { Request, Response } from 'express';
import { DonnaContainer } from '@donna/config';
import type {
  IObserverAgent,
  IMemoryContext,
  IAnalyticsEngine,
} from '@donna/shared/interfaces';

const router = Router();

/**
 * Get Phase 3 module status
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
      ObserverAgent: {
        ready: container.has('ObserverAgent'),
        description: 'Analyzes conversation quality and engagement',
      },
      MemoryContext: {
        ready: container.has('MemoryContext'),
        description: 'Long-term memory and context building',
      },
      AnalyticsEngine: {
        ready: container.has('AnalyticsEngine'),
        description: 'Metrics tracking and insights generation',
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
 * Test Observer Agent - Analyze conversation
 */
router.post('/observer/analyze', async (req: Request, res: Response) => {
  try {
    const { senior, conversationHistory, pendingReminders, currentTopic, callDuration } = req.body;

    if (!senior || !conversationHistory) {
      return res.status(400).json({ error: 'senior and conversationHistory are required' });
    }

    const container = (req.app.get('container') as DonnaContainer) || DonnaContainer.getInstance?.();
    if (!container || !container.has('ObserverAgent')) {
      return res.status(503).json({ error: 'ObserverAgent not available' });
    }

    const observer = container.get<IObserverAgent>('ObserverAgent');

    const signal = await observer.analyze({
      senior,
      conversationHistory,
      pendingReminders: pendingReminders || [],
      currentTopic,
      callDuration,
    });

    res.json({
      success: true,
      signal,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Test Memory Context - Store memory
 */
router.post('/memory', async (req: Request, res: Response) => {
  try {
    const { seniorId, type, content, source, importance } = req.body;

    if (!seniorId || !type || !content || !source) {
      return res.status(400).json({ error: 'seniorId, type, content, and source are required' });
    }

    const container = (req.app.get('container') as DonnaContainer) || DonnaContainer.getInstance?.();
    if (!container || !container.has('MemoryContext')) {
      return res.status(503).json({ error: 'MemoryContext not available' });
    }

    const memoryContext = container.get<IMemoryContext>('MemoryContext');

    const memory = await memoryContext.storeMemory(seniorId, {
      type,
      content,
      source,
      importance,
    });

    res.json({
      success: true,
      memory,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Test Memory Context - Get memories
 */
router.get('/memory/:seniorId', async (req: Request, res: Response) => {
  try {
    const { seniorId } = req.params;
    const { type, minImportance, limit } = req.query;

    const container = (req.app.get('container') as DonnaContainer) || DonnaContainer.getInstance?.();
    if (!container || !container.has('MemoryContext')) {
      return res.status(503).json({ error: 'MemoryContext not available' });
    }

    const memoryContext = container.get<IMemoryContext>('MemoryContext');

    const filters: any = {};
    if (type) filters.type = type;
    if (minImportance) filters.minImportance = parseFloat(minImportance as string);
    if (limit) filters.limit = parseInt(limit as string);

    const memories = await memoryContext.getMemories(seniorId, filters);

    res.json({
      success: true,
      count: memories.length,
      memories,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Test Memory Context - Search memories
 */
router.get('/memory/:seniorId/search', async (req: Request, res: Response) => {
  try {
    const { seniorId } = req.params;
    const { query, limit } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'query parameter is required' });
    }

    const container = (req.app.get('container') as DonnaContainer) || DonnaContainer.getInstance?.();
    if (!container || !container.has('MemoryContext')) {
      return res.status(503).json({ error: 'MemoryContext not available' });
    }

    const memoryContext = container.get<IMemoryContext>('MemoryContext');

    const memories = await memoryContext.searchMemories(
      seniorId,
      query as string,
      limit ? parseInt(limit as string) : 10
    );

    res.json({
      success: true,
      count: memories.length,
      memories,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Test Memory Context - Build context
 */
router.post('/context/build', async (req: Request, res: Response) => {
  try {
    const { seniorId, scope } = req.body;

    if (!seniorId) {
      return res.status(400).json({ error: 'seniorId is required' });
    }

    const container = (req.app.get('container') as DonnaContainer) || DonnaContainer.getInstance?.();
    if (!container || !container.has('MemoryContext')) {
      return res.status(503).json({ error: 'MemoryContext not available' });
    }

    const memoryContext = container.get<IMemoryContext>('MemoryContext');

    const context = await memoryContext.buildContext(seniorId, scope);

    res.json({
      success: true,
      context,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Test Analytics Engine - Track event
 */
router.post('/analytics/track', async (req: Request, res: Response) => {
  try {
    const { type, seniorId, metadata } = req.body;

    if (!type || !seniorId) {
      return res.status(400).json({ error: 'type and seniorId are required' });
    }

    const container = (req.app.get('container') as DonnaContainer) || DonnaContainer.getInstance?.();
    if (!container || !container.has('AnalyticsEngine')) {
      return res.status(503).json({ error: 'AnalyticsEngine not available' });
    }

    const analytics = container.get<IAnalyticsEngine>('AnalyticsEngine');

    await analytics.trackEvent({
      type,
      seniorId,
      timestamp: new Date(),
      metadata: metadata || {},
    });

    res.json({
      success: true,
      message: 'Event tracked successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Test Analytics Engine - Get senior insights
 */
router.post('/analytics/insights', async (req: Request, res: Response) => {
  try {
    const { seniorId, period } = req.body;

    if (!seniorId || !period) {
      return res.status(400).json({ error: 'seniorId and period are required' });
    }

    const container = (req.app.get('container') as DonnaContainer) || DonnaContainer.getInstance?.();
    if (!container || !container.has('AnalyticsEngine')) {
      return res.status(503).json({ error: 'AnalyticsEngine not available' });
    }

    const analytics = container.get<IAnalyticsEngine>('AnalyticsEngine');

    const insights = await analytics.getSeniorInsights(seniorId, {
      start: new Date(period.start),
      end: new Date(period.end),
    });

    res.json({
      success: true,
      insights,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Test Analytics Engine - Get system metrics
 */
router.get('/analytics/metrics', async (req: Request, res: Response) => {
  try {
    const container = (req.app.get('container') as DonnaContainer) || DonnaContainer.getInstance?.();
    if (!container || !container.has('AnalyticsEngine')) {
      return res.status(503).json({ error: 'AnalyticsEngine not available' });
    }

    const analytics = container.get<IAnalyticsEngine>('AnalyticsEngine');

    const metrics = await analytics.getSystemMetrics();

    res.json({
      success: true,
      metrics,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

export default router;
