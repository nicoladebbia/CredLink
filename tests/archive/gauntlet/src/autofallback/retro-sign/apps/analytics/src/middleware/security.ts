/**
 * Phase 13 Analytics - Enhanced Security Middleware
 * Critical security protections with comprehensive monitoring
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { getConfig } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('SecurityMiddleware');

// Enhanced in-memory rate limiter with comprehensive tracking
class EnhancedRateLimiter {
  private requests = new Map<string, { 
    count: number; 
    resetTime: number; 
    firstRequest: number;
    blockedUntil?: number;
  }>();

  constructor(
    private windowMs: number, 
    private maxRequests: number,
    private blockDuration: number = 900000 // 15 minutes block
  ) {}

  isAllowed(key: string): { allowed: boolean; retryAfter?: number; remaining?: number } {
    const now = Date.now();
    const record = this.requests.get(key);

    // Check if currently blocked
    if (record?.blockedUntil && now < record.blockedUntil) {
      return {
        allowed: false,
        retryAfter: Math.ceil((record.blockedUntil - now) / 1000)
      };
    }

    // Clear block if expired
    if (record?.blockedUntil && now >= record.blockedUntil) {
      record.blockedUntil = undefined;
      record.count = 0;
      record.resetTime = now + this.windowMs;
    }

    if (!record || now > record.resetTime) {
      this.requests.set(key, { 
        count: 1, 
        resetTime: now + this.windowMs,
        firstRequest: now
      });
      return { allowed: true, remaining: this.maxRequests - 1 };
    }

    if (record.count >= this.maxRequests) {
      // Implement exponential backoff for repeated violations
      const violations = Math.floor(record.count / this.maxRequests);
      const blockTime = this.blockDuration * Math.pow(2, Math.min(violations - 1, 5));
      
      record.blockedUntil = now + blockTime;
      
      logger.log('warn', 'Rate limit exceeded - IP blocked', {
        key,
        violations,
        blockTime: `${blockTime}ms`,
        requestCount: record.count
      });

      return {
        allowed: false,
        retryAfter: Math.ceil(blockTime / 1000)
      };
    }

    record.count++;
    return { 
      allowed: true, 
      remaining: this.maxRequests - record.count 
    };
  }

  // Enhanced cleanup with statistics
  cleanup(): { cleaned: number; active: number } {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, record] of this.requests.entries()) {
      if (now > record.resetTime && (!record.blockedUntil || now >= record.blockedUntil)) {
        this.requests.delete(key);
        cleaned++;
      }
    }

    return { cleaned, active: this.requests.size };
  }

  // Get statistics for monitoring
  getStats(): { totalEntries: number; blockedEntries: number; activeRequests: number } {
    const now = Date.now();
    let blockedEntries = 0;
    let activeRequests = 0;

    for (const record of this.requests.values()) {
      if (record.blockedUntil && now < record.blockedUntil) {
        blockedEntries++;
      }
      if (now <= record.resetTime) {
        activeRequests += record.count;
      }
    }

    return {
      totalEntries: this.requests.size,
      blockedEntries,
      activeRequests
    };
  }
}

// Global rate limiter instance
let rateLimiter: EnhancedRateLimiter;

/**
 * Enhanced rate limiting with comprehensive monitoring
 */
export async function rateLimit(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const config = getConfig();
  
  if (!rateLimiter) {
    rateLimiter = new EnhancedRateLimiter(
      config.security?.rate_limit_window || 900000,
      config.security?.rate_limit_max || 100,
      900000 // 15 minutes block
    );
  }

  // Cleanup old records periodically (0.1% chance)
  if (Math.random() < 0.001) {
    const stats = rateLimiter.cleanup();
    if (stats.cleaned > 0) {
      logger.log('debug', 'Rate limiter cleanup', stats);
    }
  }

  // Enhanced client IP detection
  const clientIP = request.headers['x-forwarded-for'] as string || 
                   request.headers['x-real-ip'] as string || 
                   request.ip || 
                   'unknown';

  // Add user agent fingerprinting for enhanced tracking
  const userAgent = request.headers['user-agent'] as string || 'unknown';
  const fingerprint = `${clientIP}:${userAgent.substring(0, 50)}`;

  const result = rateLimiter.isAllowed(fingerprint);

  if (!result.allowed) {
    logger.log('warn', 'Rate limit exceeded', {
      ip: clientIP,
      userAgent: userAgent.substring(0, 100),
      url: request.url,
      method: request.method,
      retryAfter: result.retryAfter
    });

    reply.status(429).send({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: result.retryAfter
    });
    return;
  }

  // Add rate limit headers for transparency
  reply.header('X-RateLimit-Limit', config.security?.rate_limit_max || 100);
  reply.header('X-RateLimit-Remaining', result.remaining || 0);
  reply.header('X-RateLimit-Reset', new Date(Date.now() + (config.security?.rate_limit_window || 900000)).toISOString());
}

/**
 * Enhanced security headers with CSP 3.0
 */
