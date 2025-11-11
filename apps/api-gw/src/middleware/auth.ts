import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * User interface
 */
export interface User {
  id: string;
  email: string;
  plan: 'free' | 'pro' | 'enterprise';
  rateLimitTier: number;
}

/**
 * Authenticated request
 */
export interface AuthenticatedRequest extends Request {
  user?: User;
}

/**
 * JWT payload
 */
interface JWTPayload {
  userId: string;
  email: string;
  plan: 'free' | 'pro' | 'enterprise';
  rateLimitTier: number;
}

/**
 * Authentication middleware
 * 
 * Validates JWT tokens or API keys
 */
export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] as string;

    let token: string;

    // Support both Bearer token and API key
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (apiKey) {
      token = apiKey;
    } else {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'No authentication token provided',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Verify token
    const secret = process.env.JWT_SECRET || 'default-secret-change-in-production';
    
    try {
      const decoded = jwt.verify(token, secret) as JWTPayload;

      // Attach user to request
      req.user = {
        id: decoded.userId,
        email: decoded.email,
        plan: decoded.plan,
        rateLimitTier: decoded.rateLimitTier
      };

      logger.debug('User authenticated', { userId: req.user.id });
      next();
    } catch (jwtError) {
      logger.warn('Invalid token', { error: jwtError });
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
        timestamp: new Date().toISOString()
      });
      return;
    }
  } catch (error) {
    logger.error('Authentication error', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Optional authentication middleware
 * 
 * Attaches user if token is valid, but doesn't require it
 */
export const optionalAuthMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'] as string;

  if (!authHeader && !apiKey) {
    next();
    return;
  }

  // Try to authenticate, but don't fail if invalid
  try {
    let token: string;

    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (apiKey) {
      token = apiKey;
    } else {
      next();
      return;
    }

    const secret = process.env.JWT_SECRET || 'default-secret-change-in-production';
    const decoded = jwt.verify(token, secret) as JWTPayload;

    req.user = {
      id: decoded.userId,
      email: decoded.email,
      plan: decoded.plan,
      rateLimitTier: decoded.rateLimitTier
    };
  } catch (error) {
    // Ignore errors for optional auth
    logger.debug('Optional auth failed', { error });
  }

  next();
};

/**
 * Generate JWT token
 */
export function generateToken(user: User): string {
  const secret = process.env.JWT_SECRET || 'default-secret-change-in-production';
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
    plan: user.plan,
    rateLimitTier: user.rateLimitTier
  };

  return jwt.sign(payload, secret, { expiresIn });
}
