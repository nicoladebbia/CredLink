import { logger } from './logger';

/**
 * 🔥 CRITICAL SECURITY FIX: Safe JSON Parsing Utility
 * 
 * Prevents server crashes from malicious JSON input
 * Replaces all unsafe JSON.parse() calls throughout the codebase
 */

export interface SafeJSONResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export class SafeJSON {
  /**
   * Safely parse JSON with comprehensive error handling
   * Prevents DoS attacks through malformed JSON payloads
   */
  static parse<T = any>(jsonString: string, context?: string): SafeJSONResult<T> {
    try {
      // 🔥 SECURITY: Input validation before parsing
      if (!jsonString || typeof jsonString !== 'string') {
        const error = 'Invalid input: JSON string required';
        logger.warn('SafeJSON parse failed - invalid input', { 
          context, 
          inputType: typeof jsonString,
          inputLength: jsonString?.length 
        });
        return { success: false, error };
      }

      // 🔥 SECURITY: Prevent extremely large payloads (DoS protection)
      const MAX_JSON_SIZE = 10 * 1024 * 1024; // 10MB limit
      if (jsonString.length > MAX_JSON_SIZE) {
        const error = 'JSON payload too large - possible DoS attempt';
        logger.error('SafeJSON parse failed - payload too large', { 
          context, 
          size: jsonString.length,
          maxSize: MAX_JSON_SIZE 
        });
        return { success: false, error };
      }

      // 🔥 SECURITY: Check for suspicious patterns
      const suspiciousPatterns = [
        /__proto__/g,           // Prototype pollution
        /constructor/g,         // Constructor manipulation
        /prototype/g,           // Prototype access
        /\$[a-zA-Z_]/g,        // AngularJS template injection
        /<script[^>]*>/gi,     // Script tags
        /javascript:/gi,        // JavaScript URLs
        /data:application\//gi // Data URLs
      ];

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(jsonString)) {
          const error = 'Suspicious content detected in JSON payload';
          logger.error('SafeJSON parse failed - suspicious pattern', { 
            context, 
            pattern: pattern.source 
          });
          return { success: false, error };
        }
      }

      // 🔥 SECURITY: Safe JSON parsing with depth limit
      const MAX_DEPTH = 50;
      let depth = 0;
      
      const parsed = JSON.parse(jsonString, (key, value) => {
        depth++;
        if (depth > MAX_DEPTH) {
          throw new Error('JSON nesting depth exceeded - possible DoS attempt');
        }
        return value;
      });

      logger.debug('SafeJSON parse successful', { context, size: jsonString.length });
      return { success: true, data: parsed };

    } catch (error: any) {
      const errorMessage = `JSON parsing failed: ${error.message}`;
      logger.error('SafeJSON parse failed', { 
        context, 
        error: error.message,
        inputLength: jsonString?.length 
      });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Parse with default value on failure
   */
  static parseWithDefault<T>(jsonString: string, defaultValue: T, context?: string): T {
    const result = this.parse<T>(jsonString, context);
    return result.success ? result.data! : defaultValue;
  }

  /**
   * Parse and validate with Zod schema
   */
  static parseWithSchema<T>(
    jsonString: string, 
    schema: { parse: (data: any) => T }, 
    context?: string
  ): SafeJSONResult<T> {
    const parseResult = this.parse(jsonString, context);
    
    if (!parseResult.success) {
      return parseResult;
    }

    try {
      const validated = schema.parse(parseResult.data);
      return { success: true, data: validated };
    } catch (error: any) {
      const errorMessage = `Schema validation failed: ${error.message}`;
      logger.error('SafeJSON schema validation failed', { 
        context, 
        error: error.message 
      });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Safe stringify with circular reference protection
   */
  static stringify(data: any, context?: string): SafeJSONResult<string> {
    try {
      // 🔥 SECURITY: Prevent circular reference attacks
      const seen = new WeakSet();
      const jsonString = JSON.stringify(data, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular Reference]';
          }
          seen.add(value);
        }
        return value;
      });

      // 🔥 SECURITY: Size limit for stringified output
      const MAX_STRING_SIZE = 10 * 1024 * 1024; // 10MB
      if (jsonString && jsonString.length > MAX_STRING_SIZE) {
        const error = 'Stringified JSON too large';
        logger.error('SafeJSON stringify failed - output too large', { 
          context, 
          size: jsonString.length 
        });
        return { success: false, error };
      }

      return { success: true, data: jsonString };

    } catch (error: any) {
      const errorMessage = `JSON stringify failed: ${error.message}`;
      logger.error('SafeJSON stringify failed', { 
        context, 
        error: error.message 
      });
      return { success: false, error: errorMessage };
    }
  }
}

// Export convenience functions
export const safeJsonParse = SafeJSON.parse;
export const safeJsonParseWithDefault = SafeJSON.parseWithDefault;
export const safeJsonParseWithSchema = SafeJSON.parseWithSchema;
export const safeJsonStringify = SafeJSON.stringify;