export async function securityHeaders(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Prevent clickjacking
  reply.header('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  reply.header('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection (legacy but still useful)
  reply.header('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Enhanced Content Security Policy 3.0
  const isProduction = process.env.NODE_ENV === 'production';
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'", // Handlebars requires inline scripts
    "style-src 'self' 'unsafe-inline'",  // Handlebars requires inline styles  
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "media-src 'self'",
    "manifest-src 'self'",
    "worker-src 'none'",
    isProduction ? "upgrade-insecure-requests" : "",
    "block-all-mixed-content"
  ].filter(Boolean).join('; ');
  
  reply.header('Content-Security-Policy', cspDirectives);
  
  // Strict transport security (HTTPS only)
  if (isProduction) {
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // Permissions Policy (Feature Policy)
  reply.header('Permissions-Policy', [
    'geolocation=()',
    'microphone=()',
    'camera=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()',
    'ambient-light-sensor=()',
    'autoplay=(self)',
    'encrypted-media=(self)',
    'fullscreen=(self)',
    'picture-in-picture=(self)'
  ].join(', '));

  // Additional security headers
  reply.header('Cross-Origin-Embedder-Policy', 'require-corp');
  reply.header('Cross-Origin-Resource-Policy', 'same-origin');
  reply.header('Cross-Origin-Opener-Policy', 'same-origin');
}

/**
 * Enhanced request size limiting with content-type validation
 */
export async function requestSizeLimit(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const config = getConfig();
  const contentLength = request.headers['content-length'];
  const contentType = request.headers['content-type'];
  
  // Validate content length
  const maxSize = config.security?.max_request_size || 1048576;
  if (contentLength && parseInt(contentLength) > maxSize) {
    logger.log('warn', 'Request size limit exceeded', {
      contentLength,
      maxSize,
      ip: request.ip,
      url: request.url
    });
    
    reply.status(413).send({
      error: 'Payload Too Large',
      message: `Request size cannot exceed ${maxSize} bytes`
    });
    return;
  }

  // Validate content-type for POST/PUT requests
  if (['POST', 'PUT', 'PATCH'].includes(request.method) && contentType) {
    const allowedTypes = [
      'application/json',
      'application/x-www-form-urlencoded',
      'multipart/form-data',
      'text/plain'
    ];

    const isAllowed = allowedTypes.some(type => contentType.includes(type));
    if (!isAllowed) {
      logger.log('warn', 'Invalid content-type', {
        contentType,
        method: request.method,
        ip: request.ip
      });
      
      reply.status(415).send({
        error: 'Unsupported Media Type',
        message: 'Content-Type not supported'
      });
      return;
    }
  }
}

/**
 * Enhanced IP whitelist with CIDR support
 */
export async function ipWhitelist(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const allowedIPs = process.env.ALLOWED_IPS?.split(',') || [];
  
  if (allowedIPs.length === 0) {
    return; // No IP restriction configured
  }

  const clientIP = request.headers['x-forwarded-for'] as string || 
                   request.headers['x-real-ip'] as string || 
                   request.ip || 
                   'unknown';

  // Enhanced IP validation with CIDR support
  const isAllowed = allowedIPs.some(allowed => {
    if (allowed.includes('/')) {
      // CIDR notation - simple implementation
      const [network, prefix] = allowed.split('/');
      // This is a simplified check - in production, use a proper CIDR library
      return clientIP.startsWith(network.split('.').slice(0, Math.floor(parseInt(prefix) / 8)).join('.'));
    }
    return clientIP === allowed.trim();
  });

  if (!isAllowed) {
    logger.log('warn', 'IP access denied', {
      clientIP,
      allowedIPs,
      url: request.url,
      userAgent: request.headers['user-agent']
    });
    
    reply.status(403).send({
      error: 'Access Denied',
      message: 'Your IP address is not authorized to access this endpoint'
    });
    return;
  }
}

/**
 * Enhanced request sanitization with comprehensive filtering
 */
export async function sanitizeRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sanitizeValue = (value: any): any => {
    if (typeof value === 'string') {
      return value
        .replace(/[\x00-\x1F\x7F]/g, '') // Control characters
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Script tags
        .replace(/<[^>]*>/g, '') // All HTML tags
        .replace(/javascript:/gi, '') // JavaScript protocol
        .replace(/vbscript:/gi, '') // VBScript protocol
        .replace(/on\w+\s*=/gi, '') // Event handlers
        .replace(/data:text\/html/gi, '') // Data URLs
        .trim();
    }
    
    if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    }
    
    if (typeof value === 'object' && value !== null) {
      const sanitized: any = {};
      for (const [key, val] of Object.entries(value)) {
        sanitized[key] = sanitizeValue(val);
      }
      return sanitized;
    }
    
    return value;
  };

  try {
    // Sanitize query parameters
    if (request.query) {
      request.query = sanitizeValue(request.query);
    }

    // Sanitize URL parameters
    if (request.params) {
      request.params = sanitizeValue(request.params);
    }

    // Sanitize body for POST/PUT requests
    if (request.body && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
      request.body = sanitizeValue(request.body);
    }
  } catch (error) {
    logger.log('error', 'Request sanitization error', {
      error: error instanceof Error ? error.message : String(error),
      url: request.url
    });
    
    reply.status(400).send({
      error: 'Bad Request',
      message: 'Invalid request format'
    });
    return;
  }
}

/**
 * Comprehensive security middleware for all routes
 */
export async function securityMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await securityHeaders(request, reply);
    await sanitizeRequest(request, reply);
    await rateLimit(request, reply);
    await requestSizeLimit(request, reply);
  } catch (error) {
    logger.log('error', 'Security middleware error', {
      error: error instanceof Error ? error.message : String(error),
      url: request.url,
      ip: request.ip
    });
    
    // Don't expose internal errors
    reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Security check failed'
    });
  }
}

/**
 * Get security statistics for monitoring
 */
export function getSecurityStats(): any {
  if (!rateLimiter) {
    return { rateLimiter: null };
  }

  return {
    rateLimiter: rateLimiter.getStats(),
    timestamp: new Date().toISOString()
  };
}
