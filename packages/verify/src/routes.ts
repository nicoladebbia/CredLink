/**
 * Verification API Routes
 * Fastify route definitions for C2PA verification endpoints
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyProvenance } from './verification.js';
import { signImage, getSigningStatus } from './signing-enhanced.js';
import { retrieveManifest, getManifestMetadata, manifestExists, getStorageInfo } from './storage.js';
import { 
  VerificationRequest, 
  VerificationResult, 
  ApiResponse, 
  VerificationError,
  SigningRequest,
  SigningResult,
  SigningError
} from './types.js';
import { evidencePipeline, registerEvidenceRoutes } from './phase40-evidence.js';
import { costTap, registerCostTapRoutes } from './phase40-cost-tap.js';
import { adversarialInjector, registerAdversarialRoutes } from './phase40-adversarial.js';
import { statisticalAnalyzer, registerStatisticalRoutes } from './phase40-statistics.js';
import { guardrails, registerGuardrailsRoutes } from './phase40-guardrails.js';
import { registerRehydrationRoutes } from './phase42-rehydration-routes.js';

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
 * Validation schema for signing requests
 */
const signingRequestSchema = {
  type: 'object',
  properties: {
    creator: { 
      type: 'string', 
      minLength: 1,
      maxLength: 255,
      description: 'Creator identifier (email, name, or organization)'
    },
    assertions: { 
      type: 'object',
      properties: {
        ai_generated: { type: 'boolean' },
        description: { type: 'string', maxLength: 1000 },
        title: { type: 'string', maxLength: 200 },
        metadata: { type: 'object' }
      },
      additionalProperties: false
    },
    profile: { 
      type: 'string', 
      maxLength: 100,
      description: 'Optional signing profile name'
    },
    tsa: { 
      type: 'boolean', 
      description: 'Include timestamp authority signature'
    }
  },
  required: ['creator'],
  additionalProperties: false
};

/**
 * Response schema for signing results
 */
const signingResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { 
      type: 'object',
      properties: {
        manifest_url: { type: 'string' },
        image_hash: { type: 'string' },
        created_at: { type: 'string' },
        signer: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            key_id: { type: 'string' },
            organization: { type: 'string' }
          }
        },
        manifest_hash: { type: 'string' },
        storage: {
          type: 'object',
          properties: {
            bucket: { type: 'string' },
            key: { type: 'string' },
            region: { type: 'string' }
          }
        }
      }
    },
    error: {
      type: 'object',
      properties: {
        code: { 
          type: 'string',
          enum: ['INVALID_IMAGE', 'IMAGE_TOO_LARGE', 'UNSUPPORTED_FORMAT', 'STORAGE_ERROR', 'SIGNING_FAILED', 'INVALID_REQUEST', 'CREATOR_REQUIRED']
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
 * Main verification endpoint with Phase 40 evidence logging
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

  // Extract Phase 40 experiment context from headers
  const experimentContext = extractExperimentContext(request.headers);

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

    // Log Phase 40 evidence if experiment is active
    if (experimentContext) {
      try {
        await evidencePipeline.processVerification(request, reply, result, experimentContext);
      } catch (evidenceError) {
        request.log.warn({ 
          requestId, 
          error: evidenceError instanceof Error ? evidenceError.message : 'Unknown evidence error'
        }, 'Failed to log Phase 40 evidence (non-critical)');
      }
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

    // Still log evidence for failed verifications if experiment is active
    if (experimentContext) {
      try {
        await evidencePipeline.processVerification(request, reply, {
          valid: false,
          error: verificationError,
          warnings: []
        }, experimentContext);
      } catch (evidenceError) {
        request.log.warn({ 
          requestId, 
          error: evidenceError instanceof Error ? evidenceError.message : 'Unknown evidence error'
        }, 'Failed to log Phase 40 evidence for error case (non-critical)');
      }
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
 * Main signing endpoint for image uploads
 */
async function signHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<ApiResponse<SigningResult>> {
  const requestId = generateRequestId();
  const startTime = Date.now();

  request.log.info({ requestId }, 'Signing request received');

  try {
    // Parse multipart form data
    let imageBuffer: Buffer | null = null;
    let imageMimetype: string = 'application/octet-stream';
    let creator: string = '';
    let title: string | undefined;
    let description: string | undefined;
    let aiGenerated: boolean = false;

    // Process all parts
    const parts = request.parts();
    let partCount = 0;
    
    for await (const part of parts) {
      partCount++;
      request.log.debug({ 
        partNumber: partCount,
        partType: part.type, 
        fieldname: part.fieldname,
        mimetype: part.mimetype 
      }, 'Processing part');
      
      if (part.type === 'file') {
        // This is the image file
        imageBuffer = await part.toBuffer();
        imageMimetype = part.mimetype || 'application/octet-stream';
        request.log.debug({ size: imageBuffer.length, mimetype: imageMimetype }, 'File part processed');
      } else {
        // This is a form field
        const fieldName = part.fieldname;
        const fieldValue = (part as any).value;
        
        request.log.debug({ fieldName, fieldValue }, 'Field part processed');
        
        if (fieldName === 'creator') {
          creator = fieldValue;
        } else if (fieldName === 'title') {
          title = fieldValue;
        } else if (fieldName === 'description') {
          description = fieldValue;
        } else if (fieldName === 'ai_generated') {
          aiGenerated = fieldValue === 'true';
        }
      }
    }

    request.log.info({ partCount, hasImage: !!imageBuffer, creator }, 'Finished processing parts');

    if (!imageBuffer) {
      throw new SigningError('INVALID_REQUEST', `No image file uploaded. Processed ${partCount} parts.`);
    }

    // Validate creator field
    if (!creator || creator.trim().length === 0) {
      throw new SigningError('CREATOR_REQUIRED', 'Creator field is required');
    }

    request.log.info({ 
      requestId, 
      creator,
      imageSize: imageBuffer.length,
      mimetype: imageMimetype 
    }, 'Processing image file');

    // Build signing request
    const signingRequest: SigningRequest = {
      creator: creator.trim(),
      assertions: {}
    };

    if (title) {
      signingRequest.assertions!.title = title;
    }
    if (description) {
      signingRequest.assertions!.description = description;
    }
    if (aiGenerated !== undefined) {
      signingRequest.assertions!.ai_generated = aiGenerated;
    }

    // Perform signing
    const result = await signImage(imageBuffer, imageMimetype, signingRequest);

    const totalTime = Date.now() - startTime;

    request.log.info({ 
      requestId, 
      manifestUrl: result.manifest_url,
      imageHash: result.image_hash,
      totalTime 
    }, 'Signing completed successfully');

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
    }, 'Signing failed');

    // Convert to SigningError if needed
    let signingError: SigningError;
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      signingError = error as SigningError;
    } else {
      signingError = new SigningError(
        'SIGNING_FAILED',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    return reply.status(500).send({
      success: false,
      error: signingError,
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
 * Manifest retrieval endpoint
 * GET /manifests/:hash
 */
async function getManifestHandler(
  request: FastifyRequest<{ Params: { hash: string } }>,
  reply: FastifyReply
): Promise<void> {
  const requestId = generateRequestId();
  const { hash } = request.params;

  request.log.info({ requestId, hash }, 'Manifest retrieval request');

  try {
    // Validate hash format (64 hex characters for SHA-256)
    if (!/^[a-f0-9]{64}$/i.test(hash)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_HASH',
          message: 'Invalid manifest hash format. Expected 64 hexadecimal characters.'
        },
        request_id: requestId,
        timestamp: new Date().toISOString()
      });
    }

    // Retrieve manifest
    const { manifest, metadata, etag } = await retrieveManifest(hash);

    // Set cache headers
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    reply.header('Content-Type', 'application/json');
    
    if (etag) {
      reply.header('ETag', etag);
    }

    // Add custom headers
    reply.header('X-Manifest-Hash', hash);
    reply.header('X-Created-At', metadata['created-at'] || new Date().toISOString());

    request.log.info({ requestId, hash }, 'Manifest retrieved successfully');

    return reply.send(manifest);

  } catch (error) {
    request.log.error({ requestId, hash, error: error instanceof Error ? error.message : 'Unknown error' }, 'Manifest retrieval failed');

    if (error instanceof Error && error.message.includes('not found')) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'MANIFEST_NOT_FOUND',
          message: `Manifest not found: ${hash}`
        },
        request_id: requestId,
        timestamp: new Date().toISOString()
      });
    }

    return reply.status(500).send({
      success: false,
      error: {
        code: 'RETRIEVAL_FAILED',
        message: 'Failed to retrieve manifest'
      },
      request_id: requestId,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Manifest metadata endpoint
 * HEAD /manifests/:hash
 */
async function getManifestMetadataHandler(
  request: FastifyRequest<{ Params: { hash: string } }>,
  reply: FastifyReply
): Promise<void> {
  const requestId = generateRequestId();
  const { hash } = request.params;

  try {
    // Validate hash format
    if (!/^[a-f0-9]{64}$/i.test(hash)) {
      return reply.status(400).send();
    }

    const metadata = await getManifestMetadata(hash);

    reply.header('Content-Length', metadata.size.toString());
    reply.header('Last-Modified', metadata.lastModified.toUTCString());
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    reply.header('X-Manifest-Hash', hash);
    
    if (metadata.etag) {
      reply.header('ETag', metadata.etag);
    }

    return reply.status(200).send();

  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return reply.status(404).send();
    }
    return reply.status(500).send();
  }
}

/**
 * Storage info endpoint
 * GET /storage/info
 */
async function storageInfoHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<ApiResponse<any>> {
  const info = getStorageInfo();
  
  return {
    success: true,
    data: {
      storage_type: info.type,
      bucket: info.bucket,
      public_url: info.publicUrl,
      local_path: info.localPath,
      configuration: info.type === 'r2' ? 'Cloudflare R2' : 'Local Filesystem'
    },
    request_id: generateRequestId(),
    timestamp: new Date().toISOString()
  };
}

/**
 * Signing status endpoint
 * GET /signing/status
 */
async function signingStatusHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<ApiResponse<any>> {
  const status = getSigningStatus();
  
  return {
    success: true,
    data: {
      ready: status.ready,
      crypto_mode: status.crypto_mode,
      tsa_enabled: status.tsa_enabled,
      key_id: status.key_id,
      organization: status.organization,
      capabilities: {
        cryptographic_signing: status.crypto_mode === 'production',
        tsa_timestamps: status.tsa_enabled,
        supported_algorithms: ['RSA-SHA256'],
        supported_formats: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      }
    },
    request_id: generateRequestId(),
    timestamp: new Date().toISOString()
  };
}

/**
 * Extract Phase 40 experiment context from request headers
 */
function extractExperimentContext(headers: any): {
  arm: 'A_EMBED' | 'B_REMOTE';
  tenant_id: string;
  route_bucket: number;
  pathname: string;
} | null {
  const experimentArm = headers['x-c2-experiment-arm'] as string;
  const experimentTenant = headers['x-c2-experiment-tenant'] as string;
  const routeBucket = headers['x-c2-experiment-bucket'] as string;

  if (!experimentArm || !experimentTenant || !routeBucket) {
    return null;
  }

  // Validate arm
  if (experimentArm !== 'A_EMBED' && experimentArm !== 'B_REMOTE') {
    return null;
  }

  return {
    arm: experimentArm,
    tenant_id: experimentTenant,
    route_bucket: parseInt(routeBucket, 10),
    pathname: headers['x-c2-experiment-pathname'] || 'unknown'
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

  // Main signing endpoint - multipart form data upload
  fastify.post('/sign', signHandler);

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

  // Manifest retrieval endpoint
  fastify.get<{
    Params: { hash: string };
  }>('/manifests/:hash', getManifestHandler);

  // Manifest metadata endpoint (HEAD request)
  fastify.head<{
    Params: { hash: string };
  }>('/manifests/:hash', getManifestMetadataHandler);

  // Storage info endpoint
  fastify.get('/storage/info', storageInfoHandler);

  // Signing status endpoint
  fastify.get('/signing/status', signingStatusHandler);

  // Register Phase 40 evidence pipeline routes
  await registerEvidenceRoutes(fastify);

  // Register Phase 40 cost tap routes
  await registerCostTapRoutes(fastify);

  // Register Phase 40 adversarial injection routes
  await registerAdversarialRoutes(fastify);

  // Register Phase 40 statistical analysis routes
  await registerStatisticalRoutes(fastify);

  // Register Phase 40 guardrails routes
  await registerGuardrailsRoutes(fastify);

  // Register Phase 42 rehydration routes
  await registerRehydrationRoutes(fastify);
}
