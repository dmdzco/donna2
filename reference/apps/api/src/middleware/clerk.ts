import { clerkMiddleware, requireAuth } from '@clerk/express';
import type { Request, Response, NextFunction } from 'express';

// Augment Express Request type with Clerk's auth property
declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string | null;
        sessionId?: string | null;
      };
    }
  }
}

/**
 * Clerk Authentication Middleware
 *
 * Handles authentication using Clerk for Express API routes.
 * Replaces the legacy JWT-based authentication system.
 */

/**
 * Base Clerk middleware - attaches auth context to all requests
 * Use this globally to make auth information available
 */
export const clerk = clerkMiddleware();

/**
 * Protected route middleware - requires authentication
 * Use this on routes that need authenticated users
 *
 * @example
 * app.get('/api/seniors', requireClerkAuth, async (req, res) => {
 *   const userId = req.auth.userId;
 *   // ... fetch seniors for this user
 * });
 */
export const requireClerkAuth = requireAuth();

/**
 * Custom middleware to extract Clerk user ID and attach to req
 * Maintains backward compatibility with existing code that uses req.userId
 */
export function attachUserId(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.userId) {
    (req as any).userId = req.auth.userId;
  }
  next();
}

/**
 * Optional auth middleware - doesn't require authentication but provides context
 * Use this on routes that can work with or without authentication
 */
export function optionalClerkAuth(req: Request, res: Response, next: NextFunction) {
  // Clerk middleware already attached by clerkMiddleware()
  // This is just a pass-through for routes that don't require auth
  next();
}
