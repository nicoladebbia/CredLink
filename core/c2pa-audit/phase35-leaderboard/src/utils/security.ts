/**
 * Phase 35 Leaderboard - Security Utilities
 * Comprehensive security validation and sanitization
 */

import { createHash } from 'crypto';
import { URL } from 'url';

// Security configuration
export const SECURITY_CONFIG = {
  // URL validation
  ALLOWED_PROTOCOLS: ['https:', 'http:'],
  ALLOWED_DOMAINS: [
    'opensource.contentauthenticity.org',
    'c2pa.org',
    'spec.c2pa.org',
    'github.com',
    'cloudflare.com',
    'fastly.com',
    'akamai.com',
    'cloudinary.com',
    'imgix.com',
    'wordpress.org',
    'shopify.com'
  ],
  BLOCKED_SUBDOMAINS: ['localhost', '127.0.0.1', '0.0.0.0'],
  
  // Input validation
  MAX_URL_LENGTH: 2048,
  MAX_HEADER_LENGTH: 8192,
  MAX_CONTENT_LENGTH: 50 * 1024 * 1024, // 50MB
  
  // Rate limiting
  RATE_LIMIT_WINDOW: 3600000, // 1 hour
  MAX_REQUESTS_PER_WINDOW: 1000,
  
  // Security headers
  SECURITY_HEADERS: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'nonce-{nonce}'; style-src 'self' 'nonce-{nonce}'; img-src 'self' data: https:; font-src 'self' https:; connect-src 'self' https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none';"
  },
  
  // Allowed patterns
  ALLOWED_ID_PATTERN: /^[a-zA-Z0-9_-]{1,64}$/,
  ALLOWED_VENDOR_ID_PATTERN: /^[a-z0-9-]{1,32}$/,
  ALLOWED_RUN_ID_PATTERN: /^run-[0-9]{13}-[a-z0-9]{9}$/,
  ALLOWED_CORRECTION_ID_PATTERN: /^correction-[0-9]{13}-[a-z0-9]{9}$/,
  
  // Dangerous patterns to block
  DANGEROUS_PATTERNS: [
    /javascript:/i,
    /data:script/i,
    /vbscript:/i,
    /onload=/i,
    /onerror=/i,
    /onclick=/i,
    /onmouseover=/i,
    /onfocus=/i,
    /onblur=/i,
    /onchange=/i,
    /onsubmit=/i,
    /<script/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /<link/i,
    /<meta/i,
    /eval\(/i,
    /exec\(/i,
    /system\(/i,
    /shell_exec\(/i,
    /passthru\(/i,
    /file_get_contents\(/i,
    /fopen\(/i,
    /require\(/i,
    /include\(/i,
    /\$\(/i,
    /`[^`]*`/i,
    /document\.cookie/i,
    /window\.location/i,
    /document\.write/i,
    /innerHTML/i,
    /outerHTML/i
  ],
  
  // Private IP ranges for SSRF protection
  PRIVATE_IP_RANGES: [
    { start: '10.0.0.0', end: '10.255.255.255' },
    { start: '172.16.0.0', end: '172.31.255.255' },
    { start: '192.168.0.0', end: '192.168.255.255' },
    { start: '127.0.0.0', end: '127.255.255.255' },
    { start: '169.254.0.0', end: '169.254.255.255' }, // Link-local
    { start: '224.0.0.0', end: '239.255.255.255' },  // Multicast
    { start: '::1', end: '::1' },                     // IPv6 localhost
    { start: 'fc00::', end: 'fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff' }, // IPv6 private
    { start: 'fe80::', end: 'febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff' }  // IPv6 link-local
  ]
};

/**
 * Validates and sanitizes URLs with SSRF protection
 */
export function validateUrl(url: string): boolean {
  try {
    // Basic validation
    if (!url || typeof url !== 'string') {
      return false;
    }
    
    if (url.length > SECURITY_CONFIG.MAX_URL_LENGTH) {
      return false;
    }
    
    // Parse URL
    const parsedUrl = new URL(url);
    
    // Check protocol
    if (!SECURITY_CONFIG.ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
      return false;
    }
    
    // Check for dangerous patterns
    for (const pattern of SECURITY_CONFIG.DANGEROUS_PATTERNS) {
      if (pattern.test(url)) {
        return false;
      }
    }
    
    // Check hostname
    const hostname = parsedUrl.hostname.toLowerCase();
    
    // Block private IPs
    if (isPrivateIP(hostname)) {
      return false;
    }
    
    // Block blocked subdomains
    for (const blocked of SECURITY_CONFIG.BLOCKED_SUBDOMAINS) {
      if (hostname.includes(blocked)) {
        return false;
      }
    }
    
    // Allow specific domains or their subdomains
    const allowedDomain = SECURITY_CONFIG.ALLOWED_DOMAINS.some(domain => 
      hostname === domain || hostname.endsWith(`.${domain}`)
    );
    
    if (!allowedDomain) {
      return false;
    }
    
    // Check port restrictions
    if (parsedUrl.port) {
      const port = parseInt(parsedUrl.port, 10);
      if (port < 1 || port > 65535) {
        return false;
      }
      
      // Block privileged ports (except 80, 443)
      if (port < 1024 && port !== 80 && port !== 443) {
        return false;
      }
    }
    
    return true;
    
  } catch (error) {
    return false;
  }
}

/**
 * Validates ID parameters
 */
export function validateId(id: string, pattern: RegExp = SECURITY_CONFIG.ALLOWED_ID_PATTERN): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }
  
  return pattern.test(id);
}

/**
 * Sanitizes input to prevent injection attacks
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  // Remove null bytes and control characters
  let sanitized = input.replace(/[\x00-\x1F\x7F]/g, '');
  
  // Check for dangerous patterns
  for (const pattern of SECURITY_CONFIG.DANGEROUS_PATTERNS) {
    if (pattern.test(sanitized)) {
      throw new Error('Input contains potentially dangerous content');
    }
  }
  
  // Trim whitespace and limit length
  sanitized = sanitized.trim().substring(0, SECURITY_CONFIG.MAX_URL_LENGTH);
  
  return sanitized;
}

/**
 * Validates and sanitizes user input
 */
export function validateAndSanitizeInput(input: string, maxLength: number = 1000): string {
  if (!input || typeof input !== 'string') {
    throw new Error('Invalid input');
  }
  
  if (input.length > maxLength) {
    throw new Error('Input too long');
  }
  
  return sanitizeInput(input);
}

/**
 * Validates vendor ID
 */
export function validateVendorId(vendorId: string): boolean {
  return validateId(vendorId, SECURITY_CONFIG.ALLOWED_VENDOR_ID_PATTERN);
}

/**
 * Validates run ID
 */
export function validateRunId(runId: string): boolean {
  return validateId(runId, SECURITY_CONFIG.ALLOWED_RUN_ID_PATTERN);
}

/**
 * Validates correction ID
 */
export function validateCorrectionId(correctionId: string): boolean {
  return validateId(correctionId, SECURITY_CONFIG.ALLOWED_CORRECTION_ID_PATTERN);
}

/**
 * Sanitizes string content
 */
export function sanitizeContent(content: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }
  
  let sanitized = content;
  
  // Remove dangerous patterns
  for (const pattern of SECURITY_CONFIG.DANGEROUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }
  
  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  
  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  
  // Limit length
  if (sanitized.length > SECURITY_CONFIG.MAX_HEADER_LENGTH) {
    sanitized = sanitized.substring(0, SECURITY_CONFIG.MAX_HEADER_LENGTH);
  }
  
  return sanitized;
}

/**
 * Validates email addresses
 */
export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailPattern.test(email) && email.length <= 254;
}

/**
 * Validates file paths
 */
export function validateFilePath(path: string): boolean {
  if (!path || typeof path !== 'string') {
    return false;
  }
  
  // Prevent path traversal
  if (path.includes('..') || path.includes('~')) {
    return false;
  }
  
  // Check for dangerous characters
  const dangerousChars = /[<>:"|?*]/;
  if (dangerousChars.test(path)) {
    return false;
  }
  
  return true;
}

/**
 * Creates secure hash
 */
export function createSecureHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Validates content length
 */
export function validateContentLength(length: number, maxSize: number = SECURITY_CONFIG.MAX_CONTENT_LENGTH): boolean {
  return typeof length === 'number' && length >= 0 && length <= maxSize;
}

/**
 * Checks if IP address is in private range
 */
export function isPrivateIP(hostname: string): boolean {
  // Remove any port information
  const host = hostname.split(':')[0] || hostname;
  
  // Check IPv4 ranges
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Pattern.test(host)) {
    const ipToNumber = (ip: string): number => {
      return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
    };
    
    const hostNum = ipToNumber(host);
    
    for (const range of SECURITY_CONFIG.PRIVATE_IP_RANGES) {
      if (range.start.includes('.')) {
        const startNum = ipToNumber(range.start);
        const endNum = ipToNumber(range.end);
        
        if (hostNum >= startNum && hostNum <= endNum) {
          return true;
        }
      }
    }
  }
  
  // Check IPv6 ranges (simplified)
  if (host.includes(':')) {
    for (const range of SECURITY_CONFIG.PRIVATE_IP_RANGES) {
      if (range.start.includes(':')) {
        const ipv6Prefix = range.start.split(':')[0];
        if (ipv6Prefix && host.startsWith(ipv6Prefix)) {
          return true;
        }
      }
    }
  }
  
  return false;
}

/**
 * Validates HTTP headers
 */
export function validateHeaders(headers: Record<string, string>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  for (const [key, value] of Object.entries(headers)) {
    // Check header name
    if (!/^[a-zA-Z0-9-]+$/.test(key)) {
      errors.push(`Invalid header name: ${key}`);
      continue;
    }
    
    // Check header value
    if (!value || typeof value !== 'string') {
      errors.push(`Invalid header value for: ${key}`);
      continue;
    }
    
    if (value.length > SECURITY_CONFIG.MAX_HEADER_LENGTH) {
      errors.push(`Header too long: ${key}`);
    }
    
    // Check for dangerous patterns
    for (const pattern of SECURITY_CONFIG.DANGEROUS_PATTERNS) {
      if (pattern.test(value)) {
        errors.push(`Dangerous content in header ${key}`);
        break;
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates JSON content
 */
export function validateJsonContent(content: string, maxSize: number = SECURITY_CONFIG.MAX_CONTENT_LENGTH): { valid: boolean; data?: any; error?: string } {
  try {
    if (content.length > maxSize) {
      return { valid: false, error: 'Content too large' };
    }
    
    const data = JSON.parse(content);
    
    // Basic validation to prevent prototype pollution
    if (hasPrototypePollution(data)) {
      return { valid: false, error: 'Invalid JSON structure' };
    }
    
    return { valid: true, data };
  } catch (error) {
    return { valid: false, error: 'Invalid JSON format' };
  }
}

/**
 * Checks for prototype pollution in JSON
 */
function hasPrototypePollution(obj: any): boolean {
  if (obj && typeof obj === 'object') {
    if (obj.hasOwnProperty('__proto__') || obj.hasOwnProperty('constructor') || obj.hasOwnProperty('prototype')) {
      return true;
    }
    
    for (const key in obj) {
      if (hasPrototypePollution(obj[key])) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Rate limiting implementation
 */
export class RateLimiter {
  private requests = new Map<string, { count: number; resetTime: number }>();
  
  constructor(
    private windowMs: number = SECURITY_CONFIG.RATE_LIMIT_WINDOW,
    private maxRequests: number = SECURITY_CONFIG.MAX_REQUESTS_PER_WINDOW
  ) {}
  
  isAllowed(identifier: string): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const key = this.createSecureKey(identifier);
    
    const existing = this.requests.get(key);
    
    if (!existing || now > existing.resetTime) {
      // New window or expired window
      this.requests.set(key, {
        count: 1,
        resetTime: now + this.windowMs
      });
      
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetTime: now + this.windowMs
      };
    }
    
    if (existing.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: existing.resetTime
      };
    }
    
    existing.count++;
    
    return {
      allowed: true,
      remaining: this.maxRequests - existing.count,
      resetTime: existing.resetTime
    };
  }
  
  private createSecureKey(identifier: string): string {
    return createHash('sha256').update(identifier).digest('hex').substring(0, 16);
  }
  
  // Cleanup expired entries
  cleanup(): void {
    const now = Date.now();
    
    for (const [key, data] of this.requests.entries()) {
      if (now > data.resetTime) {
        this.requests.delete(key);
      }
    }
  }
}

/**
 * Validates environment variables
 */
export function validateEnvironmentVariables(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Required variables
  const requiredVars = ['HOST', 'PORT', 'REDIS_HOST'];
  
  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (!value) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }
  
  // Validate HOST
  const host = process.env['HOST'];
  if (host && !validateUrl(`https://${host}`)) {
    errors.push('Invalid HOST value');
  }
  
  // Validate PORT
  const port = process.env['PORT'];
  if (port && (!/^\d+$/.test(port) || parseInt(port) < 1 || parseInt(port) > 65535)) {
    errors.push('Invalid PORT value');
  }
  
  // Validate Redis settings
  const redisPort = process.env['REDIS_PORT'];
  if (redisPort && (!/^\d+$/.test(redisPort) || parseInt(redisPort) < 1 || parseInt(redisPort) > 65535)) {
    errors.push('Invalid REDIS_PORT value');
  }
  
  const redisDb = process.env['REDIS_DB'];
  if (redisDb && (!/^\d+$/.test(redisDb) || parseInt(redisDb) < 0)) {
    errors.push('Invalid REDIS_DB value');
  }
  
  // Validate optional variables
  const logLevel = process.env['LOG_LEVEL'];
  if (logLevel && !['error', 'warn', 'info', 'debug'].includes(logLevel)) {
    errors.push('Invalid LOG_LEVEL value');
  }
  
  // Security warnings
  if (process.env['NODE_ENV'] === 'production') {
    const redisHost = process.env['REDIS_HOST'];
    if (redisHost && (redisHost === 'localhost' || redisHost.startsWith('127.'))) {
      errors.push('Using localhost Redis in production is not recommended');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Content Security Policy generator
 */
export function generateCSP(nonce?: string): string {
  const baseCSP = SECURITY_CONFIG.SECURITY_HEADERS['Content-Security-Policy'];
  
  if (nonce) {
    return baseCSP.replace("script-src 'self' 'unsafe-inline'", `script-src 'self' 'unsafe-inline' 'nonce-${nonce}'`);
  }
  
  return baseCSP;
}

/**
 * Security headers middleware
 */
export function getSecurityHeaders(nonce?: string): Record<string, string> {
  const headers = { ...SECURITY_CONFIG.SECURITY_HEADERS };
  
  if (nonce) {
    headers['Content-Security-Policy'] = generateCSP(nonce);
  }
  
  return headers;
}
