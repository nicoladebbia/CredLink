/**
 * Centralized Timeout Configuration Utility
 * Eliminates hardcoded timeout values throughout the CredLink codebase
 */

export class TimeoutConfig {
  /**
   * Database timeouts
   */
  static get DB_STATEMENT_TIMEOUT(): number {
    return parseInt(process.env.DB_STATEMENT_TIMEOUT || '5000'); // 5 seconds
  }

  static get DB_QUERY_TIMEOUT(): number {
    return parseInt(process.env.DB_QUERY_TIMEOUT || '5000'); // 5 seconds
  }

  static get DB_CONNECTION_TIMEOUT(): number {
    return parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'); // 10 seconds
  }

  /**
   * Certificate operation timeouts
   */
  static get CERTIFICATE_LOAD_TIMEOUT(): number {
    return parseInt(process.env.CERTIFICATE_LOAD_TIMEOUT_MS || '5000'); // 5 seconds
  }

  static get CERTIFICATE_ROTATION_TIMEOUT(): number {
    return parseInt(process.env.CERTIFICATE_ROTATION_TIMEOUT_MS || '300000'); // 5 minutes
  }

  static get CERTIFICATE_OPERATION_TIMEOUT(): number {
    return parseInt(process.env.CERTIFICATE_OPERATION_TIMEOUT_MS || '5000'); // 5 seconds
  }

  /**
   * Secrets Manager timeouts
   */
  static get SECRETS_MANAGER_TIMEOUT(): number {
    return parseInt(process.env.SECRETS_MANAGER_TIMEOUT_MS || '10000'); // 10 seconds
  }

  /**
   * Proof storage timeouts
   */
  static get PROOF_RETRIEVAL_TIMEOUT(): number {
    return parseInt(process.env.PROOF_RETRIEVAL_TIMEOUT_MS || '5000'); // 5 seconds
  }

  static get PROOF_UPLOAD_TIMEOUT(): number {
    return parseInt(process.env.PROOF_UPLOAD_TIMEOUT_MS || '30000'); // 30 seconds
  }

  static get PROOF_CLEANUP_INTERVAL(): number {
    return parseInt(process.env.PROOF_CLEANUP_INTERVAL_MS || '86400000'); // 24 hours
  }

  /**
   * Image processing timeouts
   */
  static get IMAGE_PROCESSING_TIMEOUT(): number {
    return parseInt(process.env.IMAGE_PROCESSING_TIMEOUT_MS || '30000'); // 30 seconds
  }

  static get IMAGE_VALIDATION_TIMEOUT(): number {
    return parseInt(process.env.IMAGE_VALIDATION_TIMEOUT_MS || '10000'); // 10 seconds
  }

  /**
   * Job scheduler timeouts
   */
  static get JOB_EXECUTION_TIMEOUT(): number {
    return parseInt(process.env.JOB_EXECUTION_TIMEOUT_MS || '300000'); // 5 minutes
  }

  static get JOB_RETRY_DELAY(): number {
    return parseInt(process.env.JOB_RETRY_DELAY_MS || '60000'); // 1 minute
  }

  static get JOB_SHUTDOWN_TIMEOUT(): number {
    return parseInt(process.env.JOB_SHUTDOWN_TIMEOUT_MS || '30000'); // 30 seconds
  }

  /**
   * API request timeouts
   */
  static get API_REQUEST_TIMEOUT(): number {
    return parseInt(process.env.API_REQUEST_TIMEOUT_MS || '10000'); // 10 seconds
  }

