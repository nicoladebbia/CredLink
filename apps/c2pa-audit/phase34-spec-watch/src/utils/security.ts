/**
 * Security Utilities - Phase 34 Spec Watch
 * Comprehensive security validation and sanitization functions
 */

import { createHash } from 'crypto';
import { URL } from 'url';

// Security configuration with maximum hardening
export const SECURITY_CONFIG = {
  // Allowed domains for external requests
  ALLOWED_DOMAINS: [
    'c2pa.org',
    'spec.c2pa.org',
    'opensource.contentauthenticity.org',
    'contentauthenticity.org',
    'github.com',
    'api.github.com',
    'theverge.com'
  ],
  
  // Maximum values for validation
  MAX_CONTENT_SIZE: 52428800, // 50MB
  MAX_RESPONSE_SIZE: 10485760, // 10MB
  MAX_TIMEOUT: 300000, // 5 minutes
  MAX_REDIRECTS: 5,
  MAX_URL_LENGTH: 2048,
  MAX_HEADER_LENGTH: 8192,
  
  // Input sanitization patterns
  ALLOWED_ID_PATTERN: /^[a-zA-Z0-9_-]{1,64}$/,
  ALLOWED_GITHUB_REPO_PATTERN: /^[a-zA-Z0-9_.-]{1,39}\/[a-zA-Z0-9_.-]{1,100}$/,
  ALLOWED_API_KEY_PATTERN: /^[a-zA-Z0-9+/=_-]{32,}$/,
  
  // Rate limiting with strict limits
  RATE_LIMIT_WINDOW: 3600000, // 1 hour
  MAX_REQUESTS_PER_WINDOW: 1000,
  MAX_RATE_LIMIT_ENTRIES: 10000,
  
  // Security headers configuration
  SECURITY_HEADERS: {
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin'
  }
};

/**
 * Validates and sanitizes a URL to prevent SSRF attacks with maximum protection
 */
