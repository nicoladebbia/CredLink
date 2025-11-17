import { Router, Request, Response } from 'express';
import { metricsCollector } from '../middleware/metrics';
import { logger } from '../utils/logger';

const router: Router = Router();

/**
 * GET /health
 * Basic health check
 */
router.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'CredLink Signing Service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

/**
 * GET /health/ready
 * Readiness probe - checks if service is ready to handle requests
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    // Check critical dependencies
    const metrics = metricsCollector.getHealthMetrics();
    
    const isReady = metrics.status !== 'critical';
    
    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'not ready',
      checks: {
        metrics: metrics.status,
        error_rate: metrics.details.errorRate,
        avg_processing_time: metrics.details.avgProcessingTime
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Readiness check failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(503).json({
      status: 'not ready',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /health/live
 * Liveness probe - checks if service is alive
 */
router.get('/live', (req: Request, res: Response) => {
  res.json({
    status: 'alive',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /health/metrics
 * Detailed health metrics
 */
router.get('/metrics', (req: Request, res: Response) => {
  const metrics = metricsCollector.getMetrics();
  
  res.json({
    service: 'CredLink Signing Service',
    health: metricsCollector.getHealthMetrics(),
    metrics,
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      platform: process.platform,
      node_version: process.version
    },
    timestamp: new Date().toISOString()
  });
});

export { router as healthRouter };
