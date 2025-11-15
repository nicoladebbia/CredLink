/**
 * Error Sanitization Utility
 * 
 * Sanitizes error messages and stack traces to prevent leaking sensitive information
 * in production environments.
 * 
 * SECURITY: This module prevents:
 * - API keys and tokens in error messages
 * - File paths revealing server structure
 * - Environment variables
 * - Database connection strings
 * - Internal implementation details
 */

import { logger } from './logger';

/**
 * Sensitive patterns to redact from error messages
 */
const SENSITIVE_PATTERNS = [
  // API keys and tokens
  /Bearer\s+[A-Za-z0-9_-]+/gi,
  /api[_-]?key[=:]\s*['"]?[A-Za-z0-9_-]+['"]?/gi,
  /token[=:]\s*['"]?[A-Za-z0-9_.-]+['"]?/gi,
  /sk_[a-z]+_[A-Za-z0-9]+/gi, // Stripe-style keys
  
  // AWS credentials
  /AKIA[0-9A-Z]{16}/g,
  /aws_secret_access_key[=:]\s*['"]?[A-Za-z0-9/+=]+['"]?/gi,
  
  // Connection strings
  /mongodb:\/\/[^@]+@[^\s]+/gi,
  /postgres:\/\/[^@]+@[^\s]+/gi,
  /mysql:\/\/[^@]+@[^\s]+/gi,
  
  // Email addresses (partial redaction)
  /([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
  
  // IP addresses (optional - might be needed for debugging)
  // /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
  
  // JWT tokens
  /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,
  
  // Credit card numbers
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  
  // Private keys
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]+?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi,
];

/**
 * File path patterns to redact (reveals server structure)
 */
const PATH_PATTERNS = [
  // Absolute paths
  /\/home\/[^\s]+/g,
  /\/Users\/[^\s]+/g,
  /C:\\Users\\[^\s]+/g,
  
  // Common sensitive directories
  /\/etc\/[^\s]+/g,
  /\/var\/[^\s]+/g,
  /node_modules\/[^\s]+/g,
];

/**
 * Sanitize error message by redacting sensitive information
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message) return message;
  
  let sanitized = message;
  
  // Redact sensitive patterns
  SENSITIVE_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  });
  
  // Redact file paths in production
  if (process.env.NODE_ENV === 'production') {
    PATH_PATTERNS.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[PATH]');
    });
  }
  
  return sanitized;
}

/**
 * Sanitize stack trace for safe logging/display
 */
export function sanitizeStackTrace(stack: string | undefined): string | undefined {
  if (!stack) return stack;
  
  // In production, return undefined to completely hide stack traces
  if (process.env.NODE_ENV === 'production') {
    return undefined;
  }
  
  // In development, still sanitize sensitive information
  let sanitized = stack;
  
  SENSITIVE_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  });
  
  return sanitized;
}

/**
 * Sanitize entire error object for safe logging
 */
export function sanitizeError(error: Error | any): {
  message: string;
  name: string;
  stack?: string;
  code?: string;
  statusCode?: number;
} {
  const sanitized: any = {
    message: sanitizeErrorMessage(error.message || 'Unknown error'),
    name: error.name || 'Error',
  };
  
  // Only include stack in development
  if (process.env.NODE_ENV !== 'production' && error.stack) {
    sanitized.stack = sanitizeStackTrace(error.stack);
  }
  
  // Include error code if available (e.g., ENOENT, ECONNREFUSED)
  if (error.code && typeof error.code === 'string') {
    sanitized.code = error.code;
  }
  
  // Include HTTP status code if available
  if (error.statusCode && typeof error.statusCode === 'number') {
    sanitized.statusCode = error.statusCode;
  }
  
  return sanitized;
}

/**
 * Create a safe error response for API clients
 */
export function createSafeErrorResponse(
  error: Error | any,
  defaultMessage: string = 'An error occurred'
): {
  error: string;
  statusCode: number;
  code?: string;
  stack?: string;
} {
  const isProduction = process.env.NODE_ENV === 'production';
  const statusCode = error.statusCode || error.status || 500;
  
  const response: any = {
    error: isProduction ? defaultMessage : sanitizeErrorMessage(error.message || defaultMessage),
    statusCode,
  };
  
  // Include error code for debugging (safe to expose)
  if (error.code) {
    response.code = error.code;
  }
  
  // Only include stack trace in development
  if (!isProduction && error.stack) {
    response.stack = sanitizeStackTrace(error.stack);
  }
  
  return response;
}

/**
 * Validate that a string doesn't contain sensitive information
 * Returns true if the string appears safe
 */
export function validateNoSensitiveData(text: string): {
  safe: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  
  SENSITIVE_PATTERNS.forEach((pattern, index) => {
    if (pattern.test(text)) {
      violations.push(`Pattern ${index + 1} matched`);
    }
  });
  
  if (violations.length > 0) {
    logger.warn('Sensitive data detected in text', {
      violationCount: violations.length,
      textLength: text.length
    });
  }
  
  return {
    safe: violations.length === 0,
    violations
  };
}

/**
 * Sanitize an object recursively
 */
export function sanitizeObject(obj: any, maxDepth: number = 5): any {
  if (maxDepth <= 0) return '[MAX_DEPTH]';
  
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    return sanitizeErrorMessage(obj);
  }
  
  if (typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, maxDepth - 1));
  }
  
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Skip certain keys that might contain sensitive data
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('password') || 
        lowerKey.includes('secret') || 
        lowerKey.includes('token') ||
        lowerKey.includes('key') && lowerKey.includes('api')) {
      sanitized[key] = '[REDACTED]';
      continue;
    }
    
    sanitized[key] = sanitizeObject(value, maxDepth - 1);
  }
  
  return sanitized;
}

/**
 * Test the sanitization utility
 */
export function testSanitization(): void {
  const testCases = [
    'Bearer sk_test_abc123',
    'api_key=secret123',
    'Error: Failed to connect to mongodb://user:pass@host:27017/db',
    'Token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature',
    'Email: user@example.com in error',
    '/home/user/app/config/secrets.json',
  ];
  
  console.log('=== Error Sanitization Tests ===');
  
  testCases.forEach((test, i) => {
    const sanitized = sanitizeErrorMessage(test);
    console.log(`Test ${i + 1}:`);
    console.log(`  Original: ${test}`);
    console.log(`  Sanitized: ${sanitized}`);
    console.log();
  });
}

// Export for testing in development
if (process.env.NODE_ENV === 'development' && process.env.TEST_SANITIZATION) {
  testSanitization();
}
