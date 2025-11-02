/**
 * Jest setup for Cache Service tests
 */

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock crypto module
jest.mock('crypto', () => ({
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn((algorithm: string) => {
      if (algorithm === 'hex') return 'mock-hash-1234567890abcdef';
      if (algorithm === 'md5') return 'mock-md5-hash';
      return 'mock-hash';
    })
  }))
}));

// Mock Date.now for consistent testing
const mockDateNow = jest.fn(() => 1640995200000); // 2022-01-01 00:00:00 UTC
global.Date.now = mockDateNow;
