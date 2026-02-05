import crypto from 'crypto';

/**
 * API key authentication middleware.
 * Reads DONNA_API_KEY from environment. If set, all /api/* routes
 * require Authorization: Bearer <key> header.
 * If DONNA_API_KEY is not set, auth is disabled (development mode).
 */
export function requireApiKey(req, res, next) {
  const apiKey = process.env.DONNA_API_KEY;

  // If no API key configured, skip auth (dev mode)
  if (!apiKey) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  const token = authHeader.slice(7);

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(token, apiKey)) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  next();
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * Handles different-length strings safely (timingSafeEqual throws on length mismatch).
 */
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    // Still perform a comparison to avoid leaking length info via timing
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}
