/**
 * Phase 41 — Health Probe for Cache Debugging
 * Debug-first endpoint for cache freshness and validator inspection
 * STANDARDS: Returns freshness and last validator values per RFC 9111
 * OPERATIONS: Enables rapid diagnosis of stale keys, wrong TTLs, or bad validators
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getCacheStats } from './phase41-cache-middleware.js';
import { getPurgeStats } from './phase41-cdn-invalidation.js';

/**
 * STANDARDS: Cache health probe response format
 * GET /health/cache
 */
export interface CacheHealthResponse {
  timestamp: string;
  manifest: ManifestCacheHealth;
  verify: VerifyCacheHealth;
  edge: EdgeCacheHealth;
  browser: BrowserCacheHealth;
  statistics: CacheStatistics;
  purgeStats: PurgeStatistics;
}

/**
 * STANDARDS: Manifest cache health details
 */
export interface ManifestCacheHealth {
  manifestUrl: string;
  lastFetch: string | null;
  manifestETagSeen: string | null;
  manifestAgeSeconds: number | null;
  cacheControl: string;
  ttlRemaining: number | null;
  isStale: boolean;
  mustRevalidate: boolean;
  staleWhileRevalidateWindow: number;
}

/**
 * STANDARDS: Verify cache health details
 */
export interface VerifyCacheHealth {
  verifyKey: string;
  verifyETagSeen: string | null;
  lastVerified: string | null;
  verifyAgeSeconds: number | null;
  cacheControl: string;
  ttlRemaining: number | null;
  isStale: boolean;
  staleIfErrorWindow: number;
}

/**
 * STANDARDS: Edge cache health (CDN layer)
 */
export interface EdgeCacheHealth {
  edgeCacheHit: boolean;
  edgeCacheStatus: string;
  edgeLocation: string | null;
  edgeRayId: string | null;
  edgeTtl: number | null;
}

/**
 * STANDARDS: Browser cache health (client layer)
 */
export interface BrowserCacheHealth {
  browserCacheHit: boolean;
  browserCacheStatus: string;
  clientTtl: number | null;
}

/**
 * PERFORMANCE: Cache statistics aggregation
 */
export interface CacheStatistics {
  manifestHits: number;
  manifestMisses: number;
  manifestHitRate: number;
  verifyHits: number;
  verifyMisses: number;
  verifyHitRate: number;
  conditionalRequests: number;
  notModifiedResponses: number;
  notModifiedRate: number;
}

/**
 * PERFORMANCE: Purge statistics
 */
export interface PurgeStatistics {
  totalPurges: number;
  manifestPurges: number;
  verifyPurges: number;
  tagPurges: number;
  lastPurge: string | null;
  errors: number;
}

/**
 * STANDARDS: In-memory cache state tracker
 * Tracks last seen ETags and fetch times for debugging
 */
class CacheStateTracker {
  private manifestState: Map<string, {
    url: string;
    etag: string;
    fetchTime: Date;
    cacheControl: string;
  }> = new Map();

  private verifyState: Map<string, {
    key: string;
    etag: string;
    verifiedAt: Date;
    cacheControl: string;
  }> = new Map();

  /**
   * PERFORMANCE: Record manifest fetch
   */
  recordManifestFetch(
    manifestHash: string,
    url: string,
    etag: string,
    cacheControl: string
  ): void {
    // SECURITY: Validate inputs
    if (!manifestHash || typeof manifestHash !== 'string') {
      throw new Error('Manifest hash must be a string');
    }
    if (!/^[a-f0-9]{64}$/.test(manifestHash)) {
      throw new Error('Manifest hash must be 64-character hex string');
    }
    if (!url || typeof url !== 'string') {
      throw new Error('URL must be a string');
    }
    if (!url.startsWith('https://')) {
      throw new Error('URL must be HTTPS');
    }
    try {
      new URL(url);
    } catch {
      throw new Error(`Invalid URL format: ${url}`);
    }
    if (!etag || typeof etag !== 'string') {
      throw new Error('ETag must be a string');
    }
    if (!/^"[a-f0-9]+"$/.test(etag)) {
      throw new Error('ETag must be in quoted format');
    }
    if (!cacheControl || typeof cacheControl !== 'string') {
      throw new Error('Cache-Control must be a string');
    }
    if (!cacheControl.includes('max-age=')) {
      throw new Error('Cache-Control must include max-age directive');
    }
    
    this.manifestState.set(manifestHash, {
      url,
      etag,
      fetchTime: new Date(),
      cacheControl
    });
  }

