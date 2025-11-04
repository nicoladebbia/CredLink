/**
 * Phase 42 — Rehydration Routes
 * HTTP endpoints for rehydration health and diagnostics
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { 
  verifyProvenanceWithRehydration,
  getRehydrationHealth,
  cleanupCertCache,
  REHYDRATION_CONFIG,
  isStrongETag,
  normalizeETag
} from './phase42-rehydration.js';
import { 
  VerificationRequest, 
  ApiResponse, 
  VerificationError 
} from './types.js';

/**
 * Generate unique request ID for tracing
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Enhanced verification request schema with rehydration support
 */
const rehydrationVerificationRequestSchema = {
  type: 'object',
  properties: {
    asset_url: { 
      type: 'string', 
      format: 'uri',
      minLength: 10, // Minimum reasonable URL length
      maxLength: 2048,
      pattern: '^https?://[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}(/.*)?$', // Strict domain pattern
      description: 'URL of the asset to verify'
    },
    manifest_url: { 
      type: 'string', 
      format: 'uri',
      minLength: 10, // Minimum reasonable URL length
      maxLength: 2048,
      pattern: '^https?://[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}(/.*)?$', // Strict domain pattern
      description: 'Direct URL of the manifest to verify'
    },
    trust_roots: { 
      type: 'array', 
      items: { 
        type: 'string',
        minLength: 8, // Minimum reasonable trust root length
        maxLength: 256,
        pattern: '^[a-zA-Z0-9._-]+$' // Allow dots in addition to alphanumeric, underscore, dash
      },
      maxItems: 10,
      description: 'Optional trust anchors to validate against'
    },
    timeout: { 
      type: 'integer', // More specific than number
      minimum: 1000, 
      maximum: 30000,
      default: 5000,
      description: 'Timeout for fetch operations in milliseconds'
    },
    cached_etag: { 
      type: 'string',
      minLength: 2, // Minimum: ""
      maxLength: 256,
      pattern: '^"[a-zA-Z0-9._-]*"$', // More restrictive ETag pattern
      description: 'Cached ETag for conditional requests (must be strong ETag)'
    },
    cached_cert_thumbprints: { 
      type: 'array',
      items: { 
        type: 'string',
        minLength: 10, // Minimum reasonable thumbprint length
        maxLength: 256,
        pattern: '^[a-fA-F0-9:]+$' // Hexadecimal with colons (thumbprint format)
      },
      maxItems: 50,
      description: 'Cached certificate thumbprints for 304 safety validation'
    },
    enable_delta: { 
      type: 'boolean',
      default: false,
      description: 'Enable RFC 3229 delta encoding for large manifests'
    }
  },
  oneOf: [
    { required: ['asset_url'] },
    { required: ['manifest_url'] }
  ],
  additionalProperties: false,
  minProperties: 1 // At least one URL must be provided
};

/**
 * Enhanced verification response schema with rehydration metrics
 */
const rehydrationVerificationResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { 
      type: 'object',
      properties: {
        valid: { type: 'boolean' },
        signer: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            key_id: { type: 'string' },
            organization: { type: 'string' },
            trusted: { type: 'boolean' }
          }
        },
        assertions: {
          type: 'object',
          properties: {
            ai_generated: { type: 'boolean' },
            edits: { type: 'array', items: { type: 'string' } },
            created_at: { type: 'string' },
            content_type: { type: 'string' }
          }
        },
        warnings: { type: 'array', items: { type: 'string' } },
        decision_path: {
          type: 'object',
          properties: {
            discovery: { 
              type: 'string', 
              enum: ['link_header', 'direct_url', 'embedded', 'not_found']
            },
            source: { type: 'string' },
            steps: { type: 'array', items: { type: 'string' } }
          }
        },
        metrics: {
          type: 'object',
          properties: {
            total_time_ms: { type: 'number' },
            fetch_time_ms: { type: 'number' },
            validation_time_ms: { type: 'number' },
            cached: { type: 'boolean' },
            etag: { type: 'string' },
            cache_control: { type: 'string' },
            served_via: { 
              type: 'string',
              enum: ['304', '200', '226']
            }
          }
        },
        rehydration: {
          type: 'object',
          properties: {
            served_via: { 
              type: 'string',
              enum: ['304', '200', '226']
            },
            rehydration_reason: { 
              type: 'string',
              enum: ['validator-match', 'delta-applied', 'full-fetch']
            },
            eTag_match: { type: 'boolean' },
            bytes_saved: { type: 'number' }
          }
        }
      }
    },
    error: {
      type: 'object',
      properties: {
        code: { 
          type: 'string',
          enum: [
            'MANIFEST_UNREACHABLE', 'MISMATCHED_HASH', 'UNKNOWN_TRUST_ROOT', 
            'INVALID_FORMAT', 'NETWORK_ERROR', 'TIMEOUT', 'INVALID_VALIDATOR',
            'INVALID_DELTA', 'UNSUPPORTED_DELTA', 'DELTA_APPLICATION_FAILED'
          ]
        },
        message: { type: 'string' },
        details: { type: 'object' }
      }
    },
    request_id: { type: 'string' },
    timestamp: { type: 'string' }
  }
};

