/**
 * Phase 35 Leaderboard - Authentication & Authorization
 * Secure API access control
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import crypto from 'crypto';
import { Redis } from 'ioredis';

export interface AuthConfig {
  jwtSecret: string;
  sessionTimeout: number;
  maxSessionsPerUser: number;
  enableApiKeyAuth: boolean;
}

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'vendor' | 'viewer';
  permissions: string[];
  apiKey?: string;
  sessionToken?: string;
  lastActivity: number;
}

export interface AuthToken {
  userId: string;
  sessionId: string;
  expires: number;
  permissions: string[];
}

export class AuthManager {
  private redis: Redis;
  public config: AuthConfig;
  private activeSessions = new Map<string, AuthToken>();

  constructor(redis: Redis, config: AuthConfig) {
    this.redis = redis;
    this.config = config;
  }

  /**
   * Generate secure API key
   */
  generateApiKey(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Hash API key for storage
   */
  hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Generate session token
   */
  generateSessionToken(userId: string, permissions: string[]): string {
    const sessionId = randomBytes(16).toString('hex');
    const expires = Date.now() + this.config.sessionTimeout;
    
    const token: AuthToken = {
      userId,
      sessionId,
      expires,
      permissions
    };
    
    // Store in Redis with expiration
    const tokenKey = `auth:session:${sessionId}`;
    this.redis.setex(tokenKey, Math.ceil(this.config.sessionTimeout / 1000), JSON.stringify(token));
    
    // Track active session
    this.activeSessions.set(sessionId, token);
    
    return sessionId;
  }

  /**
   * Validate session token
   */
  async validateSessionToken(token: string): Promise<AuthToken | null> {
    try {
      // Check active sessions first (memory cache)
      const cached = this.activeSessions.get(token);
      if (cached && cached.expires > Date.now()) {
        return cached;
      }
      
      // Check Redis
      const tokenKey = `auth:session:${token}`;
      const data = await this.redis.get(tokenKey);
      
      if (!data) {
        return null;
      }
      
      const authToken: AuthToken = JSON.parse(data);
      
      // Check expiration
      if (authToken.expires < Date.now()) {
        await this.redis.del(tokenKey);
        if (token) {
          this.activeSessions.delete(token);
        }
        return null;
      }
      
      // Update cache
      this.activeSessions.set(token, authToken);
      
      return authToken;
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate API key
   */
  async validateApiKey(apiKey: string): Promise<User | null> {
    try {
      const hashedKey = this.hashApiKey(apiKey);
      const userKey = `auth:api:${hashedKey}`;
      const data = await this.redis.get(userKey);
      
      if (!data) {
        return null;
      }
      
      const user: User = JSON.parse(data);
      
      // Update last activity
      user.lastActivity = Date.now();
      await this.redis.setex(userKey, Math.ceil(this.config.sessionTimeout / 1000), JSON.stringify(user));
      
      return user;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check user permissions
   */
  hasPermission(user: User, permission: string): boolean {
    return user.permissions.includes(permission) || user.role === 'admin';
  }

  /**
   * Invalidate session
   */
  async invalidateSession(token: string): Promise<void> {
    const tokenKey = `auth:session:${token}`;
    await this.redis.del(tokenKey);
    this.activeSessions.delete(token);
  }

  /**
   * Invalidate all user sessions
   */
  async invalidateUserSessions(userId: string): Promise<void> {
    try {
      const pattern = `auth:session:*`;
      const keys = await this.redis.keys(pattern);
      
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const token: AuthToken = JSON.parse(data);
          if (token.userId === userId) {
            await this.redis.del(key);
            const sessionId = key.split(':')[2];
            if (sessionId) {
              this.activeSessions.delete(sessionId);
            }
          }
        }
      }
    } catch (error) {
      // Log error but don't throw
    }
  }

  /**
   * Rate limit per user
   */
  async checkUserRateLimit(userId: string, limit: number = 100): Promise<boolean> {
    const key = `auth:rate:${userId}`;
    const window = 60; // 1 minute window
    
    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.expire(key, window);
    }
    
    return current <= limit;
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();
    
    // Clean memory cache
    for (const [sessionId, token] of this.activeSessions.entries()) {
      if (token.expires < now) {
        this.activeSessions.delete(sessionId);
      }
    }
    
    // Redis cleanup is handled by TTL
  }
}

/**
 * Authentication middleware for Fastify
 */
export function createAuthMiddleware(authManager: AuthManager, requiredPermission?: string) {
  return async (request: any, reply: any) => {
    const authHeader = request.headers['authorization'];
    const apiKey = request.headers['x-api-key'];
    
    let user: User | null = null;
    let token: AuthToken | null = null;
    
    // Try API key authentication first
    if (apiKey && authManager.config.enableApiKeyAuth) {
      user = await authManager.validateApiKey(apiKey);
    }
    
    // Try session authentication
    if (!user && authHeader) {
      const match = authHeader.match(/^Bearer\s+(.+)$/);
      if (match) {
        token = await authManager.validateSessionToken(match[1]);
        if (token) {
          // Create minimal user object from token
          user = {
            id: token.userId,
            email: '',
            role: 'viewer' as const,
            permissions: token.permissions,
            lastActivity: Date.now()
          };
        }
      }
    }
    
    // No valid authentication
    if (!user) {
      reply.code(401);
      reply.send({
        error: 'Unauthorized',
        message: 'Valid authentication required'
      });
      return reply;
    }
    
    // Check rate limiting
    const rateLimitOk = await authManager.checkUserRateLimit(user.id);
    if (!rateLimitOk) {
      reply.code(429);
      reply.send({
        error: 'Too Many Requests',
        message: 'User rate limit exceeded'
      });
      return reply;
    }
    
    // Check permissions
    if (requiredPermission && !authManager.hasPermission(user, requiredPermission)) {
      reply.code(403);
      reply.send({
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
      return reply;
    }
    
    // Attach user to request
    request.user = user;
    request.authToken = token;
  };
}

/**
 * Role-based access control
 */
export const PERMISSIONS = {
  READ_LEADERBOARD: 'leaderboard:read',
  WRITE_LEADERBOARD: 'leaderboard:write',
  ADMIN_USERS: 'admin:users',
  ADMIN_SYSTEM: 'admin:system',
  VENDOR_SUBMIT: 'vendor:submit',
  VENDOR_VIEW: 'vendor:view'
} as const;

export const ROLE_PERMISSIONS = {
  admin: Object.values(PERMISSIONS),
  vendor: [
    PERMISSIONS.READ_LEADERBOARD,
    PERMISSIONS.VENDOR_SUBMIT,
    PERMISSIONS.VENDOR_VIEW
  ],
  viewer: [
    PERMISSIONS.READ_LEADERBOARD,
    PERMISSIONS.VENDOR_VIEW
  ]
} as const;
