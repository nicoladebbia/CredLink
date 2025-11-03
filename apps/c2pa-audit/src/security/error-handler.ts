/**
 * Secure Error Handler
 * Provides centralized error handling with security considerations
 */

import { FastifyReply, FastifyRequest } from 'fastify';

export enum ErrorType {
  VALIDATION = 'VALIDATION_ERROR',
  AUTHENTICATION = 'AUTHENTICATION_ERROR',
  AUTHORIZATION = 'AUTHORIZATION_ERROR',
  RATE_LIMIT = 'RATE_LIMIT_ERROR',
  NOT_FOUND = 'NOT_FOUND_ERROR',
  INTERNAL = 'INTERNAL_ERROR',
  SECURITY = 'SECURITY_ERROR'
}

export interface SecureError {
  type: ErrorType;
  message: string;
  code: string;
  statusCode: number;
  details?: any;
  shouldLog: boolean;
}

/**
 * Secure error handler that prevents information disclosure
 */
export class SecureErrorHandler {
  private static readonly ERROR_MESSAGES: Record<ErrorType, string> = {
    [ErrorType.VALIDATION]: 'Invalid request data',
    [ErrorType.AUTHENTICATION]: 'Authentication required',
    [ErrorType.AUTHORIZATION]: 'Access denied',
    [ErrorType.RATE_LIMIT]: 'Rate limit exceeded',
    [ErrorType.NOT_FOUND]: 'Resource not found',
    [ErrorType.INTERNAL]: 'Internal server error',
    [ErrorType.SECURITY]: 'Security violation detected'
  };

  private static readonly ERROR_CODES: Record<ErrorType, Record<string, string>> = {
    [ErrorType.VALIDATION]: {
      INVALID_INPUT: 'INVALID_INPUT',
      MISSING_FIELD: 'MISSING_FIELD',
      INVALID_FORMAT: 'INVALID_FORMAT'
    },
    [ErrorType.AUTHENTICATION]: {
      MISSING_AUTH: 'MISSING_AUTH',
      INVALID_AUTH: 'INVALID_AUTH',
      EXPIRED_AUTH: 'EXPIRED_AUTH'
    },
    [ErrorType.AUTHORIZATION]: {
      INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
      ACCESS_DENIED: 'ACCESS_DENIED'
    },
    [ErrorType.RATE_LIMIT]: {
      RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
      IP_BLOCKED: 'IP_BLOCKED'
    },
    [ErrorType.NOT_FOUND]: {
      RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
      STREAM_NOT_FOUND: 'STREAM_NOT_FOUND'
    },
    [ErrorType.INTERNAL]: {
      INTERNAL_ERROR: 'INTERNAL_ERROR',
      SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE'
    },
    [ErrorType.SECURITY]: {
      SECURITY_VIOLATION: 'SECURITY_VIOLATION',
      SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY'
    }
  };

  /**
   * Handle error securely without exposing sensitive information
   */
  static handleError(error: Error | SecureError, reply: FastifyReply): void {
    const secureError = this.normalizeError(error);
    
    // Log the full error for debugging (but don't expose to user)
    if (secureError.shouldLog) {
      this.logError(error, secureError);
    }

    // Send sanitized error response
    reply.status(secureError.statusCode).send({
      error: secureError.message,
      code: secureError.code,
      type: secureError.type,
      timestamp: new Date().toISOString(),
      // Include details only in development mode
      ...(process.env.NODE_ENV === 'development' && secureError.details && { 
        details: secureError.details 
      })
    });
  }

  /**
   * Normalize any error to a SecureError
   */
  private static normalizeError(error: Error | SecureError): SecureError {
    if (this.isSecureError(error)) {
      return error;
    }

    // Determine error type based on error properties
    let errorType: ErrorType = ErrorType.INTERNAL;
    let statusCode = 500;
    let shouldLog = true;

    if (error.message.includes('validation') || error.message.includes('invalid')) {
      errorType = ErrorType.VALIDATION;
      statusCode = 400;
      shouldLog = false; // Don't log validation errors
    } else if (error.message.includes('authentication') || error.message.includes('auth')) {
      errorType = ErrorType.AUTHENTICATION;
      statusCode = 401;
    } else if (error.message.includes('authorization') || error.message.includes('access')) {
      errorType = ErrorType.AUTHORIZATION;
      statusCode = 403;
    } else if (error.message.includes('rate limit')) {
      errorType = ErrorType.RATE_LIMIT;
      statusCode = 429;
    } else if (error.message.includes('not found')) {
      errorType = ErrorType.NOT_FOUND;
      statusCode = 404;
    } else if (error.message.includes('security')) {
      errorType = ErrorType.SECURITY;
      statusCode = 403;
    }

    return {
      type: errorType,
      message: this.ERROR_MESSAGES[errorType],
      code: this.getErrorCode(errorType, 'DEFAULT'),
      statusCode,
      shouldLog,
      details: this.sanitizeErrorDetails(error)
    };
  }

