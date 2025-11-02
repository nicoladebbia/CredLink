/**
 * Jest Setup File
 * Global test configuration and mocks
 */

// Mock Web Workers for testing
class MockWorker {
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
  }

  postMessage(data) {
    // Simulate async worker response
    setTimeout(() => {
      if (this.onmessage) {
        this.onmessage({ data: { status: 'mock', data } });
      }
    }, 10);
  }

  terminate() {
    // Mock terminate
  }
}

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor(callback) {
    this.callback = callback;
  }

  observe() {
    // Mock observe
  }

  unobserve() {
    // Mock unobserve
  }

  disconnect() {
    // Mock disconnect
  }
};

// Mock Service Worker
global.ServiceWorker = class ServiceWorker {
  constructor() {
    // Mock constructor
  }
};

global.ServiceWorkerGlobalScope = class ServiceWorkerGlobalScope {
  // Mock ServiceWorkerGlobalScope
};

// Mock fetch for testing
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    headers: new Map()
  })
);

// Mock console methods in tests to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Add custom matchers if needed
expect.extend({
  toBeValidC2PAState(received) {
    const validStatuses = ['unknown', 'valid', 'warning', 'invalid'];
    const pass = validStatuses.includes(received.status);
    
    if (pass) {
      return {
        message: () => `expected ${received.status} not to be a valid C2PA status`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received.status} to be a valid C2PA status`,
        pass: false
      };
    }
  }
});
