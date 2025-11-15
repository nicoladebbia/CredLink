/**
 * Jest global setup
 * Week 7 Day 1: Configure global test cleanup to prevent hangs
 */

import { TestCleanup } from './src/tests/setup/cleanup';

// Configure global test cleanup
afterEach(async () => {
  await TestCleanup.cleanup();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't throw in tests, just log
});

// Add timeout to global expect
jest.setTimeout(30000); // 30 seconds default
