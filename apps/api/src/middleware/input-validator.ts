import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { safeJsonParse } from '../utils/safe-json';
import { validatePath } from '../utils/path-validator';

/**
 * 🔥 CRITICAL SECURITY FIX: Centralized Input Validation Middleware
 * 
 * Prevents injection attacks, validates all user input
 * Replaces unsafe direct req.body/params/query usage
 */

export interface ValidationRule {
  type: 'string' | 'number' | 'boolean' | 'email' | 'url' | 'uuid' | 'json' | 'array' | 'object';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  allowedValues?: string[];
  sanitize?: boolean;
}

export interface ValidationSchema {
  body?: Record<string, ValidationRule>;
  params?: Record<string, ValidationRule>;
  query?: Record<string, ValidationRule>;
}

export class InputValidator {
  /**
   * Main validation middleware factory
   */
  static validate(schema: ValidationSchema) {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        // 🔥 SECURITY: Validate request body
        if (schema.body) {
          const bodyResult = this.validateObject(req.body, schema.body, 'body');
          if (!bodyResult.valid) {
            logger.warn('Request body validation failed', { 
              errors: bodyResult.errors,
              ip: req.ip,
              userAgent: req.get('User-Agent')
            });
            res.status(400).json({
              error: 'Invalid request body',
              details: bodyResult.errors
            });
            return;
          }
          // Replace with validated data
          Object.assign(req.body, bodyResult.data);
        }

        // 🔥 SECURITY: Validate request parameters
        if (schema.params) {
          const paramsResult = this.validateObject(req.params, schema.params, 'params');
          if (!paramsResult.valid) {
            logger.warn('Request params validation failed', { 
              errors: paramsResult.errors,
              ip: req.ip,
              path: req.path
            });
            res.status(400).json({
              error: 'Invalid request parameters',
              details: paramsResult.errors
            });
            return;
          }
          Object.assign(req.params, paramsResult.data);
        }

        // 🔥 SECURITY: Validate query parameters
        if (schema.query) {
          const queryResult = this.validateObject(req.query, schema.query, 'query');
          if (!queryResult.valid) {
            logger.warn('Request query validation failed', { 
              errors: queryResult.errors,
              ip: req.ip,
              path: req.path
            });
            res.status(400).json({
              error: 'Invalid query parameters',
              details: queryResult.errors
            });
            return;
          }
          Object.assign(req.query, queryResult.data);
        }

        logger.debug('Input validation successful', { 
          path: req.path,
          method: req.method,
          ip: req.ip
        });
        next();

      } catch (error: any) {
        logger.error('Input validation middleware error', { 
          error: error.message,
          path: req.path,
          ip: req.ip
        });
        res.status(500).json({
          error: 'Validation error occurred'
        });
      }
    };
  }

  /**
   * Validates an object against a schema
   */
  private static validateObject(
    obj: any, 
    schema: Record<string, ValidationRule>, 
    context: string
  ): { valid: boolean; data?: any; errors: string[] } {
    const errors: string[] = [];
    const validated: any = {};

    for (const [key, rule] of Object.entries(schema)) {
      const value = obj?.[key];

      // 🔥 SECURITY: Check required fields
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`${context}.${key} is required`);
        continue;
      }

      // Skip validation if not required and value is empty
      if (!rule.required && (value === undefined || value === null || value === '')) {
        continue;
      }

      // 🔥 SECURITY: Type-specific validation
      const validationResult = this.validateValue(value, rule, `${context}.${key}`);
      if (!validationResult.valid) {
        errors.push(...validationResult.errors);
      } else {
        validated[key] = validationResult.value;
      }
    }

    return {
      valid: errors.length === 0,
      data: validated,
      errors
    };
  }

  /**
   * Validates a single value against a rule
   */
  private static validateValue(
    value: any, 
    rule: ValidationRule, 
    fieldPath: string
  ): { valid: boolean; value?: any; errors: string[] } {
    const errors: string[] = [];

    try {
      switch (rule.type) {
        case 'string':
          if (typeof value !== 'string') {
            errors.push(`${fieldPath} must be a string`);
            break;
          }

          // 🔥 SECURITY: Length validation
          if (rule.minLength && value.length < rule.minLength) {
            errors.push(`${fieldPath} must be at least ${rule.minLength} characters`);
          }
          if (rule.maxLength && value.length > rule.maxLength) {
            errors.push(`${fieldPath} must be at most ${rule.maxLength} characters`);
          }

          // 🔥 SECURITY: Pattern validation
          if (rule.pattern && !rule.pattern.test(value)) {
            errors.push(`${fieldPath} format is invalid`);
          }

          // 🔥 SECURITY: Allowed values validation
          if (rule.allowedValues && !rule.allowedValues.includes(value)) {
            errors.push(`${fieldPath} must be one of: ${rule.allowedValues.join(', ')}`);
          }

          // 🔥 SECURITY: Sanitization
          let sanitizedValue = value;
          if (rule.sanitize) {
            sanitizedValue = this.sanitizeString(value);
          }

          return { valid: errors.length === 0, value: sanitizedValue, errors };

        case 'number':
          const numValue = Number(value);
          if (isNaN(numValue)) {
            errors.push(`${fieldPath} must be a number`);
            break;
          }

          if (rule.min !== undefined && numValue < rule.min) {
            errors.push(`${fieldPath} must be at least ${rule.min}`);
          }
          if (rule.max !== undefined && numValue > rule.max) {
            errors.push(`${fieldPath} must be at most ${rule.max}`);
          }

          return { valid: errors.length === 0, value: numValue, errors };

        case 'boolean':
          if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
            errors.push(`${fieldPath} must be a boolean`);
            break;
          }
          const boolValue = typeof value === 'boolean' ? value : value === 'true';
          return { valid: errors.length === 0, value: boolValue, errors };

        case 'email':
          const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (typeof value !== 'string' || !emailPattern.test(value)) {
            errors.push(`${fieldPath} must be a valid email address`);
            break;
          }
          return { valid: errors.length === 0, value: value.toLowerCase(), errors };

        case 'url':
          try {
            const url = new URL(value);
            if (!['http:', 'https:'].includes(url.protocol)) {
              errors.push(`${fieldPath} must use HTTP or HTTPS protocol`);
              break;
            }
            return { valid: errors.length === 0, value: url.toString(), errors };
          } catch {
            errors.push(`${fieldPath} must be a valid URL`);
            break;
          }

        case 'uuid':
          const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          if (typeof value !== 'string' || !uuidPattern.test(value)) {
            errors.push(`${fieldPath} must be a valid UUID`);
            break;
          }
          return { valid: errors.length === 0, value: value.toLowerCase(), errors };

        case 'json':
          if (typeof value !== 'string') {
            errors.push(`${fieldPath} must be a JSON string`);
            break;
          }
          const jsonResult = safeJsonParse(value, fieldPath);
          if (!jsonResult.success) {
            errors.push(`${fieldPath} contains invalid JSON: ${jsonResult.error}`);
            break;
          }
          return { valid: errors.length === 0, value: jsonResult.data, errors };

        case 'array':
          if (!Array.isArray(value)) {
            errors.push(`${fieldPath} must be an array`);
            break;
          }
          if (rule.minLength && value.length < rule.minLength) {
            errors.push(`${fieldPath} must have at least ${rule.minLength} items`);
          }
          if (rule.maxLength && value.length > rule.maxLength) {
            errors.push(`${fieldPath} must have at most ${rule.maxLength} items`);
          }
          return { valid: errors.length === 0, value: value, errors };

        case 'object':
          if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            errors.push(`${fieldPath} must be an object`);
            break;
          }
          return { valid: errors.length === 0, value: value, errors };

        default:
          errors.push(`${fieldPath} has unknown validation type: ${rule.type}`);
      }
    } catch (error: any) {
      errors.push(`${fieldPath} validation error: ${error.message}`);
    }

    return { valid: false, errors };
  }

  /**
   * Sanitizes string values to prevent XSS
   */
  private static sanitizeString(text: string): string {
    return text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
      .replace(/javascript:/gi, '')
      .replace(/vbscript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  }

  /**
   * Common validation schemas
   */
  static readonly SCHEMAS = {
    // 🔥 SECURITY: Proof ID validation
    PROOF_ID: {
      params: {
        proofId: {
          type: 'string' as const,
          required: true,
          pattern: /^[a-zA-Z0-9_-]+$/,
          maxLength: 100
        }
      }
    },

    // 🔥 SECURITY: API Key validation
    API_KEY_ID: {
      params: {
        keyId: {
          type: 'string' as const,
          required: true,
          pattern: /^[a-zA-Z0-9_-]+$/,
          maxLength: 100
        }
      }
    },

    // 🔥 SECURITY: SSO validation
    SSO_STRATEGY: {
      query: {
        strategy: {
          type: 'string' as const,
          required: false,
          allowedValues: ['google', 'microsoft', 'github', 'saml'],
          maxLength: 50
        }
      }
    },

    // 🔥 SECURITY: Pagination validation
    PAGINATION: {
      query: {
        limit: {
          type: 'number' as const,
          required: false,
          min: 1,
          max: 100
        },
        offset: {
          type: 'number' as const,
          required: false,
          min: 0
        }
      }
    },

    // 🔥 SECURITY: Custom assertions validation
    CUSTOM_ASSERTIONS: {
      body: {
        customAssertions: {
          type: 'json' as const,
          required: false,
          maxLength: 10000
        }
      }
    }
  };
}

// Export convenience functions
export const validateInput = InputValidator.validate;
export const { SCHEMAS } = InputValidator;
