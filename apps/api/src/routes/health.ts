import { Router, Request, Response } from 'express';
import { HealthChecker, HealthMonitoringIntegration, healthMetrics } from '@credlink/health';
import rateLimit from 'express-rate-limit';
import { createClient } from 'redis';
import { logger } from '../utils/logger';

const router = Router();

// Shared Redis client for health checking (will be initialized with shared connections)
let sharedRedisClient: any = null;
let sharedHealthChecker: HealthChecker | null = null;
let sharedHealthMonitoring: HealthMonitoringIntegration | null = null;

/**
 * Initialize health checker with shared connections from main API
 * This prevents connection pool exhaustion by reusing existing connections
 */
export function initializeHealthChecker(dbPool: any, redisClient?: any) {
  try {
    // Create Redis client if not provided
    if (!redisClient) {
      sharedRedisClient = createClient({
        url: process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`
      });
      
      sharedRedisClient.on('error', (err: any) => {
        logger.error('Shared Redis client error:', err);
      });
      
      sharedRedisClient.connect().catch((err: any) => {
        logger.error('Failed to connect shared Redis client:', err);
      });
    } else {
      sharedRedisClient = redisClient;
    }
    
    // Initialize health checker with shared connections
    sharedHealthChecker = new HealthChecker(dbPool, sharedRedisClient as any);
    sharedHealthMonitoring = new HealthMonitoringIntegration(sharedHealthChecker);
    
    // Start metrics collection in production
    if (process.env.NODE_ENV === 'production') {
      sharedHealthMonitoring.startMetricsCollection(parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '30000'));
    }
    
    logger.info('Health checker initialized with shared connections');
  } catch (error) {
    logger.error('Failed to initialize health checker:', error);
  }
}

/**
 * Get the shared health checker instance
 */
function getHealthChecker(): HealthChecker {
  if (!sharedHealthChecker) {
    throw new Error('Health checker not initialized. Call initializeHealthChecker first.');
  }
  return sharedHealthChecker;
}

/**
 * Get the shared health monitoring instance
 */
function getHealthMonitoring(): HealthMonitoringIntegration {
  if (!sharedHealthMonitoring) {
    throw new Error('Health monitoring not initialized. Call initializeHealthChecker first.');
  }
  return sharedHealthMonitoring;
}

// Rate limiting for health endpoints
const healthLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // High limit for health checks
  message: 'Too many health check requests'
});

/**
 * Basic health check - for load balancers
 * Returns 200 if service is running, checks minimal dependencies
 */
router.get('/health', healthLimiter, async (req: Request, res: Response) => {
  try {
    const healthChecker = getHealthChecker();
    // Quick check of critical dependencies only
    const dbHealth = await healthChecker.checkDatabaseHealth();
    const redisHealth = await healthChecker.checkRedisHealth();
    
    // In development, only require database to be healthy (Redis is optional)
    const isHealthy = process.env.NODE_ENV === 'development' 
      ? dbHealth.status === 'healthy'
      : dbHealth.status === 'healthy' && (redisHealth?.status === 'healthy');
    
    const statusCode = isHealthy ? 200 : 503;
    
    res.status(statusCode).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbHealth.status,
        redis: redisHealth?.status || 'not_available'
      }
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

/**
 * Readiness probe - for Kubernetes
 * Checks if service is ready to accept traffic
 */
router.get('/ready', healthLimiter, async (req: Request, res: Response) => {
  try {
    const healthChecker = getHealthChecker();
    const health = await healthChecker.getOverallHealth();
    const isReady = health.overallStatus !== 'unhealthy';
    const statusCode = isReady ? 200 : 503;
    
    res.status(statusCode).json({
      ready: isReady,
      status: health.overallStatus,
      timestamp: new Date().toISOString(),
      components: health.checks.reduce((acc, check) => {
        acc[check.component] = check.status;
        return acc;
      }, {} as Record<string, string>)
    });
  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      ready: false,
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Readiness check failed'
    });
  }
});

/**
 * Liveness probe - for Kubernetes
 * Checks if service is still alive (not hung)
 */
router.get('/live', healthLimiter, (req: Request, res: Response) => {
  // Basic liveness - if we can respond, we're alive
  res.status(200).json({
    alive: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/**
 * Detailed health check - for monitoring and debugging
 * Returns comprehensive health status of all components
 */
router.get('/health/detailed', healthLimiter, async (req: Request, res: Response) => {
  try {
    const healthChecker = getHealthChecker();
    const health = await healthChecker.getOverallHealth();
    const statusCode = health.overallStatus === 'healthy' ? 200 : 
                      health.overallStatus === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Detailed health check failed:', error);
    res.status(503).json({
      service: 'credlink-api',
      overallStatus: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Detailed health check failed',
      checks: []
    });
  }
});

/**
 * Health check metrics endpoint
 * Returns current monitoring metrics and alert thresholds
 */
router.get('/health/metrics', healthLimiter, async (req: Request, res: Response) => {
  try {
    const healthMonitoring = getHealthMonitoring();
    const thresholds = healthMonitoring.getAlertThresholds();
    const failureCounts = healthMonitoring.getFailureCounts();
    
    res.status(200).json({
      service: 'credlink-api',
      timestamp: new Date().toISOString(),
      alert_thresholds: thresholds,
      failure_counts: failureCounts,
      monitoring_active: process.env.NODE_ENV === 'production'
    });
  } catch (error) {
    logger.error('Health metrics check failed:', error);
    res.status(500).json({
      error: 'Failed to retrieve health metrics',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Prometheus metrics endpoint
 * Exposes metrics in Prometheus format for scraping
 */
router.get('/metrics', healthLimiter, async (req: Request, res: Response) => {
  try {
    const metrics = await healthMetrics.getMetrics();
    res.set('Content-Type', 'text/plain');
    res.send(metrics);
  } catch (error) {
    logger.error('Metrics endpoint failed:', error);
    res.status(500).send('# Metrics collection failed\n');
  }
});

export { router as healthRouter };
