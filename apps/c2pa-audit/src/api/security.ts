/**
 * Security Middleware for C2PA Audit Tool
 * Implements comprehensive security controls and rate limiting
 */

import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Rate limiting configuration
 */
const RATE_LIMIT_CONFIG = {
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Max 100 requests per minute
  message: 'Rate limit exceeded. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
};

/**
 * In-memory rate limiter (use Redis in production)
 */
class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  isAllowed(clientId: string): boolean {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_CONFIG.windowMs;
    
    // Get existing requests for this client
    let timestamps = this.requests.get(clientId) || [];
    
    // Filter out old requests
    timestamps = timestamps.filter(timestamp => timestamp > windowStart);
    
    // Check if limit exceeded
    if (timestamps.length >= RATE_LIMIT_CONFIG.max) {
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

const rateLimiter = new RateLimiter();

/**
 * Rate limiting middleware
 */
export async function rateLimitMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const clientId = getClientIdentifier(request);
  
  if (!rateLimiter.isAllowed(clientId)) {
    return reply.code(429).send({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: RATE_LIMIT_CONFIG.message
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
    return forwardedFor.split(',')[0].trim();
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
 * Input validation middleware
 */
export async function validateInputMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // Validate request size
  const contentLength = request.headers['content-length'];
  if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) { // 10MB limit
    return reply.code(413).send({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload too large'
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
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-XSS-Protection', '1; mode=block');
  reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  reply.header('Cross-Origin-Embedder-Policy', 'require-corp');
  reply.header('Cross-Origin-Resource-Policy', 'same-origin');
}

/**
 * IP blocking middleware
 */
const BLOCKED_IPS = new Set([
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
  const response = await reply;
  
  // Log response details
  const duration = Date.now() - startTime;
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    ip: clientIP,
    statusCode: response.statusCode,
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
