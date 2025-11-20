import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

/**
 * 🔥 CRITICAL SECURITY FIX: JWT Cookie Authentication Middleware
 * 
 * Validates JWT tokens from secure cookies instead of URL parameters
 * This completes the JWT token exposure vulnerability fix
 */

export interface CookieAuthUser {
  userId: string;
  email: string;
  orgId: string;
  ssoSessionId: string;
  iat?: number;
  exp?: number;
}

// Use separate property to avoid conflicts with Passport.js user
declare global {
  namespace Express {
    interface Request {
      cookieUser?: CookieAuthUser;
    }
  }
}

export class CookieAuthMiddleware {
  private jwtSecret: string;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    
    if (!this.jwtSecret || this.jwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long for secure authentication');
    }
  }

  /**
   * Middleware to authenticate JWT from secure cookies
   * Falls back to Authorization header if cookie not found
   */
  authenticate() {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        // Step 1: Try to get JWT from secure cookie
        let token = req.cookies?.auth_token;

        // Step 2: Fallback to Authorization header (for API clients)
        if (!token && req.headers.authorization) {
          const authHeader = req.headers.authorization;
          if (authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
          }
        }

        // Step 3: No token found - reject request
        if (!token) {
          logger.warn('Authentication failed: No token found in cookie or header', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            hasCookie: !!req.cookies?.auth_token,
            hasHeader: !!req.headers.authorization
          });
          
          res.status(401).json({
            error: 'Authentication required',
            message: 'Please login to access this resource'
          });
          return;
        }

        // Step 4: Validate JWT token
        const decoded = jwt.verify(token, this.jwtSecret) as CookieAuthUser;

        // Step 5: Attach user info to request
        req.cookieUser = decoded;

        logger.debug('JWT authentication successful', {
          userId: decoded.userId,
          email: decoded.email,
          orgId: decoded.orgId,
          authMethod: req.cookies?.auth_token ? 'cookie' : 'header'
        });

        next();

      } catch (error: any) {
        logger.error('JWT authentication failed', {
          error: error.message,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });

        if (error.name === 'TokenExpiredError') {
          res.status(401).json({
            error: 'Token expired',
            message: 'Please login again'
          });
        } else if (error.name === 'JsonWebTokenError') {
          res.status(401).json({
            error: 'Invalid token',
            message: 'Authentication failed'
          });
        } else {
          res.status(500).json({
            error: 'Authentication error',
            message: 'Please try again later'
          });
        }
      }
    };
  }

  /**
   * Optional authentication - doesn't reject if no token
   */
  optional() {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        // Try to authenticate but don't reject if it fails
        let token = req.cookies?.auth_token || 
                   (req.headers.authorization?.startsWith('Bearer ') ? 
                    req.headers.authorization.substring(7) : null);

        if (token) {
          const decoded = jwt.verify(token, this.jwtSecret) as CookieAuthUser;
          req.cookieUser = decoded;
        }

        next();

      } catch (error: any) {
        // Log but don't reject for optional auth
        logger.debug('Optional authentication failed', {
          error: error.message,
          ip: req.ip
        });
        next();
      }
    };
  }

  /**
   * Require specific organization membership
   */
  requireOrg(orgId: string) {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!req.cookieUser) {
        res.status(401).json({
          error: 'Authentication required'
        });
        return;
      }

      if (req.cookieUser.orgId !== orgId) {
        logger.warn('Organization access denied', {
          userId: req.cookieUser.userId,
          userOrgId: req.cookieUser.orgId,
          requiredOrgId: orgId
        });

        res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this organization'
        });
        return;
      }

      next();
    };
  }
}

// Singleton instance
export const cookieAuth = new CookieAuthMiddleware();

// Export middleware functions for convenience
export const authenticateCookie = cookieAuth.authenticate();
export const optionalCookieAuth = cookieAuth.optional();
