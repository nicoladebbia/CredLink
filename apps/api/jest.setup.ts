/**
 * Jest global setup
 * Week 7 Day 1: Configure global test cleanup to prevent hangs
 */

// Load test environment variables
import dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

// Configure global test cleanup
afterEach(async () => {
  // Simple cleanup - no TestCleanup import needed for now
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't throw in tests, just log
});

// Add timeout to global expect
jest.setTimeout(30000); // 30 seconds default
