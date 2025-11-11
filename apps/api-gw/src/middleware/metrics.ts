import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Metrics storage
 */
interface Metrics {
  requests: number;
  errors: number;
  totalDuration: number;
  byEndpoint: Map<string, {
    count: number;
    totalDuration: number;
    errors: number;
  }>;
  byStatusCode: Map<number, number>;
}

const metrics: Metrics = {
  requests: 0,
  errors: 0,
  totalDuration: 0,
  byEndpoint: new Map(),
  byStatusCode: new Map()
};

/**
 * Metrics middleware
 * 
 * Collects request metrics
 */
export const metricsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();

  // Increment request counter
  metrics.requests++;

  // Capture response
  const originalSend = res.send;
  res.send = function(data: unknown): Response {
    const duration = Date.now() - startTime;
    const endpoint = `${req.method} ${req.route?.path || req.path}`;

    // Update metrics
    metrics.totalDuration += duration;

    // Track by endpoint
    const endpointMetrics = metrics.byEndpoint.get(endpoint) || {
      count: 0,
      totalDuration: 0,
      errors: 0
    };

    endpointMetrics.count++;
    endpointMetrics.totalDuration += duration;

    if (res.statusCode >= 400) {
      endpointMetrics.errors++;
      metrics.errors++;
    }

    metrics.byEndpoint.set(endpoint, endpointMetrics);

    // Track by status code
    const statusCount = metrics.byStatusCode.get(res.statusCode) || 0;
    metrics.byStatusCode.set(res.statusCode, statusCount + 1);

    // Log slow requests
    if (duration > 1000) {
      logger.warn('Slow request', {
        endpoint,
        duration,
        statusCode: res.statusCode
      });
    }

    return originalSend.call(this, data);
  };

  next();
};

/**
 * Get current metrics
 */
export function getMetrics(): {
  requests: number;
  errors: number;
  averageDuration: number;
  errorRate: number;
  endpoints: Array<{
    endpoint: string;
    count: number;
    averageDuration: number;
    errorRate: number;
  }>;
  statusCodes: Record<number, number>;
} {
  const endpoints = Array.from(metrics.byEndpoint.entries()).map(([endpoint, data]) => ({
    endpoint,
    count: data.count,
    averageDuration: data.totalDuration / data.count,
    errorRate: data.errors / data.count
  }));

  return {
    requests: metrics.requests,
    errors: metrics.errors,
    averageDuration: metrics.requests > 0 ? metrics.totalDuration / metrics.requests : 0,
    errorRate: metrics.requests > 0 ? metrics.errors / metrics.requests : 0,
    endpoints,
    statusCodes: Object.fromEntries(metrics.byStatusCode)
  };
}

/**
 * Reset metrics
 */
export function resetMetrics(): void {
  metrics.requests = 0;
  metrics.errors = 0;
  metrics.totalDuration = 0;
  metrics.byEndpoint.clear();
  metrics.byStatusCode.clear();
}
