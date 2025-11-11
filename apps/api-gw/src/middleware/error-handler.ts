import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Error with status code
 */
export class HTTPError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'HTTPError';
  }
}

/**
 * Error handler middleware
 * 
 * Catches and formats errors
 */
export const errorHandler = (
  err: Error | HTTPError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Log error
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Determine status code
  const statusCode = err instanceof HTTPError ? err.statusCode : 500;
  const details = err instanceof HTTPError ? err.details : undefined;

  // Send error response
  res.status(statusCode).json({
    error: err.name || 'Error',
    message: err.message || 'An error occurred',
    details,
    timestamp: new Date().toISOString(),
    path: req.path
  });
};

/**
 * Async handler wrapper
 * 
 * Wraps async route handlers to catch errors
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
