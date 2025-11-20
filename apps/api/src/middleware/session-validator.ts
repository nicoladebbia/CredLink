import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * 🔥 CRITICAL SECURITY FIX: Session Validation Middleware
 * 
 * Validates session integrity, prevents session hijacking
 * Ensures sessions are properly configured and secure
 */

export interface SessionValidationOptions {
  requireAuth?: boolean;
  validateUser?: boolean;
  checkExpiration?: boolean;
  logFailures?: boolean;
}

export class SessionValidator {
  /**
   * Main session validation middleware
   */
  static validate(options: SessionValidationOptions = {}) {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        // 🔥 SECURITY: Check if session exists
        if (!req.session) {
          if (options.requireAuth) {
            this.handleValidationFailure(req, res, 'Session required', options);
            return;
          }
          next();
          return;
        }

        // 🔥 SECURITY: Validate session structure
        if (!this.validateSessionStructure(req.session)) {
          this.handleValidationFailure(req, res, 'Invalid session structure', options);
          return;
        }

        // 🔥 SECURITY: Check session expiration
        if (options.checkExpiration && !this.validateSessionExpiration(req.session)) {
          this.handleValidationFailure(req, res, 'Session expired', options);
          return;
        }

        // 🔥 SECURITY: Validate user data if required
        if (options.validateUser && !this.validateUserData(req.session)) {
          this.handleValidationFailure(req, res, 'Invalid user session', options);
          return;
        }

        // 🔥 SECURITY: Update session activity
        this.updateSessionActivity(req.session);

        logger.debug('Session validation successful', { 
          sessionId: req.sessionID,
          userId: (req.session as any).userId,
          ip: req.ip
        });

        next();

      } catch (error: any) {
        logger.error('Session validation error', { 
          error: error.message,
          sessionId: req.sessionID,
          ip: req.ip 
        });
        
        if (options.requireAuth) {
          res.status(401).json({ error: 'Session validation failed' });
        } else {
          next();
        }
      }
    };
  }

  /**
   * Validates session structure
   */
  private static validateSessionStructure(session: any): boolean {
    // 🔥 SECURITY: Ensure session has required properties
    if (!session || typeof session !== 'object') {
      return false;
    }

    // Check for session ID
    if (!session.id && !session.sessionID) {
      return false;
    }

    // Check for session creation time
    if (!session.cookie || !session.cookie.expires) {
      return false;
    }

    return true;
  }

  /**
   * Validates session expiration
   */
  private static validateSessionExpiration(session: any): boolean {
    if (!session.cookie || !session.cookie.expires) {
      return false;
    }

    const now = new Date();
    const expires = new Date(session.cookie.expires);
    
    return now < expires;
  }

  /**
   * Validates user data in session
   */
  private static validateUserData(session: any): boolean {
    // 🔥 SECURITY: Check for required user properties
    if (!session.userId || !session.email) {
      return false;
    }

    // Validate user ID format
    if (typeof session.userId !== 'string' || session.userId.length === 0) {
      return false;
    }

    // Validate email format
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(session.email)) {
      return false;
    }

    return true;
  }

  /**
   * Updates session activity timestamp
   */
  private static updateSessionActivity(session: any): void {
    session.lastActivity = new Date().toISOString();
    session.touch(); // Update session expiration
  }

  /**
   * Handles session validation failures
   */
  private static handleValidationFailure(
    req: Request, 
    res: Response, 
    reason: string, 
    options: SessionValidationOptions
  ): void {
    if (options.logFailures !== false) {
      logger.warn('Session validation failed', { 
        reason,
        sessionId: req.sessionID,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
    }

    // 🔥 SECURITY: Clear invalid session
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          logger.error('Failed to destroy invalid session', { error: err.message });
        }
      });
    }

    if (options.requireAuth) {
      // API endpoints return JSON error
      if (req.path.startsWith('/api/') || req.get('Accept')?.includes('application/json')) {
        res.status(401).json({ 
          error: 'Authentication required',
          message: 'Please login to access this resource'
        });
      } else {
        // Web pages redirect to login
        res.redirect(302, '/login?reason=session_expired');
      }
    } else {
      // For non-required auth, continue without session
      return;
    }
  }

  /**
   * Middleware to require valid authentication
   */
  static requireAuth() {
    return this.validate({ 
      requireAuth: true, 
      validateUser: true, 
      checkExpiration: true 
    });
  }

  /**
   * Middleware to optionally validate session
   */
  static optionalAuth() {
    return this.validate({ 
      requireAuth: false, 
      validateUser: true, 
      checkExpiration: true 
    });
  }

  /**
   * Middleware to check session freshness
   */
  static checkFreshness(maxAge: number = 30 * 60 * 1000) { // 30 minutes default
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!req.session || !(req.session as any).lastActivity) {
        next();
        return;
      }

      const lastActivity = new Date((req.session as any).lastActivity);
      const now = new Date();
      const age = now.getTime() - lastActivity.getTime();

      if (age > maxAge) {
        logger.warn('Session too old, requiring refresh', { 
          sessionId: req.sessionID,
          age,
          maxAge
        });
        
        res.status(401).json({ 
          error: 'Session expired',
          message: 'Please refresh your session' 
        });
        return;
      }

      next();
    };
  }
}

// Export convenience functions
export const validateSession = SessionValidator.validate;
export const requireAuth = SessionValidator.requireAuth;
export const optionalAuth = SessionValidator.optionalAuth;
export const checkSessionFreshness = SessionValidator.checkFreshness;
