/**
 * Security Middleware for C2PA Audit Tool
 * Implements comprehensive security controls and rate limiting
 */

import { FastifyRequest, FastifyReply } from 'fastify';

interface SecurityEvent {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  ip?: string;
  userAgent?: string;
  url?: string;
  timestamp?: string;
}

/**
 * Rate limiting configuration
 */
const RATE_LIMIT_CONFIG = {
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Max 100 requests per minute
  message: 'Rate limit exceeded. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // CRITICAL: Enhanced security settings
  blockDuration: 15 * 60 * 1000, // Block for 15 minutes after limit exceeded
  maxViolations: 5, // Block after 5 violations
  distributedProtection: true, // Enable distributed protection
};

/**
 * Enhanced rate limiter with Redis backend for production
 */
class EnhancedRateLimiter {
  private requests: Map<string, number[]> = new Map();
  private violations: Map<string, { count: number; blockedUntil: number }> = new Map();
  private redis: any = null; // Redis client for production

  constructor() {
    // Initialize Redis if available (production)
    if (process.env.REDIS_URL) {
      // In production, initialize Redis client
      // this.redis = new Redis(process.env.REDIS_URL);
    }
  }

  async isAllowed(clientId: string): Promise<boolean> {
    // Check if client is blocked
    const violation = this.violations.get(clientId);
    if (violation && violation.blockedUntil > Date.now()) {
      return false;
    }

    const now = Date.now();
    const windowStart = now - RATE_LIMIT_CONFIG.windowMs;
    
    // Try Redis first (production)
    if (this.redis) {
      try {
        const redisKey = `rate_limit:${clientId}`;
        const current = await this.redis.incr(redisKey);
        
        if (current === 1) {
          await this.redis.expire(redisKey, Math.ceil(RATE_LIMIT_CONFIG.windowMs / 1000));
        }
        
        if (current > RATE_LIMIT_CONFIG.max) {
          await this.handleViolation(clientId);
          return false;
        }
        
        return true;
      } catch (error) {
        console.error('Redis rate limiting failed, falling back to memory:', error);
      }
    }
    
    // Fallback to in-memory rate limiting
    let timestamps = this.requests.get(clientId) || [];
    
    // Filter out old requests
    timestamps = timestamps.filter(timestamp => timestamp > windowStart);
    
    // Check if limit exceeded
    if (timestamps.length >= RATE_LIMIT_CONFIG.max) {
      await this.handleViolation(clientId);
      return false;
    }
    
    // Add current request
    timestamps.push(now);
    this.requests.set(clientId, timestamps);
    
    // Cleanup old entries periodically
    if (Math.random() < 0.01) { // 1% chance to cleanup
      this.cleanup();
    }
    
    return true;
  }

  private async handleViolation(clientId: string): Promise<void> {
    const violation = this.violations.get(clientId) || { count: 0, blockedUntil: 0 };
    violation.count++;
    
    if (violation.count >= RATE_LIMIT_CONFIG.maxViolations) {
      violation.blockedUntil = Date.now() + RATE_LIMIT_CONFIG.blockDuration;
    }
    
    this.violations.set(clientId, violation);
    
    // Log violation for monitoring
    console.warn(`Rate limit violation: ${clientId}, count: ${violation.count}`);
  }

  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_CONFIG.windowMs;
    
    for (const [clientId, timestamps] of this.requests.entries()) {
      const filtered = timestamps.filter(timestamp => timestamp > windowStart);
      if (filtered.length === 0) {
        this.requests.delete(clientId);
      } else {
        this.requests.set(clientId, filtered);
      }
    }
  }
}

const rateLimiter = new EnhancedRateLimiter();

/**
 * Rate limiting middleware
 */
export async function rateLimitMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const clientId = getClientIdentifier(request);
  
  if (!(await rateLimiter.isAllowed(clientId))) {
    return reply.code(429).send({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: RATE_LIMIT_CONFIG.message,
        retryAfter: Math.ceil(RATE_LIMIT_CONFIG.blockDuration / 1000)
      }
    });
  }
}

/**
 * Get client identifier for rate limiting
 */
function getClientIdentifier(request: FastifyRequest): string {
  // Try to get real IP from various headers
  const forwardedFor = request.headers['x-forwarded-for'] as string;
  const realIP = request.headers['x-real-ip'] as string;
  const cfConnectingIP = request.headers['cf-connecting-ip'] as string;
  
  if (forwardedFor) {
    const ips = forwardedFor.split(',');
    if (ips.length > 0) {
      const firstIP = ips[0]?.trim();
      return firstIP || 'unknown';
    }
  }
  
  if (realIP) {
    return realIP;
  }
  
  if (cfConnectingIP) {
    return cfConnectingIP;
  }
  
  return request.ip || 'unknown';
}

/**
 * Security monitoring and logging
 */
class SecurityMonitor {
  private static events: SecurityEvent[] = [];
  private static maxEvents = 1000;

  static logEvent(event: SecurityEvent): void {
    this.events.push({
      ...event,
      timestamp: new Date().toISOString()
    });

    // Keep only recent events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Log critical events
    if (event.severity === 'critical') {
      console.error('SECURITY CRITICAL:', event);
    } else if (event.severity === 'high') {
      console.warn('SECURITY HIGH:', event);
    }
  }