  /**
   * PERFORMANCE: Record verify response
   */
  recordVerifyResponse(
    verifyKey: string,
    etag: string,
    cacheControl: string
  ): void {
    // SECURITY: Validate inputs
    if (!verifyKey || typeof verifyKey !== 'string') {
      throw new Error('Verify key must be a string');
    }
    if (!/^verify:[a-f0-9]+:v\d+$/.test(verifyKey)) {
      throw new Error('Verify key must be in format verify:{hash}:v{version}');
    }
    if (!etag || typeof etag !== 'string') {
      throw new Error('ETag must be a string');
    }
    if (!/^"verify:[a-f0-9]+:v\d+:[a-f0-9]+"/.test(etag)) {
      throw new Error('ETag must be in verify format');
    }
    if (!cacheControl || typeof cacheControl !== 'string') {
      throw new Error('Cache-Control must be a string');
    }
    if (!cacheControl.includes('max-age=')) {
      throw new Error('Cache-Control must include max-age directive');
    }
    
    this.verifyState.set(verifyKey, {
      key: verifyKey,
      etag,
      verifiedAt: new Date(),
      cacheControl
    });
  }

  /**
   * STANDARDS: Get manifest cache state
   */
  getManifestState(manifestHash: string): ManifestCacheHealth {
    // SECURITY: Validate inputs
    if (!manifestHash || typeof manifestHash !== 'string') {
      throw new Error('Manifest hash must be a string');
    }
    if (!/^[a-f0-9]{64}$/.test(manifestHash)) {
      throw new Error('Manifest hash must be 64-character hex string');
    }
    
    const state = this.manifestState.get(manifestHash);
    
    if (!state) {
      return {
        manifestUrl: '',
        lastFetch: null,
        manifestETagSeen: null,
        manifestAgeSeconds: null,
        cacheControl: 'max-age=30, s-maxage=120, must-revalidate, stale-while-revalidate=300',
        ttlRemaining: null,
        isStale: false,
        mustRevalidate: true,
        staleWhileRevalidateWindow: 300
      };
    }

    const ageSeconds = Math.floor((Date.now() - state.fetchTime.getTime()) / 1000);
    const maxAge = this.extractMaxAge(state.cacheControl);
    const ttlRemaining = maxAge ? Math.max(0, maxAge - ageSeconds) : null;
    const isStale = maxAge ? ageSeconds > maxAge : false;

    return {
      manifestUrl: state.url,
      lastFetch: state.fetchTime.toISOString(),
      manifestETagSeen: state.etag,
      manifestAgeSeconds: ageSeconds,
      cacheControl: state.cacheControl,
      ttlRemaining,
      isStale,
      mustRevalidate: state.cacheControl.includes('must-revalidate'),
      staleWhileRevalidateWindow: this.extractSWR(state.cacheControl)
    };
  }

  /**
   * STANDARDS: Get verify cache state
   */
  getVerifyState(verifyKey: string): VerifyCacheHealth {
    // SECURITY: Validate inputs
    if (!verifyKey || typeof verifyKey !== 'string') {
      throw new Error('Verify key must be a string');
    }
    if (!/^verify:[a-f0-9]+:v\d+$/.test(verifyKey)) {
      throw new Error('Verify key must be in format verify:{hash}:v{version}');
    }
    
    const state = this.verifyState.get(verifyKey);
    
    if (!state) {
      return {
        verifyKey,
        verifyETagSeen: null,
        lastVerified: null,
        verifyAgeSeconds: null,
        cacheControl: 'max-age=300, s-maxage=900, must-revalidate, stale-while-revalidate=600, stale-if-error=120',
        ttlRemaining: null,
        isStale: false,
        staleIfErrorWindow: 120
      };
    }

    const ageSeconds = Math.floor((Date.now() - state.verifiedAt.getTime()) / 1000);
    const maxAge = this.extractMaxAge(state.cacheControl);
    const ttlRemaining = maxAge ? Math.max(0, maxAge - ageSeconds) : null;
    const isStale = maxAge ? ageSeconds > maxAge : false;

    return {
      verifyKey: state.key,
      verifyETagSeen: state.etag,
      lastVerified: state.verifiedAt.toISOString(),
      verifyAgeSeconds: ageSeconds,
      cacheControl: state.cacheControl,
      ttlRemaining,
      isStale,
      staleIfErrorWindow: this.extractSIE(state.cacheControl)
    };
  }

  /**
   * STANDARDS: Extract max-age from Cache-Control with validation
   */
  private extractMaxAge(cacheControl: string): number | null {
    if (!cacheControl || typeof cacheControl !== 'string') {
      return null;
    }
    if (cacheControl.length > 1000) {
      return null; // Prevent DoS via long strings
    }
    
    const match = cacheControl.match(/max-age=(\d+)/);
    if (!match) {
      return null;
    }
    
    const maxAge = parseInt(match[1], 10);
    if (isNaN(maxAge) || maxAge < 0 || maxAge > 31536000) { // Max 1 year
      return null;
    }
    
    return maxAge;
  }

