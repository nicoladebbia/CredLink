import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let details: any = {};

  // Handle known application errors
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;
  } else if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    details = { validation: error.message };
  } else if (error.name === 'MulterError') {
    statusCode = 400;
    message = 'File Upload Error';
    details = { upload: error.message };
  } else if (error.name === 'ZodError') {
    statusCode = 400;
    message = 'Invalid Request Data';
    details = { fields: (error as any).errors };
  }

  // Log error details
  logger.error('Request error', {
    error: error.message,
    stack: error.stack,
    statusCode,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    requestId: req.headers['x-request-id']
  });

  // Send error response
  res.status(statusCode).json({
    error: message,
    statusCode,
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
    requestId: req.headers['x-request-id'],
    ...(Object.keys(details).length > 0 && { details })
  });
};

export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