/**
 * Rehydration health response schema
 */
const rehydrationHealthResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        manifest_url: { type: 'string' },
        last_verify: { type: 'string' },
        etag_cached: { type: 'string' },
        etag_last_seen: { type: 'string' },
        cert_thumbprints: { type: 'array', items: { type: 'string' } },
        policy_version: { type: 'string' },
        served_via: { 
          type: 'string',
          enum: ['304', '200', '226']
        },
        rehydration_reason: { 
          type: 'string',
          enum: ['validator-match', 'delta-applied', 'full-fetch']
        },
        notes: { type: 'string' }
      }
    },
    request_id: { type: 'string' },
    timestamp: { type: 'string' }
  }
};

/**
 * Enhanced verification endpoint with rehydration support
 */
async function rehydrationVerifyHandler(
  request: FastifyRequest<{ 
    Body: VerificationRequest & {
      cached_etag?: string;
      cached_cert_thumbprints?: string[];
      enable_delta?: boolean;
    };
  }>,
  reply: FastifyReply
): Promise<ApiResponse<any>> {
  const requestId = generateRequestId();
  const startTime = Date.now();

  request.log.info({ 
    requestId, 
    asset_url: request.body.asset_url,
    manifest_url: request.body.manifest_url,
    cached_etag: request.body.cached_etag,
    enable_delta: request.body.enable_delta
  }, 'Rehydration verification request received');

  try {
    // CRITICAL SECURITY: Additional runtime validation beyond schema
    const { asset_url, manifest_url, cached_etag, cached_cert_thumbprints, timeout } = request.body;
    
    // Optimized URL validation with comprehensive security patterns
    const validateUrlSecurity = (url: string, fieldName: string) => {
      if (!url || typeof url !== 'string') {
        return false;
      }
      
      const lowerUrl = url.toLowerCase();
      
      // CRITICAL SECURITY: Block dangerous patterns
      const dangerousPatterns = [
        '..', '%2e', '%2E', 'javascript:', 'data:', 'file:', 
        'ftp:', 'mailto:', '<script', 'vbscript:', 'onclick'
      ];
      
      for (const pattern of dangerousPatterns) {
        if (lowerUrl.includes(pattern)) {
          return false;
        }
      }
      
      // CRITICAL SECURITY: Validate URL structure
      try {
        const parsed = new URL(url);
        return ['https:', 'http:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    };
    
    // Validate asset_url if provided
    if (asset_url && !validateUrlSecurity(asset_url, 'asset_url')) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_FORMAT',
          message: 'Invalid or unsafe asset URL detected',
          details: { 
            url: asset_url.substring(0, 100) + (asset_url.length > 100 ? '...' : ''),
            reason: 'Security validation failed'
          }
        },
        request_id: requestId,
        timestamp: new Date().toISOString()
      });
    }
    
    // Validate manifest_url if provided
    if (manifest_url && !validateUrlSecurity(manifest_url, 'manifest_url')) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_FORMAT',
          message: 'Invalid or unsafe manifest URL detected',
          details: { 
            url: manifest_url.substring(0, 100) + (manifest_url.length > 100 ? '...' : ''),
            reason: 'Security validation failed'
          }
        },
        request_id: requestId,
        timestamp: new Date().toISOString()
      });
    }
    
    // CRITICAL SECURITY: Validate timeout bounds
    if (timeout && (typeof timeout !== 'number' || timeout < 1000 || timeout > 30000)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_FORMAT',
          message: 'Timeout must be between 1000ms and 30000ms',
          details: { provided: timeout }
        },
        request_id: requestId,
        timestamp: new Date().toISOString()
      });
    }
    
    // Validate cached ETag format and length
    if (cached_etag) {
      if (!isStrongETag(cached_etag)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_FORMAT',
            message: 'cached_etag must be a strong ETag (quoted and not starting with W/)',
            details: { 
              provided: cached_etag,
              expected_format: '"strong-etag-value"',
              length: cached_etag.length
            }
          },
          request_id: requestId,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // CRITICAL SECURITY: Validate certificate thumbprints
    if (cached_cert_thumbprints) {
      if (!Array.isArray(cached_cert_thumbprints)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_FORMAT',
            message: 'cached_cert_thumbprints must be an array',
            details: { type: typeof cached_cert_thumbprints }
          },
          request_id: requestId,
          timestamp: new Date().toISOString()
        });
      }
      
      if (cached_cert_thumbprints.length > 50) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_FORMAT',
            message: 'Too many certificate thumbprints provided (max 50)',
            details: { count: cached_cert_thumbprints.length, maxAllowed: 50 }
          },
          request_id: requestId,
          timestamp: new Date().toISOString()
        });
      }
      
      // Validate each thumbprint format
      const thumbprintPattern = /^[a-fA-F0-9:]+$/;
      for (let i = 0; i < cached_cert_thumbprints.length; i++) {
        const thumbprint = cached_cert_thumbprints[i];
        if (!thumbprint || typeof thumbprint !== 'string' || 
            thumbprint.length < 10 || thumbprint.length > 256 ||
            !thumbprintPattern.test(thumbprint)) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'INVALID_FORMAT',
              message: `Invalid certificate thumbprint format at index ${i}`,
              details: { 
                index: i,
                thumbprint: thumbprint ? thumbprint.substring(0, 20) + '...' : 'null',
                length: thumbprint ? thumbprint.length : 0
              }
            },
            request_id: requestId,
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    // Perform enhanced verification with rehydration
    const result = await verifyProvenanceWithRehydration({
      asset_url: request.body.asset_url,
      manifest_url: request.body.manifest_url,
      trust_roots: request.body.trust_roots,
      timeout: request.body.timeout || 5000,
      cachedETag: request.body.cached_etag,
      cachedCertThumbprints: request.body.cached_cert_thumbprints || [],
      enableDelta: request.body.enable_delta || false
    });

    const totalTime = Date.now() - startTime;

    request.log.info({ 
      requestId, 
      valid: result.valid,
      totalTime,
      served_via: result.rehydration.servedVia,
      rehydration_reason: result.rehydration.rehydrationReason,
      bytes_saved: result.rehydration.bytesSaved
    }, 'Rehydration verification completed');

    // Add appropriate cache headers for 304 responses
    if (result.rehydration.servedVia === '304') {
      reply.header('Cache-Control', REHYDRATION_CONFIG.CACHE_CONTROL);
      reply.header('ETag', request.body.cached_etag || '');
    }

    return {
      success: true,
      data: result,
      request_id: requestId,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    const totalTime = Date.now() - startTime;
    
    request.log.error({ 
      requestId, 
      error: error instanceof Error ? error.message : 'Unknown error',
      totalTime 
    }, 'Rehydration verification failed');

    // Convert to VerificationError if needed
    let verificationError: VerificationError;
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      verificationError = error as VerificationError;
    } else {
      verificationError = new VerificationError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    return reply.status(500).send({
      success: false,
      error: verificationError,
      request_id: requestId,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Rehydration health check endpoint
 */
async function rehydrationHealthHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<ApiResponse<any>> {
  const requestId = generateRequestId();

  try {
    const health = await getRehydrationHealth();

    request.log.info({ 
      requestId, 
      served_via: health.served_via,
      rehydration_reason: health.rehydration_reason,
      etag_match: health.etag_cached === health.etag_last_seen
    }, 'Rehydration health check completed');

    return {
      success: true,
      data: health,
      request_id: requestId,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    request.log.error({ 
      requestId, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 'Rehydration health check failed');

    return reply.status(500).send({
      success: false,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: 'Failed to retrieve rehydration health status'
      },
      request_id: requestId,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Cache cleanup endpoint for maintenance
 */
async function rehydrationCleanupHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<ApiResponse<{ cleaned: boolean; timestamp: string }>> {
  const requestId = generateRequestId();

  try {
    cleanupCertCache();

    request.log.info({ requestId }, 'Rehydration cache cleanup completed');

    return {
      success: true,
      data: {
        cleaned: true,
        timestamp: new Date().toISOString()
      },
      request_id: requestId,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    request.log.error({ 
      requestId, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 'Rehydration cache cleanup failed');

    return reply.status(500).send({
      success: false,
      error: {
        code: 'CLEANUP_FAILED',
        message: 'Failed to cleanup rehydration cache'
      },
      request_id: requestId,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * ETag validation utility endpoint
 */
async function validateETagHandler(
  request: FastifyRequest<{ 
    Querystring: { etag: string };
  }>,
  reply: FastifyReply
): Promise<ApiResponse<{ 
  valid: boolean; 
  strong: boolean; 
  normalized?: string;
  reason?: string;
}>> {
  const requestId = generateRequestId();
  const { etag } = request.query;

  if (!etag) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'INVALID_FORMAT',
        message: 'ETag parameter is required'
      },
      request_id: requestId,
      timestamp: new Date().toISOString()
    });
  }

  const isStrong = isStrongETag(etag);
  const normalized = isStrong ? normalizeETag(etag) : undefined;

  let reason: string | undefined;
  if (!isStrong) {
    if (etag.startsWith('W/')) {
      reason = 'ETag is weak (starts with W/) - not suitable for cryptographic validation';
    } else if (!etag.startsWith('"') || !etag.endsWith('"')) {
      reason = 'ETag is not properly quoted - must be enclosed in double quotes';
    } else {
      reason = 'ETag format is invalid';
    }
  }

  return {
    success: true,
    data: {
      valid: isStrong,
      strong: isStrong,
      normalized,
      reason
    },
    request_id: requestId,
    timestamp: new Date().toISOString()
  };
}

/**
 * Register all Phase 42 rehydration routes
 */
export async function registerRehydrationRoutes(fastify: FastifyInstance): Promise<void> {
  
  // Enhanced verification endpoint with rehydration
  fastify.post<{
    Body: VerificationRequest & {
      cached_etag?: string;
      cached_cert_thumbprints?: string[];
      enable_delta?: boolean;
    };
    Reply: ApiResponse<any>;
  }>('/verify/rehydration', {
    schema: {
      body: rehydrationVerificationRequestSchema,
      response: {
        200: rehydrationVerificationResponseSchema,
        400: rehydrationVerificationResponseSchema,
        500: rehydrationVerificationResponseSchema
      }
    }
  }, rehydrationVerifyHandler);

  // Rehydration health endpoint
  fastify.get<{
    Reply: ApiResponse<any>;
  }>('/health/rehydration', {
    schema: {
      response: {
        200: rehydrationHealthResponseSchema,
        500: rehydrationHealthResponseSchema
      }
    }
  }, rehydrationHealthHandler);

  // Cache cleanup endpoint
  fastify.post<{
    Reply: ApiResponse<{ cleaned: boolean; timestamp: string }>;
  }>('/maintenance/rehydration/cleanup', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                cleaned: { type: 'boolean' },
                timestamp: { type: 'string' }
              }
            },
            request_id: { type: 'string' },
            timestamp: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' }
              }
            },
            request_id: { type: 'string' },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, rehydrationCleanupHandler);

  // ETag validation utility endpoint
  fastify.get<{
    Querystring: { etag: string };
    Reply: ApiResponse<{ 
      valid: boolean; 
      strong: boolean; 
      normalized?: string;
      reason?: string;
    }>;
  }>('/utils/validate-etag', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          etag: { type: 'string', description: 'ETag to validate' }
        },
        required: ['etag']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                valid: { type: 'boolean' },
                strong: { type: 'boolean' },
                normalized: { type: 'string' },
                reason: { type: 'string' }
              }
            },
            request_id: { type: 'string' },
            timestamp: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' }
              }
            },
            request_id: { type: 'string' },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, validateETagHandler);

  // Add cache control headers for rehydration endpoints
  fastify.addHook('onSend', async (request, reply, payload) => {
    if (request.url.includes('/rehydration') || request.url.includes('/validate-etag')) {
      reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      reply.header('Pragma', 'no-cache');
      reply.header('Expires', '0');
    }
    return payload;
  });
}