  /**
   * Check if error is already a SecureError
   */
  private static isSecureError(error: any): error is SecureError {
    return error && typeof error === 'object' && 'type' in error && 'code' in error;
  }

  /**
   * Get error code for type and specific error
   */
  private static getErrorCode(type: ErrorType, specificCode: string): string {
    const typeCodes = this.ERROR_CODES[type];
    return typeCodes[specificCode] || typeCodes['DEFAULT'] || 'UNKNOWN_ERROR';
  }

  /**
   * Sanitize error details to remove sensitive information
   */
  private static sanitizeErrorDetails(error: Error): any {
    // Remove stack traces, internal paths, and sensitive data
    const sanitized: any = {};

    if (error.name) {
      sanitized.name = error.name;
    }

    // Only include non-sensitive message parts
    if (error.message) {
      sanitized.message = error.message
        .replace(/\/.*\//g, '[PATH]') // Remove file paths
        .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]') // Remove IP addresses
        .replace(/[a-f0-9]{32,}/gi, '[HASH]'); // Remove hashes
    }

    return sanitized;
  }

  /**
   * Log error securely
   */
  private static logError(error: Error | SecureError, context?: string): void {
    const logData: any = {
      timestamp: new Date().toISOString(),
      type: error instanceof SecureError ? error.type : ErrorType.INTERNAL,
      message: error.message,
      code: error instanceof SecureError ? error.code : undefined,
      context
    };

    // Add stack trace for internal errors (not for production)
    if (error instanceof Error && 'stack' in error) {
      logData.stack = (error as Error).stack;
    }

    // Add name if available
    if (error instanceof Error && 'name' in error) {
      logData.name = (error as Error).name;
    }

    console.error('[SECURE_ERROR]', JSON.stringify(logData));
  }

  /**
   * Create specific secure errors
   */
  static createValidationError(message: string, code: string = 'INVALID_INPUT'): SecureError {
    return {
      type: ErrorType.VALIDATION,
      message,
      code: this.getErrorCode(ErrorType.VALIDATION, code),
      statusCode: 400,
      shouldLog: false
    };
  }

  static createAuthenticationError(message: string, code: string = 'INVALID_AUTH'): SecureError {
    return {
      type: ErrorType.AUTHENTICATION,
      message,
      code: this.getErrorCode(ErrorType.AUTHENTICATION, code),
      statusCode: 401,
      shouldLog: true
    };
  }

  static createAuthorizationError(message: string, code: string = 'ACCESS_DENIED'): SecureError {
    return {
      type: ErrorType.AUTHORIZATION,
      message,
      code: this.getErrorCode(ErrorType.AUTHORIZATION, code),
      statusCode: 403,
      shouldLog: true
    };
  }

  static createRateLimitError(message: string, code: string = 'RATE_LIMIT_EXCEEDED'): SecureError {
    return {
      type: ErrorType.RATE_LIMIT,
      message,
      code: this.getErrorCode(ErrorType.RATE_LIMIT, code),
      statusCode: 429,
      shouldLog: true
    };
  }

  static createNotFoundError(message: string, code: string = 'RESOURCE_NOT_FOUND'): SecureError {
    return {
      type: ErrorType.NOT_FOUND,
      message,
      code: this.getErrorCode(ErrorType.NOT_FOUND, code),
      statusCode: 404,
      shouldLog: false
    };
  }

  static createInternalError(message: string, code: string = 'INTERNAL_ERROR'): SecureError {
    return {
      type: ErrorType.INTERNAL,
      message,
      code: this.getErrorCode(ErrorType.INTERNAL, code),
      statusCode: 500,
      shouldLog: true
    };
  }

  static createSecurityError(message: string, code: string = 'SECURITY_VIOLATION'): SecureError {
    return {
      type: ErrorType.SECURITY,
      message,
      code: this.getErrorCode(ErrorType.SECURITY, code),
      statusCode: 403,
      shouldLog: true
    };
  }

  /**
   * Setup global error handler for Fastify
   */
  static setupGlobalErrorHandler(fastify: any): void {
    fastify.setErrorHandler((error: Error, _request: FastifyRequest, reply: FastifyReply) => {
      const secureError = this.normalizeError(error);
      this.logError(secureError);
      
      const response = this.createErrorResponse(secureError);
      reply.status(response.statusCode).send(response);
    });
  }
}