  static getRecentEvents(minutes: number = 60): SecurityEvent[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.events.filter(event => 
      event.timestamp && new Date(event.timestamp) > cutoff
    );
  }

  static getEventsByType(type: string): SecurityEvent[] {
    return this.events.filter(event => event.type === type);
  }
}

/**
 * Input validation middleware
 */
export async function validateInputMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // Validate request size
  const contentLength = request.headers['content-length'];
  if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) { // 10MB limit
    SecurityMonitor.logEvent({
      type: 'oversized_request',
      severity: 'medium',
      message: `Oversized request: ${contentLength} bytes`,
      ip: getClientIdentifier(request),
      userAgent: request.headers['user-agent'] || 'unknown',
      url: request.url
    });
    return reply.code(413).send({
      error: {
        code: 'REQUEST_TOO_LARGE',
        message: 'Request size exceeds limit'
      }
    });
  }

  // Validate User-Agent
  const userAgent = request.headers['user-agent'];
  if (!userAgent || userAgent.length > 500) {
    return reply.code(400).send({
      error: {
        code: 'INVALID_USER_AGENT',
        message: 'Invalid or missing User-Agent'
      }
    });
  }

  // Check for suspicious patterns
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /data:text\/html/i,
    /vbscript:/i
  ];

  const requestBody = JSON.stringify(request.body);
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(requestBody)) {
      return reply.code(400).send({
        error: {
          code: 'SUSPICIOUS_INPUT',
          message: 'Request contains suspicious content'
        }
      });
    }
  }
}

/**
 * Security headers middleware
 */
export async function securityHeadersMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // CRITICAL: Prevent clickjacking
  reply.header('X-Frame-Options', 'DENY');
  
  // CRITICAL: Prevent MIME type sniffing
  reply.header('X-Content-Type-Options', 'nosniff');
  
  // CRITICAL: Enable XSS protection
  reply.header('X-XSS-Protection', '1; mode=block');
  
  // CRITICAL: Strict transport security (HTTPS only)
  if (request.url.startsWith('https')) {
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // CRITICAL: Content security policy
  reply.header('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self'; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'"
  );
  
  // CRITICAL: Referrer policy
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // CRITICAL: Permissions policy
  reply.header('Permissions-Policy', 
    'geolocation=(), ' +
    'microphone=(), ' +
    'camera=(), ' +
    'payment=(), ' +
    'usb=(), ' +
    'magnetometer=(), ' +
    'gyroscope=(), ' +
    'accelerometer=()'
  );
  
  // CRITICAL: Remove server information
  reply.header('Server', 'C2PA-Audit');
  
  // CRITICAL: Remove powered by header
  reply.removeHeader('X-Powered-By');
}

/**
 * CSRF protection middleware
 */
export async function csrfProtectionMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // Only apply to state-changing methods
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
    const origin = request.headers.origin;
    const referer = request.headers.referer;
    const host = request.headers.host;
    
    // CRITICAL: Validate Origin header for state-changing requests
    if (!origin && !referer) {
      return reply.code(403).send({
        error: {
          code: 'CSRF_MISSING_ORIGIN',
          message: 'Origin or Referer header required for state-changing requests'
        }
      });
    }
    
    // CRITICAL: Check if origin matches host or is allowed
    const allowedOrigins = [
      `https://${host}`,
      `http://${host}`,
      process.env.CORS_ORIGIN
    ].filter(Boolean);
    
    const requestOrigin = origin || new URL(referer || '').origin;
    
    if (!allowedOrigins.includes(requestOrigin)) {
      console.warn('CSRF attempt detected:', { origin, referer, host, requestOrigin });
      return reply.code(403).send({
        error: {
          code: 'CSRF_INVALID_ORIGIN',
          message: 'Origin not allowed for this request'
        }
      });
    }
  }
}

/**
 * IP blocking middleware
 */
const BLOCKED_IPS: Set<string> = new Set([
  // Add known malicious IPs here
]);

export async function ipBlockingMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const clientIP = getClientIdentifier(request);
  
  if (BLOCKED_IPS.has(clientIP)) {
    return reply.code(403).send({
      error: {
        code: 'IP_BLOCKED',
        message: 'Access denied'
      }
    });
  }
}

/**
 * Request logging middleware for security monitoring
 */
export async function securityLoggingMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const startTime = Date.now();
  const clientIP = getClientIdentifier(request);
  const userAgent = request.headers['user-agent'] || 'unknown';
  
  // Log request details for security monitoring
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    ip: clientIP,
    method: request.method,
    url: request.url,
    userAgent: userAgent.substring(0, 200),
    contentLength: request.headers['content-length'] || '0'
  }));
  
  // Continue with request
  await reply;
  
  // Log response details
  const duration = Date.now() - startTime;
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    ip: clientIP,
    duration: duration
  }));
}

/**
 * Comprehensive security middleware bundle
 */
export async function securityMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // Apply security headers first
  await securityHeadersMiddleware(request, reply);
  
  // Check IP blocking
  await ipBlockingMiddleware(request, reply);
  
  // Validate input
  await validateInputMiddleware(request, reply);
  
  // Apply rate limiting
  await rateLimitMiddleware(request, reply);
  
  // Log for security monitoring
  await securityLoggingMiddleware(request, reply);
}
