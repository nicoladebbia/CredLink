/**
 * Phase 13 Analytics - Input Validation and Sanitization
 * Critical security utilities for preventing injection attacks
 */

import Joi from 'joi';

/**
 * Enhanced validation and sanitization utilities
 */
// Tenant validation - alphanumeric with hyphens and underscores only
export const tenantSchema = Joi.string()
  .pattern(/^[a-zA-Z0-9_-]+$/)
  .min(1)
  .max(64)
  .required()
  .messages({
    'string.pattern.base': 'Tenant must contain only alphanumeric characters, hyphens, and underscores',
    'string.min': 'Tenant cannot be empty',
    'string.max': 'Tenant cannot exceed 64 characters'
  });

// Route validation - URL path segments only
export const routeSchema = Joi.string()
  .pattern(/^[a-zA-Z0-9/_-]+$/)
  .min(1)
  .max(255)
  .optional()
  .messages({
    'string.pattern.base': 'Route must contain only alphanumeric characters, slashes, hyphens, and underscores',
    'string.min': 'Route cannot be empty',
    'string.max': 'Route cannot exceed 255 characters'
  });

// Incident ID validation - UUID format only
export const incidentIdSchema = Joi.string()
  .pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  .required()
  .messages({
    'string.pattern.base': 'Incident ID must be a valid UUID'
  });

// Period validation - specific allowed values
export const periodSchema = Joi.string()
  .valid('1h', '24h', '7d', '30d')
  .required()
  .messages({
    'any.only': 'Period must be one of: 1h, 24h, 7d, 30d'
  });

// Format validation - CSV or JSON only
export const formatSchema = Joi.string()
  .valid('csv', 'json')
  .default('csv')
  .messages({
    'any.only': 'Format must be either csv or json'
  });

// Window validation - specific time windows
export const windowSchema = Joi.string()
  .valid('5m', '15m', '1h', '24h')
  .default('5m')
  .messages({
    'any.only': 'Window must be one of: 5m, 15m, 1h, 24h'
  });

// Reason validation - text with length limits and sanitization
export const reasonSchema = Joi.string()
  .max(1000)
  .optional()
  .custom((value, helpers) => {
    // CRITICAL: Enhanced HTML/JS injection prevention
    let sanitized = value;
    
    // Remove script tags (including variations)
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gis, '');
    
    // Remove dangerous event handlers and javascript: protocols
    sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
    sanitized = sanitized.replace(/javascript\s*:/gi, '');
    sanitized = sanitized.replace(/vbscript\s*:/gi, '');
    sanitized = sanitized.replace(/data\s*:\s*text\/html/gi, '');
    
    // Remove all HTML tags
    sanitized = sanitized.replace(/<[^>]*>/g, '');
    
    // Remove potentially dangerous characters
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    sanitized = sanitized.trim();
    
    if (sanitized !== value) {
      return helpers.error('string.sanitized');
    }
    
    return sanitized;
  })
  .messages({
    'string.max': 'Reason cannot exceed 1000 characters',
    'string.sanitized': 'Reason contains invalid characters, HTML, or scripts'
  });

// Token validation - JWT token format with DoS protection
export const tokenSchema = Joi.string()
  .max(1024) // CRITICAL: Prevent DoS via extremely long tokens
  .pattern(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/)
  .optional()
  .messages({
    'string.pattern.base': 'Token must be a valid JWT format',
    'string.max': 'Token cannot exceed 1024 characters'
  });

/**
 * Enhanced validation and sanitization utilities
 */
export class RequestValidator {
  /**
   * Validate tenant parameter with enhanced security
   */
  static validateTenant(tenant: string): string {
    if (typeof tenant !== 'string') {
      throw new Error('Tenant must be a string');
    }

    const { error, value } = tenantSchema.validate(tenant);
    if (error) {
      throw new Error(`Invalid tenant: ${error.details[0].message}`);
    }

    // Additional security checks
    if (value.includes('..') || value.includes('/') || value.includes('\\')) {
      throw new Error('Tenant contains invalid path characters');
    }

    return value;
  }

  /**
   * Validate route parameter with enhanced security
   */
  static validateRoute(route?: string): string | undefined {
    if (!route) return undefined;
    
    if (typeof route !== 'string') {
      throw new Error('Route must be a string');
    }

    const { error, value } = routeSchema.validate(route);
    if (error) {
      throw new Error(`Invalid route: ${error.details[0].message}`);
    }

    // Prevent directory traversal
    if (value.includes('..') || value.startsWith('/') || value.includes('\\')) {
      throw new Error('Route contains invalid path characters');
    }

    return value;
  }

  /**
   * Validate incident ID parameter
   */
  static validateIncidentId(incidentId: string): string {
    if (typeof incidentId !== 'string') {
      throw new Error('Incident ID must be a string');
    }

    const { error, value } = incidentIdSchema.validate(incidentId);
    if (error) {
      throw new Error(`Invalid incident ID: ${error.details[0].message}`);
    }

    return value;
  }

  /**
   * Validate period parameter
   */
  static validatePeriod(period: string): string {
    if (typeof period !== 'string') {
      throw new Error('Period must be a string');
    }

    const { error, value } = periodSchema.validate(period);
    if (error) {
      throw new Error(`Invalid period: ${error.details[0].message}`);
    }

    return value;
  }

