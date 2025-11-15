#!/usr/bin/env ts-node

/**
 * Configuration Validator
 * 
 * Validates environment configuration and dependencies
 * 
 * Usage:
 *   ts-node scripts/validate-config.ts [--env <file>]
 */

import { promises as fs } from 'fs';
import path from 'path';
import { config } from 'dotenv';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
}

const REQUIRED_VARS = [
  'NODE_ENV',
  'PORT',
  'LOG_LEVEL',
];

const OPTIONAL_VARS = [
  'ALLOWED_ORIGINS',
  'RATE_LIMIT_WINDOW_MS',
  'RATE_LIMIT_MAX',
  'MAX_FILE_SIZE_MB',
  'ENABLE_API_KEY_AUTH',
  'API_KEYS',
  'ENABLE_SENTRY',
  'SENTRY_DSN',
  'USE_S3_PROOF_STORAGE',
  'S3_PROOF_BUCKET',
  'AWS_REGION',
  'USE_LOCAL_PROOF_STORAGE',
  'PROOF_STORAGE_PATH',
];

const PRODUCTION_REQUIRED = [
  'ENABLE_API_KEY_AUTH',
  'API_KEYS',
  'ENABLE_SENTRY',
  'SENTRY_DSN',
  'USE_S3_PROOF_STORAGE',
  'S3_PROOF_BUCKET',
];

async function validateConfig(envPath?: string): Promise<ValidationResult> {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    info: [],
  };
  
  // Load environment
  if (envPath) {
    const loaded = config({ path: envPath });
    if (loaded.error) {
      result.errors.push(`Failed to load .env file: ${loaded.error.message}`);
      result.valid = false;
      return result;
    }
    result.info.push(`Loaded environment from: ${envPath}`);
  } else {
    config();
    result.info.push('Using current environment variables');
  }
  
  const env = process.env;
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  
  result.info.push(`Environment: ${nodeEnv}`);
  result.info.push('');
  
  // Check required variables
  console.log('Checking required variables...');
  for (const varName of REQUIRED_VARS) {
    if (!env[varName]) {
      result.errors.push(`Missing required variable: ${varName}`);
      result.valid = false;
    } else {
      result.info.push(`✓ ${varName}: ${env[varName]}`);
    }
  }
  
  // Check production requirements
  if (isProduction) {
    console.log('\nChecking production requirements...');
    for (const varName of PRODUCTION_REQUIRED) {
      if (!env[varName] || env[varName] === 'false') {
        result.warnings.push(`Production deployment missing: ${varName}`);
      } else {
        result.info.push(`✓ ${varName}: configured`);
      }
    }
  }
  
  // Validate specific values
  console.log('\nValidating configuration values...');
  
  // Port validation
  const port = parseInt(env.PORT || '3001', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    result.errors.push(`Invalid PORT: ${env.PORT} (must be 1-65535)`);
    result.valid = false;
  }
  
  // Log level validation
  const validLogLevels = ['error', 'warn', 'info', 'debug'];
  if (env.LOG_LEVEL && !validLogLevels.includes(env.LOG_LEVEL)) {
    result.warnings.push(`Invalid LOG_LEVEL: ${env.LOG_LEVEL} (valid: ${validLogLevels.join(', ')})`);
  }
  
  // Rate limit validation
  if (env.RATE_LIMIT_MAX) {
    const rateLimit = parseInt(env.RATE_LIMIT_MAX, 10);
    if (isNaN(rateLimit) || rateLimit < 1) {
      result.errors.push(`Invalid RATE_LIMIT_MAX: ${env.RATE_LIMIT_MAX}`);
      result.valid = false;
    }
  }
  
  // File size validation
  if (env.MAX_FILE_SIZE_MB) {
    const maxSize = parseInt(env.MAX_FILE_SIZE_MB, 10);
    if (isNaN(maxSize) || maxSize < 1) {
      result.errors.push(`Invalid MAX_FILE_SIZE_MB: ${env.MAX_FILE_SIZE_MB}`);
      result.valid = false;
    }
  }
  
  // API keys validation
  if (env.ENABLE_API_KEY_AUTH === 'true') {
    if (!env.API_KEYS) {
      result.errors.push('API key auth enabled but API_KEYS not set');
      result.valid = false;
    } else {
      const keys = env.API_KEYS.split(',');
      if (keys.length === 0) {
        result.errors.push('API_KEYS is empty');
        result.valid = false;
      } else {
        result.info.push(`✓ API keys configured: ${keys.length} key(s)`);
        
        // Validate format
        for (const key of keys) {
          const parts = key.split(':');
          if (parts.length !== 3) {
            result.warnings.push(`Invalid API key format: ${key} (expected format: key:clientId:clientName)`);
          }
        }
      }
    }
  }
  
  // S3 validation
  if (env.USE_S3_PROOF_STORAGE === 'true') {
    if (!env.S3_PROOF_BUCKET) {
      result.errors.push('S3 storage enabled but S3_PROOF_BUCKET not set');
      result.valid = false;
    }
    if (!env.AWS_REGION) {
      result.warnings.push('S3 storage enabled but AWS_REGION not set (will use default)');
    }
  }
  
  // Sentry validation
  if (env.ENABLE_SENTRY === 'true') {
    if (!env.SENTRY_DSN) {
      result.errors.push('Sentry enabled but SENTRY_DSN not set');
      result.valid = false;
    } else if (!env.SENTRY_DSN.startsWith('https://')) {
      result.warnings.push('SENTRY_DSN should start with https://');
    }
  }
  
  // Check for certificate files
  console.log('\nChecking certificate files...');
  const certPath = env.SIGNING_CERTIFICATE || './certs/signing-cert.pem';
  const keyPath = env.SIGNING_PRIVATE_KEY || './certs/signing-key.pem';
  
  try {
    await fs.access(certPath);
    result.info.push(`✓ Certificate found: ${certPath}`);
  } catch {
    result.warnings.push(`Certificate not found: ${certPath}`);
  }
  
  try {
    await fs.access(keyPath);
    result.info.push(`✓ Private key found: ${keyPath}`);
  } catch {
    result.warnings.push(`Private key not found: ${keyPath}`);
  }
  
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  let envPath: string | undefined;
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env') {
      envPath = args[++i];
    }
  }
  
  console.log('=== Configuration Validator ===\n');
  
  const result = await validateConfig(envPath);
  
  // Print info
  if (result.info.length > 0) {
    console.log('\nInformation:');
    result.info.forEach(msg => console.log(`  ${msg}`));
  }
  
  // Print warnings
  if (result.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    result.warnings.forEach(msg => console.log(`  ${msg}`));
  }
  
  // Print errors
  if (result.errors.length > 0) {
    console.log('\n❌ Errors:');
    result.errors.forEach(msg => console.log(`  ${msg}`));
  }
  
  // Summary
  console.log('\n=== Summary ===');
  console.log(`Status: ${result.valid ? '✅ VALID' : '❌ INVALID'}`);
  console.log(`Errors: ${result.errors.length}`);
  console.log(`Warnings: ${result.warnings.length}`);
  
  process.exit(result.valid ? 0 : 1);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
