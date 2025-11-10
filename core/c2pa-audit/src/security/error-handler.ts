/**
 * Secure Error Handler
 * Centralized error handling with security-focused sanitization
 */

export enum ErrorType {
  VALIDATION = 'validation',
  SECURITY = 'security',
  NETWORK = 'network',
  SYSTEM = 'system',
  CRYPTOGRAPHIC = 'cryptographic',
  BUSINESS = 'business'
}

export interface SecureError extends Error {
  type: ErrorType;
  code: string;
  details?: Record<string, unknown> | undefined;
  timestamp: string;
  sanitized: boolean;
}

export interface ErrorContext {
  requestId?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  endpoint?: string;
  method?: string;
}

/**
 * Security-focused error handler with sanitization
 */
export class SecureErrorHandler {
  private static readonly MAX_ERROR_MESSAGE_LENGTH = 500;
  private static readonly SENSITIVE_PATTERNS = [
    /password/i,
    /secret/i,
    /token/i,
    /key/i,
    /credential/i,
    /auth/i,
    /private/i,
    /confidential/i
  ];

  /**
   * Create a secure error instance
   */
  createSecureError(
    message: string,
    type: ErrorType,
    code: string,
    details?: Record<string, unknown>
  ): SecureError {
    const sanitizedMessage = this.sanitizeErrorMessage(message);
    const sanitizedDetails = details ? this.sanitizeErrorDetails(details) : undefined;

    const error: SecureError = new Error(sanitizedMessage) as SecureError;
    error.type = type;
    error.code = code;
    error.details = sanitizedDetails;
    error.timestamp = new Date().toISOString();
    error.sanitized = true;
    
    return error;
  }

  /**
   * Handle and process errors securely
   */
  handleError(error: unknown, context?: ErrorContext): SecureError {
    const secureError = this.normalizeError(error);
    
    // Log the error (in production, this would go to a secure logging system)
    this.logError(secureError, context);
    
    // Return sanitized error for client response
    return secureError;
  }

