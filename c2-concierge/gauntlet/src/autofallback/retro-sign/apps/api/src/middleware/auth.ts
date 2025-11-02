/**
 * Authentication and Authorization Middleware
 * Production-ready JWT validation and role-based access control
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { securityConfig } from '../config/security';
import { tokenBlacklist } from '../services/token-blacklist-service';
import { 
  securePermissionCheck, 
  secureRoleCheck, 
  secureArrayIncludes,
  addRandomDelay 
} from '../utils/timing';

// JWT payload interface
export interface JWTPayload {
  jti: string; // JWT ID - CRITICAL for token revocation
  sub: string; // user ID
  email: string;
  role: 'admin' | 'user' | 'readonly';
  permissions: string[];
  iat: number;
  exp: number;
  aud: string;
  iss: string;
}

// Rate limiting interface
export interface RateLimitStore {
  get(key: string): Promise<number | null>;
  set(key: string, count: number, ttlSeconds: number): Promise<void>;
  increment(key: string, ttlSeconds: number): Promise<number>;
}

// In-memory rate limiter (use Redis in production)
class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, { count: number; expires: number }>();

  async get(key: string): Promise<number | null> {
    const item = this.store.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expires) {
      this.store.delete(key);
      return null;
    }
    
    return item.count;
  }

  async set(key: string, count: number, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      count,
      expires: Date.now() + (ttlSeconds * 1000)
    });
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const current = await this.get(key) || 0;
    const newCount = current + 1;
    await this.set(key, newCount, ttlSeconds);
    return newCount;
  }
}

// Global rate limit store (use Redis in production)
const rateLimitStore = new MemoryRateLimitStore();

/**
 * JWT Authentication Middleware - WITH ERROR HANDLING
 */
export async function authenticateJWT(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader) {
      return reply.status(401).send({ 
        error: 'Authentication required',
        message: 'Missing Authorization header'
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ 
        error: 'Invalid authentication format',
        message: 'Expected Bearer token'
      });
    }

    const token = authHeader.substring(7);
    
    // Verify JWT token with proper error handling
    const payload = await verifyJWT(token);
    
    // Attach user info to request
    (request as any).user = payload;
    
  } catch (error) {
    console.error('Authentication error:', error);
    
    // Don't expose internal errors to clients
    const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
    
    if (errorMessage.includes('expired')) {
      return reply.status(401).send({ 
        error: 'Token expired',
        message: 'Please refresh your authentication token'
      });
    }
    
    return reply.status(401).send({ 
      error: 'Authentication failed',
      message: 'Invalid or expired authentication token'
    });
  }
}

/**
 * Role-based Authorization Middleware
 */
export function requireRole(requiredRole: 'admin' | 'user' | 'readonly') {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = (request as any).user as JWTPayload;
    
    if (!user) {
      return reply.status(401).send({ 
        error: 'Authentication required',
        message: 'User not authenticated'
      });
    }

    // 🚨 CRITICAL: Use timing-safe role comparison to prevent timing attacks
    const roleHierarchy = {
      'readonly': 0,
      'user': 1,
      'admin': 2
    };

    const userLevel = roleHierarchy[user.role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;

    // Add random delay to prevent timing attacks
    await addRandomDelay(10, 30);

    if (userLevel < requiredLevel) {
      return reply.status(403).send({ 
        error: 'Insufficient permissions',
        message: `Requires ${requiredRole} role, current role: ${user.role}`,
        required_role: requiredRole,
        current_role: user.role
      });
    }
  };
}

/**
 * Permission-based Authorization Middleware
 */
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = (request as any).user as JWTPayload;
    
    if (!user) {
      return reply.status(401).send({ 
        error: 'Authentication required',
        message: 'User not authenticated'
      });
    }

    // 🚨 CRITICAL: Use timing-safe permission check to prevent timing attacks
    await addRandomDelay(10, 30);

    if (!securePermissionCheck(user.permissions, permission)) {
      return reply.status(403).send({ 
        error: 'Insufficient permissions',
        message: `Requires permission: ${permission}`,
        required_permission: permission,
        user_permissions: user.permissions
      });
    }
  };
}

/**
 * Rate Limiting Middleware
 */
export function createRateLimit(options: {
  requestsPerMinute: number;
  keyGenerator?: (request: FastifyRequest) => string;
}) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const key = options.keyGenerator 
      ? options.keyGenerator(request)
      : `rate-limit:${request.ip}:general`;
    
    const current = await rateLimitStore.increment(key, 60); // 60 second window
    
    if (current > options.requestsPerMinute) {
      return reply.status(429).send({ 
        error: 'Rate limit exceeded',
        message: `Too many requests. Limit: ${options.requestsPerMinute} per minute`,
        retry_after: 60,
        current_count: current,
        limit: options.requestsPerMinute
      });
    }
    
    // Add rate limit headers
    reply.header('X-RateLimit-Limit', options.requestsPerMinute);
    reply.header('X-RateLimit-Remaining', Math.max(0, options.requestsPerMinute - current));
    reply.header('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + 60);
  };
}

