import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { sentryService } from '../utils/sentry';
import { sanitizeError, createSafeErrorResponse } from '../utils/error-sanitizer';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const isProduction = process.env.NODE_ENV === 'production';

  // 🔥 CRITICAL FIX: Handle MulterError for file size limits
  if (err.name === 'MulterError') {
    const multerErr = err as any;
    if (multerErr.code === 'LIMIT_FILE_SIZE') {
      logger.error('File size limit exceeded', {
        error: multerErr.message,
        code: multerErr.code,
        path: req.path,
        method: req.method,
      });
      return res.status(413).json({
        error: `File too large. Maximum size: ${process.env.MAX_FILE_SIZE_MB || 50}MB`,
        statusCode: 413,
      });
    } else {
      logger.error('Multer upload error', {
        error: multerErr.message,
        code: multerErr.code,
        path: req.path,
        method: req.method,
      });
      return res.status(400).json({
        error: 'File upload failed: Invalid file format or corrupted data',
        statusCode: 400,
      });
    }
  }

  // 🔥 CRITICAL FIX: Handle malformed multipart headers (null bytes, etc.)
  if (err.message === 'Malformed part header' || err.message.includes('null byte')) {
    logger.error('Malformed filename detected', {
      error: err.message,
      path: req.path,
      method: req.method,
    });
    return res.status(400).json({
      error: 'Invalid filename format',
      statusCode: 400,
    });
  }

  if (err instanceof AppError) {
    // Operational errors (expected)
    logger.error('Application error', {
      statusCode: err.statusCode,
      message: err.message,
      path: req.path,
      method: req.method,
    });

    return res.status(err.statusCode).json({
      error: err.message,
      statusCode: err.statusCode,
    });
  }

  // Unexpected errors
  // ✅ SECURITY: Sanitize error before logging or sending to client
  const sanitized = sanitizeError(err);
  
  logger.error('Unexpected error', {
    error: sanitized.message,
    name: sanitized.name,
    code: sanitized.code,
    path: req.path,
    method: req.method,
    stack: sanitized.stack, // Only included in development, already sanitized
  });

  // Send to Sentry if enabled (Sentry will handle its own sanitization)
  sentryService.captureException(err, {
    path: req.path,
    method: req.method,
    query: req.query,
    body: req.body,
  });

  // ✅ SECURITY: Create safe error response with sanitization
  const errorResponse = createSafeErrorResponse(err, 'Internal server error');
  return res.status(errorResponse.statusCode).json(errorResponse);
};
