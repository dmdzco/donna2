import crypto from 'crypto';
import helmet from 'helmet';

/**
 * Security headers middleware using helmet.
 * - Sets X-Content-Type-Options, X-Frame-Options, etc.
 * - CSP configured for admin dashboard (allows inline scripts for now)
 */
export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "ws:", "wss:"],
      },
    },
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
    },
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin',
    },
  });
}

/**
 * Request ID middleware - adds unique ID to each request for tracing.
 */
export function requestId() {
  return (req, res, next) => {
    req.id = req.headers['x-request-id'] || crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  };
}