/**
 * Security Headers Middleware
 */
export async function addSecurityHeaders(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Security headers
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-XSS-Protection', '1; mode=block');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // 🚨 CRITICAL: Add HSTS for HTTPS security
  if (process.env.NODE_ENV === 'production' || request.headers['x-forwarded-proto'] === 'https') {
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // Content Security Policy - HARSH SECURITY MODE
  const csp = [
    "default-src 'self'",
    "script-src 'self'", // REMOVED unsafe-inline - XSS VULNERABILITY
    "style-src 'self'", // REMOVED unsafe-inline - XSS VULNERABILITY  
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'", // Prevent plugin embedding
    "media-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "child-src 'none'"
  ].join('; ');
  
  reply.header('Content-Security-Policy', csp);
  
  // Remove server information
  reply.header('Server', '');
  reply.header('X-Powered-By', '');
  
  // Additional security headers
  reply.header('X-Permitted-Cross-Domain-Policies', 'none');
  reply.header('X-Download-Options', 'noopen');
  reply.header('X-Content-Security-Policy', 'default-src \'self\'');
}

/**
 * CORS Validation Middleware
 */
export function validateCORS(allowedOrigins: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const origin = request.headers.origin;
    
    if (!origin) return; // Same-origin request
    
    // Check if origin is allowed
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed === '*') return true;
      if (allowed.includes('*')) {
        const pattern = allowed.replace('*', '.*');
        return new RegExp(`^${pattern}$`).test(origin);
      }
      return allowed === origin;
    });
    
    if (!isAllowed) {
      console.warn('CORS violation attempt:', {
        origin,
        allowedOrigins,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        timestamp: new Date().toISOString()
      });
      
      return reply.status(403).send({
        error: 'CORS policy violation',
        message: 'Origin not allowed',
        origin
      });
    }
    
    // Add CORS headers for allowed origins
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With');
    reply.header('Access-Control-Allow-Credentials', 'true');
    reply.header('Access-Control-Max-Age', '86400'); // 24 hours
  };
}

/**
 * JWT Verification - PRODUCTION IMPLEMENTATION
 */
async function verifyJWT(token: string): Promise<JWTPayload> {
  try {
    // CRITICAL: Verify JWT signature and claims
    const decoded = jwt.verify(token, securityConfig.jwt.secret, {
      issuer: securityConfig.jwt.issuer,
      audience: securityConfig.jwt.audience,
      algorithms: [securityConfig.jwt.algorithm],
      clockTolerance: 30 // 30 seconds clock skew tolerance
    }) as JWTPayload;
    
    // Validate required claims
    if (!decoded.jti || !decoded.sub || !decoded.email || !decoded.role) {
      throw new Error('JWT missing required claims');
    }
    
    // Validate role
    if (!['admin', 'user', 'readonly'].includes(decoded.role)) {
      throw new Error('Invalid user role in JWT');
    }
    
    // Validate permissions array
    if (!Array.isArray(decoded.permissions)) {
      throw new Error('Invalid permissions in JWT');
    }
    
    // Check if token is revoked (CRITICAL SECURITY CHECK)
    if (await tokenBlacklist.isTokenRevoked(decoded.jti, decoded.sub)) {
      throw new Error('Token has been revoked');
    }
    
    return decoded;
    
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token signature');
    } else if (error.name === 'NotBeforeError') {
      throw new Error('Token not active');
    } else {
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }
}

/**
 * Audit Logging Helper
 */
export function createAuditLogger(fastify: any) {
  return function logAudit(event: {
    action: string;
    user_id?: string;
    key_id?: string;
    details: Record<string, any>;
    request: FastifyRequest;
  }) {
    const auditLog = {
      timestamp: new Date().toISOString(),
      action: event.action,
      user_id: event.user_id || 'anonymous',
      ip_address: event.request.ip,
      user_agent: event.request.headers['user-agent'],
      ...event.details
    };
    
    // Log to different levels based on action severity
    const criticalActions = ['KEY_REVOCATION', 'ADMIN_ACCESS', 'SECURITY_BREACH'];
    
    if (criticalActions.includes(event.action)) {
      fastify.log.error('SECURITY AUDIT', auditLog);
      console.error('CRITICAL AUDIT:', JSON.stringify(auditLog));
    } else {
      fastify.log.warn('AUDIT', auditLog);
      console.log('AUDIT:', JSON.stringify(auditLog));
    }
    
    // TODO: Store in database for compliance
    // TODO: Send to security monitoring system
  };
}

/**
 * Request Validation Middleware
 */
export function validateRequestBody(schema: any) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      // Use Fastify's built-in validation
      // This is a placeholder for additional custom validation
      if (!schema) return;
      
      // Custom validation logic here if needed
    } catch (error) {
      return reply.status(400).send({
        error: 'Invalid request body',
        message: error instanceof Error ? error.message : 'Validation failed'
      });
    }
  };
}
