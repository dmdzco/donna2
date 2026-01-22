/**
 * Twilio Webhook Verification Middleware
 *
 * Validates that incoming requests to /voice/* endpoints are actually from Twilio
 * by verifying the X-Twilio-Signature header.
 *
 * Security: Prevents attackers from triggering calls or injecting fake call data.
 */

import twilio from 'twilio';

/**
 * Middleware to validate Twilio webhook signatures
 *
 * In production, rejects requests without valid signatures.
 * In development (localhost), allows requests through with a warning.
 */
export function validateTwilioWebhook(req, res, next) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!authToken) {
    console.error('[Twilio] TWILIO_AUTH_TOKEN not set - cannot validate webhooks');
    return res.status(500).send('Server configuration error');
  }

  // Get the signature from Twilio's header
  const signature = req.headers['x-twilio-signature'];

  // Build the full URL that Twilio signed
  // In production, use the public domain; locally, use the request host
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const url = `${protocol}://${host}${req.originalUrl}`;

  // For local development, skip validation but log a warning
  const isLocalhost = host?.includes('localhost') || host?.includes('127.0.0.1');
  if (isLocalhost && !signature) {
    console.warn('[Twilio] Skipping signature validation for localhost (no signature provided)');
    return next();
  }

  // Validate the request
  const isValid = twilio.validateRequest(
    authToken,
    signature,
    url,
    req.body
  );

  if (!isValid) {
    console.warn(`[Twilio] Invalid webhook signature for ${req.originalUrl}`, {
      url,
      hasSignature: !!signature,
      bodyKeys: Object.keys(req.body || {}),
    });

    // In development, log but allow through
    if (process.env.NODE_ENV !== 'production' && isLocalhost) {
      console.warn('[Twilio] Allowing invalid signature in development mode');
      return next();
    }

    return res.status(403).send('Invalid Twilio signature');
  }

  next();
}

/**
 * Alternative: Use Twilio's built-in Express middleware
 * This is simpler but less flexible for custom error handling
 */
export function createTwilioWebhookMiddleware() {
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!authToken) {
    throw new Error('TWILIO_AUTH_TOKEN environment variable is required');
  }

  return twilio.webhook({ validate: true });
}

export default validateTwilioWebhook;
