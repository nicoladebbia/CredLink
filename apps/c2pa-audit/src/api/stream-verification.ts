/**
 * Phase 31 - API Endpoints for Stream Verification
 * Implements Range Index publishing and verification endpoints
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { RangeIndex, RangeIndexGenerator } from '../core/range-index';
import { VerificationPolicyEngine, VerificationRequest } from '../core/verification-policy';
import { verify } from 'jsonwebtoken';
import { credentialManager } from '../security/credential-manager';
import { SecureErrorHandler, ErrorType, setupGlobalErrorHandler } from '../security/error-handler';

export interface StreamVerificationRequest {
  stream_id: string;
  at?: string; // ISO 8601 timestamp
  daterange_id?: string;
  mode?: 'full' | 'sample';
}

export interface StreamVerificationResponse {
  kind: 'program' | 'ad' | 'unknown';
  issuer?: string;
  tsa?: string;
  manifest: string;
  verified: boolean;
  verified_at: string;
}

export interface RangeIndexPublishRequest {
  stream_id: string;
  program_manifest: string;
  ranges: Array<{
    id: string;
    type: 'ad' | 'program_end_ad';
    start: string;
    end: string;
    scte35?: string;
    manifest: string;
  }>;
}

/**
 * Extract client IP from request with proxy support
 */
function extractClientIP(request: FastifyRequest): string {
  // Check for forwarded headers (proxies, load balancers)
  const forwardedFor = request.headers['x-forwarded-for'];
  if (forwardedFor && typeof forwardedFor === 'string') {
    // X-Forwarded-For can contain multiple IPs, take the first one
    return forwardedFor.split(',')[0].trim();
  }
  
  const realIP = request.headers['x-real-ip'];
  if (realIP && typeof realIP === 'string') {
    return realIP.trim();
  }
  
  // Fallback to direct connection IP
  const connection = request.raw as any;
  return connection?.socket?.remoteAddress || 
         connection?.connection?.remoteAddress || 
         'unknown';
}

/**
 * Validate URL uses HTTPS
 */
function validateHTTPS(url: string): boolean {
  const parsed = new URL(url);
  return parsed.protocol === 'https:';
}

/**
 * Input validation utilities
 */
function validateStreamId(streamId: string): boolean {
  // Allow only alphanumeric, hyphens, and underscores
  // Max length 64 to prevent DoS
  const validPattern = /^[a-zA-Z0-9_-]{1,64}$/;
  return validPattern.test(streamId);
}

function validateDateRangeId(dateRangeId: string): boolean {
  // Allow only alphanumeric, hyphens, and underscores
  // Max length 128
  const validPattern = /^[a-zA-Z0-9_-]{1,128}$/;
  return validPattern.test(dateRangeId);
}

function validateTimestamp(timestamp: string): boolean {
  // Validate ISO 8601 format and reasonable date range
  const iso8601Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
  if (!iso8601Pattern.test(timestamp)) return false;
  
  const date = new Date(timestamp);
  const now = new Date();
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  
  return date >= oneYearAgo && date <= oneYearFromNow;
}

function sanitizeManifestUrl(url: string): string {
  try {
    const parsed = new URL(url);
    
    // Enforce HTTPS only
    if (parsed.protocol !== 'https:') {
      throw new Error('Only HTTPS URLs are allowed for security');
    }
    
    // Prevent javascript: and data: URLs
    if (!['https:'].includes(parsed.protocol)) {
      throw new Error('Invalid protocol');
    }
    
    // Validate hostname is not private/internal
    if (isPrivateIP(parsed.hostname)) {
      throw new Error('Access to private IP addresses is not allowed');
    }
    
    return parsed.toString();
  } catch (error) {
    throw new Error('Invalid manifest URL');
  }
}

/**
 * Check if hostname is a private IP
 */
function isPrivateIP(hostname: string): boolean {
  const privateRanges = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^127\./,
    /^169\.254\./,
    /^::1$/,
    /^fc00:/,
    /^fe80:/
  ];
  
  return privateRanges.some(range => range.test(hostname));
}

/**
 * Authentication middleware for API endpoints
 */
async function authenticateRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return SecureErrorHandler.handleError(
      SecureErrorHandler.createAuthenticationError('Authentication required', 'MISSING_AUTH'),
      reply
    );
  }
  
  const token = authHeader.substring(7);
  
  // Validate JWT secret is properly configured
  const jwtSecret = credentialManager.getCredential('jwt_secret') || process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    return SecureErrorHandler.handleError(
      SecureErrorHandler.createInternalError('Server configuration error', 'CONFIG_ERROR'),
      reply
    );
  }
  
  // Verify JWT token (in production, use proper secret and validation)
  try {
    const decoded = verify(token, jwtSecret, { 
      algorithms: ['HS256'],
      maxAge: '1h' // Token expires after 1 hour
    });
    (request as any).user = decoded;
  } catch (error) {
    return SecureErrorHandler.handleError(
      SecureErrorHandler.createAuthenticationError('Invalid or expired token', 'INVALID_AUTH'),
      reply
    );
  }
}