export function validateUrl(url: string, allowedDomains: string[] = SECURITY_CONFIG.ALLOWED_DOMAINS): string {
  // Input validation
  if (!url || typeof url !== 'string') {
    throw new Error('URL must be a non-empty string');
  }
  
  // Length validation
  if (url.length > SECURITY_CONFIG.MAX_URL_LENGTH) {
    throw new Error(`URL too long: ${url.length} characters (max ${SECURITY_CONFIG.MAX_URL_LENGTH})`);
  }
  
  // Remove potential whitespace and control characters
  const sanitizedUrl = url.replace(/[\x00-\x1F\x7F]/g, '').trim();
  
  try {
    const parsedUrl = new URL(sanitizedUrl);
    
    // Only allow HTTPS and HTTP
    if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
      throw new Error('Only HTTPS and HTTP URLs are allowed');
    }
    
    // Validate port ranges
    if (parsedUrl.port) {
      const port = parseInt(parsedUrl.port, 10);
      if (port < 1 || port > 65535) {
        throw new Error('Invalid port number');
      }
      // Block privileged ports
      if (port < 80 || (port > 80 && port < 443) || (port > 443 && port < 1024)) {
        throw new Error('Privileged ports are not allowed');
      }
    }
    
    // Check against allowed domains
    const isAllowed = allowedDomains.some(domain => 
      parsedUrl.hostname === domain || parsedUrl.hostname?.endsWith(`.${domain}`)
    );
    
    if (!isAllowed) {
      throw new Error(`Domain ${parsedUrl.hostname} is not in allowed list`);
    }
    
    // Prevent private IP access with comprehensive detection
    if (isPrivateIp(parsedUrl.hostname)) {
      throw new Error('Private IP addresses are not allowed');
    }
    
    // Validate URL structure
    if (!parsedUrl.pathname) {
      throw new Error('URL must have a valid path');
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
  
  // Comprehensive private IP detection
  const privatePatterns = [
    // IPv4 private ranges
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^127\./,
    /^169\.254\./,
    /^0\./,
    /^255\.255\.255\.255/,
    
    // IPv6 private ranges
    /^::1$/,
    /^fc[0-9a-f]{2}:/i,
    /^fe80::/i,
    /^ff[0-9a-f]{2}:/i, // multicast
    /^2001:db8::/i, // documentation
    /^2001:0:/i, // TEREDO
    /^2002:/i, // 6to4
    
    // Localhost variations
    /^localhost$/i,
    /^0\.0\.0\.0$/,
    /^::$/,
    
    // Link-local
    /^169\.254\./,
    /^fe80::/i,
    
    // Test networks
    /^192\.0\.2\./,
    /^198\.51\.100\./,
    /^203\.0\.113\./,
  ];
  
  return privatePatterns.some(pattern => pattern.test(hostname));
}

/**
 * Validates and sanitizes IDs with maximum security
 */
export function validateId(id: string, fieldName: string): string {
  // Input validation
  if (!id || typeof id !== 'string') {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  
  // Length validation
  if (id.length === 0 || id.length > 64) {
    throw new Error(`${fieldName} must be between 1 and 64 characters`);
  }
  
  // Remove control characters and whitespace
  const sanitizedId = id.replace(/[\x00-\x1F\x7F\s]/g, '');
  
  // Pattern validation
  if (!SECURITY_CONFIG.ALLOWED_ID_PATTERN.test(sanitizedId)) {
    throw new Error(`${fieldName} contains invalid characters. Only alphanumeric characters, underscores, and hyphens are allowed`);
  }
  
  // Prevent common attack patterns
  const dangerousPatterns = [
    /^(admin|root|system|test|debug|null|undefined|true|false)$/i,
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i, // Windows reserved names
    /^\./, // Hidden files
    /\.$/, // Trailing dots
    /^-+/, // Leading hyphens (command line flags)
    /--+/, // Multiple consecutive hyphens
  ];
  
  if (dangerousPatterns.some(pattern => pattern.test(sanitizedId))) {
    throw new Error(`${fieldName} contains reserved or dangerous patterns`);
  }
  
  return sanitizedId;
}

/**
 * Validates GitHub repository format
 */
export function validateGitHubRepo(repo: string): string {
  if (!repo || typeof repo !== 'string') {
    throw new Error('Repository must be a non-empty string');
  }
  
  if (!SECURITY_CONFIG.ALLOWED_GITHUB_REPO_PATTERN.test(repo)) {
    throw new Error('Invalid GitHub repository format (expected: owner/repo)');
  }
  
  return repo.trim();
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
 * Sanitizes content to prevent injection attacks
 */
export function sanitizeContent(content: string, maxLength: number = SECURITY_CONFIG.MAX_CONTENT_SIZE): string {
  if (!content || typeof content !== 'string') {
    throw new Error('Content must be a non-empty string');
  }
  
  if (content.length > maxLength) {
    throw new Error(`Content too large: ${content.length} bytes (max ${maxLength})`);
  }
  
  // Comprehensive sanitization to prevent XSS and injection attacks
  let sanitized = content
    // Remove all script tags and content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove all iframe tags and content
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    // Remove all object tags
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    // Remove all embed tags
    .replace(/<embed\b[^>]*>/gi, '')
    // Remove all form tags
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '')
    // Remove all input tags
    .replace(/<input\b[^>]*>/gi, '')
    // Remove dangerous protocols
    .replace(/javascript:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/file:/gi, '')
    .replace(/ftp:/gi, '')
    // Remove all event handlers
    .replace(/on\w+\s*=/gi, '')
    // Remove style tags with potential CSS injection
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Remove meta tags
    .replace(/<meta\b[^>]*>/gi, '')
    // Remove link tags
    .replace(/<link\b[^>]*>/gi, '')
    // Remove HTML comments that might hide scripts
    .replace(/<!--[\s\S]*?-->/g, '')
    // Remove base64 encoded content that might contain malicious code
    .replace(/(?:data:|base64,)[\w\/+=]+/gi, '')
    // Remove potential SQL injection patterns
    .replace(/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi, '')
    // Remove shell command patterns
    .replace(/(\$|\`|&&|\|\||;|&|\||>|<)/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
  
  // Additional validation for remaining content
  if (/<[^>]*>/.test(sanitized)) {
    throw new Error('Content contains potentially dangerous HTML tags');
  }
  
  if (sanitized.length !== content.length && content.length - sanitized.length > 1000) {
    throw new Error('Content contains excessive potentially dangerous elements');
  }
  
  return sanitized;
}

/**
 * Creates a secure hash for content integrity checking
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
  
  // Check for common file signatures
  const fileSignatures = {
    '25504446': 'application/pdf', // PDF
    '3c217469746c653e': 'text/html', // HTML title tag
    'efbbbf': 'text/utf-8', // UTF-8 BOM
  };
  
  const detectedType = Object.entries(fileSignatures).find(([sig]) => 
    signature.startsWith(sig)
  )?.[1];
  
  if (!detectedType || !allowedTypes.includes(detectedType)) {
    throw new Error('Invalid or unsupported file type');
  }
}

/**
 * Rate limiting helper with maximum memory protection and performance optimization
 */
export class RateLimiter {
  private requests = new Map<string, { count: number; resetTime: number; lastAccess: number; blockedUntil?: number }>();
  private readonly maxEntries: number;
  private readonly cleanupInterval: number;
  private cleanupTimer: NodeJS.Timeout;
  private totalRequests = 0; // Track total requests for system-wide limits
  private systemResetTime = 0;
  
  constructor(private windowMs: number, private maxRequests: number, maxEntries?: number) {
    this.maxEntries = maxEntries || SECURITY_CONFIG.MAX_RATE_LIMIT_ENTRIES;
    this.cleanupInterval = Math.min(60000, this.windowMs / 10); // Adaptive cleanup interval
    
    // Start cleanup timer to prevent memory leaks
    this.cleanupTimer = setInterval(() => this.cleanup(), this.cleanupInterval);
    
    // Ensure timer doesn't keep process alive
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
    
    // Initialize system-wide tracking
    this.systemResetTime = Date.now() + this.windowMs;
  }
  
  isAllowed(identifier: string): boolean {
    const now = Date.now();
    
    // System-wide rate limiting check
    if (now > this.systemResetTime) {
      this.totalRequests = 0;
      this.systemResetTime = now + this.windowMs;
    }
    
    // System-wide protection: if we're getting too many requests overall
    if (this.totalRequests > this.maxRequests * 100) { // 100x normal limit as safety
      return false;
    }
    
    const key = this.createSecureKey(identifier);
    
    // Aggressive memory protection - cleanup if approaching limit
    if (this.requests.size >= this.maxEntries * 0.8) {
      this.cleanup();
    }
    
    const current = this.requests.get(key);
    
    // Check if identifier is temporarily blocked due to excessive requests
    if (current && current.blockedUntil && now < current.blockedUntil) {
      return false;
    }
    
    if (!current || now > current.resetTime) {
      this.requests.set(key, { 
        count: 1, 
        resetTime: now + this.windowMs,
        lastAccess: now
      });
      this.totalRequests++;
      return true;
    }
    
    // Update last access time
    current.lastAccess = now;
    
    if (current.count >= this.maxRequests) {
      // Temporary block for excessive requests
      current.blockedUntil = now + (this.windowMs * 2); // Block for 2x the window
      return false;
    }
    
    current.count++;
    this.totalRequests++;
    return true;
  }
  
  private createSecureKey(identifier: string): string {
    // Hash identifier to prevent key length attacks and ensure consistency
    if (!identifier || typeof identifier !== 'string') {
      return 'invalid';
    }
    
    // Normalize identifier
    const normalized = identifier.toLowerCase().trim();
    
    // Create hash with salt for additional security
    return createHash('sha256')
      .update(normalized + 'rate-limiter-salt')
      .digest('hex')
      .substring(0, 16);
  }
  
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    // Find expired entries
    for (const [key, data] of this.requests.entries()) {
      if (now > data.resetTime || 
          (now - data.lastAccess) > this.windowMs * 2 ||
          (data.blockedUntil && now > data.blockedUntil && now - data.blockedUntil > this.windowMs)) {
        keysToDelete.push(key);
      }
    }
    
    // Remove expired entries
    for (const key of keysToDelete) {
      this.requests.delete(key);
    }
    
    // If still too many entries, remove oldest by last access time
    if (this.requests.size > this.maxEntries / 2) {
      const sortedEntries = Array.from(this.requests.entries())
        .sort(([, a], [, b]) => a.lastAccess - b.lastAccess);
      
      const toDelete = sortedEntries.slice(0, Math.floor(this.requests.size / 2));
      for (const [key] of toDelete) {
        this.requests.delete(key);
      }
    }
  }
  
  // Get statistics for monitoring
  getStats(): { activeEntries: number; totalRequests: number; memoryUsage: number } {
    return {
      activeEntries: this.requests.size,
      totalRequests: this.totalRequests,
      memoryUsage: Math.round(this.requests.size * 200 / 1024) // Rough estimate in KB
    };
  }
  
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.requests.clear();
    this.totalRequests = 0;
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

/**
 * Validates environment variables with maximum security
 */
export function validateEnvironmentVariables(): void {
  const requiredVars = ['GITHUB_TOKEN', 'REDIS_HOST', 'API_KEY'];
  
  // Check for required variables
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new Error(`Required environment variable ${varName} is missing`);
    }
  }
  
  // Validate GitHub token format with comprehensive checks
  const githubToken = process.env['GITHUB_TOKEN']!;;
  if (!githubToken.startsWith('ghp_') && !githubToken.startsWith('github_pat_')) {
    throw new Error('Invalid GitHub token format. Must start with "ghp_" or "github_pat_"');
  }
  
  if (githubToken.length < 40) {
    throw new Error('GitHub token appears to be too short');
  }
  
  if (githubToken.includes(' ') || githubToken.includes('\n') || githubToken.includes('\r')) {
    throw new Error('GitHub token contains invalid whitespace characters');
  }
  
  // Validate API key format and strength with enhanced checks
  const apiKey = process.env['API_KEY']!;;
  if (apiKey.length < 32) {
    throw new Error('API key must be at least 32 characters long for security');
  }
  
  if (apiKey.length > 256) {
    throw new Error('API key is excessively long (max 256 characters)');
  }
  
  if (!SECURITY_CONFIG.ALLOWED_API_KEY_PATTERN.test(apiKey)) {
    throw new Error('API key contains invalid characters. Only alphanumeric, +, /, =, _, and - are allowed');
  }
  
  // Check for weak API keys
  const weakPatterns = [
    /^(.)\1{31,}$/, // Repeated characters
    /^(test|demo|sample|example|default|admin|root)/i, // Common weak prefixes
    /^(123|abc|password|secret|key)/i, // Common weak patterns
  ];
  
  if (weakPatterns.some(pattern => pattern.test(apiKey))) {
    throw new Error('API key appears to be weak or insecure');
  }
  
  // Validate Redis configuration with comprehensive checks
  const redisHost = process.env['REDIS_HOST']!;;
  if (redisHost.length === 0 || redisHost.length > 253) {
    throw new Error('Redis host must be between 1 and 253 characters');
  }
  
  // Check for suspicious Redis hosts
  const suspiciousHosts = ['0.0.0.0', '127.0.0.1', 'localhost', '::1'];
  if (suspiciousHosts.includes(redisHost.toLowerCase())) {
    console.warn('Warning: Using localhost or loopback address for Redis in production is not recommended');
  }
  
  const redisPort = parseInt(process.env['REDIS_PORT'] || '6379', 10);
  if (isNaN(redisPort) || redisPort < 1 || redisPort > 65535) {
    throw new Error('REDIS_PORT must be a valid port number (1-65535)');
  }
  
  // Block privileged Redis ports
  if (redisPort < 1024 && redisPort !== 6379) {
    throw new Error('Privileged ports are not allowed for Redis');
  }
  
  const redisDb = parseInt(process.env['REDIS_DB'] || '1', 10);
  if (isNaN(redisDb) || redisDb < 0 || redisDb > 15) {
    throw new Error('REDIS_DB must be between 0 and 15');
  }
  
  // Validate optional security variables
  if (process.env['NODE_ENV']) {
    const validEnvs = ['development', 'production', 'test'];
    if (!validEnvs.includes(process.env['NODE_ENV']!)) {
      throw new Error('NODE_ENV must be one of: development, production, test');
    }
  }
  
  if (process.env['LOG_LEVEL']) {
    const validLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
    if (!validLevels.includes(process.env['LOG_LEVEL']!)) {
      throw new Error('LOG_LEVEL must be one of: fatal, error, warn, info, debug, trace');
    }
  }
  
  // Security warnings for development mode
  if (process.env['NODE_ENV'] === 'production') {
    if (redisHost === 'localhost' || redisHost === '127.0.0.1') {
      console.warn('SECURITY WARNING: Using localhost Redis in production environment');
    }
    
    if (apiKey.length < 64) {
      console.warn('SECURITY WARNING: Consider using a longer API key (64+ characters) for production');
    }
  }
}