  /**
   * STANDARDS: Extract stale-while-revalidate from Cache-Control with validation
   */
  private extractSWR(cacheControl: string): number {
    if (!cacheControl || typeof cacheControl !== 'string') {
      return 0;
    }
    if (cacheControl.length > 1000) {
      return 0;
    }
    
    const match = cacheControl.match(/stale-while-revalidate=(\d+)/);
    if (!match) {
      return 0;
    }
    
    const swr = parseInt(match[1], 10);
    if (isNaN(swr) || swr < 0 || swr > 86400) { // Max 1 day
      return 0;
    }
    
    return swr;
  }

  /**
   * STANDARDS: Extract stale-if-error from Cache-Control with validation
   */
  private extractSIE(cacheControl: string): number {
    if (!cacheControl || typeof cacheControl !== 'string') {
      return 0;
    }
    if (cacheControl.length > 1000) {
      return 0;
    }
    
    const match = cacheControl.match(/stale-if-error=(\d+)/);
    if (!match) {
      return 0;
    }
    
    const sie = parseInt(match[1], 10);
    if (isNaN(sie) || sie < 0 || sie > 3600) { // Max 1 hour
      return 0;
    }
    
    return sie;
  }

  /**
   * PERFORMANCE: Clear all cached state
   */
  clear(): void {
    this.manifestState.clear();
    this.verifyState.clear();
  }
}

// PERFORMANCE: Global cache state tracker
const cacheStateTracker = new CacheStateTracker();

/**
 * PERFORMANCE: Export tracker for use in middleware
 */
export { cacheStateTracker };

/**
 * STANDARDS: Health probe endpoint handler
 * GET /health/cache?manifest={hash}&verify={key}
 */
export async function handleCacheHealthProbe(
  request: FastifyRequest<{
    Querystring: {
      manifest?: string;
      verify?: string;
    };
  }>,
  reply: FastifyReply
): Promise<void> {
  // SECURITY: Validate request object
  if (!request || typeof request !== 'object') {
    reply.code(400).send({ error: 'Invalid request' });
    return;
  }
  if (!reply || typeof reply !== 'object') {
    throw new Error('Invalid reply object');
  }

  // SECURITY: Validate and sanitize query parameters
  const manifestHash = request.query.manifest;
  const verifyKey = request.query.verify;

  // SECURITY: Validate manifest hash if provided
  if (manifestHash) {
    if (typeof manifestHash !== 'string') {
      reply.code(400).send({ error: 'Manifest hash must be string' });
      return;
    }
    if (!/^[a-f0-9]{64}$/.test(manifestHash)) {
      reply.code(400).send({ error: 'Invalid manifest hash format' });
      return;
    }
  }

  // SECURITY: Validate verify key if provided
  if (verifyKey) {
    if (typeof verifyKey !== 'string') {
      reply.code(400).send({ error: 'Verify key must be string' });
      return;
    }
    if (!/^verify:[a-f0-9]{64}:v\d+$/.test(verifyKey)) {
      reply.code(400).send({ error: 'Invalid verify key format' });
      return;
    }
  }

  const safeManifestHash = manifestHash || '';
  const safeVerifyKey = verifyKey || '';

  // PERFORMANCE: Get cache statistics
  const cacheStats = getCacheStats();
  const purgeStats = getPurgeStats();

  // STANDARDS: Calculate hit rates
  const manifestTotal = cacheStats.manifestCacheHits + cacheStats.manifestCacheMisses;
  const manifestHitRate = manifestTotal > 0 
    ? cacheStats.manifestCacheHits / manifestTotal 
    : 0;

  const verifyTotal = cacheStats.verifyCacheHits + cacheStats.verifyCacheMisses;
  const verifyHitRate = verifyTotal > 0 
    ? cacheStats.verifyCacheHits / verifyTotal 
    : 0;

  const notModifiedRate = cacheStats.conditionalRequests > 0
    ? cacheStats.notModifiedResponses / cacheStats.conditionalRequests
    : 0;

  // STANDARDS: Extract edge cache headers from request
  const edgeCacheStatus = request.headers['cf-cache-status'] as string || 'UNKNOWN';
  const edgeRayId = request.headers['cf-ray'] as string || null;
  const edgeLocation = request.headers['cf-ipcountry'] as string || null;

  // STANDARDS: Build health response with validated inputs
  const response: CacheHealthResponse = {
    timestamp: new Date().toISOString(),
    manifest: cacheStateTracker.getManifestState(safeManifestHash),
    verify: cacheStateTracker.getVerifyState(safeVerifyKey),
    edge: {
      edgeCacheHit: edgeCacheStatus === 'HIT',
      edgeCacheStatus,
      edgeLocation,
      edgeRayId,
      edgeTtl: null // Would need to parse from headers
    },
    browser: {
      browserCacheHit: false, // Cannot determine from server side
      browserCacheStatus: 'UNKNOWN',
      clientTtl: null
    },
    statistics: {
      manifestHits: cacheStats.manifestCacheHits,
      manifestMisses: cacheStats.manifestCacheMisses,
      manifestHitRate: Math.round(manifestHitRate * 10000) / 100,
      verifyHits: cacheStats.verifyCacheHits,
      verifyMisses: cacheStats.verifyCacheMisses,
      verifyHitRate: Math.round(verifyHitRate * 10000) / 100,
      conditionalRequests: cacheStats.conditionalRequests,
      notModifiedResponses: cacheStats.notModifiedResponses,
      notModifiedRate: Math.round(notModifiedRate * 10000) / 100
    },
    purgeStats: {
      totalPurges: purgeStats.totalPurges,
      manifestPurges: purgeStats.manifestPurges,
      verifyPurges: purgeStats.verifyPurges,
      tagPurges: purgeStats.tagPurges,
      lastPurge: purgeStats.lastPurge ? purgeStats.lastPurge.toISOString() : null,
      errors: purgeStats.errors
    }
  };

  // STANDARDS: Set response headers
  reply.headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'X-Health-Check': 'cache-probe'
  });

  reply.send(response);
}

