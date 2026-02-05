/**
 * Authentication Middleware
 *
 * Uses Clerk for authentication with cofounder API key fallback.
 * Cofounders can never be locked out even if Clerk is down.
 */

import { clerkMiddleware, getAuth, clerkClient } from '@clerk/express';
import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET && process.env.RAILWAY_PUBLIC_DOMAIN) {
  throw new Error('JWT_SECRET environment variable is required in production');
}
const JWT_SECRET = process.env.JWT_SECRET || 'donna-admin-secret-change-me';

// Cofounder API keys from environment (comma-separated)
const COFOUNDER_API_KEYS = [
  process.env.COFOUNDER_API_KEY_1,
  process.env.COFOUNDER_API_KEY_2,
].filter(Boolean);

/**
 * Check if request has valid cofounder API key
 */
function isCofounderRequest(req) {
  const apiKey = req.headers['x-api-key'];
  return apiKey && COFOUNDER_API_KEYS.includes(apiKey);
}

/**
 * Main auth middleware
 *
 * Checks in order:
 * 1. Cofounder API key (bypass Clerk entirely)
 * 2. Admin JWT Bearer token
 * 3. Clerk session
 *
 * Sets req.auth with:
 * - isCofounder: boolean
 * - isAdmin: boolean (cofounder or Clerk admin role)
 * - userId: string (Clerk user ID or 'cofounder')
 */
export async function requireAuth(req, res, next) {
  // 1. Check for cofounder API key (can't be locked out)
  if (isCofounderRequest(req)) {
    req.auth = {
      isCofounder: true,
      isAdmin: true,
      userId: 'cofounder',
    };
    return next();
  }

  // 2. Check for admin JWT Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, JWT_SECRET);
      req.auth = {
        isCofounder: false,
        isAdmin: true,
        userId: decoded.adminId,
      };
      return next();
    } catch {
      // Invalid JWT - fall through to Clerk
    }
  }

  // 3. Check Clerk session
  try {
    const auth = getAuth(req);

    if (!auth || !auth.userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    // Get user metadata to check for admin role
    let isAdmin = false;
    try {
      const user = await clerkClient.users.getUser(auth.userId);
      isAdmin = user.publicMetadata?.role === 'admin';
    } catch (err) {
      console.warn('[Auth] Could not fetch user metadata:', err.message);
    }

    req.auth = {
      isCofounder: false,
      isAdmin,
      userId: auth.userId,
    };

    next();
  } catch (error) {
    console.error('[Auth] Clerk error:', error.message);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired session',
    });
  }
}

/**
 * Optional auth - sets req.auth if authenticated, but doesn't require it
 */
export async function optionalAuth(req, res, next) {
  if (isCofounderRequest(req)) {
    req.auth = {
      isCofounder: true,
      isAdmin: true,
      userId: 'cofounder',
    };
    return next();
  }

  // Check for admin JWT Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, JWT_SECRET);
      req.auth = {
        isCofounder: false,
        isAdmin: true,
        userId: decoded.adminId,
      };
      return next();
    } catch {
      // Invalid JWT - fall through to Clerk
    }
  }

  try {
    const auth = getAuth(req);
    if (auth?.userId) {
      let isAdmin = false;
      try {
        const user = await clerkClient.users.getUser(auth.userId);
        isAdmin = user.publicMetadata?.role === 'admin';
      } catch (err) {
        // Ignore metadata fetch errors for optional auth
      }
      req.auth = {
        isCofounder: false,
        isAdmin,
        userId: auth.userId,
      };
    }
  } catch {
    // Ignore errors for optional auth
  }

  next();
}

/**
 * Require admin role (cofounder or Clerk admin)
 */
export async function requireAdmin(req, res, next) {
  await requireAuth(req, res, () => {
    if (!req.auth?.isAdmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Admin access required',
      });
    }
    next();
  });
}

/**
 * Clerk middleware initializer - must be used before requireAuth
 */
export { clerkMiddleware };

/**
 * Get Clerk user ID from request (for consumer app)
 */
export function getClerkUserId(req) {
  try {
    const auth = getAuth(req);
    return auth?.userId || null;
  } catch {
    return null;
  }
}

export default {
  requireAuth,
  requireAdmin,
  optionalAuth,
  clerkMiddleware,
  getClerkUserId,
};
