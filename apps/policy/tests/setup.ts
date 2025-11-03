/**
 * Phase 20: Policy Engine & Assertions Builder - Test Setup
 * Global test configuration and mocks
 */

// Set test environment
process.env.NODE_ENV = 'test';

// Mock dependencies that might cause issues in tests
jest.mock('fs/promises');
jest.mock('crypto');

// Increase timeout for async operations
jest.setTimeout(10000);

// Global test cleanup
afterEach(() => {
  jest.clearAllMocks();
});
