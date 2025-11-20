/**
 * 🔥 CRITICAL SECURITY FIX: Application Error Class
 * 
 * Provides structured error handling for the application
 * Prevents information disclosure in error messages
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    message: string,
    code: string = 'APPLICATION_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    
    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Create a 400 Bad Request error
   */
  static badRequest(message: string, code: string = 'BAD_REQUEST'): AppError {
    return new AppError(400, message, code);
  }

  /**
   * Create a 401 Unauthorized error
   */
  static unauthorized(message: string, code: string = 'UNAUTHORIZED'): AppError {
    return new AppError(401, message, code);
  }

  /**
   * Create a 403 Forbidden error
   */
  static forbidden(message: string, code: string = 'FORBIDDEN'): AppError {
    return new AppError(403, message, code);
  }

  /**
   * Create a 404 Not Found error
   */
  static notFound(message: string, code: string = 'NOT_FOUND'): AppError {
    return new AppError(404, message, code);
  }

  /**
   * Create a 409 Conflict error
   */
  static conflict(message: string, code: string = 'CONFLICT'): AppError {
    return new AppError(409, message, code);
  }

  /**
   * Create a 422 Unprocessable Entity error
   */
  static unprocessableEntity(message: string, code: string = 'UNPROCESSABLE_ENTITY'): AppError {
    return new AppError(422, message, code);
  }

  /**
   * Create a 429 Too Many Requests error
   */
  static tooManyRequests(message: string, code: string = 'TOO_MANY_REQUESTS'): AppError {
    return new AppError(429, message, code);
  }

  /**
   * Create a 500 Internal Server Error
   */
  static internal(message: string, code: string = 'INTERNAL_ERROR'): AppError {
    return new AppError(500, message, code, false);
  }

  /**
   * Create a 502 Bad Gateway error
   */
  static badGateway(message: string, code: string = 'BAD_GATEWAY'): AppError {
    return new AppError(502, message, code, false);
  }

  /**
   * Create a 503 Service Unavailable error
   */
  static serviceUnavailable(message: string, code: string = 'SERVICE_UNAVAILABLE'): AppError {
    return new AppError(503, message, code, false);
  }

  /**
   * Convert error to safe JSON response
   */
  toJSON(): {
    error: string;
    code: string;
    statusCode: number;
    message?: string; // Only include in development
  } {
    const response: {
      error: string;
      code: string;
      statusCode: number;
      message?: string;
    } = {
      error: this.constructor.name,
      code: this.code,
      statusCode: this.statusCode
    };

    // 🔥 SECURITY: Only include detailed message in development
    if (process.env.NODE_ENV === 'development') {
      response.message = this.message;
    }

    return response;
  }
}
