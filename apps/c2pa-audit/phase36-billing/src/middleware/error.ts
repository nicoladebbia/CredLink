/**
 * Phase 36 Billing - Error Handling Middleware
 * Centralized error handling and error response formatting
 */

import { FastifyError, FastifyReply } from 'fastify';

/**
 * Global error handler middleware
 */
export async function errorMiddleware(error: FastifyError, request: any, reply: FastifyReply): Promise<void> {
  // Generate error ID for tracking
  const errorId = generateErrorId();
  const requestId = request.requestId || 'unknown';
  
  // Log the error
  logError(error, request, errorId, requestId);

  // Determine error response based on error type
  const errorResponse = formatErrorResponse(error, errorId);

  // Set appropriate headers
  reply.header('X-Error-ID', errorId);
  
  // Send error response
  reply.status(errorResponse.statusCode).send(errorResponse.body);
}

/**
 * Format error response based on error type
 */
function formatErrorResponse(error: FastifyError, errorId: string): {
  statusCode: number;
  body: any;
} {
  // Handle validation errors
  if (error.name === 'ValidationError' || error.code === 'VALIDATION_ERROR') {
    const isDevelopment = process.env['NODE_ENV'] === 'development';
    
    return {
      statusCode: 400,
      body: {
        code: error.code || 'VALIDATION_ERROR',
        message: error.message || 'Request validation failed',
        error_id: errorId,
        ...(isDevelopment && {
          details: (error as any).details || undefined,
        }),
      },
    };
  }

  // Handle authentication errors
  if (error.code === 'UNAUTHORIZED' || error.code === 'INVALID_API_KEY') {
    return {
      statusCode: 401,
      body: {
        code: error.code || 'UNAUTHORIZED',
        message: error.message || 'Authentication failed',
        error_id: errorId,
      },
    };
  }

  // Handle authorization errors
  if (error.code === 'FORBIDDEN' || error.code === 'ACCOUNT_INACTIVE') {
    return {
      statusCode: 403,
      body: {
        code: error.code || 'FORBIDDEN',
        message: error.message || 'Access forbidden',
        error_id: errorId,
      },
    };
  }

  // Handle not found errors
  if (error.code === 'NOT_FOUND' || error.code === 'TENANT_NOT_FOUND') {
    return {
      statusCode: 404,
      body: {
        code: error.code || 'NOT_FOUND',
        message: error.message || 'Resource not found',
        error_id: errorId,
      },
    };
  }

  // Handle rate limiting errors
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    return {
      statusCode: 429,
      body: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        error_id: errorId,
        retry_after: (error as any).retryAfter || undefined,
      },
    };
  }

  // Handle Stripe errors
  if (error.message && error.message.includes('Stripe')) {
    const isDevelopment = process.env['NODE_ENV'] === 'development';
    
    return {
      statusCode: 400,
      body: {
        code: 'STRIPE_ERROR',
        message: 'Payment processing error',
        error_id: errorId,
        ...(isDevelopment && {
          details: {
            stripe_error: error.message,
          },
        }),
      },
    };
  }

  // Handle trial limit exceeded
  if ((error as any).code === 'TRIAL_LIMIT_EXCEEDED') {
    return {
      statusCode: 429,
      body: {
        code: 'TRIAL_LIMIT_EXCEEDED',
        message: 'Trial limit exceeded. Please upgrade your plan.',
        error_id: errorId,
      },
    };
  }

  // Handle Redis connection errors
  if (error.name === 'RedisError' || error.message?.includes('Redis')) {
    return {
      statusCode: 503,
      body: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service temporarily unavailable',
        error_id: errorId,
      },
    };
  }

  // Handle network errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
    return {
      statusCode: 503,
      body: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'External service unavailable',
        error_id: errorId,
      },
    };
  }

  // Handle JSON parsing errors
  if (error.name === 'SyntaxError' && error.message?.includes('JSON')) {
    return {
      statusCode: 400,
      body: {
        code: 'INVALID_JSON',
        message: 'Invalid JSON in request body',
        error_id: errorId,
      },
    };
  }

  // Handle file upload errors
  if (error.code === 'FST_FILES_LIMIT' || error.code === 'FST_PART_FILE_LIMIT') {
    return {
      statusCode: 413,
      body: {
        code: 'FILE_TOO_LARGE',
        message: 'File size exceeds limit',
        error_id: errorId,
      },
    };
  }

  // Default internal server error
  const isDevelopment = process.env['NODE_ENV'] === 'development';
  
  return {
    statusCode: 500,
    body: {
      code: 'INTERNAL_ERROR',
      message: 'An internal error occurred',
      error_id: errorId,
      ...(isDevelopment && {
        details: {
          error: error.message,
          stack: error.stack,
        },
      }),
    },
  };
}

/**
 * Log error details
 */
function logError(error: FastifyError, request: any, errorId: string, requestId: string): void {
  const logData = {
    errorId,
    requestId,
    timestamp: new Date().toISOString(),
    method: request.method,
    url: request.url,
    tenantId: request.tenant?.tenantId || 'anonymous',
    clientIP: request.ip || request.headers['x-forwarded-for'] || 'unknown',
    userAgent: request.headers['user-agent'],
    error: {
      name: error.name,
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      stack: error.stack,
    },
  };

  // Log based on error severity
  if (error.statusCode && error.statusCode >= 500) {
    console.error('🔴 SERVER ERROR:', JSON.stringify(logData, null, 2));
  } else if (error.statusCode && error.statusCode >= 400) {
    console.warn('🟡 CLIENT ERROR:', JSON.stringify(logData, null, 2));
  } else {
    console.error('🔴 UNEXPECTED ERROR:', JSON.stringify(logData, null, 2));
  }

  // Store critical errors in audit log
  if (error.statusCode && error.statusCode >= 500) {
    storeErrorAuditLog(logData);
  }
}

/**
 * Store error in audit log
 */
function storeErrorAuditLog(logData: any): void {
  try {
    console.log(JSON.stringify({
      level: 'audit',
      type: 'error_audit',
      ...logData,
    }, null, 2));
  } catch (error) {
    console.error('Failed to store error audit log:', error);
  }
}

/**
 * Generate unique error ID
 */
function generateErrorId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Custom error classes for better error handling
 */
export class ValidationError extends Error {
  public code = 'VALIDATION_ERROR';
  public statusCode = 400;
  public details: any;

  constructor(message: string, details?: any) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class AuthenticationError extends Error {
  public code = 'UNAUTHORIZED';
  public statusCode = 401;

  constructor(message: string = 'Authentication failed') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  public code = 'FORBIDDEN';
  public statusCode = 403;

  constructor(message: string = 'Access forbidden') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends Error {
  public code = 'NOT_FOUND';
  public statusCode = 404;

  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends Error {
  public code = 'RATE_LIMIT_EXCEEDED';
  public statusCode = 429;
  public retryAfter?: number;

  constructor(message: string = 'Rate limit exceeded', retryAfter?: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class ServiceUnavailableError extends Error {
  public code = 'SERVICE_UNAVAILABLE';
  public statusCode = 503;

  constructor(message: string = 'Service temporarily unavailable') {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}

export class TrialLimitError extends Error {
  public code = 'TRIAL_LIMIT_EXCEEDED';
  public statusCode = 429;

  constructor(message: string = 'Trial limit exceeded') {
    super(message);
    this.name = 'TrialLimitError';
  }
}