  static get HEALTH_CHECK_TIMEOUT(): number {
    return parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS || '3000'); // 3 seconds
  }

  static get WEBHOOK_TIMEOUT(): number {
    return parseInt(process.env.WEBHOOK_TIMEOUT_MS || '5000'); // 5 seconds
  }

  /**
   * Security operation timeouts
   */
  static get SECURITY_SCAN_TIMEOUT(): number {
    return parseInt(process.env.SECURITY_SCAN_TIMEOUT_MS || '60000'); // 1 minute
  }

  static get THREAT_ANALYSIS_TIMEOUT(): number {
    return parseInt(process.env.THREAT_ANALYSIS_TIMEOUT_MS || '30000'); // 30 seconds
  }

  /**
   * Monitoring and logging timeouts
   */
  static get SENTRY_FLUSH_TIMEOUT(): number {
    return parseInt(process.env.SENTRY_FLUSH_TIMEOUT_MS || '2000'); // 2 seconds
  }

  static get LOG_FLUSH_TIMEOUT(): number {
    return parseInt(process.env.LOG_FLUSH_TIMEOUT_MS || '1000'); // 1 second
  }

  /**
   * Cache and session timeouts
   */
  static get CACHE_CLEANUP_INTERVAL(): number {
    return parseInt(process.env.CACHE_CLEANUP_INTERVAL_MS || '300000'); // 5 minutes
  }

  static get SESSION_TIMEOUT(): number {
    return parseInt(process.env.SESSION_TIMEOUT_MS || '1800000'); // 30 minutes
  }

  static get RATE_LIMIT_CLEANUP_INTERVAL(): number {
    return parseInt(process.env.RATE_LIMIT_CLEANUP_INTERVAL_MS || '300000'); // 5 minutes
  }

  /**
   * Testing timeouts (can be overridden for CI/CD)
   */
  static get TEST_TIMEOUT(): number {
    return parseInt(process.env.TEST_TIMEOUT_MS || '30000'); // 30 seconds
  }

  static get TEST_ASSERTION_TIMEOUT(): number {
    return parseInt(process.env.TEST_ASSERTION_TIMEOUT_MS || '5000'); // 5 seconds
  }

  static get LOAD_TEST_TIMEOUT(): number {
    return parseInt(process.env.LOAD_TEST_TIMEOUT_MS || '120000'); // 2 minutes
  }

  /**
   * Retry and backoff configurations
   */
  static get DEFAULT_RETRY_DELAY(): number {
    return parseInt(process.env.DEFAULT_RETRY_DELAY_MS || '1000'); // 1 second
  }

  static get MAX_RETRY_DELAY(): number {
    return parseInt(process.env.MAX_RETRY_DELAY_MS || '30000'); // 30 seconds
  }

  static get CIRCUIT_BREAKER_TIMEOUT(): number {
    return parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT_MS || '60000'); // 1 minute
  }

  /**
   * External service timeouts
   */
  static get EXTERNAL_API_TIMEOUT(): number {
    return parseInt(process.env.EXTERNAL_API_TIMEOUT_MS || '10000'); // 10 seconds
  }

  static get NOTIFICATION_TIMEOUT(): number {
    return parseInt(process.env.NOTIFICATION_TIMEOUT_MS || '5000'); // 5 seconds
  }

  /**
   * Graceful shutdown timeouts
   */
  static get GRACEFUL_SHUTDOWN_TIMEOUT(): number {
    return parseInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS || '30000'); // 30 seconds
  }

  static get FORCE_SHUTDOWN_TIMEOUT(): number {
    return parseInt(process.env.FORCE_SHUTDOWN_TIMEOUT_MS || '5000'); // 5 seconds
  }

  /**
   * Validation helper for timeout values
   */
  static validateTimeout(value: number, name: string): void {
    if (isNaN(value) || value <= 0) {
      throw new Error(`Invalid timeout value for ${name}: ${value}. Must be a positive number.`);
    }

    if (value > 3600000) { // 1 hour
      throw new Error(`Timeout value for ${name} (${value}ms) exceeds maximum allowed (1 hour).`);
    }
  }

  /**
   * Get all timeout configurations as an object (for debugging/monitoring)
   */
  static getAllConfigs(): Record<string, number> {
    return {
      DB_STATEMENT_TIMEOUT: this.DB_STATEMENT_TIMEOUT,
      DB_QUERY_TIMEOUT: this.DB_QUERY_TIMEOUT,
      DB_CONNECTION_TIMEOUT: this.DB_CONNECTION_TIMEOUT,
      CERTIFICATE_LOAD_TIMEOUT: this.CERTIFICATE_LOAD_TIMEOUT,
      CERTIFICATE_ROTATION_TIMEOUT: this.CERTIFICATE_ROTATION_TIMEOUT,
      CERTIFICATE_OPERATION_TIMEOUT: this.CERTIFICATE_OPERATION_TIMEOUT,
      SECRETS_MANAGER_TIMEOUT: this.SECRETS_MANAGER_TIMEOUT,
      PROOF_RETRIEVAL_TIMEOUT: this.PROOF_RETRIEVAL_TIMEOUT,
      PROOF_UPLOAD_TIMEOUT: this.PROOF_UPLOAD_TIMEOUT,
      PROOF_CLEANUP_INTERVAL: this.PROOF_CLEANUP_INTERVAL,
      IMAGE_PROCESSING_TIMEOUT: this.IMAGE_PROCESSING_TIMEOUT,
      IMAGE_VALIDATION_TIMEOUT: this.IMAGE_VALIDATION_TIMEOUT,
      JOB_EXECUTION_TIMEOUT: this.JOB_EXECUTION_TIMEOUT,
      JOB_RETRY_DELAY: this.JOB_RETRY_DELAY,
      JOB_SHUTDOWN_TIMEOUT: this.JOB_SHUTDOWN_TIMEOUT,
      API_REQUEST_TIMEOUT: this.API_REQUEST_TIMEOUT,
      HEALTH_CHECK_TIMEOUT: this.HEALTH_CHECK_TIMEOUT,
      WEBHOOK_TIMEOUT: this.WEBHOOK_TIMEOUT,
      SECURITY_SCAN_TIMEOUT: this.SECURITY_SCAN_TIMEOUT,
      THREAT_ANALYSIS_TIMEOUT: this.THREAT_ANALYSIS_TIMEOUT,
      SENTRY_FLUSH_TIMEOUT: this.SENTRY_FLUSH_TIMEOUT,
      LOG_FLUSH_TIMEOUT: this.LOG_FLUSH_TIMEOUT,
      CACHE_CLEANUP_INTERVAL: this.CACHE_CLEANUP_INTERVAL,
      SESSION_TIMEOUT: this.SESSION_TIMEOUT,
      RATE_LIMIT_CLEANUP_INTERVAL: this.RATE_LIMIT_CLEANUP_INTERVAL,
      TEST_TIMEOUT: this.TEST_TIMEOUT,
      TEST_ASSERTION_TIMEOUT: this.TEST_ASSERTION_TIMEOUT,
      LOAD_TEST_TIMEOUT: this.LOAD_TEST_TIMEOUT,
      DEFAULT_RETRY_DELAY: this.DEFAULT_RETRY_DELAY,
      MAX_RETRY_DELAY: this.MAX_RETRY_DELAY,
      CIRCUIT_BREAKER_TIMEOUT: this.CIRCUIT_BREAKER_TIMEOUT,
      EXTERNAL_API_TIMEOUT: this.EXTERNAL_API_TIMEOUT,
      NOTIFICATION_TIMEOUT: this.NOTIFICATION_TIMEOUT,
      GRACEFUL_SHUTDOWN_TIMEOUT: this.GRACEFUL_SHUTDOWN_TIMEOUT,
      FORCE_SHUTDOWN_TIMEOUT: this.FORCE_SHUTDOWN_TIMEOUT
    };
  }
}

