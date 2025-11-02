/**
 * HTTP Parameter Pollution Protection
 * Prevents HPP attacks by detecting and handling duplicate parameters
 */

import { FastifyRequest, FastifyReply } from 'fastify';

export interface ParameterPollutionConfig {
  allowedDuplicates: string[];  // Parameters that can have multiple values
  maxParamCount: number;        // Maximum total parameters
  maxArraySize: number;         // Maximum size for array parameters
}

const DEFAULT_CONFIG: ParameterPollutionConfig = {
  allowedDuplicates: ['tracks', 'tags', 'permissions', 'roles'],
  maxParamCount: 50,
  maxArraySize: 10
};

/**
 * HTTP Parameter Pollution protection middleware
 */
export function preventParameterPollution(config: Partial<ParameterPollutionConfig> = {}) {
  const options = { ...DEFAULT_CONFIG, ...config };
  
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // 🚨 CRITICAL: Check total parameter count to prevent overload
    const totalParams = Object.keys(request.query || {}).length + 
                       Object.keys(request.params || {}).length;
    
    if (totalParams > options.maxParamCount) {
      return reply.status(400).send({
        error: 'Too many parameters',
        message: `Request contains ${totalParams} parameters, maximum allowed is ${options.maxParamCount}`
      });
    }
    
    // 🚨 CRITICAL: Check for parameter pollution in query string
    const query = request.query as Record<string, any>;
    const pollutedParams: string[] = [];
    
    for (const [key, value] of Object.entries(query || {})) {
      if (Array.isArray(value)) {
        // Check if this parameter allows duplicates
        if (!options.allowedDuplicates.includes(key)) {
          pollutedParams.push(key);
        }
        
        // Check array size limits
        if (value.length > options.maxArraySize) {
          return reply.status(400).send({
            error: 'Parameter array too large',
            message: `Parameter '${key}' has ${value.length} values, maximum allowed is ${options.maxArraySize}`
          });
        }
        
        // Check for suspicious values in arrays
        for (const item of value) {
          if (typeof item === 'string') {
            const suspiciousPatterns = [
              /\.\.\//,                    // Path traversal
              /<script/i,                  // XSS
              /javascript:/i,              // XSS
              /data:.*base64/i,            // Data URI
              /union.*select/i,            // SQL injection
              /\${.*}/,                    // Template injection
              /document\.cookie/i          // Cookie theft
            ];
            
            for (const pattern of suspiciousPatterns) {
              if (pattern.test(item)) {
                console.warn('🚨 Suspicious parameter value detected:', {
                  parameter: key,
                  value: item,
                  pattern: pattern.source,
                  ip: request.ip
                });
                
                return reply.status(400).send({
                  error: 'Suspicious parameter content',
                  message: `Parameter '${key}' contains potentially malicious content`
                });
              }
            }
          }
        }
      }
    }
    
    // Report parameter pollution attempts
    if (pollutedParams.length > 0) {
      console.warn('🚨 HTTP Parameter Pollution attempt detected:', {
        pollutedParams,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        url: request.url
      });
      
      return reply.status(400).send({
        error: 'Parameter pollution detected',
        message: `Duplicate parameters not allowed: ${pollutedParams.join(', ')}`,
        allowedDuplicates: options.allowedDuplicates
      });
    }
    
    // 🚨 CRITICAL: Check for parameter pollution in URL path
    const urlParams = request.url.split('?')[0];
    const paramMatches = urlParams.match(/[^?&=]+=[^?&=]*/g);
    
    if (paramMatches) {
      const paramNames = paramMatches.map(match => match.split('=')[0]);
      const duplicates = paramNames.filter((name, index) => paramNames.indexOf(name) !== index);
      
      if (duplicates.length > 0) {
        console.warn('🚨 URL parameter pollution detected:', {
          duplicates,
          ip: request.ip,
          url: request.url
        });
        
        return reply.status(400).send({
          error: 'URL parameter pollution detected',
          message: `Duplicate URL parameters: ${[...new Set(duplicates)].join(', ')}`
        });
      }
    }
    
    // 🚨 CRITICAL: Validate parameter names
    const invalidParamNames = Object.keys(query || {}).filter(name => {
      // Allow alphanumeric, underscore, hyphen, and brackets
      return !/^[a-zA-Z0-9_\-[\]]+$/.test(name);
    });
    
    if (invalidParamNames.length > 0) {
      return reply.status(400).send({
        error: 'Invalid parameter names',
        message: `Parameter names contain invalid characters: ${invalidParamNames.join(', ')}`
      });
    }
  };
}

/**
 * Strict parameter pollution protection for sensitive endpoints
 */
export const strictParameterPollution = preventParameterPollution({
  allowedDuplicates: [], // No duplicates allowed
  maxParamCount: 20,
  maxArraySize: 5
});

/**
 * Default parameter pollution protection
 */
export const defaultParameterPollution = preventParameterPollution(DEFAULT_CONFIG);
