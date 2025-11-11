import { Router, Request, Response } from 'express';
import { getMetrics } from '../middleware/metrics';

const router = Router();

/**
 * Health check endpoint
 */
router.get('/', (req: Request, res: Response) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor(uptime),
      formatted: formatUptime(uptime)
    },
    memory: {
      heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`
    },
    environment: process.env.NODE_ENV || 'development'
  });
});

/**
 * Detailed health check with metrics
 */
router.get('/detailed', (req: Request, res: Response) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  const metrics = getMetrics();

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor(uptime),
      formatted: formatUptime(uptime)
    },
    memory: {
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      external: memoryUsage.external,
      rss: memoryUsage.rss
    },
    metrics: {
      requests: metrics.requests,
      errors: metrics.errors,
      errorRate: `${(metrics.errorRate * 100).toFixed(2)}%`,
      averageDuration: `${metrics.averageDuration.toFixed(2)}ms`
    },
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  });
});

/**
 * Readiness probe
 */
router.get('/ready', (req: Request, res: Response) => {
  // Check if service is ready to accept traffic
  const memoryUsage = process.memoryUsage();
  const heapUtilization = memoryUsage.heapUsed / memoryUsage.heapTotal;

  if (heapUtilization > 0.95) {
    res.status(503).json({
      status: 'not ready',
      reason: 'High memory utilization',
      timestamp: new Date().toISOString()
    });
    return;
  }

  res.json({
    status: 'ready',
    timestamp: new Date().toISOString()
  });
});

/**
 * Liveness probe
 */
router.get('/live', (req: Request, res: Response) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

/**
 * Format uptime
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

export const healthRoutes = router;
