import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { createHash } from 'crypto';

/**
 * 🔥 REALISTIC SECURITY: Comprehensive audit logging middleware
 * Logs all security events without exposing sensitive data
 */
export function auditSecurityEvent(req: Request, res: Response, next: NextFunction) {
  // 🔥 DEBUG: Log middleware execution
  console.log('🔥 DEBUG: AUDIT MIDDLEWARE CALLED');
  logger.info('🔥 DEBUG: Audit middleware called', { path: req.path, method: req.method });
  
  // Store original end function
  const originalEnd = res.end;
  
  // Override end function to capture response
  res.end = function(chunk?: any, encoding?: any): Response {
    // 🔥 DEBUG: Log response capture
    console.log('🔥 DEBUG: AUDIT RESPONSE END CALLED', { statusCode: res.statusCode });
    logger.info('🔥 DEBUG: Audit response end called', { path: req.path, statusCode: res.statusCode });
    
    // Log security event based on response status and route
    logSecurityEvent(req, res);
    
    // Call original end function and return Response
    return originalEnd.call(res, chunk, encoding);
  };
  
  next();
}

/**
 * 🔥 CRITICAL: Log security events with sanitized data
 */
function logSecurityEvent(req: Request, res: Response): void {
  try {
    const securityEvent = categorizeSecurityEvent(req, res);
    
    if (securityEvent) {
      logger.warn('Security event detected', {
        eventType: securityEvent.type,
        severity: securityEvent.severity,
        timestamp: new Date().toISOString(),
        ip: sanitizeIP(req.ip),
        userAgent: sanitizeUserAgent(req.get('User-Agent')),
        method: req.method,
        path: sanitizePath(req.path),
        statusCode: res.statusCode,
        userId: getUserId(req),
        sessionId: getSessionId(req),
        duration: getResponseTime(req),
        // 🔥 SECURITY: Never log sensitive data
        requestBody: securityEvent.includeBody ? sanitizeRequestBody(req.body) : undefined,
        query: securityEvent.includeQuery ? sanitizeQuery(req.query) : undefined,
        headers: securityEvent.includeHeaders ? sanitizeHeaders(req.headers) : undefined
      });
    }
  } catch (error) {
    // Fail silently to avoid breaking application
    logger.error('Audit logging error', { error: (error as Error).message });
  }
}

/**
 * 🔥 SECURITY: Categorize security events based on request characteristics
 */
function categorizeSecurityEvent(req: Request, res: Response): {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  includeBody?: boolean;
  includeQuery?: boolean;
  includeHeaders?: boolean;
} | null {
  const path = req.path.toLowerCase();
  const method = req.method;
  const status = res.statusCode;
  
  // Authentication events
  if (path.includes('/auth') || path.includes('/sso')) {
    if (status >= 400) {
      return { type: 'AUTH_FAILURE', severity: 'high', includeBody: false, includeQuery: true };
    }
    return { type: 'AUTH_SUCCESS', severity: 'medium', includeBody: false };
  }
  
  // File upload events
  if (path.includes('/sign') || path.includes('/verify')) {
    if (status >= 400) {
      return { type: 'FILE_UPLOAD_FAILURE', severity: 'medium', includeBody: false };
    }
    return { type: 'FILE_UPLOAD_SUCCESS', severity: 'low', includeBody: false };
  }
  
  // Rate limit events
  if (status === 429) {
    return { type: 'RATE_LIMIT_EXCEEDED', severity: 'high', includeHeaders: true };
  }
  
  // Admin/audit events
  if (path.includes('/audit') || path.includes('/admin')) {
    return { type: 'ADMIN_ACCESS', severity: 'high', includeBody: false, includeQuery: false };
  }
  
  // Error events
  if (status >= 500) {
    return { type: 'SERVER_ERROR', severity: 'critical', includeBody: false, includeQuery: false };
  }
  
  // Suspicious patterns
  if (hasSuspiciousPatterns(req)) {
    return { type: 'SUSPICIOUS_REQUEST', severity: 'high', includeBody: true, includeQuery: true, includeHeaders: true };
  }
  
  return null;
}

/**
 * 🔥 SECURITY: Sanitize sensitive data from logs
 */
function sanitizeIP(ip?: string): string {
  if (!ip) return 'unknown';
  // Hash IP for privacy while maintaining uniqueness
  return createHash('sha256').update(ip).digest('hex').substring(0, 8);
}

function sanitizeUserAgent(userAgent?: string): string {
  if (!userAgent) return 'unknown';
  // Remove potentially sensitive information
  return userAgent.replace(/[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/g, 'X.X.X.X')
                 .substring(0, 100); // Truncate long user agents
}

function sanitizePath(path: string): string {
  // Remove potential sensitive parameters from path
  return path.replace(/\/[a-f0-9-]{36}/g, '/{uuid}'); // Replace UUIDs
}

function sanitizeRequestBody(body: any): any {
  if (!body || typeof body !== 'object') return {};
  
  const sanitized: any = {};
  for (const key in body) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      const value = body[key];
      // 🔥 CRITICAL: Never log sensitive fields
      if (typeof value === 'string' && 
          (key.toLowerCase().includes('password') ||
           key.toLowerCase().includes('token') ||
           key.toLowerCase().includes('secret') ||
           key.toLowerCase().includes('key'))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 100) {
        sanitized[key] = value.substring(0, 100) + '...';
      } else {
        sanitized[key] = value;
      }
    }
  }
  return sanitized;
}

function sanitizeQuery(query: any): any {
  if (!query || typeof query !== 'object') return {};
  
  const sanitized: any = {};
  for (const key in query) {
    if (Object.prototype.hasOwnProperty.call(query, key)) {
      const value = query[key];
      if (typeof value === 'string' && value.length > 50) {
        sanitized[key] = value.substring(0, 50) + '...';
      } else {
        sanitized[key] = value;
      }
    }
  }
  return sanitized;
}

function sanitizeHeaders(headers: any): any {
  if (!headers || typeof headers !== 'object') return {};
  
  const sanitized: any = {};
  for (const key in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, key)) {
      // 🔥 CRITICAL: Never log sensitive headers
      if (key.toLowerCase().includes('authorization') ||
          key.toLowerCase().includes('cookie') ||
          key.toLowerCase().includes('x-api-key')) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = headers[key];
      }
    }
  }
  return sanitized;
}

function getUserId(req: Request): string {
  return (req as any).user?.id || 'anonymous';
}

function getSessionId(req: Request): string {
  // Return session identifier without exposing actual session ID
  return req.session?.id ? createHash('sha256').update(req.session.id).digest('hex').substring(0, 8) : 'none';
}

function getResponseTime(req: Request): number {
  return (req as any).startTime ? Date.now() - (req as any).startTime : 0;
}

function hasSuspiciousPatterns(req: Request): boolean {
  const suspiciousPatterns = [
    /\.\./,  // Path traversal
    /<script/i,  // XSS attempt
    /union.*select/i,  // SQL injection
    /exec.*\(/i,  // Code execution
    /\${.*}/,  // Template injection
  ];
  
  const combinedInput = JSON.stringify({
    body: req.body,
    query: req.query,
    params: req.params
  });
  
  return suspiciousPatterns.some(pattern => pattern.test(combinedInput));
}
