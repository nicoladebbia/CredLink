/**
 * Job Configuration for CredLink Scheduler
 * 
 * Centralizes all job scheduling configuration to eliminate hardcoded values.
 * Uses environment variables with sensible defaults.
 */

import { TIME_CONSTANTS } from '@credlink/config/src/time-constants';

export const JOB_CONFIG = {
  // Cleanup jobs
  PROOF_CLEANUP: {
    enabled: process.env.ENABLE_PROOF_CLEANUP !== 'false',
    intervalMs: parseInt(process.env.PROOF_CLEANUP_INTERVAL_MS || String(TIME_CONSTANTS.TWENTY_FOUR_HOURS_MS)),
  },

  // Certificate management
  CERTIFICATE_EXPIRY_CHECK: {
    enabled: process.env.ENABLE_CERTIFICATE_EXPIRY_CHECK !== 'false',
    intervalMs: parseInt(process.env.CERTIFICATE_EXPIRY_CHECK_INTERVAL_MS || String(TIME_CONSTANTS.ONE_HOUR_MS)),
    warningDays: parseInt(process.env.CERTIFICATE_EXPIRY_WARNING_DAYS || '7'),
    renewalDays: parseInt(process.env.CERTIFICATE_RENEWAL_DAYS || '30'),
  },

  // Metrics and monitoring
  METRICS_COLLECTION: {
    enabled: process.env.ENABLE_METRICS_COLLECTION !== 'false',
    intervalMs: parseInt(process.env.METRICS_COLLECTION_INTERVAL_MS || String(TIME_CONSTANTS.FIVE_MINUTES_MS)),
  },

  // Health checks
  HEALTH_CHECK: {
    enabled: process.env.ENABLE_HEALTH_CHECK !== 'false',
    intervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || String(TIME_CONSTANTS.ONE_HOUR_MS)),
  },

  // Database maintenance
  DATABASE_MAINTENANCE: {
    enabled: process.env.ENABLE_DATABASE_MAINTENANCE !== 'false',
    intervalMs: parseInt(process.env.DATABASE_MAINTENANCE_INTERVAL_MS || String(TIME_CONSTANTS.TWENTY_FOUR_HOURS_MS)),
  },

  // Cache cleanup
  CACHE_CLEANUP: {
    enabled: process.env.ENABLE_CACHE_CLEANUP !== 'false',
    intervalMs: parseInt(process.env.CACHE_CLEANUP_INTERVAL_MS || String(TIME_CONSTANTS.ONE_HOUR_MS)),
  },

  // Log rotation
  LOG_ROTATION: {
    enabled: process.env.ENABLE_LOG_ROTATION !== 'false',
    intervalMs: parseInt(process.env.LOG_ROTATION_INTERVAL_MS || String(TIME_CONSTANTS.TWENTY_FOUR_HOURS_MS)),
  },

  // Session cleanup
  SESSION_CLEANUP: {
    enabled: process.env.ENABLE_SESSION_CLEANUP !== 'false',
    intervalMs: parseInt(process.env.SESSION_CLEANUP_INTERVAL_MS || String(TIME_CONSTANTS.SIX_HOURS_MS)),
  },

  // Temporary file cleanup
  TEMP_FILE_CLEANUP: {
    enabled: process.env.ENABLE_TEMP_FILE_CLEANUP !== 'false',
    intervalMs: parseInt(process.env.TEMP_FILE_CLEANUP_INTERVAL_MS || String(TIME_CONSTANTS.ONE_HOUR_MS)),
  },
} as const;

// Export individual job configs for easy access
export const {
  PROOF_CLEANUP,
  CERTIFICATE_EXPIRY_CHECK,
  METRICS_COLLECTION,
  HEALTH_CHECK,
  DATABASE_MAINTENANCE,
  CACHE_CLEANUP,
  LOG_ROTATION,
  SESSION_CLEANUP,
  TEMP_FILE_CLEANUP,
} = JOB_CONFIG;