/**
 * Register Phase 31 API routes
 */
export async function registerStreamVerificationRoutes(
  fastify: FastifyInstance,
  policyEngine: VerificationPolicyEngine
): Promise<void> {
  
  // Setup secure global error handler
  setupGlobalErrorHandler(fastify);
  
  // Add security headers to all responses
  fastify.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    // HSTS - Force HTTPS for 1 year including subdomains
    if (request.protocol === 'https') {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    
    return payload;
  });
  
  // Store range indexes in memory (in production, use Redis/database)
  const rangeIndexes = new Map<string, RangeIndex>();

  /**
   * 1) Publish Range Index
   * PUT /streams/{stream_id}/range-index
   */
  fastify.put<{ Params: { stream_id: string }; Body: RangeIndexPublishRequest }>(
    '/streams/:stream_id/range-index',
    {
      preHandler: authenticateRequest,
      schema: {
        params: {
          type: 'object',
          properties: {
            stream_id: { type: 'string' }
          },
          required: ['stream_id']
        },
        body: {
          type: 'object',
          properties: {
            stream_id: { type: 'string' },
            program_manifest: { type: 'string' },
            ranges: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string', enum: ['ad', 'program_end_ad'] },
                  start: { type: 'string' },
                  end: { type: 'string' },
                  scte35: { type: 'string' },
                  manifest: { type: 'string' }
                },
                required: ['id', 'type', 'start', 'end', 'manifest']
              }
            }
          },
          required: ['stream_id', 'program_manifest', 'ranges']
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { stream_id } = request.params as { stream_id: string };
        const body = request.body as RangeIndexPublishRequest;

        // Validate stream_id
        if (!validateStreamId(stream_id)) {
          return reply.status(400).send({
            error: 'Invalid stream_id format',
            code: 'INVALID_STREAM_ID'
          });
        }

        // Validate stream_id matches
        if (body.stream_id !== stream_id) {
          return reply.status(400).send({
            error: 'Stream ID mismatch between URL and body',
            code: 'STREAM_ID_MISMATCH'
          });
        }

        // Validate manifest URLs
        try {
          sanitizeManifestUrl(body.program_manifest);
          for (const range of body.ranges) {
            sanitizeManifestUrl(range.manifest);
          }
        } catch (error) {
          return reply.status(400).send({
            error: 'Invalid manifest URL in request',
            code: 'INVALID_MANIFEST_URL'
          });
        }

        // Generate range index
        const rangeIndex = RangeIndexGenerator.generateFromSSAILogs({
          stream_id: body.stream_id,
          program_manifest: body.program_manifest,
          ad_events: body.ranges.map(range => ({
            id: range.id,
            start_time: range.start,
            end_time: range.end,
            scte35: range.scte35,
            ad_manifest: range.manifest
          }))
        });

        // Store range index
        rangeIndexes.set(stream_id, rangeIndex);

        // Set cache headers
        reply.header('Cache-Control', 'max-age=15, stale-while-revalidate=60');
        reply.header('Content-Type', 'application/json');

        return rangeIndex;

      } catch (error) {
        console.error('Failed to publish range index:', error);
        return reply.status(500).send({
          error: 'Internal server error'
        });
      }
    }
  );

  /**
   * Get Range Index
   * GET /streams/{stream_id}/range-index
   */
  fastify.get<{ Params: { stream_id: string } }>(
    '/streams/:stream_id/range-index',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            stream_id: { type: 'string' }
          },
          required: ['stream_id']
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { stream_id } = request.params as { stream_id: string };
        const rangeIndex = rangeIndexes.get(stream_id);

        if (!rangeIndex) {
          return reply.status(404).send({
            error: 'Range index not found'
          });
        }

        // Check if expired
        if (new Date() > new Date(rangeIndex.expires_at)) {
          rangeIndexes.delete(stream_id);
          return reply.status(410).send({
            error: 'Range index expired'
          });
        }

        // Set cache headers
        reply.header('Cache-Control', 'max-age=15, stale-while-revalidate=60');
        reply.header('Content-Type', 'application/json');

        return rangeIndex;

      } catch (error) {
        console.error('Failed to get range index:', error);
        return reply.status(500).send({
          error: 'Internal server error'
        });
      }
    }
  );

  /**
   * 2) Verify endpoint (idempotent cache)
   * POST /verify/stream
   */
  fastify.post<{ Body: StreamVerificationRequest }>(
    '/verify/stream',
    {
      preHandler: authenticateRequest,
      schema: {
        body: {
          type: 'object',
          properties: {
            stream_id: { type: 'string' },
            at: { type: 'string' }, // ISO 8601 timestamp
            daterange_id: { type: 'string' },
            mode: { type: 'string', enum: ['full', 'sample'], default: 'sample' }
          },
          required: ['stream_id']
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as StreamVerificationRequest;
        const { stream_id, at, daterange_id, mode = 'sample' } = body;

        // Validate inputs
        if (!validateStreamId(stream_id)) {
          return SecureErrorHandler.handleError(
            SecureErrorHandler.createValidationError('Invalid stream_id format', 'INVALID_STREAM_ID'),
            reply
          );
        }

        if (daterange_id && !validateDateRangeId(daterange_id)) {
          return SecureErrorHandler.handleError(
            SecureErrorHandler.createValidationError('Invalid daterange_id format', 'INVALID_DATERANGE_ID'),
            reply
          );
        }

        if (at && !validateTimestamp(at)) {
          return SecureErrorHandler.handleError(
            SecureErrorHandler.createValidationError('Invalid timestamp format or value', 'INVALID_TIMESTAMP'),
            reply
          );
        }

        // Get range index
        const rangeIndex = rangeIndexes.get(stream_id);
        if (!rangeIndex) {
          return SecureErrorHandler.handleError(
            SecureErrorHandler.createNotFoundError('Stream not found', 'STREAM_NOT_FOUND'),
            reply
          );
        }

        // Determine current content type and manifest
        let manifestUrl: string;
        let contentType: 'program' | 'ad' | 'unknown';

        if (daterange_id) {
          // Lookup by DATERANGE ID
          const range = RangeIndexGenerator.lookupRange(rangeIndex, daterange_id);
          if (range) {
            manifestUrl = sanitizeManifestUrl(range.manifest);
            contentType = range.type === 'ad' ? 'ad' : 'program';
          } else {
            manifestUrl = sanitizeManifestUrl(rangeIndex.program.manifest);
            contentType = 'program';
          }
        } else if (at) {
          // Lookup by timestamp
          const range = RangeIndexGenerator.lookupRange(rangeIndex, undefined, at);
          if (range) {
            manifestUrl = sanitizeManifestUrl(range.manifest);
            contentType = range.type === 'ad' ? 'ad' : 'program';
          } else {
            manifestUrl = sanitizeManifestUrl(rangeIndex.program.manifest);
            contentType = 'program';
          }
        } else {
          // Default to program
          manifestUrl = sanitizeManifestUrl(rangeIndex.program.manifest);
          contentType = 'program';
        }

        // Perform verification
        const clientIP = extractClientIP(request);
        const verificationResult = await policyEngine.verify({
          manifestUrl,
          mode: mode === 'full' ? 'full' : 'sample',
          streamId: stream_id,
          timestamp: at,
          rangeId: daterange_id,
          clientIP
        });

        const response: StreamVerificationResponse = {
          kind: contentType,
          issuer: verificationResult.issuer,
          tsa: verificationResult.tsa,
          manifest: manifestUrl,
          verified: verificationResult.valid,
          verified_at: verificationResult.verifiedAt
        };

        // Set cache headers for idempotent responses
        reply.header('Cache-Control', 'max-age=30, stale-while-revalidate=120');
        reply.header('Content-Type', 'application/json');

        return response;

      } catch (error) {
        console.error('Stream verification failed:', error);
        return reply.status(500).send({
          error: 'Verification failed'
        });
      }
    }
  );

  /**
   * Health check for verification service
   * GET /verify/health
   */
  fastify.get('/verify/health', async (request: FastifyRequest, reply: FastifyReply) => {
    const metrics = policyEngine.getPerformanceMetrics();
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: {
        total_verifications: metrics.totalVerifications,
        cache_hit_rate: metrics.cacheHitRate,
        average_duration: metrics.averageDuration,
        active_streams: rangeIndexes.size
      }
    };
  });

  /**
   * Cleanup expired range indexes (should be run periodically)
   */
  fastify.post('/admin/cleanup-expired', { 
    preHandler: authenticateRequest 
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const now = new Date();
      let cleaned = 0;

      for (const [streamId, rangeIndex] of Array.from(rangeIndexes.entries())) {
        if (now > new Date(rangeIndex.expires_at)) {
          rangeIndexes.delete(streamId);
          cleaned++;
        }
      }

      return {
        cleaned,
        remaining: rangeIndexes.size
      };

    } catch (error) {
      console.error('Cleanup failed:', error);
      return reply.status(500).send({
        error: 'Cleanup failed'
      });
    }
  });
}

/**
 * Middleware to inject Link headers on init segments
 */
export async function injectManifestLinkHeader(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Check if this is an init segment request
  const url = request.url;
  
  if (url.includes('.mp4') && (url.includes('init') || url.includes('header'))) {
    // Extract stream ID from URL path
    const streamIdMatch = url.match(/\/streams\/([^\/]+)/);
    if (streamIdMatch) {
      const streamId = streamIdMatch[1];
      
      // In a real implementation, look up the manifest URL for this stream
      // For now, use a placeholder pattern
      const manifestUrl = `https://manifests.example.com/${streamId}/sha256/.../active.c2pa`;
      
      reply.header('Link', `<${manifestUrl}>; rel="c2pa-manifest"`);
    }
  }
}
