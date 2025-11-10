/**
 * Phase 35 Leaderboard - Request Validation
 * Comprehensive request validation and sanitization
 */

import { z } from 'zod';
import { randomBytes } from 'crypto';
import crypto from 'crypto';
import { validateAndSanitizeInput, validateId, validateUrl } from './security';

// Common validation schemas
export const IdSchema = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);
export const VendorIdSchema = z.string().min(1).max(32).regex(/^[a-z0-9-]+$/);
export const UrlSchema = z.string().url().max(2048);
export const EmailSchema = z.string().email().max(255);
export const ScoreSchema = z.number().min(0).max(100);

// Request validation schemas
export const GetVendorRequestSchema = z.object({
  vendorId: VendorIdSchema,
});

export const GetPlaybookRequestSchema = z.object({
  vendorId: VendorIdSchema,
  target: ScoreSchema.optional().default(90),
});

export const SubmitCorrectionRequestSchema = z.object({
  vendorId: VendorIdSchema,
  correctionType: z.enum(['docs', 'config', 'behavior', 'other']),
  description: z.string().min(10).max(2000),
  evidence: z.array(z.object({
    type: z.enum(['screenshot', 'log', 'config', 'test']),
    url: UrlSchema.optional(),
    content: z.string().max(5000).optional(),
  })).max(10),
  proposedConfig: z.record(z.string(), z.string()).optional(),
  docUrls: z.array(UrlSchema).max(5),
  testUrls: z.array(UrlSchema).max(5),
  submitterInfo: z.object({
    name: z.string().min(2).max(100),
    email: EmailSchema,
    company: z.string().max(100).optional(),
    role: z.string().max(100).optional(),
  }),
});

export const SearchRequestSchema = z.object({
  query: z.string().min(1).max(100).optional(),
  category: z.string().max(50).optional(),
  grade: z.enum(['green', 'yellow', 'red']).optional(),
  limit: z.number().min(1).max(100).optional().default(20),
  offset: z.number().min(0).max(1000).optional().default(0),
  sortBy: z.enum(['score', 'name', 'category']).optional().default('score'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

// Validation middleware factory
export function createValidationMiddleware<T>(schema: z.ZodSchema<T>) {
  return async (request: any, reply: any) => {
    try {
      const validated = await schema.parseAsync(request.body || request.query || request.params);
      request.validated = validated;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400);
        reply.send({
          error: 'Validation Error',
          message: 'Invalid request parameters',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
        return reply;
      }
      throw error;
    }
  };
}

// Input sanitization middleware
export function createSanitizationMiddleware() {
  return async (request: any, reply: any) => {
    // Sanitize string inputs
    const sanitizeObject = (obj: any): any => {
      if (typeof obj === 'string') {
        return validateAndSanitizeInput(obj);
      }
      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      }
      if (obj && typeof obj === 'object') {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(obj)) {
          sanitized[key] = sanitizeObject(value);
        }
        return sanitized;
      }
      return obj;
    };

    // Sanitize request body, query, and params
    if (request.body) {
      request.body = sanitizeObject(request.body);
    }
    if (request.query) {
      request.query = sanitizeObject(request.query);
    }
    if (request.params) {
      request.params = sanitizeObject(request.params);
    }
  };
}

// Security headers middleware
export function createSecurityHeadersMiddleware() {
  return async (request: any, reply: any) => {
    // Generate nonce for CSP
    const nonce = Buffer.from(crypto.randomBytes(16)).toString('base64');
    
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Content-Security-Policy', 
      `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; ` +
      `img-src 'self' data: https:; font-src 'self' https:; connect-src 'self' https:; ` +
      `object-src 'none'; base-uri 'self'; frame-ancestors 'none';`
    );
    reply.header('X-Permitted-Cross-Domain-Policies', 'none');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    
    // Store nonce for potential use in templates
    request.nonce = nonce;
  };
}

// IP validation middleware
export function createIPValidationMiddleware() {
  const blockedIPs = new Set<string>([
    // Add known malicious IPs if needed
  ]);
  
  return async (request: any, reply: any) => {
    const ip = request.ip || request.headers['x-forwarded-for'] || request.headers['x-real-ip'];
    
    if (!ip) {
      reply.code(400);
      reply.send({ error: 'Bad Request', message: 'Unable to determine client IP' });
      return reply;
    }
    
    // Check blocked IPs
    if (blockedIPs.has(String(ip))) {
      reply.code(403);
      reply.send({ error: 'Forbidden', message: 'Access denied' });
      return reply;
    }
    
    // Validate IP format
    if (!validateId(String(ip).replace(/[.:]/g, '-'))) {
      reply.code(400);
      reply.send({ error: 'Bad Request', message: 'Invalid IP format' });
      return reply;
    }
  };
}

// Request size limiting middleware
export function createSizeLimitMiddleware(maxSize: number = 10 * 1024 * 1024) { // 10MB default
  return async (request: any, reply: any) => {
    const contentLength = request.headers['content-length'];
    
    if (contentLength && parseInt(contentLength) > maxSize) {
      reply.code(413);
      reply.send({ 
        error: 'Payload Too Large', 
        message: `Request size exceeds limit of ${maxSize} bytes` 
      });
      return reply;
    }
  };
}

// User agent validation middleware
export function createUserAgentValidationMiddleware() {
  const blockedPatterns = [
    /bot/i,
    /crawler/i,
    /scanner/i,
    /curl/i,
    /wget/i,
  ];
  
  return async (request: any, reply: any) => {
    const userAgent = request.headers['user-agent'] || '';
    
    // Allow empty user agents but block suspicious ones
    for (const pattern of blockedPatterns) {
      if (pattern.test(userAgent)) {
        reply.code(403);
        reply.send({ error: 'Forbidden', message: 'Automated requests not allowed' });
        return reply;
      }
    }
  };
}
