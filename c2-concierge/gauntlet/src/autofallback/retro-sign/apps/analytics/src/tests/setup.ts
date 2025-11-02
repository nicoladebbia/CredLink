/**
 * Phase 13 Analytics - Test Setup
 * Global test configuration and mocks
 */

import { jest } from '@jest/globals';

// Set test environment
process.env.NODE_ENV = 'test';

// Override configuration for testing
process.env.CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST || 'localhost';
process.env.CLICKHOUSE_PORT = process.env.CLICKHOUSE_PORT || '8123';
process.env.CLICKHOUSE_USER = process.env.CLICKHOUSE_USER || 'default';
process.env.CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE || 'test_analytics';
process.env.LOG_LEVEL = 'error';
process.env.ALERTS_ENABLED = 'false';

// Mock global services
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
} as any;

// Mock nodemailer
(global as any).testMocks = {
  nodemailer: {
    sendMail: jest.fn().mockImplementation(() => Promise.resolve({ messageId: 'test-message-id' }))
  },
  slack: {
    postMessage: jest.fn().mockImplementation(() => Promise.resolve({ ok: true, ts: '1234567890.123456' }))
  },
  fetch: jest.fn()
};

// Global test utilities
global.testUtils = {
  generateTestTenant: (prefix = 'test') => `${prefix}-tenant-${Math.random().toString(36).substring(7)}`,
  generateTestToken: () => `test-token-${Math.random().toString(36).substring(7)}`,
  generateServiceToken: () => `service-token-${Math.random().toString(36).substring(7)}`,
  
  // Wait for async operations
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Generate test data
  generateTestSLOData: (tenant: string, route: string) => ({
    tenant,
    route,
    mode: 'remote' as const,
    survival_30d: 0.995 + Math.random() * 0.004,
    survival_target: 0.999,
    survival_status: Math.random() > 0.1 ? 'PASS' as const : 'FAIL' as const,
    budget_left: Math.floor(Math.random() * 1000),
    burn_rate_5m: Math.random() * 2,
    burn_rate_1h: Math.random() * 1.5,
    policy: 'NORMAL' as const
  }),
  
  generateTestIncident: (tenant: string, route: string) => ({
    id: `test-inc-${Math.random().toString(36).substring(7)}`,
    tenant,
    route,
    ts: new Date(),
    state_from: 'NORMAL',
    state_to: 'FALLBACK_REMOTE_ONLY',
    reason: 'Test incident',
    rules: ['test-rule'],
    status: 'open' as const
  })
};

// Mock external services
jest.mock('nodemailer', () => ({
  createTransporter: jest.fn(() => ({
    sendMail: jest.fn().mockImplementation(() => Promise.resolve({ messageId: 'test-message-id' }))
  }))
}));

jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn(() => ({
    chat: {
      postMessage: jest.fn().mockImplementation(() => Promise.resolve({ ok: true, ts: '1234567890.123456' }))
    }
  }))
}));

// Mock fetch for external API calls
(global as any).fetch = jest.fn() as jest.Mock;

// Global test utilities
(global as any).testUtils = {
  generateTestTenant: (prefix = 'test') => `${prefix}-tenant-${Math.random().toString(36).substring(7)}`,
  generateTestToken: () => `test-token-${Math.random().toString(36).substring(7)}`,
  generateServiceToken: () => `service-token-${Math.random().toString(36).substring(7)}`,
  
  // Wait for async operations
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Generate test data
  generateTestSLOData: (tenant: string, route: string) => ({
    tenant,
    route,
    mode: 'remote' as const,
    survival_30d: 0.995 + Math.random() * 0.004,
    survival_target: 0.999,
    survival_status: Math.random() > 0.1 ? 'PASS' as const : 'FAIL' as const,
    budget_left: Math.floor(Math.random() * 1000),
    burn_rate_5m: Math.random() * 2,
    burn_rate_1h: Math.random() * 1.5,
    policy: 'NORMAL' as const
  }),
  
  generateTestIncident: (tenant: string, route: string) => ({
    tenant,
    route,
    ts: new Date(),
    state_from: 'NORMAL',
    state_to: 'FALLBACK_REMOTE_ONLY',
    reason: 'High burn rate detected',
    rules: ['remote-fast-burn'],
    id: `inc_${Date.now()}_${Math.random().toString(36).substring(7)}`
  }),
  
  // Mock ClickHouse responses
  mockClickHouseResponse: (data: any[]) => ({
    data,
    rows: data.length,
    statistics: {
      elapsed: 0.001,
      rows_read: data.length,
      bytes_read: 1024
    }
  })
};

// Add Jest globals
declare global {
  var testUtils: any;
  var testMocks: any;
}

// Setup and teardown
beforeAll(async () => {
  // Test setup
});

afterAll(async () => {
  // Test cleanup
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Extend Jest matchers for custom assertions
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
  
  toBeValidSurvivalRate(received: number) {
    const pass = received >= 0 && received <= 1;
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid survival rate (0-1)`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid survival rate (0-1)`,
        pass: false,
      };
    }
  },
  
  toBeValidBurnRate(received: number) {
    const pass = received >= 0 && received < 100; // Reasonable upper bound
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid burn rate (>= 0)`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid burn rate (>= 0)`,
        pass: false,
      };
    }
  }
});

// Type declarations for global test utils
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
      toBeValidSurvivalRate(): R;
      toBeValidBurnRate(): R;
    }
  }
}
