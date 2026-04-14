import { Router } from 'express';
import { seniorService } from '../services/seniors.js';
import { schedulerService } from '../services/scheduler.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { callLimiter } from '../middleware/rate-limit.js';
import { validateBody } from '../middleware/validate.js';
import { initiateCallSchema } from '../validators/schemas.js';
import { canAccessSenior, routeError } from './helpers.js';
import { logAudit, authToRole } from '../services/audit.js';

const router = Router();

function formatPhoneForCall(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return String(phone || '').startsWith('+') ? String(phone) : `+${digits}`;
}

// API: Initiate outbound call (strict rate limit: 5/min)
router.post('/api/call', requireAuth, callLimiter, validateBody(initiateCallSchema), async (req, res) => {
  const { seniorId } = req.body;
  const twilioClient = req.app.get('twilioClient');
  // Twilio webhooks must hit Pipecat (voice pipeline), not this Node.js server
  const PIPECAT_URL = req.app.get('baseUrl');

  logAudit({
    userId: req.auth.userId,
    userRole: authToRole(req.auth),
    action: 'create',
    resourceType: 'call',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { seniorId },
  });

  try {
    const senior = await seniorService.getById(seniorId);
    if (!senior) {
      return res.status(404).json({ error: 'Senior not found' });
    }
    if (!senior.isActive) {
      return res.status(400).json({ error: 'Senior is not active' });
    }

    // Check if user can access this senior before resolving/calling the phone number.
    if (!await canAccessSenior(req.auth, senior.id)) {
      return res.status(403).json({ error: 'Access denied to this senior' });
    }

    const callPhone = formatPhoneForCall(senior.phone);
    if (!callPhone) {
      return res.status(400).json({ error: 'Senior phone is not callable' });
    }
    await schedulerService.prefetchForPhone(callPhone, senior);

    const call = await twilioClient.calls.create({
      to: callPhone,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: `${PIPECAT_URL}/voice/answer`,
      statusCallback: `${PIPECAT_URL}/voice/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    });

    res.json({ success: true, callSid: call.sid, seniorId: senior.id });

  } catch (error) {
    routeError(res, error, 'POST /api/call');
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
    routeError(res, error, 'POST /api/calls/:callSid/end');
  }
});

export default router;
