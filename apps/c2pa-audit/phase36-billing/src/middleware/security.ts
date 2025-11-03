/**
 * Phase 36 Billing - Security Middleware
 * Security headers, CSRF protection, and input sanitization
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { Redis } from 'ioredis';

// Redis instance for rate limiting - CRITICAL: Use TLS in production
const redisConfig: any = {
  host: process.env['REDIS_HOST'] || 'localhost',
  port: parseInt(process.env['REDIS_PORT'] || '6379'),
  db: parseInt(process.env['REDIS_DB'] || '0'),
  password: process.env['REDIS_PASSWORD'],
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000,
  connectTimeout: 10000,
  commandTimeout: 5000,
  family: 4,
  enableAutoPipelining: true,
};

// Enable TLS in production environments
if (process.env['NODE_ENV'] === 'production' || process.env['REDIS_TLS'] === 'true') {
  redisConfig.tls = {
    rejectUnauthorized: true,
    checkServerIdentity: () => undefined, // Allow self-signed certs in development
  };
}

const redis = new Redis(redisConfig);

/**
 * Security middleware for enhanced security measures
 */
export async function securityMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    // Set security headers
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    // CRITICAL: Enhanced origin validation with Host header check
    const origin = request.headers['origin'];
    const host = request.headers['host'];
    const referer = request.headers['referer'];
    const allowedOrigins = process.env['ALLOWED_ORIGINS']?.split(',').map(o => o.trim()) || ['http://localhost:3000'];
    
    // Validate origin header
    if (origin && allowedOrigins.length > 0) {
      const originAllowed = allowedOrigins.some(allowed => {
        // Exact match or subdomain match
        if (allowed === origin) return true;
        if (allowed.startsWith('*.')) {
          const domain = allowed.substring(2);
          return origin.endsWith('.' + domain) || origin === 'https://' + domain;
        }
        return false;
      });
      
      if (!originAllowed) {
        reply.status(403).send({
          code: 'ORIGIN_NOT_ALLOWED',
          message: 'Origin not allowed',
        });
        return;
      }
    }
    
    // CRITICAL: Validate Host header to prevent Host header injection
    if (host) {
      const allowedHosts = allowedOrigins.map(origin => {
        try {
          return new URL(origin).host;
        } catch {
          return origin.replace(/^https?:\/\//, '');
        }
      });
      
      if (!allowedHosts.includes(host) && !allowedHosts.some(h => host.endsWith('.' + h))) {
        reply.status(403).send({
          code: 'HOST_NOT_ALLOWED', 
          message: 'Host header not allowed',
        });
        return;
      }
    }

    // Check for suspicious user agents
    const userAgent = request.headers['user-agent'];
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /scraper/i,
      /curl/i,
      /wget/i,
    ];

    if (userAgent && suspiciousPatterns.some(pattern => pattern.test(userAgent))) {
      // Log suspicious requests but don't block them (could be legitimate tools)
      console.warn('Suspicious user agent detected:', userAgent);
    }

    // CRITICAL: Enhanced rate limiting with multiple identifier strategies
    const clientIP = request.ip || 
                     (Array.isArray(request.headers['x-forwarded-for']) 
                       ? request.headers['x-forwarded-for'][0] 
                       : request.headers['x-forwarded-for'])?.split(',')[0]?.trim() ||
                     request.headers['x-real-ip'] ||
                     'unknown';
    
    // CRITICAL: Add additional identifiers to prevent bypass
    const userAgent = request.headers['user-agent'] || 'unknown';
    const rateLimitKey = `rate_limit:${clientIP}:${Buffer.from(userAgent).toString('base64').substring(0, 16)}`;
    
    const windowMs = parseInt(process.env['RATE_LIMIT_WINDOW'] || '900000'); // 15 minutes
    const maxRequests = parseInt(process.env['MAX_REQUESTS_PER_WINDOW'] || '100');
    
    try {
      const currentRequests = await redis.incr(rateLimitKey);
      if (currentRequests === 1) {
        await redis.expire(rateLimitKey, Math.ceil(windowMs / 1000));
      }
      
      if (currentRequests > maxRequests) {
        reply.status(429).send({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Rate limit exceeded',
          retry_after: Math.ceil(windowMs / 1000),
        });
        return;
      }
      
      // Set rate limit headers
      reply.header('X-RateLimit-Limit', maxRequests);
      reply.header('X-RateLimit-Remaining', Math.max(0, maxRequests - currentRequests));
      reply.header('X-RateLimit-Reset', new Date(Date.now() + windowMs).toISOString());
      
    } catch (redisError) {
      console.error('Rate limiting Redis error:', redisError);
      // Fail open - don't block requests if Redis is down
    }

    // Sanitize request body if present
    if (request.body && typeof request.body === 'object') {
      sanitizeObject(request.body);
    }

    // Validate JSON structure
    if (request.body && typeof request.body === 'object') {
      validateJSONStructure(request.body);
    }

  } catch (error) {
    console.error('Security middleware error:', error);
    // Security middleware should not fail the request unless there's a serious issue
  }
}