  /**
   * Setup global error handlers
   */
  setupGlobalErrorHandler(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      const secureError = this.createSecureError(
        'Uncaught exception occurred',
        ErrorType.SYSTEM,
        'UNCAUGHT_EXCEPTION',
        { originalMessage: error.message }
      );
      this.logError(secureError);
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: unknown) => {
      const secureError = this.createSecureError(
        'Unhandled promise rejection',
        ErrorType.SYSTEM,
        'UNHANDLED_REJECTION',
        { reason: String(reason) }
      );
      this.logError(secureError);
    });
  }

  /**
   * Normalize various error types to SecureError
   */
  private normalizeError(error: unknown): SecureError {
    if (this.isSecureError(error)) {
      return error;
    }

    if (error instanceof Error) {
      return this.createSecureError(
        error.message,
        this.getErrorType(error),
        this.getErrorCode(error),
        { stack: error.stack }
      );
    }

    if (typeof error === 'string') {
      return this.createSecureError(
        error,
        ErrorType.BUSINESS,
        'STRING_ERROR'
      );
    }

    if (error && typeof error === 'object') {
      return this.createSecureError(
        'Object error occurred',
        ErrorType.SYSTEM,
        'OBJECT_ERROR',
        { originalError: error }
      );
    }

    return this.createSecureError(
      'Unknown error occurred',
      ErrorType.SYSTEM,
      'UNKNOWN_ERROR'
    );
  }

  /**
   * Check if error is already a SecureError
   */
  private isSecureError(error: unknown): error is SecureError {
    return (
      error instanceof Error &&
      'type' in error &&
      'code' in error &&
      'timestamp' in error &&
      'sanitized' in error
    );
  }

  /**
   * Determine error type from error characteristics
   */
  private getErrorType(error: Error): ErrorType {
    const message = error.message.toLowerCase();
    const name = error.constructor.name.toLowerCase();

    if (message.includes('validation') || name.includes('validation')) {
      return ErrorType.VALIDATION;
    }

    if (message.includes('security') || name.includes('security') || 
        message.includes('unauthorized') || message.includes('forbidden')) {
      return ErrorType.SECURITY;
    }

    if (message.includes('network') || name.includes('network') ||
        message.includes('timeout') || message.includes('connection')) {
      return ErrorType.NETWORK;
    }

    if (message.includes('crypto') || name.includes('crypto') ||
        message.includes('encryption') || message.includes('decryption')) {
      return ErrorType.CRYPTOGRAPHIC;
    }

    if (message.includes('system') || name.includes('system') ||
        message.includes('memory') || message.includes('disk')) {
      return ErrorType.SYSTEM;
    }

    return ErrorType.BUSINESS;
  }

  /**
   * Generate error code from error
   */
  private getErrorCode(error: Error): string {
    const name = error.constructor.name.toUpperCase();
    return name.replace(/ERROR$/, '') + '_ERROR';
  }

  /**
   * Sanitize error message to prevent information disclosure
   */
  private sanitizeErrorMessage(message: string): string {
    if (!message) return 'Error occurred';

    // Check for sensitive information
    const lowerMessage = message.toLowerCase();
    for (const pattern of SecureErrorHandler.SENSITIVE_PATTERNS) {
      if (pattern.test(lowerMessage)) {
        return 'Sensitive operation failed';
      }
    }

    // Truncate long messages
    if (message.length > SecureErrorHandler.MAX_ERROR_MESSAGE_LENGTH) {
      return message.substring(0, SecureErrorHandler.MAX_ERROR_MESSAGE_LENGTH) + '...';
    }

    return message;
  }

  /**
   * Sanitize error details to remove sensitive information
   */
  private sanitizeErrorDetails(details: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(details)) {
      // Skip sensitive keys
      const lowerKey = key.toLowerCase();
      if (SecureErrorHandler.SENSITIVE_PATTERNS.some(pattern => pattern.test(lowerKey))) {
        continue;
      }

      // Sanitize string values
      if (typeof value === 'string') {
        if (SecureErrorHandler.SENSITIVE_PATTERNS.some(pattern => pattern.test(value.toLowerCase()))) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = value;
        }
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Log error securely
   */
  private logError(error: SecureError, context?: ErrorContext): void {
    // NEVER log sensitive details in production
    const logEntry = {
      timestamp: error.timestamp,
      type: error.type,
      code: error.code,
      message: error.message,
      // Only include non-sensitive error details
      hasDetails: !!error.details,
      detailCount: error.details ? Object.keys(error.details).length : 0,
      // Only include sanitized context
      context: context ? this.sanitizeContext(context) : undefined
    };

    // In production, use structured logging with appropriate log levels
    // CRITICAL: Never log full error details as they may contain sensitive data
    if (error.type === ErrorType.SECURITY || error.type === ErrorType.CRYPTOGRAPHIC) {
      // Security errors should go to security monitoring system
      console.error('[SECURITY_ALERT]', JSON.stringify({
        timestamp: error.timestamp,
        type: error.type,
        code: error.code,
        context: context ? { endpoint: context.endpoint, method: context.method } : undefined
      }));
    } else {
      console.error('[ERROR]', JSON.stringify(logEntry));
    }
  }

  /**
   * Sanitize context information
   */
  private sanitizeContext(context: ErrorContext): ErrorContext {
    const sanitized: ErrorContext = {};

    for (const [key, value] of Object.entries(context)) {
      if (value && typeof value === 'string') {
        // Truncate long values
        if (value.length > 100) {
          sanitized[key as keyof ErrorContext] = value.substring(0, 100) + '...';
        } else {
          sanitized[key as keyof ErrorContext] = value;
        }
      } else {
        sanitized[key as keyof ErrorContext] = value;
      }
    }

    return sanitized;
  }

  /**
   * Create validation error
   */
  createValidationError(message: string, field?: string): SecureError {
    return this.createSecureError(
      message,
      ErrorType.VALIDATION,
      'VALIDATION_ERROR',
      field ? { field } : undefined
    );
  }

  /**
   * Create security error
   */
  createSecurityError(message: string, details?: Record<string, unknown>): SecureError {
    return this.createSecureError(
      message,
      ErrorType.SECURITY,
      'SECURITY_ERROR',
      details
    );
  }

  /**
   * Create network error
   */
  createNetworkError(message: string, statusCode?: number): SecureError {
    return this.createSecureError(
      message,
      ErrorType.NETWORK,
      'NETWORK_ERROR',
      statusCode ? { statusCode } : undefined
    );
  }

  /**
   * Create cryptographic error
   */
  createCryptographicError(message: string, operation?: string): SecureError {
    return this.createSecureError(
      message,
      ErrorType.CRYPTOGRAPHIC,
      'CRYPTOGRAPHIC_ERROR',
      operation ? { operation } : undefined
    );
  }
}
