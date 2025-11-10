import { vi } from 'vitest';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-128-characters-minimum-with-uppercase-lowercase-numbers-and-special-characters-!@#$%^&*()';
process.env.API_KEY_SECRET = 'test-api-key-secret-64-characters-minimum-with-uppercase-lowercase-numbers-and-special-characters-!@#$%';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.REDIS_DB = '1';
process.env.REDIS_PASSWORD = 'test-redis-password';
process.env.STRIPE_SECRET_KEY = 'sk_test_123456789';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123456789';
process.env.HOST = 'localhost';
process.env.PORT = '3001';

// Mock Redis
vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    exists: vi.fn(),
    expire: vi.fn(),
    flushall: vi.fn(),
    ping: vi.fn().mockResolvedValue('PONG'),
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

// Mock Stripe
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    customers: {
      create: vi.fn(),
      retrieve: vi.fn(),
      update: vi.fn(),
      del: vi.fn(),
    },
    subscriptions: {
      create: vi.fn(),
      retrieve: vi.fn(),
      update: vi.fn(),
      cancel: vi.fn(),
    },
    prices: {
      retrieve: vi.fn(),
    },
    billing: {
      meterEvents: {
        create: vi.fn(),
      },
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(),
      },
    },
  })),
}));

// Global test utilities
declare global {
  namespace Vi {
    interface JestAssertion<T = any> {
      toBeValidTenant(): T;
      toBeValidApiKey(): T;
      toBeSecureSecret(): T;
    }
  }
}

// Custom matchers
expect.extend({
  toBeValidTenant(received: any) {
    const pass = received && 
      typeof received.tenant_id === 'string' &&
      typeof received.stripe_customer_id === 'string' &&
      typeof received.stripe_subscription_id === 'string' &&
      ['starter', 'pro', 'enterprise'].includes(received.plan) &&
      ['trial', 'active', 'grace', 'suspended', 'canceled'].includes(received.status);

    return {
      message: () =>
        pass
          ? `expected ${received} not to be a valid tenant`
          : `expected ${received} to be a valid tenant`,
      pass,
    };
  },

  toBeValidApiKey(received: string) {
    const pass = typeof received === 'string' && 
      /^c2pa_[a-z0-9]+_[a-f0-9]{64}[a-f0-9]{22}$/.test(received);

    return {
      message: () =>
        pass
          ? `expected ${received} not to be a valid API key`
          : `expected ${received} to be a valid API key`,
      pass,
    };
  },

  toBeSecureSecret(received: string) {
    const pass = typeof received === 'string' && 
      received.length >= 64 &&
      /[A-Z]/.test(received) &&
      /[a-z]/.test(received) &&
      /[0-9]/.test(received) &&
      /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(received);

    return {
      message: () =>
        pass
          ? `expected ${received} not to be a secure secret`
          : `expected ${received} to be a secure secret`,
      pass,
    };
  },
});

// Cleanup after each test
afterEach(() => {
  vi.clearAllMocks();
});