/**
 * Timeout constants for specific use cases (when environment variables aren't appropriate)
 */
export const TIMEOUT_CONSTANTS = {
  // Health check intervals
  HEALTH_CHECK_INTERVAL: 30000, // 30 seconds
  HEALTH_CHECK_GRACE_PERIOD: 5000, // 5 seconds
  
  // Cleanup intervals
  MEMORY_CLEANUP_INTERVAL: 60000, // 1 minute
  TEMP_FILE_CLEANUP_INTERVAL: 300000, // 5 minutes
  
  // Retry strategies
  EXPONENTIAL_BACKOFF_BASE: 1000, // 1 second
  EXPONENTIAL_BACKOFF_MAX: 30000, // 30 seconds
  
  // Rate limiting
  RATE_LIMIT_WINDOW: 60000, // 1 minute
  RATE_LIMIT_BURST_WINDOW: 1000, // 1 second
  
  // File operations
  FILE_READ_TIMEOUT: 10000, // 10 seconds
  FILE_WRITE_TIMEOUT: 15000, // 15 seconds
  
  // Network operations
  DNS_RESOLUTION_TIMEOUT: 5000, // 5 seconds
  TCP_CONNECTION_TIMEOUT: 10000, // 10 seconds
  
  // Security operations
  HASH_COMPUTATION_TIMEOUT: 5000, // 5 seconds
  ENCRYPTION_TIMEOUT: 10000, // 10 seconds
} as const;
