import { Router } from 'express';
import { seniorService } from '../services/seniors.js';
import { schedulerService } from '../services/scheduler.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { callLimiter } from '../middleware/rate-limit.js';
import { validateBody } from '../middleware/validate.js';
import { initiateCallSchema } from '../validators/schemas.js';
import { canAccessSenior } from './helpers.js';
import { logAudit, authToRole } from '../services/audit.js';

const router = Router();

// API: Initiate outbound call (strict rate limit: 5/min)
router.post('/api/call', requireAuth, callLimiter, validateBody(initiateCallSchema), async (req, res) => {
  const { phoneNumber } = req.body;
  const twilioClient = req.app.get('twilioClient');
  // Twilio webhooks must hit Pipecat (voice pipeline), not this Node.js server
  const PIPECAT_URL = process.env.PIPECAT_BASE_URL || req.app.get('baseUrl');

  logAudit({
    userId: req.auth.userId,
    userRole: authToRole(req.auth),
    action: 'create',
    resourceType: 'call',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { phoneLast4: phoneNumber ? phoneNumber.slice(-4) : null },
  });

  try {
    // PRE-FETCH: Look up senior and build context BEFORE calling Twilio
    const senior = await seniorService.findByPhone(phoneNumber);
    if (senior) {
      // Check if user can access this senior
      if (!await canAccessSenior(req.auth, senior.id)) {
        return res.status(403).json({ error: 'Access denied to this senior' });
      }
      await schedulerService.prefetchForPhone(phoneNumber, senior);
    }

    const call = await twilioClient.calls.create({
      to: phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: `${PIPECAT_URL}/voice/answer`,
      statusCallback: `${PIPECAT_URL}/voice/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    });

    console.log(`Initiated call ${call.sid} to ${phoneNumber}`);
    res.json({ success: true, callSid: call.sid });

  } catch (error) {
    console.error('Failed to initiate call:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: List active calls (admin only)
// Active calls are tracked by Pipecat — query its /health endpoint
router.get('/api/calls', requireAdmin, (req, res) => {
  res.json({
    activeCalls: 0,
    callSids: [],
  });
});

// API: End a call (admin only)
router.post('/api/calls/:callSid/end', requireAdmin, async (req, res) => {
  const twilioClient = req.app.get('twilioClient');
  try {
    await twilioClient.calls(req.params.callSid).update({ status: 'completed' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
