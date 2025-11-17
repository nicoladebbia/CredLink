import request from 'supertest';
import express from 'express';
import { Router } from 'express';

// Mock the health package before importing
jest.mock('@credlink/health', () => ({
  HealthChecker: jest.fn().mockImplementation(() => ({
    checkDatabaseHealth: jest.fn().mockResolvedValue({
      component: 'postgresql',
      status: 'healthy',
      responseTime: 50,
      lastChecked: new Date()
    }),
    checkRedisHealth: jest.fn().mockResolvedValue({
      component: 'redis',
      status: 'healthy',
      responseTime: 10,
      lastChecked: new Date()
    }),
    getOverallHealth: jest.fn().mockResolvedValue({
      service: 'credlink-api',
      overallStatus: 'healthy',
      checks: [
        {
          component: 'postgresql',
          status: 'healthy',
          responseTime: 50,
          lastChecked: new Date()
        },
        {
          component: 'redis',
          status: 'healthy',
          responseTime: 10,
          lastChecked: new Date()
        },
        {
          component: 'manifest_store',
          status: 'healthy',
          responseTime: 100,
          lastChecked: new Date()
        },
        {
          component: 'c2pa_sdk',
          status: 'healthy',
          responseTime: 25,
          lastChecked: new Date()
        },
        {
          component: 'certificate_manager',
          status: 'healthy',
          responseTime: 15,
          lastChecked: new Date()
        }
      ],
      uptime: 3600,
      version: '1.0.0',
      timestamp: new Date()
    })
  })),
  HealthMonitoringIntegration: jest.fn().mockImplementation(() => ({
    getAlertThresholds: jest.fn().mockReturnValue({
      responseTime: 5000,
      consecutiveFailures: 3,
      degradedThreshold: 2
    }),
    getFailureCounts: jest.fn().mockReturnValue({}),
    startMetricsCollection: jest.fn(),
    stopMetricsCollection: jest.fn()
  }))
}));

// Mock other dependencies
jest.mock('../middleware/rate-limiting', () => ({
  createRateLimit: jest.fn().mockImplementation(() => (req: any, res: any, next: any) => next())
}));

jest.mock('../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
  }
}));

