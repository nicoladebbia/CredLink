/**
 * Phase 6 - Optimizer Auto-Fallback: Security Validation
 * Input sanitization and security checks
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized: any;
}

export class SecurityValidator {
  private static readonly MAX_ROUTE_LENGTH = 255;
  private static readonly MAX_REASON_LENGTH = 1000;
  private static readonly ALLOWED_ROUTE_PATTERN = /^[a-zA-Z0-9._/-]+$/;
  private static readonly ALLOWED_REASON_PATTERN = /^[a-zA-Z0-9\s._-]+$/;

  // Validate route key
  static validateRoute(route: string): ValidationResult {
    const errors: string[] = [];
    
    if (!route || typeof route !== 'string') {
      errors.push('Route must be a non-empty string');
      return { valid: false, errors, sanitized: 'default' };
    }
    
    if (route.length > this.MAX_ROUTE_LENGTH) {
      errors.push(`Route too long (max ${this.MAX_ROUTE_LENGTH} chars)`);
    }
    
    if (!this.ALLOWED_ROUTE_PATTERN.test(route)) {
      errors.push('Route contains invalid characters');
    }
    
    // Check for path traversal
    if (route.includes('..') || route.includes('~')) {
      errors.push('Route contains path traversal sequences');
    }
    
    // Check for null bytes
    if (route.includes('\0')) {
      errors.push('Route contains null bytes');
    }
    
    const sanitized = route.trim().substring(0, this.MAX_ROUTE_LENGTH);
    
    return {
      valid: errors.length === 0,
      errors,
      sanitized: errors.length === 0 ? sanitized : 'default'
    };
  }

  // Validate break-glass reason
  static validateReason(reason: string): ValidationResult {
    const errors: string[] = [];
    
    if (!reason || typeof reason !== 'string') {
      errors.push('Reason must be a non-empty string');
      return { valid: false, errors, sanitized: 'Manual override' };
    }
    
    if (reason.length > this.MAX_REASON_LENGTH) {
      errors.push(`Reason too long (max ${this.MAX_REASON_LENGTH} chars)`);
    }
    
    if (!this.ALLOWED_REASON_PATTERN.test(reason)) {
      errors.push('Reason contains invalid characters');
    }
    
    // Check for script injection patterns
    const dangerousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /data:text\/html/i
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(reason)) {
        errors.push('Reason contains potentially dangerous content');
        break;
      }
    }
    
    const sanitized = reason.trim()
      .replace(/[<>]/g, '')
      .substring(0, this.MAX_REASON_LENGTH);
    
    return {
      valid: errors.length === 0,
      errors,
      sanitized: errors.length === 0 ? sanitized : 'Sanitized reason'
    };
  }

  // Validate admin token
  static validateToken(token: string, expectedToken: string): ValidationResult {
    const errors: string[] = [];
    
    if (!token || typeof token !== 'string') {
      errors.push('Token is required');
      return { valid: false, errors, sanitized: null };
    }
    
    if (!expectedToken || typeof expectedToken !== 'string') {
      errors.push('Server token not configured');
      return { valid: false, errors, sanitized: null };
    }
    
    // Constant-time comparison to prevent timing attacks
    if (!this.constantTimeEquals(token, expectedToken)) {
      errors.push('Invalid token');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      sanitized: token
    };
  }

  // Validate numeric parameters
  static validateNumber(
    value: any, 
    min: number, 
    max: number, 
    defaultValue: number,
    name: string
  ): ValidationResult {
    const errors: string[] = [];
    
    if (value === null || value === undefined) {
      return { valid: true, errors: [], sanitized: defaultValue };
    }
    
    const num = Number(value);
    
    if (isNaN(num)) {
      errors.push(`${name} must be a number`);
      return { valid: false, errors, sanitized: defaultValue };
    }
    
    if (num < min || num > max) {
      errors.push(`${name} must be between ${min} and ${max}`);
      return { valid: false, errors, sanitized: defaultValue };
    }
    
    return {
      valid: true,
      errors: [],
      sanitized: num
    };
  }

  // Validate URL
  static validateUrl(url: string, allowedDomains: string[] = []): ValidationResult {
    const errors: string[] = [];
    
    try {
      const parsed = new URL(url);
      
      // Only allow HTTPS in production
      if (parsed.protocol !== 'https:') {
        errors.push('Only HTTPS URLs are allowed');
      }
      
      // Check against allowed domains
      if (allowedDomains.length > 0 && !allowedDomains.includes(parsed.hostname)) {
        errors.push('Domain not allowed');
      }
      
      // Check for dangerous protocols in query params
      if (url.includes('javascript:') || url.includes('data:')) {
        errors.push('URL contains dangerous protocols');
      }
      
      return {
        valid: errors.length === 0,
        errors,
        sanitized: parsed.toString()
      };
      
    } catch (error) {
      errors.push('Invalid URL format');
      return { valid: false, errors, sanitized: '' };
    }
  }

  // Sanitize headers
  static sanitizeHeaders(headers: Headers): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const dangerousHeaders = ['cookie', 'authorization', 'proxy-authorization'];
    
    for (const [key, value] of headers.entries()) {
      const lowerKey = key.toLowerCase();
      
      // Skip dangerous headers
      if (dangerousHeaders.includes(lowerKey)) {
        continue;
      }
      
      // Sanitize header value
      if (typeof value === 'string') {
        sanitized[key] = value.replace(/[\r\n]/g, '').substring(0, 1000);
      }
    }
    
    return sanitized;
  }

  // Constant-time string comparison
  private static constantTimeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }

  // Generate secure random token
  static generateSecureToken(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
  }

  // Validate JSON payload
  static validateJson(payload: string, maxSize: number = 1024 * 1024): ValidationResult {
    const errors: string[] = [];
    
    if (!payload || typeof payload !== 'string') {
      errors.push('Payload must be a string');
      return { valid: false, errors, sanitized: null };
    }
    
    if (payload.length > maxSize) {
      errors.push(`Payload too large (max ${maxSize} bytes)`);
    }
    
    try {
      const parsed = JSON.parse(payload);
      
      // Check for dangerous nested objects
      const depth = this.getObjectDepth(parsed);
      if (depth > 10) {
        errors.push('Object nesting too deep');
      }
      
      return {
        valid: errors.length === 0,
        errors,
        sanitized: parsed
      };
      
    } catch (error) {
      errors.push('Invalid JSON format');
      return { valid: false, errors, sanitized: null };
    }
  }

  // Get object depth
  private static getObjectDepth(obj: any, currentDepth: number = 0): number {
    if (typeof obj !== 'object' || obj === null) {
      return currentDepth;
    }
    
    if (currentDepth > 10) {
      return currentDepth;
    }
    
    let maxDepth = currentDepth;
    for (const value of Object.values(obj)) {
      maxDepth = Math.max(maxDepth, this.getObjectDepth(value, currentDepth + 1));
    }
    
    return maxDepth;
  }
}
