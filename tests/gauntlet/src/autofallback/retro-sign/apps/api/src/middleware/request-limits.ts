/**
 * Request Size Limits Middleware
 * Prevents DoS attacks via oversized requests
 */

import { FastifyRequest, FastifyReply } from 'fastify';

export interface RequestLimitsConfig {
  maxBodySize: number;      // Max request body size in bytes
  maxHeaderSize: number;    // Max header size in bytes
  maxParamLength: number;   // Max URL parameter length
  maxQueryLength: number;   // Max query string length
  timeoutMs: number;        // Request timeout in milliseconds
}

const DEFAULT_LIMITS: RequestLimitsConfig = {
  maxBodySize: 10 * 1024 * 1024,      // 10MB
  maxHeaderSize: 16 * 1024,           // 16KB
  maxParamLength: 1000,               // 1000 chars
  maxQueryLength: 2048,               // 2048 chars
  timeoutMs: 30000                    // 30 seconds
};

/**
 * Request size limiting middleware
 */
export function addRequestLimits(config: Partial<RequestLimitsConfig> = {}) {
  const limits = { ...DEFAULT_LIMITS, ...config };
  
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // 🚨 CRITICAL: Check request body size
    const contentLength = parseInt(request.headers['content-length'] || '0');
    if (contentLength > limits.maxBodySize) {
      return reply.status(413).send({
        error: 'Request entity too large',
        message: `Request body size ${contentLength} exceeds maximum allowed size ${limits.maxBodySize}`,
        maxSize: limits.maxBodySize
      });
    }
    
    // 🚨 CRITICAL: Check header size
    const headerSize = JSON.stringify(request.headers).length;
    if (headerSize > limits.maxHeaderSize) {
      return reply.status(431).send({
        error: 'Request header fields too large',
        message: `Header size ${headerSize} exceeds maximum allowed size ${limits.maxHeaderSize}`
      });
    }
    
    // 🚨 CRITICAL: Check URL parameter lengths
    for (const [key, value] of Object.entries(request.params || {})) {
      if (typeof value === 'string' && value.length > limits.maxParamLength) {
        return reply.status(414).send({
          error: 'Request-URI too long',
          message: `Parameter '${key}' length ${value.length} exceeds maximum allowed length ${limits.maxParamLength}`
        });
      }
    }
    
    // 🚨 CRITICAL: Check query string length
    const queryString = request.url.split('?')[1] || '';
    if (queryString.length > limits.maxQueryLength) {
      return reply.status(414).send({
        error: 'Request-URI too long',
        message: `Query string length ${queryString.length} exceeds maximum allowed length ${limits.maxQueryLength}`
      });
    }
    
    // 🚨 CRITICAL: Check for suspicious patterns in URL
    const suspiciousPatterns = [
      /\.\.\//,                    // Path traversal
      /<script/i,                  // XSS attempt
      /javascript:/i,              // XSS attempt
      /data:.*base64/i,            // Data URI injection
      /union.*select/i,            // SQL injection
      /\${.*}/,                    // Template injection
      /document\.cookie/i,         // Cookie theft attempt
      /window\.location/i          // Redirect attempt
    ];
    
    const url = request.url;
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(url)) {
        console.warn('🚨 Suspicious URL pattern detected:', {
          url,
          pattern: pattern.source,
          ip: request.ip,
          userAgent: request.headers['user-agent']
        });
        
        return reply.status(400).send({
          error: 'Invalid request format',
          message: 'Request contains suspicious content'
        });
      }
    }
    
    // 🚨 CRITICAL: Check request timeout
    const startTime = Date.now();
    
    // Add timeout check to response
    const originalSend = reply.send.bind(reply);
    reply.send = function(payload: any) {
      const elapsed = Date.now() - startTime;
      if (elapsed > limits.timeoutMs) {
        console.warn('🚨 Request timeout exceeded:', {
          url: request.url,
          elapsed,
          timeout: limits.timeoutMs,
          ip: request.ip
        });
        
        return reply.status(408).send({
          error: 'Request timeout',
          message: `Request processing time ${elapsed}ms exceeds timeout ${limits.timeoutMs}ms`
        });
      }
      
      return originalSend(payload);
    };
  };
}

/**
 * Strict request limits for sensitive endpoints
 */
export const strictRequestLimits = addRequestLimits({
  maxBodySize: 1024 * 1024,        // 1MB for sensitive endpoints
  maxHeaderSize: 8 * 1024,         // 8KB
  maxParamLength: 500,             // 500 chars
  maxQueryLength: 1000,            // 1KB
  timeoutMs: 15000                 // 15 seconds
});

/**
 * Lenient request limits for file upload endpoints
 */
export const lenientRequestLimits = addRequestLimits({
  maxBodySize: 100 * 1024 * 1024,  // 100MB for uploads
  maxHeaderSize: 32 * 1024,         // 32KB
  maxParamLength: 2000,            // 2KB
  maxQueryLength: 4096,            // 4KB
  timeoutMs: 60000                 // 1 minute
});

/**
 * Default request limits for general endpoints
 */
export const defaultRequestLimits = addRequestLimits(DEFAULT_LIMITS);
