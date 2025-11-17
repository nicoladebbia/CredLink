import { HealthChecker } from '../health-checker.js';
import { Pool } from 'pg';
import { createClient } from 'redis';

// Mock dependencies
jest.mock('pg');
jest.mock('redis');
jest.mock('@credlink/config', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
  }
}));

describe('HealthChecker', () => {
  let healthChecker: HealthChecker;
  let mockPool: jest.Mocked<Pool>;
  let mockRedisClient: any;

  beforeEach(() => {
    // Create mock pool
    mockPool = {
      query: jest.fn(),
      totalCount: 5,
      idleCount: 3,
      waitingCount: 0
    } as any;

    // Create mock Redis client
    mockRedisClient = {
      ping: jest.fn(),
      info: jest.fn(),
      connect: jest.fn(),
      on: jest.fn()
    };

    healthChecker = new HealthChecker(mockPool, mockRedisClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkDatabaseHealth', () => {
    it('should return healthy when database responds', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ health_check: 1 }] });
      
      const result = await healthChecker.checkDatabaseHealth();
      
      expect(result.status).toBe('healthy');
      expect(result.component).toBe('postgresql');
      expect(result.responseTime).toBeGreaterThan(0);
      expect(result.details).toEqual({
        connectionCount: 5,
        idleCount: 3,
        waitingCount: 0
      });
    });

    it('should return unhealthy when database fails', async () => {
      const error = new Error('Connection failed');
      mockPool.query.mockRejectedValue(error);
      
      const result = await healthChecker.checkDatabaseHealth();
      
      expect(result.status).toBe('unhealthy');
      expect(result.component).toBe('postgresql');
      expect(result.errorMessage).toBe('Connection failed');
      expect(result.responseTime).toBeGreaterThan(0);
    });

    it('should handle unknown database errors', async () => {
      mockPool.query.mockRejectedValue('Unknown error');
      
      const result = await healthChecker.checkDatabaseHealth();
      
      expect(result.status).toBe('unhealthy');
      expect(result.errorMessage).toBe('Unknown database error');
    });
  });

  describe('checkRedisHealth', () => {
    it('should return healthy when Redis responds with PONG', async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');
      mockRedisClient.info.mockResolvedValue('used_memory:1000000\r\nused_memory_human:1M\r\n');
      
      const result = await healthChecker.checkRedisHealth();
      
      expect(result.status).toBe('healthy');
      expect(result.component).toBe('redis');
      expect(result.details?.ping).toBe('PONG');
      expect(result.details?.memory).toEqual({
        used: '1000000',
        used_human: '1M'
      });
    });

    it('should return unhealthy when Redis fails to ping', async () => {
      const error = new Error('Redis connection failed');
      mockRedisClient.ping.mockRejectedValue(error);
      
      const result = await healthChecker.checkRedisHealth();
      
      expect(result.status).toBe('unhealthy');
      expect(result.errorMessage).toBe('Redis connection failed');
    });

    it('should return unhealthy when Redis returns invalid response', async () => {
      mockRedisClient.ping.mockResolvedValue('INVALID');
      
      const result = await healthChecker.checkRedisHealth();
      
      expect(result.status).toBe('unhealthy');
      expect(result.details?.ping).toBe('INVALID');
    });
  });

  describe('checkManifestStoreHealth', () => {
    beforeEach(() => {
      // Mock fetch globally
      global.fetch = jest.fn();
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it('should return healthy when manifest store responds', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ status: 'healthy', version: '1.0.0' })
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      
      const result = await healthChecker.checkManifestStoreHealth();
      
      expect(result.status).toBe('healthy');
      expect(result.component).toBe('manifest_store');
      expect(result.details).toEqual({ status: 'healthy', version: '1.0.0' });
    });

    it('should return degraded when manifest store reports degraded', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ status: 'degraded', reason: 'High load' })
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      
      const result = await healthChecker.checkManifestStoreHealth();
      
      expect(result.status).toBe('degraded');
      expect(result.component).toBe('manifest_store');
    });

    it('should return unhealthy when manifest store is unavailable', async () => {
      const error = new Error('Service unavailable');
      (global.fetch as jest.Mock).mockRejectedValue(error);
      
      const result = await healthChecker.checkManifestStoreHealth();
      
      expect(result.status).toBe('unhealthy');
      expect(result.errorMessage).toBe('Service unavailable');
    });

    it('should handle HTTP error responses', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      
      const result = await healthChecker.checkManifestStoreHealth();
      
      expect(result.status).toBe('unhealthy');
      expect(result.errorMessage).toBe('HTTP 500: Internal Server Error');
    });
  });

  describe('checkC2PAServiceHealth', () => {
    it('should return healthy when C2PA validation works', async () => {
      const result = await healthChecker.checkC2PAServiceHealth();
      
      expect(result.status).toBe('healthy');
      expect(result.component).toBe('c2pa_sdk');
      expect(result.details?.test_validation_passed).toBe(true);
      expect(result.details?.sdk_version).toBe('1.0.0');
    });

    it('should handle C2PA service errors gracefully', async () => {
      // Mock the private method to throw an error
      const healthCheckerAny = healthChecker as any;
      healthCheckerAny.validateC2PAManifest = jest.fn().mockRejectedValue(new Error('SDK error'));
      
      const result = await healthCheckerAny.checkC2PAServiceHealth();
      
      expect(result.status).toBe('unhealthy');
      expect(result.errorMessage).toBe('SDK error');
    });
  });

  describe('checkCertificateManagerHealth', () => {
    it('should return healthy when certificate is valid', async () => {
      const result = await healthChecker.checkCertificateManagerHealth();
      
      expect(result.status).toBe('healthy');
      expect(result.component).toBe('certificate_manager');
      expect(result.details?.days_until_expiration).toBeGreaterThan(7);
    });

    it('should return degraded when certificate expires soon', async () => {
      const healthCheckerAny = healthChecker as any;
      const expiresSoon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days
      healthCheckerAny.getCurrentCertificate = jest.fn().mockResolvedValue({
        id: 'cert-123',
        expires_at: expiresSoon
      });
      
      const result = await healthCheckerAny.checkCertificateManagerHealth();
      
      expect(result.status).toBe('degraded');
      expect(result.details?.days_until_expiration).toBeLessThan(7);
    });

    it('should return unhealthy when certificate is expired', async () => {
      const healthCheckerAny = healthChecker as any;
      const expired = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 1 day ago
      healthCheckerAny.getCurrentCertificate = jest.fn().mockResolvedValue({
        id: 'cert-123',
        expires_at: expired
      });
      
      const result = await healthCheckerAny.checkCertificateManagerHealth();
      
      expect(result.status).toBe('unhealthy');
      expect(result.details?.days_until_expiration).toBeLessThan(1);
    });

    it('should handle certificate manager errors', async () => {
      const healthCheckerAny = healthChecker as any;
      healthCheckerAny.getCurrentCertificate = jest.fn().mockRejectedValue(new Error('Certificate error'));
      
      const result = await healthCheckerAny.checkCertificateManagerHealth();
      
      expect(result.status).toBe('unhealthy');
      expect(result.errorMessage).toBe('Certificate error');
    });
  });

  describe('getOverallHealth', () => {
    it('should return healthy when all components are healthy', async () => {
      jest.spyOn(healthChecker, 'checkDatabaseHealth').mockResolvedValue({
        component: 'postgresql',
        status: 'healthy',
        lastChecked: new Date()
      } as any);
      
      jest.spyOn(healthChecker, 'checkRedisHealth').mockResolvedValue({
        component: 'redis',
        status: 'healthy',
        lastChecked: new Date()
      } as any);
      
      jest.spyOn(healthChecker, 'checkManifestStoreHealth').mockResolvedValue({
        component: 'manifest_store',
        status: 'healthy',
        lastChecked: new Date()
      } as any);
      
      jest.spyOn(healthChecker, 'checkC2PAServiceHealth').mockResolvedValue({
        component: 'c2pa_sdk',
        status: 'healthy',
        lastChecked: new Date()
      } as any);
      
      jest.spyOn(healthChecker, 'checkCertificateManagerHealth').mockResolvedValue({
        component: 'certificate_manager',
        status: 'healthy',
        lastChecked: new Date()
      } as any);
      
      const result = await healthChecker.getOverallHealth();
      
      expect(result.overallStatus).toBe('healthy');
      expect(result.checks).toHaveLength(5);
      expect(result.service).toBe('credlink-api');
      expect(result.uptime).toBeGreaterThan(0);
    });

    it('should return unhealthy when any component is unhealthy', async () => {
      jest.spyOn(healthChecker, 'checkDatabaseHealth').mockResolvedValue({
        component: 'postgresql',
        status: 'unhealthy',
        lastChecked: new Date()
      } as any);
      
      const result = await healthChecker.getOverallHealth();
      
      expect(result.overallStatus).toBe('unhealthy');
    });

    it('should return degraded when components are degraded but not unhealthy', async () => {
      jest.spyOn(healthChecker, 'checkDatabaseHealth').mockResolvedValue({
        component: 'postgresql',
        status: 'degraded',
        lastChecked: new Date()
      } as any);
      
      jest.spyOn(healthChecker, 'checkRedisHealth').mockResolvedValue({
        component: 'redis',
        status: 'healthy',
        lastChecked: new Date()
      } as any);
      
      jest.spyOn(healthChecker, 'checkManifestStoreHealth').mockResolvedValue({
        component: 'manifest_store',
        status: 'healthy',
        lastChecked: new Date()
      } as any);
      
      jest.spyOn(healthChecker, 'checkC2PAServiceHealth').mockResolvedValue({
        component: 'c2pa_sdk',
        status: 'healthy',
        lastChecked: new Date()
      } as any);
      
      jest.spyOn(healthChecker, 'checkCertificateManagerHealth').mockResolvedValue({
        component: 'certificate_manager',
        status: 'healthy',
        lastChecked: new Date()
      } as any);
      
      const result = await healthChecker.getOverallHealth();
      
      expect(result.overallStatus).toBe('degraded');
    });

    it('should handle failed promises gracefully', async () => {
      jest.spyOn(healthChecker, 'checkDatabaseHealth').mockRejectedValue(new Error('Database failed'));
      
      const result = await healthChecker.getOverallHealth();
      
      expect(result.overallStatus).toBe('unhealthy');
      const dbCheck = result.checks.find(c => c.component === 'postgresql');
      expect(dbCheck?.status).toBe('unhealthy');
      expect(dbCheck?.errorMessage).toBe('Database failed');
    });
  });
});
