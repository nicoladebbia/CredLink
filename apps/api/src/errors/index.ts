import { Request } from 'express';

/**
 * Base Error Class for all application errors
 */
export abstract class CredLinkError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: string;
  public readonly context?: Record<string, any>;
  public readonly retryable: boolean;
  public readonly severity: 'low' | 'medium' | 'high' | 'critical';

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    retryable: boolean = false,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.retryable = retryable;
    this.severity = severity;
    this.context = context;

    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Get error details for logging
   */
  getLogDetails(req?: Request): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      isOperational: this.isOperational,
      retryable: this.retryable,
      severity: this.severity,
      context: this.context,
      stack: this.stack,
      request: req ? {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        apiVersion: (req as any).apiVersion
      } : undefined
    };
  }

  /**
   * Get client-safe error response
   */
  getClientResponse(): Record<string, any> {
    const response: Record<string, any> = {
      error: this.code,
      message: this.message
    };

    // Add retry information for retryable errors
    if (this.retryable) {
      response.retryable = true;
      response.retryAfter = '30s'; // Default retry suggestion
    }

    // Add context for operational errors (if safe)
    if (this.isOperational && this.context && Object.keys(this.context).length > 0) {
      const safeContext: Record<string, any> = {};
      
      // Only include safe context fields
      const safeFields = ['field', 'value', 'limit', 'expected', 'received'];
      for (const field of safeFields) {
        if (this.context[field] !== undefined) {
          safeContext[field] = this.context[field];
        }
      }

      if (Object.keys(safeContext).length > 0) {
        response.details = safeContext;
      }
    }

    return response;
  }
}

/**
 * Validation Errors (400)
 */
export class ValidationError extends CredLinkError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 400, 'VALIDATION_ERROR', true, false, 'low', context);
  }
}

export class FileValidationError extends ValidationError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, context);
    // Properly set code by calling parent constructor with specific code
    Object.defineProperty(this, 'code', { value: 'FILE_VALIDATION_ERROR' });
  }
}

export class MimetypeError extends ValidationError {
  constructor(mimetype: string, allowed: string[]) {
    super(`Unsupported file type: ${mimetype}`, {
      mimetype,
      allowed
    });
    Object.defineProperty(this, 'code', { value: 'UNSUPPORTED_MIMETYPE' });
  }
}

export class FileSizeError extends ValidationError {
  constructor(size: number, maxSize: number) {
    super(`File too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB`, {
      size,
      maxSize
    });
    Object.defineProperty(this, 'code', { value: 'FILE_TOO_LARGE' });
  }
}

/**
 * Authentication/Authorization Errors (401/403)
 */
export class AuthenticationError extends CredLinkError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR', true, false, 'medium');
  }
}

export class AuthorizationError extends CredLinkError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR', true, false, 'medium');
  }
}

export class ApiKeyError extends AuthenticationError {
  constructor(message: string = 'Invalid API key') {
    super(message);
    Object.defineProperty(this, 'code', { value: 'INVALID_API_KEY' });
  }
}

/**
 * Not Found Errors (404)
 */
export class NotFoundError extends CredLinkError {
  constructor(resource: string, identifier?: string) {
    const message = identifier 
      ? `${resource} not found: ${identifier}`
      : `${resource} not found`;
    
    super(message, 404, 'NOT_FOUND', true, false, 'low', {
      resource,
      identifier
    });
    Object.defineProperty(this, 'code', { value: 'RESOURCE_NOT_FOUND' });
  }
}

export class ProofNotFoundError extends NotFoundError {
  constructor(proofId: string) {
    super('Proof', proofId);
    Object.defineProperty(this, 'code', { value: 'PROOF_NOT_FOUND' });
  }
}

/**
 * Rate Limiting Errors (429)
 */
export class RateLimitError extends CredLinkError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', true, true, 'medium');
    Object.defineProperty(this, 'code', { value: 'RATE_LIMIT_EXCEEDED' });
  }
}

/**
 * Storage Errors (500/503)
 */
export class StorageError extends CredLinkError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 500, 'STORAGE_ERROR', true, true, 'high', context);
  }
}

export class S3Error extends StorageError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, context);
    Object.defineProperty(this, 'code', { value: 'S3_ERROR' });
  }
}

export class EncryptionError extends CredLinkError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 500, 'ENCRYPTION_ERROR', true, false, 'high', context);
  }
}

/**
 * Service Errors (500/503)
 */
export class ServiceError extends CredLinkError {
  constructor(service: string, message: string, context?: Record<string, any>) {
    super(`${service} error: ${message}`, 503, 'SERVICE_ERROR', true, true, 'high', {
      service,
      ...context
    });
  }
}

export class C2PAError extends ServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super('C2PA', message, context);
    Object.defineProperty(this, 'code', { value: 'C2PA_ERROR' });
  }
}

export class CertificateError extends ServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super('Certificate', message, context);
    Object.defineProperty(this, 'code', { value: 'CERTIFICATE_ERROR' });
  }
}

/**
 * Configuration Errors (500)
 */
export class ConfigurationError extends CredLinkError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 500, 'CONFIGURATION_ERROR', true, false, 'critical', context);
  }
}

/**
 * Programmer Errors (500) - Not operational, should not happen
 */
export class ProgrammerError extends CredLinkError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 500, 'PROGRAMMER_ERROR', false, false, 'critical', context);
  }
}

/**
 * External Service Errors (502/504)
 */
export class ExternalServiceError extends CredLinkError {
  constructor(service: string, message: string, context?: Record<string, any>) {
    super(`External service ${service} error: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR', true, true, 'high', {
      service,
      ...context
    });
  }
}

/**
 * Utility function to create appropriate errors
 */
export function createError(
  type: keyof typeof ErrorTypes,
  message: string,
  context?: Record<string, any>
): CredLinkError {
  const ErrorClass = ErrorTypes[type];
  return new (ErrorClass as any)(message, context);
}

/**
 * Error type mapping
 */
export const ErrorTypes = {
  ValidationError,
  FileValidationError,
  MimetypeError,
  FileSizeError,
  AuthenticationError,
  AuthorizationError,
  ApiKeyError,
  NotFoundError,
  ProofNotFoundError,
  RateLimitError,
  StorageError,
  S3Error,
  EncryptionError,
  ServiceError,
  C2PAError,
  CertificateError,
  ConfigurationError,
  ProgrammerError,
  ExternalServiceError
} as const;