/**
 * STANDARDS: Register health probe routes
 */
export function registerCacheHealthRoutes(fastify: FastifyInstance): void {
  // STANDARDS: Main cache health endpoint
  fastify.get('/health/cache', async (request, reply) => {
    await handleCacheHealthProbe(
      request as FastifyRequest<{ Querystring: { manifest?: string; verify?: string } }>,
      reply
    );
  });

  // PERFORMANCE: Cache statistics endpoint
  fastify.get('/health/cache/stats', async (request, reply) => {
    const stats = getCacheStats();
    reply.headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    });
    reply.send(stats);
  });

  // PERFORMANCE: Purge statistics endpoint
  fastify.get('/health/cache/purge-stats', async (request, reply) => {
    const stats = getPurgeStats();
    reply.headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    });
    reply.send(stats);
  });

  // OPERATIONS: Cache state reset endpoint (admin only)
  fastify.post('/health/cache/reset', async (request, reply) => {
    // SECURITY: Should be protected by authentication in production
    cacheStateTracker.clear();
    reply.send({ success: true, message: 'Cache state tracker reset' });
  });
}

/**
 * OPERATIONS: Diagnostic helper for cache issues
 */
export interface CacheDiagnostic {
  issue: string;
  severity: 'critical' | 'warning' | 'info';
  recommendation: string;
  affectedKeys: string[];
}

/**
 * OPERATIONS: Diagnose cache health issues
 */
export function diagnoseCacheHealth(
  manifestHash: string,
  verifyKey: string
): CacheDiagnostic[] {
  const diagnostics: CacheDiagnostic[] = [];
  
  const manifestState = cacheStateTracker.getManifestState(manifestHash);
  const verifyState = cacheStateTracker.getVerifyState(verifyKey);

  // OPERATIONS: Check for stale manifest
  if (manifestState.isStale && !manifestState.mustRevalidate) {
    diagnostics.push({
      issue: 'Stale manifest without must-revalidate',
      severity: 'critical',
      recommendation: 'Add must-revalidate directive to Cache-Control header',
      affectedKeys: [manifestHash]
    });
  }

  // OPERATIONS: Check for missing ETags
  if (!manifestState.manifestETagSeen) {
    diagnostics.push({
      issue: 'Missing ETag on manifest response',
      severity: 'critical',
      recommendation: 'Ensure strong ETags are generated for all manifest responses',
      affectedKeys: [manifestHash]
    });
  }

  // OPERATIONS: Check for stale verify responses
  if (verifyState.isStale) {
    diagnostics.push({
      issue: 'Stale verify response detected',
      severity: 'warning',
      recommendation: 'Purge verify cache or wait for revalidation',
      affectedKeys: [verifyKey]
    });
  }

  // OPERATIONS: Check cache statistics
  const stats = getCacheStats();
  const totalRequests = stats.manifestCacheHits + stats.manifestCacheMisses;
  if (totalRequests > 100 && stats.manifestCacheHits / totalRequests < 0.5) {
    diagnostics.push({
      issue: 'Low manifest cache hit rate',
      severity: 'warning',
      recommendation: 'Review TTL settings or check for cache purge frequency',
      affectedKeys: []
    });
  }

  return diagnostics;
}
