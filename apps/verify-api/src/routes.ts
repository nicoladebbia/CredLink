/**
 * Verification API Routes
 * Fastify route definitions for C2PA verification endpoints
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyProvenance } from './verification.js';
import { 
  VerificationRequest, 
  VerificationResult, 
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
 * Validation schema for verification requests
 */
const verificationRequestSchema = {
  type: 'object',
  properties: {
    asset_url: { 
      type: 'string', 
      format: 'uri',
      minLength: 1,
      maxLength: 2048,
      description: 'URL of the asset to verify'
    },
    manifest_url: { 
      type: 'string', 
      format: 'uri',
      minLength: 1,
      maxLength: 2048,
      description: 'Direct URL of the manifest to verify'
    },
    trust_roots: { 
      type: 'array', 
      items: { type: 'string' },
      maxItems: 10,
      description: 'Optional trust anchors to validate against'
    },
    timeout: { 
      type: 'number', 
      minimum: 1000, 
      maximum: 30000,
      default: 5000,
      description: 'Timeout for fetch operations in milliseconds'
    }
  },
  oneOf: [
    { required: ['asset_url'] },
    { required: ['manifest_url'] }
  ],
  additionalProperties: false
};

/**
 * Response schema for verification results
 */
const verificationResponseSchema = {
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
            cached: { type: 'boolean' }
          }
        }
      }
    },
    error: {
      type: 'object',
      properties: {
        code: { 
          type: 'string',
          enum: ['MANIFEST_UNREACHABLE', 'MISMATCHED_HASH', 'UNKNOWN_TRUST_ROOT', 'INVALID_FORMAT', 'NETWORK_ERROR', 'TIMEOUT']
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
 * Main verification endpoint
 */
async function verifyHandler(
  request: FastifyRequest<{ Body: VerificationRequest }>,
  reply: FastifyReply
): Promise<ApiResponse<VerificationResult>> {
  const requestId = generateRequestId();
  const startTime = Date.now();

  request.log.info({ 
    requestId, 
    asset_url: request.body.asset_url,
    manifest_url: request.body.manifest_url 
  }, 'Verification request received');

  try {
    // Validate request body
    const { asset_url, manifest_url, trust_roots, timeout } = request.body;

    // Perform verification
    const result = await verifyProvenance({
      asset_url,
      manifest_url,
      trust_roots,
      timeout: timeout || 5000
    });

    const totalTime = Date.now() - startTime;

    request.log.info({ 
      requestId, 
      valid: result.valid,
      totalTime,
      warnings: result.warnings.length 
    }, 'Verification completed');

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
    }, 'Verification failed');

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
 * Health check endpoint
 */
async function healthHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<ApiResponse<{ status: string; version: string }>> {
  return {
    success: true,
    data: {
      status: 'healthy',
      version: '1.0.0'
    },
    request_id: generateRequestId(),
    timestamp: new Date().toISOString()
  };
}

/**
 * Trust roots endpoint
 */
async function trustRootsHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<ApiResponse<{ trust_roots: Array<{ id: string; name: string; trusted: boolean }> }>> {
  // In production, this would return actual trust roots
  return {
    success: true,
    data: {
      trust_roots: [
        {
          id: 'c2pa-production-1',
          name: 'C2PA Production Root CA',
          trusted: true
        }
      ]
    },
    request_id: generateRequestId(),
    timestamp: new Date().toISOString()
  };
}

/**
 * Register all verification routes
 */
export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  
  // Main verification endpoint
  fastify.post<{
    Body: VerificationRequest;
    Reply: ApiResponse<VerificationResult>;
  }>('/verify', {
    schema: {
      body: verificationRequestSchema,
      response: {
        200: verificationResponseSchema,
        400: verificationResponseSchema,
        500: verificationResponseSchema
      }
    }
  }, verifyHandler);

  // Health check endpoint
  fastify.get<{
    Reply: ApiResponse<{ status: string; version: string }>;
  }>('/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                version: { type: 'string' }
              }
            },
            request_id: { type: 'string' },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, healthHandler);

  // Trust roots endpoint
  fastify.get<{
    Reply: ApiResponse<{ trust_roots: Array<{ id: string; name: string; trusted: boolean }> }>;
  }>('/trust-roots', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                trust_roots: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      trusted: { type: 'boolean' }
                    }
                  }
                }
              }
            },
            request_id: { type: 'string' },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, trustRootsHandler);

  // Metrics endpoint
  fastify.get<{
    Reply: ApiResponse<{ 
      total_verifications: number; 
      success_rate: number; 
      average_response_time_ms: number 
    }>;
  }>('/metrics', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                total_verifications: { type: 'number' },
                success_rate: { type: 'number' },
                average_response_time_ms: { type: 'number' }
              }
            },
            request_id: { type: 'string' },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    // TODO: Implement actual metrics collection
    return {
      success: true,
      data: {
        total_verifications: 0,
        success_rate: 0,
        average_response_time_ms: 0
      },
      request_id: generateRequestId(),
      timestamp: new Date().toISOString()
    };
  });
}