describe('Health Endpoints Integration', () => {
  let app: express.Application;
  let healthRouter: Router;

  beforeAll(() => {
    // Set environment for testing
    process.env.NODE_ENV = 'test';
    
    // Import after mocking
    const healthModule = require('../routes/health');
    healthRouter = healthModule.healthRouter;
    
    app = express();
    app.use('/api', healthRouter);
  });

  afterAll(() => {
    delete process.env.NODE_ENV;
  });

  describe('GET /health', () => {
    it('should return 200 when service is healthy', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);
      
      expect(response.body).toMatchObject({
        status: 'healthy',
        checks: {
          database: 'healthy',
          redis: 'healthy'
        }
      });
      expect(response.body.timestamp).toBeDefined();
    });

    it('should return 503 when database is unhealthy', async () => {
      // Mock database failure
      const { HealthChecker } = require('@credlink/health');
      HealthChecker.mockImplementationOnce(() => ({
        checkDatabaseHealth: jest.fn().mockResolvedValue({
          component: 'postgresql',
          status: 'unhealthy',
          errorMessage: 'Connection failed',
          lastChecked: new Date()
        }),
        checkRedisHealth: jest.fn().mockResolvedValue({
          component: 'redis',
          status: 'healthy',
          lastChecked: new Date()
        })
      }));
      
      // Re-create the router with new mock
      const healthModule = require('../routes/health');
      const newHealthRouter = healthModule.healthRouter;
      
      const newApp = express();
      newApp.use('/api', newHealthRouter);
      
      const response = await request(newApp)
        .get('/api/health')
        .expect(503);
      
      expect(response.body.status).toBe('unhealthy');
    });

    it('should handle health check errors gracefully', async () => {
      // Mock health check failure
      const { HealthChecker } = require('@credlink/health');
      HealthChecker.mockImplementationOnce(() => ({
        checkDatabaseHealth: jest.fn().mockRejectedValue(new Error('Service unavailable')),
        checkRedisHealth: jest.fn().mockResolvedValue({
          component: 'redis',
          status: 'healthy',
          lastChecked: new Date()
        })
      }));
      
      const healthModule = require('../routes/health');
      const newHealthRouter = healthModule.healthRouter;
      
      const newApp = express();
      newApp.use('/api', newHealthRouter);
      
      const response = await request(newApp)
        .get('/api/health')
        .expect(503);
      
      expect(response.body.status).toBe('unhealthy');
      expect(response.body.error).toBe('Health check failed');
    });
  });

  describe('GET /ready', () => {
    it('should return 200 when service is ready', async () => {
      const response = await request(app)
        .get('/api/ready')
        .expect(200);
      
      expect(response.body.ready).toBe(true);
      expect(response.body.status).toMatch(/healthy|degraded/);
      expect(response.body.components).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
    });

    it('should return 503 when service is not ready', async () => {
      // Mock unhealthy service
      const { HealthChecker } = require('@credlink/health');
      HealthChecker.mockImplementationOnce(() => ({
        getOverallHealth: jest.fn().mockResolvedValue({
          service: 'credlink-api',
          overallStatus: 'unhealthy',
          checks: [
            {
              component: 'postgresql',
              status: 'unhealthy',
              lastChecked: new Date()
            }
          ],
          uptime: 3600,
          version: '1.0.0',
          timestamp: new Date()
        })
      }));
      
      const healthModule = require('../routes/health');
      const newHealthRouter = healthModule.healthRouter;
      
      const newApp = express();
      newApp.use('/api', newHealthRouter);
      
      const response = await request(newApp)
        .get('/api/ready')
        .expect(503);
      
      expect(response.body.ready).toBe(false);
      expect(response.body.status).toBe('unhealthy');
    });

    it('should handle readiness check errors', async () => {
      const { HealthChecker } = require('@credlink/health');
      HealthChecker.mockImplementationOnce(() => ({
        getOverallHealth: jest.fn().mockRejectedValue(new Error('Readiness check failed'))
      }));
      
      const healthModule = require('../routes/health');
      const newHealthRouter = healthModule.healthRouter;
      
      const newApp = express();
      newApp.use('/api', newHealthRouter);
      
      const response = await request(newApp)
        .get('/api/ready')
        .expect(503);
      
      expect(response.body.ready).toBe(false);
      expect(response.body.error).toBe('Readiness check failed');
    });
  });

  describe('GET /live', () => {
    it('should always return 200 for liveness', async () => {
      const response = await request(app)
        .get('/api/live')
        .expect(200);
      
      expect(response.body.alive).toBe(true);
      expect(response.body.uptime).toBeGreaterThan(0);
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('GET /health/detailed', () => {
    it('should return comprehensive health information', async () => {
      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);
      
      expect(response.body).toMatchObject({
        service: 'credlink-api',
        overallStatus: expect.stringMatching(/healthy|degraded|unhealthy/),
        checks: expect.arrayContaining([
          expect.objectContaining({ component: 'postgresql' }),
          expect.objectContaining({ component: 'redis' }),
          expect.objectContaining({ component: 'manifest_store' }),
          expect.objectContaining({ component: 'c2pa_sdk' }),
          expect.objectContaining({ component: 'certificate_manager' })
        ]),
        uptime: expect.any(Number),
        version: expect.any(String)
      });
    });

    it('should return 503 for unhealthy detailed health', async () => {
      const { HealthChecker } = require('@credlink/health');
      HealthChecker.mockImplementationOnce(() => ({
        getOverallHealth: jest.fn().mockResolvedValue({
          service: 'credlink-api',
          overallStatus: 'unhealthy',
          checks: [
            {
              component: 'postgresql',
              status: 'unhealthy',
              errorMessage: 'Database down',
              lastChecked: new Date()
            }
          ],
          uptime: 3600,
          version: '1.0.0',
          timestamp: new Date()
        })
      }));
      
      const healthModule = require('../routes/health');
      const newHealthRouter = healthModule.healthRouter;
      
      const newApp = express();
      newApp.use('/api', newHealthRouter);
      
      const response = await request(newApp)
        .get('/api/health/detailed')
        .expect(503);
      
      expect(response.body.overallStatus).toBe('unhealthy');
    });

    it('should handle detailed health check errors', async () => {
      const { HealthChecker } = require('@credlink/health');
      HealthChecker.mockImplementationOnce(() => ({
        getOverallHealth: jest.fn().mockRejectedValue(new Error('Detailed health check failed'))
      }));
      
      const healthModule = require('../routes/health');
      const newHealthRouter = healthModule.healthRouter;
      
      const newApp = express();
      newApp.use('/api', newHealthRouter);
      
      const response = await request(newApp)
        .get('/api/health/detailed')
        .expect(503);
      
      expect(response.body.error).toBe('Detailed health check failed');
      expect(response.body.checks).toEqual([]);
    });
  });

  describe('GET /health/metrics', () => {
    it('should return health metrics information', async () => {
      const response = await request(app)
        .get('/api/health/metrics')
        .expect(200);
      
      expect(response.body).toMatchObject({
        service: 'credlink-api',
        alert_thresholds: {
          responseTime: 5000,
          consecutiveFailures: 3,
          degradedThreshold: 2
        },
        failure_counts: {},
        monitoring_active: false // Since NODE_ENV is 'test'
      });
      expect(response.body.timestamp).toBeDefined();
    });

    it('should show monitoring as active in production', async () => {
      process.env.NODE_ENV = 'production';
      
      const response = await request(app)
        .get('/api/health/metrics')
        .expect(200);
      
      expect(response.body.monitoring_active).toBe(true);
      
      process.env.NODE_ENV = 'test';
    });

    it('should handle metrics endpoint errors', async () => {
      const { HealthMonitoringIntegration } = require('@credlink/health');
      HealthMonitoringIntegration.mockImplementationOnce(() => ({
        getAlertThresholds: jest.fn().mockRejectedValue(new Error('Metrics error')),
        getFailureCounts: jest.fn().mockReturnValue({}),
        startMetricsCollection: jest.fn(),
        stopMetricsCollection: jest.fn()
      }));
      
      const healthModule = require('../routes/health');
      const newHealthRouter = healthModule.healthRouter;
      
      const newApp = express();
      newApp.use('/api', newHealthRouter);
      
      const response = await request(newApp)
        .get('/api/health/metrics')
        .expect(500);
      
      expect(response.body.error).toBe('Failed to retrieve health metrics');
    });
  });
});