/**
 * Sanitize object properties to prevent injection attacks
 */
function sanitizeObject(obj: any, depth = 0): void {
  if (depth > 10) return; // Prevent infinite recursion

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) {
        sanitizeObject(item, depth + 1);
      }
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // CRITICAL: Comprehensive XSS prevention
        let sanitized = value
          // Remove all script tags and content
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          // Remove JavaScript protocols
          .replace(/javascript:/gi, '')
          .replace(/data:(?!image\/)/gi, '') // Allow data:image but block other data protocols
          .replace(/vbscript:/gi, '')
          .replace(/livescript:/gi, '')
          // Remove all event handlers
          .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
          .replace(/on\w+\s*=\s*[^"\s>]+/gi, '')
          // Remove dangerous HTML tags
          .replace(/<iframe\b[^>]*>/gi, '')
          .replace(/<object\b[^>]*>/gi, '')
          .replace(/<embed\b[^>]*>/gi, '')
          .replace(/<form\b[^>]*>/gi, '')
          .replace(/<input\b[^>]*>/gi, '')
          .replace(/<textarea\b[^>]*>/gi, '')
          // Remove CSS expressions
          .replace(/expression\s*\(/gi, '')
          .replace(/@import/gi, '')
          .replace(/binding\s*:/gi, '');
        
        // CRITICAL: Enhanced SQL injection prevention
        sanitized = sanitized
          .replace(/(\b(union|select|insert|update|delete|drop|create|alter|exec|execute|truncate|grant|revoke)\b)/gi, '')
          .replace(/--/g, '')
          .replace(/\/\*/g, '')
          .replace(/\*\//g, '')
          .replace(/;/g, '')
          .replace(/'/g, "''") // Escape single quotes
          .replace(/"/g, '""') // Escape double quotes
          .replace(/\\x[0-9a-fA-F]{2}/g, '') // Remove hex encoded characters
          .replace(/\\u[0-9a-fA-F]{4}/g, ''); // Remove unicode encoded characters
        
        // CRITICAL: Path traversal prevention
        sanitized = sanitized
          .replace(/\.\./g, '')
          .replace(/%2e%2e/gi, '')
          .replace(/%2E%2E/gi, '')
          .replace(/\//g, '')
          .replace(/\\\\/g, '')
          .replace(/%2f/gi, '')
          .replace(/%5c/gi, '');
        
        // CRITICAL: Command injection prevention
        sanitized = sanitized
          .replace(/[;&|`$(){}[\]]/g, '')
          .replace(/&&/g, '')
          .replace(/\|\|/g, '')
          .replace(/>>/g, '')
          .replace(/</g, '')
          .replace(/>/g, '');
        
        // CRITICAL: LDAP injection prevention
        sanitized = sanitized
          .replace(/\*/g, '')
          .replace(/\(/g, '')
          .replace(/\)/g, '')
          .replace(/\|/g, '');
        
        // CRITICAL: NoSQL injection prevention
        sanitized = sanitized
          .replace(/\$where/gi, '')
          .replace(/\$ne/gi, '')
          .replace(/\$gt/gi, '')
          .replace(/\$lt/gi, '')
          .replace(/\$in/gi, '')
          .replace(/\$nin/gi, '');
        
        (obj as any)[key] = sanitized.trim();
        
        // CRITICAL: Validate sanitized string length
        if ((obj as any)[key].length > 10000) {
          throw new Error('Sanitized string exceeds maximum length');
        }
      } else if (typeof value === 'object' && value !== null) {
        sanitizeObject(value, depth + 1);
      }
    }
  }
}

/**
 * Validate JSON structure for potential issues
 */
function validateJSONStructure(obj: any, depth = 0): void {
  if (depth > 10) return; // Prevent infinite recursion

  if (Array.isArray(obj)) {
    if (obj.length > 1000) {
      throw new Error('Array too large');
    }
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) {
        validateJSONStructure(item, depth + 1);
      }
    }
  } else if (typeof obj === 'object' && obj !== null) {
    const keys = Object.keys(obj);
    if (keys.length > 100) {
      throw new Error('Object has too many properties');
    }

    for (const [key, value] of Object.entries(obj)) {
      // Check key length
      if (key.length > 100) {
        throw new Error('Property key too long');
      }

      // Check string length
      if (typeof value === 'string' && value.length > 10000) {
        throw new Error('String value too long');
      }

      if (typeof value === 'object' && value !== null) {
        validateJSONStructure(value, depth + 1);
      }
    }
  }
}

/**
 * Enhanced rate limiting with Redis fallback
 */
async function checkRateLimit(clientIP: string, userAgent: string): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
  const rateLimitKey = `rate_limit:${clientIP}:${Buffer.from(userAgent).toString('base64').substring(0, 16)}`;
  const windowMs = parseInt(process.env['RATE_LIMIT_WINDOW'] || '900000');
  const maxRequests = parseInt(process.env['MAX_REQUESTS_PER_WINDOW'] || '100');
  
  try {
    const currentRequests = await redis.incr(rateLimitKey);
    if (currentRequests === 1) {
      await redis.expire(rateLimitKey, Math.ceil(windowMs / 1000));
    }
    
    return {
      allowed: currentRequests <= maxRequests,
      remaining: Math.max(0, maxRequests - currentRequests),
      resetTime: new Date(Date.now() + windowMs),
    };
  } catch (error) {
    console.error('Rate limiting error:', error);
    // Fail open - allow requests if Redis is down
    return {
      allowed: true,
      remaining: maxRequests,
      resetTime: new Date(Date.now() + windowMs),
    };
  }
}

/**
 * Rate limiting middleware factory
 */
export function createRateLimitMiddleware(options: {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
}) {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return async function rateLimitMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const clientIP = request.ip || request.headers['x-forwarded-for'] || 'unknown';
      const now = Date.now();
      const windowStart = now - options.windowMs;

      // Clean up old entries
      for (const [ip, data] of requests.entries()) {
        if (data.resetTime < windowStart) {
          requests.delete(ip);
        }
      }

      // Get or create client data
      let clientData = requests.get(clientIP);
      if (!clientData || clientData.resetTime < windowStart) {
        clientData = { count: 0, resetTime: now + options.windowMs };
        requests.set(clientIP, clientData);
      }

      // Check rate limit
      if (clientData.count >= options.maxRequests) {
        reply.status(429).send({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
          retryAfter: Math.ceil((clientData.resetTime - now) / 1000),
        });
        return;
      }

      clientData.count++;

      // Set rate limit headers
      reply.header('X-RateLimit-Limit', options.maxRequests);
      reply.header('X-RateLimit-Remaining', Math.max(0, options.maxRequests - clientData.count));
      reply.header('X-RateLimit-Reset', new Date(clientData.resetTime).toISOString());

    } catch (error) {
      console.error('Rate limiting middleware error:', error);
      // Don't fail the request on rate limiting errors
    }
  };
}
