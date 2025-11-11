import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Request ID middleware
 * 
 * Adds a unique request ID to each request for tracing
 */
export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check if request ID already exists in headers
  const existingId = req.headers['x-request-id'] as string;
  
  // Generate or use existing request ID
  const requestId = existingId || randomUUID();
  
  // Attach to request object
  (req as Request & { id: string }).id = requestId;
  
  // Add to response headers
  res.setHeader('X-Request-ID', requestId);
  
  next();
};
