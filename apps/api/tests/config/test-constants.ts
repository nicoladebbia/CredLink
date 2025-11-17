/**
 * Test Configuration Constants - Environment Configurable
 * 
 * All test performance thresholds and timeouts are configurable via environment variables
 * to ensure CI stability across different environments and hardware configurations.
 */

export const TEST_CONSTANTS = {
  // Performance thresholds (configurable for CI environments)
  PERFORMANCE_THRESHOLD_MS: parseInt(process.env.TEST_PERFORMANCE_THRESHOLD_MS || '2000'),
  LONG_OPERATION_THRESHOLD_MS: parseInt(process.env.TEST_LONG_OPERATION_THRESHOLD_MS || '10000'),
  
  // Test timeouts (configurable for slow CI environments)
  DEFAULT_TEST_TIMEOUT_MS: parseInt(process.env.TEST_DEFAULT_TIMEOUT_MS || '5000'),
  C2PA_OPERATION_TIMEOUT_MS: parseInt(process.env.TEST_C2PA_OPERATION_TIMEOUT_MS || '10000'),
  LARGE_FILE_TIMEOUT_MS: parseInt(process.env.TEST_LARGE_FILE_TIMEOUT_MS || '60000'),
  
  // File size limits for testing
  TEST_MAX_FILE_SIZE_MB: parseInt(process.env.TEST_MAX_FILE_SIZE_MB || '50'),
  
  // Cache sizes for testing
  TEST_CACHE_SIZE: parseInt(process.env.TEST_CACHE_SIZE || '1000'),
  
  // Performance test durations
  LOAD_TEST_DURATION_MS: parseInt(process.env.TEST_LOAD_TEST_DURATION_MS || '10000'),
  
  // Assertion limits
  MAX_ASSERTION_LENGTH: parseInt(process.env.TEST_MAX_ASSERTION_LENGTH || '10000'),
  MAX_URI_LENGTH: parseInt(process.env.TEST_MAX_URI_LENGTH || '2000'),
  
  // RSA key size for certificate tests
  TEST_RSA_MODULUS_LENGTH: parseInt(process.env.TEST_RSA_MODULUS_LENGTH || '2048')
} as const;
