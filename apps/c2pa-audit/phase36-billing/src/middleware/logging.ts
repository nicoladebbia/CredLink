/**
 * Phase 36 Billing - Logging Middleware
 * Request/response logging and audit trails
 */

import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Logging middleware for request tracking and audit trails
 */
export async function loggingMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const startTime = Date.now();
  const requestId = generateRequestId();
  
  // Add request ID to response headers
  reply.header('X-Request-ID', requestId);
  
  // Store request info for later use
  (request as any).requestId = requestId;
  (request as any).startTime = startTime;

  // Log incoming request
  logRequest(request, requestId);

  // Hook into response to log when it completes
  (reply as any).addHook('onSend', async (request: any, reply: any, payload: any) => {
    logResponse(request, reply, startTime, requestId);
    return payload;
  });
}

/**
 * Log request details
 */
function logRequest(request: FastifyRequest, requestId: string): void {
  const tenant = (request as any).tenant;
  const logData = {
    requestId,
    timestamp: new Date().toISOString(),
    method: request.method,
    url: request.url,
    userAgent: request.headers['user-agent'],
    clientIP: request.ip || request.headers['x-forwarded-for'] || 'unknown',
    tenantId: tenant?.tenantId || 'anonymous',
    contentType: request.headers['content-type'],
    contentLength: request.headers['content-length'],
  };

  // Log based on environment
  if (process.env['NODE_ENV'] === 'development') {
    console.log(`🔵 INCOMING: ${request.method} ${request.url}`, logData);
  } else {
    console.log(JSON.stringify({
      level: 'info',
      type: 'request',
      ...logData,
    }));
  }

  // Store in audit log for sensitive operations
  const sensitiveRoutes = [
    '/tenants',
    '/billing/checkout',
    '/billing/subscription',
    '/webhooks',
  ];

  if (sensitiveRoutes.some(route => request.url.startsWith(route))) {
    storeAuditLog({
      ...logData,
      type: 'sensitive_request',
      body: sanitizeRequestBody(request.body),
    });
  }
}

/**
 * Log response details
 */
function logResponse(request: FastifyRequest, reply: FastifyReply, startTime: number, requestId: string): void {
  const duration = Date.now() - startTime;
  const tenant = (request as any).tenant;
  
  const logData = {
    requestId,
    timestamp: new Date().toISOString(),
    method: request.method,
    url: request.url,
    statusCode: reply.statusCode,
    duration: `${duration}ms`,
    tenantId: tenant?.tenantId || 'anonymous',
    contentLength: reply.getHeader('content-length'),
  };

  // Log based on status code
  const logLevel = getLogLevel(reply.statusCode);
  
  if (process.env['NODE_ENV'] === 'development') {
    const emoji = getStatusEmoji(reply.statusCode);
    console.log(`${emoji} OUTGOING: ${reply.statusCode} ${request.method} ${request.url} (${duration}ms)`, logData);
  } else {
    console.log(JSON.stringify({
      level: logLevel,
      type: 'response',
      ...logData,
    }));
  }

  // Store error responses in audit log
  if (reply.statusCode >= 400) {
    storeAuditLog({
      ...logData,
      type: 'error_response',
      error: reply.statusCode >= 500 ? 'server_error' : 'client_error',
    });
  }

  // Performance monitoring for slow requests
  if (duration > 5000) { // 5 seconds
    console.warn(`🐌 SLOW REQUEST: ${request.method} ${request.url} took ${duration}ms`, {
      requestId,
      method: request.method,
      url: request.url,
      duration,
      tenantId: tenant?.tenantId,
    });
  }
}

/**
 * Store audit log entry (in production, this would go to a database or logging service)
 */
function storeAuditLog(logData: any): void {
  try {
    // In a real implementation, you'd store this in a database or external logging service
    // For now, we'll just log it with a special marker
    console.log(JSON.stringify({
      level: 'audit',
      type: 'audit_log',
      ...logData,
    }));
  } catch (error) {
    console.error('Failed to store audit log:', error);
  }
}

/**
 * Sanitize request body for logging (remove sensitive data)
 */
function sanitizeRequestBody(body: any): any {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sensitiveFields = [
    'password',
    'api_key',
    'secret',
    'token',
    'credit_card',
    'payment_method_id',
    'stripe_customer_id',
  ];

  const sanitized = { ...body };

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get log level based on status code
 */
function getLogLevel(statusCode: number): string {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  if (statusCode >= 300) return 'info';
  return 'info';
}

/**
 * Get emoji for status code
 */
function getStatusEmoji(statusCode: number): string {
  if (statusCode >= 500) return '🔴';
  if (statusCode >= 400) return '🟡';
  if (statusCode >= 300) return '🔵';
  return '🟢';
}

/**
 * Performance monitoring middleware
 */
export async function performanceMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const startTime = process.hrtime.bigint();
  
  (reply as any).addHook('onSend', async (request: any, reply: any, payload: any) => {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    
    // Log performance metrics
    if (duration > 1000) { // Log requests taking more than 1 second
      console.log(JSON.stringify({
        level: 'perf',
        type: 'slow_request',
        method: request.method,
        url: request.url,
        duration: Math.round(duration),
        tenantId: (request as any).tenant?.tenantId,
        timestamp: new Date().toISOString(),
      }));
    }
    
    return payload;
  });
}
