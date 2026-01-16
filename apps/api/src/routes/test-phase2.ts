import { Router } from 'express';
import type { Request, Response } from 'express';
import { DonnaContainer } from '@donna/config';
import type {
  IReminderManagement,
  ISchedulerService,
  IStorageAdapter,
} from '@donna/shared/interfaces';

const router = Router();

/**
 * Get Phase 2 module status
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
      ReminderManagement: {
        ready: container.has('ReminderManagement'),
        description: 'Manages medication and appointment reminders',
      },
      Scheduler: {
        ready: container.has('Scheduler'),
        description: 'Automates scheduled calls with BullMQ',
      },
      StorageAdapter: {
        ready: container.has('StorageAdapter'),
        description: 'Vercel Blob storage for audio files',
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
 * Test Reminder Management - Create reminder
 */
router.post('/reminders', async (req: Request, res: Response) => {
  try {
    const { seniorId, type, title, description, scheduledTime } = req.body;

    if (!seniorId || !title) {
      return res.status(400).json({ error: 'seniorId and title are required' });
    }

    const container = (req.app.get('container') as DonnaContainer) || DonnaContainer.getInstance?.();
    if (!container || !container.has('ReminderManagement')) {
      return res.status(503).json({ error: 'ReminderManagement not available' });
    }

    const reminderMgmt = container.get<IReminderManagement>('ReminderManagement');

    const reminder = await reminderMgmt.create(seniorId, {
      type: type || 'medication',
      title,
      description,
      scheduledTime,
    });

    res.json({
      success: true,
      reminder,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Test Reminder Management - List reminders
 */
router.get('/reminders/:seniorId', async (req: Request, res: Response) => {
  try {
    const { seniorId } = req.params;

    const container = (req.app.get('container') as DonnaContainer) || DonnaContainer.getInstance?.();
    if (!container || !container.has('ReminderManagement')) {
      return res.status(503).json({ error: 'ReminderManagement not available' });
    }

    const reminderMgmt = container.get<IReminderManagement>('ReminderManagement');

    const reminders = await reminderMgmt.list(seniorId);

    res.json({
      success: true,
      count: reminders.length,
      reminders,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Test Reminder Management - Get pending reminders
 */
router.get('/reminders/:seniorId/pending', async (req: Request, res: Response) => {
  try {
    const { seniorId } = req.params;

    const container = (req.app.get('container') as DonnaContainer) || DonnaContainer.getInstance?.();
    if (!container || !container.has('ReminderManagement')) {
      return res.status(503).json({ error: 'ReminderManagement not available' });
    }

    const reminderMgmt = container.get<IReminderManagement>('ReminderManagement');

    const pending = await reminderMgmt.getPendingForSenior(seniorId);

    res.json({
      success: true,
      count: pending.length,
      reminders: pending,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Test Scheduler Service - Schedule a call
 */
router.post('/schedule', async (req: Request, res: Response) => {
  try {
    const { seniorId, scheduledTime, reminderIds } = req.body;

    if (!seniorId || !scheduledTime) {
      return res.status(400).json({ error: 'seniorId and scheduledTime are required' });
    }

    const container = (req.app.get('container') as DonnaContainer) || DonnaContainer.getInstance?.();
    if (!container || !container.has('Scheduler')) {
      return res.status(503).json({ error: 'Scheduler not available' });
    }

    const scheduler = container.get<ISchedulerService>('Scheduler');

    const scheduledCall = await scheduler.scheduleCall({
      seniorId,
      type: 'check_in',
      scheduledTime: new Date(scheduledTime),
      reminderIds: reminderIds || [],
      maxRetries: 3,
    });

    res.json({
      success: true,
      scheduledCall,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Test Scheduler Service - Get upcoming calls
 */
router.get('/schedule/:seniorId', async (req: Request, res: Response) => {
  try {
    const { seniorId } = req.params;

    const container = (req.app.get('container') as DonnaContainer) || DonnaContainer.getInstance?.();
    if (!container || !container.has('Scheduler')) {
      return res.status(503).json({ error: 'Scheduler not available' });
    }

    const scheduler = container.get<ISchedulerService>('Scheduler');

    const upcoming = await scheduler.getUpcomingCalls(seniorId);

    res.json({
      success: true,
      count: upcoming.length,
      calls: upcoming,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Test Storage Adapter - Upload test file
 */
router.post('/storage/upload', async (req: Request, res: Response) => {
  try {
    const { conversationId, data, contentType } = req.body;

    if (!conversationId || !data) {
      return res.status(400).json({ error: 'conversationId and data are required' });
    }

    const container = (req.app.get('container') as DonnaContainer) || DonnaContainer.getInstance?.();
    if (!container || !container.has('StorageAdapter')) {
      return res.status(503).json({ error: 'StorageAdapter not available' });
    }

    const storage = container.get<IStorageAdapter>('StorageAdapter');

    // Convert base64 or text data to buffer
    const buffer = Buffer.from(data, 'base64');

    const url = await storage.uploadAudio(conversationId, buffer, contentType || 'audio/mpeg');

    res.json({
      success: true,
      url,
      size: buffer.length,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

export default router;
