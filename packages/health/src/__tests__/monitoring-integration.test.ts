import { HealthMonitoringIntegration } from '../monitoring-integration.js';
import { HealthChecker } from '../health-checker.js';
import { logger } from '@credlink/config';

// Mock dependencies
jest.mock('@credlink/config', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
  }
}));

describe('HealthMonitoringIntegration', () => {
  let healthMonitoring: HealthMonitoringIntegration;
  let mockHealthChecker: jest.Mocked<HealthChecker>;
  let mockSetInterval: jest.Mock;
  let mockClearInterval: jest.Mock;

  beforeEach(() => {
    // Create mock health checker
    mockHealthChecker = {
      getOverallHealth: jest.fn()
    } as any;

    // Mock setInterval/clearInterval
    mockSetInterval = jest.fn().mockReturnValue(123);
    mockClearInterval = jest.fn();
    global.setInterval = mockSetInterval;
    global.clearInterval = mockClearInterval;

    healthMonitoring = new HealthMonitoringIntegration(mockHealthChecker);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should use default alert thresholds', () => {
      const thresholds = healthMonitoring.getAlertThresholds();
      
      expect(thresholds).toEqual({
        responseTime: 5000,
        consecutiveFailures: 3,
        degradedThreshold: 2
      });
    });

    it('should accept custom alert thresholds', () => {
      const customThresholds = {
        responseTime: 3000,
        degradedThreshold: 1
      };
      
      const customMonitoring = new HealthMonitoringIntegration(mockHealthChecker, customThresholds);
      const thresholds = customMonitoring.getAlertThresholds();
      
      expect(thresholds).toEqual({
        responseTime: 3000,
        consecutiveFailures: 3,
        degradedThreshold: 1
      });
    });
  });

  describe('startMetricsCollection', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('should start metrics collection with default interval', () => {
      const mockHealth = {
        service: 'test-service',
        overallStatus: 'healthy',
        checks: [],
        uptime: 100,
        version: '1.0.0',
        timestamp: new Date()
      };
      
      mockHealthChecker.getOverallHealth.mockResolvedValue(mockHealth);
      
      healthMonitoring.startMetricsCollection();
      
      expect(mockSetInterval).toHaveBeenCalledWith(
        expect.any(Function),
        30000
      );
      expect(logger.info).toHaveBeenCalledWith('Health metrics collection started with 30000ms interval');
    });

    it('should start metrics collection with custom interval', () => {
      healthMonitoring.startMetricsCollection(60000);
      
      expect(mockSetInterval).toHaveBeenCalledWith(
        expect.any(Function),
        60000
      );
    });

    it('should collect metrics and check alerts on interval', async () => {
      const mockHealth = {
        service: 'test-service',
        overallStatus: 'healthy',
        checks: [
          {
            component: 'postgresql',
            status: 'healthy',
            responseTime: 100,
            lastChecked: new Date()
          }
        ],
        uptime: 100,
        version: '1.0.0',
        timestamp: new Date()
      };
      
      mockHealthChecker.getOverallHealth.mockResolvedValue(mockHealth);
      
      healthMonitoring.startMetricsCollection(1000);
      
      // Get the callback function from setInterval call
      const callback = mockSetInterval.mock.calls[0][0];
      
      // Execute the callback
      await callback();
      
      expect(mockHealthChecker.getOverallHealth).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'METRIC: health_check_response_time{service="test-service",component="postgresql",status="healthy"} 100'
      );
    });

    it('should handle errors in metrics collection gracefully', async () => {
      const error = new Error('Health check failed');
      mockHealthChecker.getOverallHealth.mockRejectedValue(error);
      
      healthMonitoring.startMetricsCollection(1000);
      
      const callback = mockSetInterval.mock.calls[0][0];
      await callback();
      
      expect(logger.error).toHaveBeenCalledWith('Health metrics collection failed:', error);
    });
  });

  describe('stopMetricsCollection', () => {
    it('should stop metrics collection', () => {
      healthMonitoring.startMetricsCollection();
      healthMonitoring.stopMetricsCollection();
      
      expect(mockClearInterval).toHaveBeenCalledWith(123);
      expect(logger.info).toHaveBeenCalledWith('Health metrics collection stopped');
    });

    it('should handle stopping when not started', () => {
      healthMonitoring.stopMetricsCollection();
      
      expect(mockClearInterval).not.toHaveBeenCalled();
    });
  });

  describe('alert conditions', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('should send critical alert for unhealthy components', async () => {
      const mockHealth = {
        service: 'test-service',
        overallStatus: 'unhealthy',
        checks: [
          {
            component: 'postgresql',
            status: 'unhealthy',
            responseTime: 1000,
            lastChecked: new Date()
          }
        ],
        uptime: 100,
        version: '1.0.0',
        timestamp: new Date()
      };
      
      mockHealthChecker.getOverallHealth.mockResolvedValue(mockHealth);
      
      healthMonitoring.startMetricsCollection(1000);
      
      const callback = mockSetInterval.mock.calls[0][0];
      await callback();
      
      expect(logger.error).toHaveBeenCalledWith(
        'ALERT [CRITICAL] Unhealthy Components Detected: 1 components are unhealthy: postgresql',
        expect.objectContaining({
          service: 'test-service',
          overallStatus: 'unhealthy'
        })
      );
    });

    it('should send warning alert for degraded components', async () => {
      const mockHealth = {
        service: 'test-service',
        overallStatus: 'degraded',
        checks: [
          {
            component: 'postgresql',
            status: 'degraded',
            responseTime: 1000,
            lastChecked: new Date()
          },
          {
            component: 'redis',
            status: 'degraded',
            responseTime: 1000,
            lastChecked: new Date()
          }
        ],
        uptime: 100,
        version: '1.0.0',
        timestamp: new Date()
      };
      
      mockHealthChecker.getOverallHealth.mockResolvedValue(mockHealth);
      
      healthMonitoring.startMetricsCollection(1000);
      
      const callback = mockSetInterval.mock.calls[0][0];
      await callback();
      
      expect(logger.error).toHaveBeenCalledWith(
        'ALERT [WARNING] Service Degraded: 2 components are degraded: postgresql, redis',
        expect.any(Object)
      );
    });

    it('should send warning alert for slow response times', async () => {
      const mockHealth = {
        service: 'test-service',
        overallStatus: 'healthy',
        checks: [
          {
            component: 'postgresql',
            status: 'healthy',
            responseTime: 6000, // Above default threshold of 5000ms
            lastChecked: new Date()
          }
        ],
        uptime: 100,
        version: '1.0.0',
        timestamp: new Date()
      };
      
      mockHealthChecker.getOverallHealth.mockResolvedValue(mockHealth);
      
      healthMonitoring.startMetricsCollection(1000);
      
      const callback = mockSetInterval.mock.calls[0][0];
      await callback();
      
      expect(logger.error).toHaveBeenCalledWith(
        'ALERT [WARNING] Slow Health Checks Detected: 1 components have slow response times: postgresql (6000ms)',
        expect.any(Object)
      );
    });

    it('should track consecutive failures and alert', async () => {
      const mockHealth = {
        service: 'test-service',
        overallStatus: 'unhealthy',
        checks: [],
        uptime: 100,
        version: '1.0.0',
        timestamp: new Date()
      };
      
      mockHealthChecker.getOverallHealth.mockResolvedValue(mockHealth);
      
      healthMonitoring.startMetricsCollection(1000);
      
      const callback = mockSetInterval.mock.calls[0][0];
      
      // Simulate 3 consecutive failures
      await callback();
      await callback();
      await callback();
      
      expect(logger.error).toHaveBeenCalledWith(
        'ALERT [CRITICAL] Service Consecutive Failures: Service test-service has failed 3 consecutive health checks',
        expect.any(Object)
      );
    });
  });

  describe('configuration methods', () => {
    it('should update alert thresholds', () => {
      const newThresholds = {
        responseTime: 3000,
        degradedThreshold: 1
      };
      
      healthMonitoring.updateAlertThresholds(newThresholds);
      
      const thresholds = healthMonitoring.getAlertThresholds();
      expect(thresholds).toEqual({
        responseTime: 3000,
        consecutiveFailures: 3,
        degradedThreshold: 1
      });
      
      expect(logger.info).toHaveBeenCalledWith('Alert thresholds updated', thresholds);
    });

    it('should track and reset failure counts', async () => {
      const mockHealth = {
        service: 'test-service',
        overallStatus: 'unhealthy',
        checks: [],
        uptime: 100,
        version: '1.0.0',
        timestamp: new Date()
      };
      
      mockHealthChecker.getOverallHealth.mockResolvedValue(mockHealth);
      
      healthMonitoring.startMetricsCollection(1000);
      
      const callback = mockSetInterval.mock.calls[0][0];
      await callback();
      
      let failureCounts = healthMonitoring.getFailureCounts();
      expect(failureCounts['test-service']).toBe(1);
      
      healthMonitoring.resetFailureCounts();
      
      failureCounts = healthMonitoring.getFailureCounts();
      expect(Object.keys(failureCounts)).toHaveLength(0);
      
      expect(logger.info).toHaveBeenCalledWith('Failure counts reset');
    });
  });
});
