/**
 * Security Utilities - Phase 33 Reverse Lab
 * Comprehensive security validation and sanitization functions
 */

import { createHash } from 'crypto';
import { URL } from 'url';

// Security configuration
export const SECURITY_CONFIG = {
  // Allowed domains for external requests
  ALLOWED_DOMAINS: [
    'images.cloudflare.com',
    'io.fastly.com', 
    'akamai.com',
    'res.cloudinary.com',
    'imgix.com',
    'opensource.contentauthenticity.org'
  ],
  
  // Private IP ranges to block
  PRIVATE_IP_RANGES: [
    '10.0.0.0/8',
    '172.16.0.0/12', 
    '192.168.0.0/16',
    '127.0.0.0/8',
    '169.254.0.0/16',
    '::1/128',
    'fc00::/7'
  ],
  
  // Maximum values for validation
  MAX_TIMEOUT: 3600000, // 1 hour
  MAX_RUNS: 10,
  MAX_REDIRECTS: 5,
  MAX_RESPONSE_SIZE: 10485760, // 10MB
  
  // Input sanitization patterns
  ALLOWED_ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  ALLOWED_CRON_PATTERN: /^[0-9\*\-\,\/\s]+$/,
};

/**
 * Validates and sanitizes a URL to prevent SSRF attacks
 */
export function validateUrl(url: string, allowedDomains: string[] = SECURITY_CONFIG.ALLOWED_DOMAINS): string {
  try {
    const parsedUrl = new URL(url);
    
    // Only allow HTTPS
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('Only HTTPS URLs are allowed');
    }
    
    // Check against allowed domains
    const isAllowed = allowedDomains.some(domain => 
      parsedUrl.hostname === domain || parsedUrl.hostname?.endsWith(`.${domain}`)
    );
    
    if (!isAllowed) {
      throw new Error(`Domain ${parsedUrl.hostname} is not in allowed list`);
    }
    
    // Prevent private IP access
    if (isPrivateIp(parsedUrl.hostname)) {
      throw new Error('Private IP addresses are not allowed');
    }
    
    return parsedUrl.toString();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid URL: ${errorMessage}`);
  }
}

/**
 * Checks if an IP address is in private ranges
 */
function isPrivateIp(hostname: string | undefined): boolean {
  if (!hostname) return true;
  
  // Simple check for common private patterns
  const privatePatterns = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^127\./,
    /^169\.254\./,
    /^::1$/,
    /^fc[0-9a-f]{2}:/
  ];
  
  return privatePatterns.some(pattern => pattern.test(hostname));
}

/**
 * Validates and sanitizes provider/transform IDs
 */
export function validateId(id: string, fieldName: string): string {
  if (!id || typeof id !== 'string') {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  
  if (!SECURITY_CONFIG.ALLOWED_ID_PATTERN.test(id)) {
    throw new Error(`${fieldName} contains invalid characters`);
  }
  
  if (id.length > 50) {
    throw new Error(`${fieldName} is too long (max 50 characters)`);
  }
  
  return id.trim();
}

/**
 * Validates numeric inputs with bounds checking
 */
export function validateNumber(
  value: string | number, 
  fieldName: string, 
  min: number, 
  max: number
): number {
  const num = typeof value === 'string' ? parseInt(value, 10) : value;
  
  if (isNaN(num)) {
    throw new Error(`${fieldName} must be a valid number`);
  }
  
  if (num < min || num > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}`);
  }
  
  return num;
}

/**
 * Validates cron expressions
 */
export function validateCronExpression(cron: string): string {
  if (!cron || typeof cron !== 'string') {
    throw new Error('Cron expression must be a non-empty string');
  }
  
  if (!SECURITY_CONFIG.ALLOWED_CRON_PATTERN.test(cron)) {
    throw new Error('Invalid cron expression format');
  }
  
  // Basic validation of cron fields
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error('Cron expression must have 5 fields');
  }
  
  return cron.trim();
}

/**
 * Sanitizes comma-separated lists
 */
export function sanitizeCommaSeparatedList(input: string, validator: (item: string) => string): string[] {
  if (!input || typeof input !== 'string') {
    throw new Error('Input must be a non-empty string');
  }
  
  const items = input.split(',').map(item => item.trim()).filter(item => item.length > 0);
  
  if (items.length === 0) {
    throw new Error('At least one item must be provided');
  }
  
  if (items.length > 20) {
    throw new Error('Too many items provided (max 20)');
  }
  
  return items.map(validator);
}

/**
 * Validates environment variables
 */
export function validateEnvironmentVariables(): void {
  const requiredVars = ['PORT', 'REDIS_HOST'];
  
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new Error(`Required environment variable ${varName} is missing`);
    }
  }
  
  // Validate port
  const port = parseInt(process.env['PORT']!, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid port number (1-65535)');
  }
  
  // Validate Redis port
  const redisPort = parseInt(process.env['REDIS_PORT'] || '6379', 10);
  if (isNaN(redisPort) || redisPort < 1 || redisPort > 65535) {
    throw new Error('REDIS_PORT must be a valid port number (1-65535)');
  }
}

/**
 * Creates a secure hash for caching/integrity checking
 */
export function createSecureHash(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Validates file size and content type
 */
export function validateFileContent(buffer: Buffer, maxSize: number, allowedTypes: string[]): void {
  if (buffer.length > maxSize) {
    throw new Error(`File too large: ${buffer.length} bytes (max ${maxSize})`);
  }
  
  // Basic content type detection
  const signature = buffer.slice(0, 16).toString('hex');
  
  // Check for common image signatures
  const imageSignatures = {
    'ffd8ffe': 'image/jpeg',
    '89504e47': 'image/png', 
    '52494646': 'image/webp',
    '000000186674797061766966': 'image/avif'
  };
  
  const detectedType = Object.entries(imageSignatures).find(([sig]) => 
    signature.startsWith(sig)
  )?.[1];
  
  if (!detectedType || !allowedTypes.includes(detectedType)) {
    throw new Error('Invalid or unsupported file type');
  }
}

/**
 * Rate limiting helper
 */
export class RateLimiter {
  private requests = new Map<string, { count: number; resetTime: number }>();
  
  constructor(private windowMs: number, private maxRequests: number) {}
  
  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const key = identifier;
    const current = this.requests.get(key);
    
    if (!current || now > current.resetTime) {
      this.requests.set(key, { count: 1, resetTime: now + this.windowMs });
      return true;
    }
    
    if (current.count >= this.maxRequests) {
      return false;
    }
    
    current.count++;
    return true;
  }
  
  reset(identifier: string): void {
    this.requests.delete(identifier);
  }
}

/**
 * Security headers for HTTP responses
 */
export const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};
