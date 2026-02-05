import twilio from 'twilio';

/**
 * Validates that webhook requests actually come from Twilio.
 * Uses Twilio's X-Twilio-Signature header verification.
 * Skipped in development (no RAILWAY_PUBLIC_DOMAIN).
 */
export function validateTwilioWebhook(req, res, next) {
  // Skip validation in local development
  if (!process.env.RAILWAY_PUBLIC_DOMAIN) {
    return next();
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error('[Auth] TWILIO_AUTH_TOKEN not set, cannot validate webhook');
    return res.status(500).send('Server configuration error');
  }

  const signature = req.headers['x-twilio-signature'];
  const url = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}${req.originalUrl}`;

  const isValid = twilio.validateRequest(authToken, signature, url, req.body);

  if (!isValid) {
    console.warn(`[Auth] Invalid Twilio signature for ${req.originalUrl}`);
    return res.status(403).send('Forbidden');
  }

  next();
}