  /**
   * Validate format parameter
   */
  static validateFormat(format?: string): string {
    if (typeof format !== 'string' && format !== undefined) {
      throw new Error('Format must be a string');
    }

    const { error, value } = formatSchema.validate(format);
    if (error) {
      throw new Error(`Invalid format: ${error.details[0].message}`);
    }

    return value;
  }

  /**
   * Validate window parameter
   */
  static validateWindow(window?: string): string {
    if (typeof window !== 'string' && window !== undefined) {
      throw new Error('Window must be a string');
    }

    const { error, value } = windowSchema.validate(window);
    if (error) {
      throw new Error(`Invalid window: ${error.details[0].message}`);
    }

    return value;
  }

  /**
   * Validate reason parameter with enhanced sanitization
   */
  static validateReason(reason?: string): string | undefined {
    if (!reason) return undefined;
    
    if (typeof reason !== 'string') {
      throw new Error('Reason must be a string');
    }

    const { error, value } = reasonSchema.validate(reason);
    if (error) {
      throw new Error(`Invalid reason: ${error.details[0].message}`);
    }

    return value;
  }

  /**
   * Validate token parameter
   */
  static validateToken(token?: string): string | undefined {
    if (!token) return undefined;
    
    if (typeof token !== 'string') {
      throw new Error('Token must be a string');
    }

    const { error, value } = tokenSchema.validate(token);
    if (error) {
      throw new Error(`Invalid token: ${error.details[0].message}`);
    }

    return value;
  }

  /**
   * Enhanced string sanitization
   */
  static sanitizeString(input: string, maxLength: number = 255): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }

    if (input.length > maxLength) {
      throw new Error(`Input exceeds maximum length of ${maxLength} characters`);
    }

    // Remove null bytes, control characters, and potential injection vectors
    return input
      .replace(/[\x00-\x1F\x7F]/g, '') // Control characters
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Script tags
      .replace(/<[^>]*>/g, '') // All HTML tags
      .replace(/javascript:/gi, '') // JavaScript protocol
      .replace(/vbscript:/gi, '') // VBScript protocol
      .replace(/on\w+\s*=/gi, '') // Event handlers
      .trim();
  }

  /**
   * Enhanced SQL parameter validation
   */
  static validateSQLParam(param: any): string {
    if (param === null || param === undefined) {
      throw new Error('SQL parameter cannot be null or undefined');
    }

    const str = String(param);
    
    // Enhanced SQL injection pattern detection
    const dangerousPatterns = [
      // Basic SQL keywords
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT|TRUNCATE)\b)/i,
      // SQL comments and operators
      /(--|;|\/\*|\*\/|xp_|sp_)/,
      // Boolean-based injection
      /(\bOR\b.*=.*\bOR\b)/i,
      /(\bAND\b.*=.*\bAND\b)/i,
      // Quote-based injection
      /('.*OR.*')|(".*OR.*")/i,
      // Time-based injection
      /(WAITFOR|SLEEP|BENCHMARK)/i,
      // Stored procedures
      /(EXECUTE|EXEC)\s*\(/i,
      // Information schema
      /(INFORMATION_SCHEMA|SYS|MASTER|MSDB)/i,
      // File operations
      /(BULK|OPENROWSET|OPENDATASOURCE)/i
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(str)) {
        throw new Error('Potential SQL injection detected');
      }
    }

    // Additional length validation
    if (str.length > 1000) {
      throw new Error('SQL parameter too long');
    }

    return str;
  }

  /**
   * Validate email address format
   */
  static validateEmail(email: string): string {
    const emailSchema = Joi.string()
      .email()
      .max(254)
      .required()
      .messages({
        'string.email': 'Invalid email format',
        'string.max': 'Email cannot exceed 254 characters'
      });

    const { error, value } = emailSchema.validate(email);
    if (error) {
      throw new Error(`Invalid email: ${error.details[0].message}`);
    }

    return value.toLowerCase();
  }

  /**
   * Validate URL format
   */
  static validateURL(url: string): string {
    const urlSchema = Joi.string()
      .uri()
      .max(2048)
      .required()
      .messages({
        'string.uri': 'Invalid URL format',
        'string.max': 'URL cannot exceed 2048 characters'
      });

    const { error, value } = urlSchema.validate(url);
    if (error) {
      throw new Error(`Invalid URL: ${error.details[0].message}`);
    }

    // Ensure HTTPS in production
    if (process.env.NODE_ENV === 'production' && !value.startsWith('https://')) {
      throw new Error('URL must use HTTPS in production');
    }

    return value;
  }

  /**
   * Validate numeric parameter within range
   */
  static validateNumber(value: any, min: number, max: number, fieldName: string): number {
    const num = Number(value);
    
    if (isNaN(num)) {
      throw new Error(`${fieldName} must be a number`);
    }

    if (num < min || num > max) {
      throw new Error(`${fieldName} must be between ${min} and ${max}`);
    }

    return num;
  }

  /**
   * Validate IP address format
   */
  static validateIP(ip: string): string {
    const ipSchema = Joi.string()
      .ip({ version: ['ipv4', 'ipv6'] })
      .required()
      .messages({
        'string.ip': 'Invalid IP address format'
      });

    const { error, value } = ipSchema.validate(ip);
    if (error) {
      throw new Error(`Invalid IP address: ${error.details[0].message}`);
    }

    return value;
  }
}
