import { Router } from 'express';
import { seniorService } from '../services/seniors.js';
import { schedulerService } from '../services/scheduler.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { callLimiter } from '../middleware/rate-limit.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { validateBody } from '../middleware/validate.js';
import { initiateCallSchema } from '../validators/schemas.js';
import { canAccessSenior, routeError } from './helpers.js';
import { logAudit, authToRole } from '../services/audit.js';
import { sendError } from '../lib/http-response.js';
import {
  endTelnyxCall,
  getTelephonyProvider,
  initiateTelnyxOutboundCall,
} from '../services/telnyx.js';

const router = Router();

function formatPhoneForCall(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return String(phone || '').startsWith('+') ? String(phone) : `+${digits}`;
}

// API: Initiate outbound call (strict rate limit: 5/min)
router.post('/api/call', requireAuth, validateBody(initiateCallSchema), idempotencyMiddleware, callLimiter, async (req, res) => {
  const { seniorId } = req.body;
  const twilioClient = req.app.get('twilioClient');
  const telephonyProvider = getTelephonyProvider();
  // Telephony webhooks must hit Pipecat (voice pipeline), not this Node.js server.
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
      return sendError(res, 404, { error: 'Senior not found' });
    }
    if (!senior.isActive) {
      return sendError(res, 400, { error: 'Senior is not active' });
    }

    // Check if user can access this senior before resolving/calling the phone number.
    if (!await canAccessSenior(req.auth, senior.id)) {
      return sendError(res, 403, { error: 'Access denied to this senior' });
    }

    const callPhone = formatPhoneForCall(senior.phone);
    if (!callPhone) {
      return sendError(res, 400, { error: 'Senior phone is not callable' });
    }

    if (telephonyProvider === 'telnyx') {
      const call = await initiateTelnyxOutboundCall({
        seniorId: senior.id,
        callType: 'check-in',
        baseUrl: PIPECAT_URL,
      });
      return res.json({
        success: true,
        provider: 'telnyx',
        callSid: call.callSid,
        callControlId: call.callControlId,
        seniorId: senior.id,
      });
    }

    await schedulerService.prefetchForPhone(callPhone, senior);

    const call = await twilioClient.calls.create({
      to: callPhone,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: `${PIPECAT_URL}/voice/answer`,
      statusCallback: `${PIPECAT_URL}/voice/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    });

    res.json({ success: true, provider: 'twilio', callSid: call.sid, seniorId: senior.id });

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
    if (getTelephonyProvider() === 'telnyx') {
      await endTelnyxCall(req.params.callSid, { baseUrl: req.app.get('baseUrl') });
      return res.json({ success: true, provider: 'telnyx' });
    }

    await twilioClient.calls(req.params.callSid).update({ status: 'completed' });
    res.json({ success: true, provider: 'twilio' });
  } catch (error) {
    routeError(res, error, 'POST /api/calls/:callSid/end');
  }
});

export default router;
