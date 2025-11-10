/**
 * Phase 36 Billing - Validation Middleware
 * Request validation and sanitization
 */

import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Validation middleware for request sanitization and basic validation
 */
export async function validationMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    // CRITICAL: Validate request method
    if (!request.method || typeof request.method !== 'string') {
      reply.status(400).send({
        code: 'INVALID_METHOD',
        message: 'Invalid request method',
      });
      return;
    }

    // Validate content type for POST/PUT requests
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const contentType = request.headers['content-type'];
      
      if (!contentType || typeof contentType !== 'string') {
        reply.status(400).send({
          code: 'INVALID_CONTENT_TYPE',
          message: 'Content-Type header is required',
        });
        return;
      }
      
      // CRITICAL: Strict content type validation
      const validContentTypes = [
        'application/json',
        'application/json; charset=utf-8',
        'multipart/form-data',
        'multipart/form-data; charset=utf-8'
      ];
      
      // CRITICAL: Strict content type validation - exact match only
      const isValidContentType = validContentTypes.some(valid => 
        contentType.toLowerCase().trim() === valid.toLowerCase().trim()
      );
      
      if (!isValidContentType) {
        reply.status(400).send({
          code: 'INVALID_CONTENT_TYPE',
          message: 'Content-Type must be application/json or multipart/form-data',
        });
        return;
      }
    }

    // Validate request size
    const contentLength = request.headers['content-length'];
    if (contentLength) {
      const size = parseInt(contentLength);
      if (isNaN(size) || size < 0) {
        reply.status(400).send({
          code: 'INVALID_CONTENT_LENGTH',
          message: 'Invalid Content-Length header',
        });
        return;
      }
      
      if (size > 10 * 1024 * 1024) { // 10MB limit
        reply.status(413).send({
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request payload too large (max 10MB)',
        });
        return;
      }
    }

    // CRITICAL: Sanitize URL parameters with enhanced security
    if (request.params) {
      for (const [key, value] of Object.entries(request.params)) {
        if (typeof value === 'string') {
          // Remove path traversal, injection attempts, and dangerous characters
          let sanitized = value
            .replace(/\.\./g, '') // Path traversal
            .replace(/\//g, '') // Path separators
            .replace(/\\/g, '') // Backslashes
            .replace(/%2e%2e/gi, '') // Encoded path traversal
            .replace(/%2f/gi, '') // Encoded forward slash
            .replace(/%5c/gi, '') // Encoded backslash
            .replace(/[<>]/g, '') // HTML tags
            .replace(/["']/g, '') // Quotes
            .replace(/[;&|`$(){}[\]]/g, '') // Command injection
            .trim();
          
          // Validate parameter length
          if (sanitized.length > 1000) {
            reply.status(400).send({
              code: 'PARAMETER_TOO_LONG',
              message: `Parameter ${key} exceeds maximum length`,
            });
            return;
          }
          
          (request.params as any)[key] = sanitized;
        }
      }
    }

    // CRITICAL: Enhanced query parameter validation
    if (request.query) {
      const query = request.query as any;
      
      // Validate limit parameter
      if (query.limit) {
        const limit = parseInt(query.limit);
        if (isNaN(limit) || limit < 1 || limit > 1000) {
          reply.status(400).send({
            code: 'INVALID_LIMIT',
            message: 'Limit must be between 1 and 1000',
          });
          return;
        }
      }
      
      // Validate page parameter
      if (query.page) {
        const page = parseInt(query.page);
        if (isNaN(page) || page < 1) {
          reply.status(400).send({
            code: 'INVALID_PAGE',
            message: 'Page must be a positive integer',
          });
          return;
        }
      }
      
      // Sanitize all string query parameters
      for (const [key, value] of Object.entries(query)) {
        if (typeof value === 'string') {
          // Remove dangerous characters
          let sanitized = value
            .replace(/[<>]/g, '') // HTML tags
            .replace(/["']/g, '') // Quotes
            .replace(/[;&|`$(){}[\]]/g, '') // Command injection
            .replace(/--/g, '') // SQL comments
            .replace(/\/\*/g, '') // SQL comments
            .replace(/\*\//g, '') // SQL comments
            .trim();
          
          // Validate query parameter length
          if (sanitized.length > 500) {
            reply.status(400).send({
              code: 'QUERY_PARAMETER_TOO_LONG',
              message: `Query parameter ${key} exceeds maximum length`,
            });
            return;
          }
          
          query[key] = sanitized;
        }
      }
    }

  } catch (error) {
    console.error('Validation middleware error:', error);
    reply.status(500).send({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
    });
  }
}

/**
 * Schema validation middleware factory
 */
export function validateSchema(schema: any) {
  return async function schemaValidationMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      // Basic schema validation would be implemented here
      // For now, just check if request body exists when expected
      if (schema && ['POST', 'PUT', 'PATCH'].includes(request.method) && !request.body) {
        reply.status(400).send({
          code: 'MISSING_BODY',
          message: 'Request body is required',
        });
        return;
      }

      // In a full implementation, you'd use a library like Joi or Zod here
      // to validate the request body against the schema

    } catch (error) {
      console.error('Schema validation middleware error:', error);
      reply.status(500).send({
        code: 'SCHEMA_VALIDATION_ERROR',
        message: 'Schema validation failed',
      });
    }
  };
}
