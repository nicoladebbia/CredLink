/**
 * SIEM Integration Tests
 * Verifies external alert providers work correctly
 */

import { SecurityMonitor } from '../index';
import { SentryAlertProvider, PagerDutyAlertProvider, ConsoleFallbackProvider } from '../alert-providers';
import { initializeAlertProviders, validateAlertConfig } from '../config';

// Mock fetch for PagerDuty tests
global.fetch = jest.fn();

describe('SIEM Integration', () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    jest.clearAllMocks();
  });

  describe('Alert Provider Initialization', () => {
    it('should initialize with console fallback only', () => {
      delete process.env.SENTRY_DSN;
      delete process.env.PAGERDUTY_API_KEY;
      delete process.env.PAGERDUTY_INTEGRATION_KEY;

      const providers = initializeAlertProviders();
      expect(providers).toHaveLength(1);
      expect(providers[0]).toBeInstanceOf(ConsoleFallbackProvider);
    });

    it('should initialize Sentry provider when DSN is configured', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      delete process.env.PAGERDUTY_API_KEY;

      const providers = initializeAlertProviders();
      expect(providers).toHaveLength(2);
      expect(providers[0]).toBeInstanceOf(ConsoleFallbackProvider);
      expect(providers[1]).toBeInstanceOf(SentryAlertProvider);
    });

    it('should initialize PagerDuty provider when credentials are configured', () => {
      delete process.env.SENTRY_DSN;
      process.env.PAGERDUTY_API_KEY = 'test-api-key';
      process.env.PAGERDUTY_INTEGRATION_KEY = 'test-integration-key';

      const providers = initializeAlertProviders();
      expect(providers).toHaveLength(2);
      expect(providers[0]).toBeInstanceOf(ConsoleFallbackProvider);
      expect(providers[1]).toBeInstanceOf(PagerDutyAlertProvider);
    });
  });

  describe('Alert Configuration Validation', () => {
    it('should validate Sentry DSN format', () => {
      process.env.SENTRY_DSN = 'invalid-dsn';
      const validation = validateAlertConfig();
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('SENTRY_DSN must be a valid HTTPS URL');
    });

    it('should require both PagerDuty credentials', () => {
      process.env.PAGERDUTY_API_KEY = 'test-key';
      delete process.env.PAGERDUTY_INTEGRATION_KEY;
      const validation = validateAlertConfig();
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('PAGERDUTY_INTEGRATION_KEY is required when using PagerDuty');
    });

    it('should pass validation with no configuration', () => {
      delete process.env.SENTRY_DSN;
      delete process.env.PAGERDUTY_API_KEY;
      const validation = validateAlertConfig();
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('Security Monitor Integration', () => {
    it('should send alerts to all configured providers', async () => {
      // Mock successful Sentry initialization
      const mockSentry = {
        init: jest.fn(),
        captureMessage: jest.fn()
      };
      jest.doMock('@sentry/node', () => mockSentry);

      const consoleProvider = new ConsoleFallbackProvider();
      const sentryProvider = new SentryAlertProvider('https://test@sentry.io/123');
      const pagerDutyProvider = new PagerDutyAlertProvider('test-key', 'test-integration');

      const monitor = new SecurityMonitor({
        alertProviders: [consoleProvider, sentryProvider, pagerDutyProvider]
      });

      // Mock successful PagerDuty response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202
      });

      // Record a critical event that should trigger alerts
      monitor.recordEvent({
        type: 'brute_force_attack',
        severity: 'high',
        source: {
          ip: '192.168.1.100',
          userAgent: 'test-agent'
        },
        details: {
          failedAttempts: 15,
          timeWindow: '1 minute'
        }
      });

      // Wait for async alert processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify console fallback received alert
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('SECURITY ALERT (FALLBACK)'),
        expect.objectContaining({
          alertType: 'brute_force_attack',
          severity: 'high'
        })
      );

      // Verify Sentry was called
      expect(mockSentry.captureMessage).toHaveBeenCalledWith(
        'Security Alert: brute_force_attack',
        expect.objectContaining({
          level: 'error',
          tags: expect.objectContaining({
            security: 'true',
            alertType: 'brute_force_attack'
          })
        })
      );

      // Verify PagerDuty was called
      expect(mockFetch).toHaveBeenCalledWith(
        'https://events.pagerduty.com/v2/enqueue',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('brute_force_attack')
        })
      );
    });

    it('should handle provider failures gracefully', async () => {
      const consoleProvider = new ConsoleFallbackProvider();
      const failingProvider = {
        send: jest.fn().mockRejectedValue(new Error('Provider failed')),
        isHealthy: jest.fn().mockResolvedValue(false)
      };

      const monitor = new SecurityMonitor({
        alertProviders: [consoleProvider, failingProvider]
      });

      // Record a critical event
      monitor.recordEvent({
        type: 'security_breach',
        severity: 'critical',
        source: {
          ip: '192.168.1.100'
        },
        details: { breach: true }
      });

      // Wait for async alert processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify console fallback still works despite provider failure
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('SECURITY ALERT (FALLBACK)'),
        expect.any(Object)
      );

      // Verify error was logged for failed provider
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Alert provider failed'),
        expect.any(Object)
      );
    });
  });

  describe('Alert Provider Health Checks', () => {
    it('should verify Sentry health', async () => {
      const mockSentry = {
        init: jest.fn(),
        captureMessage: jest.fn().mockResolvedValue(undefined)
      };
      jest.doMock('@sentry/node', () => mockSentry);

      const provider = new SentryAlertProvider('https://test@sentry.io/123');
      const isHealthy = await provider.isHealthy();
      expect(isHealthy).toBe(true);
    });

    it('should verify PagerDuty health', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202
      });

      const provider = new PagerDutyAlertProvider('test-key', 'test-integration');
      const isHealthy = await provider.isHealthy();
      expect(isHealthy).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle PagerDuty health check failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const provider = new PagerDutyAlertProvider('test-key', 'test-integration');
      const isHealthy = await provider.isHealthy();
      expect(isHealthy).toBe(false);
    });
  });
});
