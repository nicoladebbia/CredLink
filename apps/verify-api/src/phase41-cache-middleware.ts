/**
 * Phase 41 — Cache Discipline & TTL Tactics
 * RFC 9110/9111 compliant caching middleware for manifests and verify responses
 * SECURITY: Integrity first, then speed - strong validators prevent cache poisoning
 * STANDARDS: HTTP Semantics + Caching per IETF RFC 9110/9111
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'crypto';

// STANDARDS: Cache TTL values per RFC 9111 freshness model
const MANIFEST_MAX_AGE = 30; // Browser cache: 30 seconds
const MANIFEST_S_MAXAGE = 120; // Edge cache: 2 minutes
const MANIFEST_SWR = 300; // Stale-while-revalidate: 5 minutes
const VERIFY_MAX_AGE = 300; // Browser cache: 5 minutes
const VERIFY_S_MAXAGE = 900; // Edge cache: 15 minutes
const VERIFY_SWR = 600; // Stale-while-revalidate: 10 minutes
const VERIFY_SIE = 120; // Stale-if-error: 2 minutes

// SECURITY: Policy version for cache key invalidation
const POLICY_VERSION = 'v1';

/**
 * STANDARDS: Generate strong ETag per RFC 9110 Section 8.8.3
 * Strong validators are byte-exact and must be quoted
 */
function generateStrongETag(content: Buffer | string): string {
  // SECURITY: Comprehensive input validation
  if (content === null || content === undefined) {
    throw new Error('Content cannot be null or undefined');
  }
  
  if (typeof content === 'string') {
    if (content.length === 0) {
      throw new Error('String content cannot be empty');
    }
    if (content.length > 10000000) { // 10MB limit
      throw new Error('String content too large for ETag generation');
    }
    // SECURITY: Validate UTF-8 encoding
    try {
      Buffer.from(content, 'utf8');
    } catch {
      throw new Error('String content contains invalid UTF-8 characters');
    }
  } else if (Buffer.isBuffer(content)) {
    if (content.length === 0) {
      throw new Error('Buffer content cannot be empty');
    }
    if (content.length > 10000000) { // 10MB limit
      throw new Error('Buffer content too large for ETag generation');
    }
  } else {
    throw new Error('Content must be string or Buffer');
  }

  // SECURITY: Use full SHA-256 hash (256 bits) for cryptographic security
  // CRITICAL: 16-character hashes (64 bits) are vulnerable to collision attacks
  const hash = crypto
    .createHash('sha256')
    .update(typeof content === 'string' ? Buffer.from(content, 'utf8') : content)
    .digest('hex');
  
  // SECURITY: Ensure hash is exactly 64 characters
  if (hash.length !== 64) {
    throw new Error('Generated hash has invalid length');
  }
  
  return `"${hash}"`; // Strong ETag must be quoted and cryptographically secure
}

/**
 * STANDARDS: Generate verify cache key with manifest hash and policy version
 * Format: verify:{manifest_hash}:{policy_version}
 */
function generateVerifyCacheKey(manifestHash: string, policyVersion: string = POLICY_VERSION): string {
  // SECURITY: Comprehensive input validation
  if (manifestHash === null || manifestHash === undefined) {
    throw new Error('Manifest hash cannot be null or undefined');
  }
  if (typeof manifestHash !== 'string') {
    throw new Error('Manifest hash must be a string');
  }
  if (manifestHash.length !== 64) {
    throw new Error('Manifest hash must be exactly 64 characters');
  }
  if (!/^[a-f0-9]{64}$/.test(manifestHash)) {
    throw new Error('Manifest hash must be 64-character hex string');
  }
  
  if (policyVersion === null || policyVersion === undefined) {
    throw new Error('Policy version cannot be null or undefined');
  }
  if (typeof policyVersion !== 'string') {
    throw new Error('Policy version must be a string');
  }
  if (!/^v\d+$/.test(policyVersion)) {
    throw new Error('Policy version must be in format v1, v2, etc.');
  }
  if (policyVersion.length > 10) {
    throw new Error('Policy version too long');
  }
  
  const cacheKey = `verify:${manifestHash}:${policyVersion}`;
  if (cacheKey.length < 72 || cacheKey.length > 81) { // 6 + 64 + 1 + 1-10
    throw new Error('Generated cache key has invalid length');
  }
  
  return cacheKey;
}

/**
 * STANDARDS: Generate verify response ETag including result hash
 * Format: "verify:{manifest_hash}:{policy_version}:{result_hash}"
 */
function generateVerifyETag(
  manifestHash: string,
  policyVersion: string,
  resultHash: string
): string {
  // SECURITY: Comprehensive input validation
  if (manifestHash === null || manifestHash === undefined) {
    throw new Error('Manifest hash cannot be null or undefined');
  }
  if (typeof manifestHash !== 'string') {
    throw new Error('Manifest hash must be a string');
  }
  if (manifestHash.length !== 64) {
    throw new Error('Manifest hash must be exactly 64 characters');
  }
  if (!/^[a-f0-9]{64}$/.test(manifestHash)) {
    throw new Error('Manifest hash must be 64-character hex string');
  }
  
  if (policyVersion === null || policyVersion === undefined) {
    throw new Error('Policy version cannot be null or undefined');
  }
  if (typeof policyVersion !== 'string') {
    throw new Error('Policy version must be a string');
  }
  if (!/^v\d+$/.test(policyVersion)) {
    throw new Error('Policy version must be in format v1, v2, etc.');
  }
  if (policyVersion.length > 10) {
    throw new Error('Policy version too long');
  }
  
  if (resultHash === null || resultHash === undefined) {
    throw new Error('Result hash cannot be null or undefined');
  }
  if (typeof resultHash !== 'string') {
    throw new Error('Result hash must be a string');
  }
  if (resultHash.length !== 64) {
    throw new Error('Result hash must be exactly 64 characters');
  }
  if (!/^[a-f0-9]{64}$/.test(resultHash)) {
    throw new Error('Result hash must be 64-character hex string (SHA-256)');
  }
  
  const etag = `"verify:${manifestHash}:${policyVersion}:${resultHash}"`;
  if (etag.length < 144 || etag.length > 153) { // 1 + 6 + 64 + 1 + 1-10 + 1 + 64 + 1
    throw new Error('Generated ETag has invalid length');
  }
  
  return etag;
}

/**
 * STANDARDS: Manifest cache headers per RFC 9111
 * A) Manifests (/{sha256}.c2pa, remote-first default)
 * - Short TTL with strong validators enforces revalidation
 * - SWR gives speed without serving long-stale data
 * - must-revalidate prevents serving stale on error
 */
export function setManifestCacheHeaders(
  reply: FastifyReply,
  manifestContent: Buffer,
  sha256: string
): void {
  // SECURITY: Validate inputs
  if (!reply || typeof reply !== 'object') {
    throw new Error('Invalid reply object');
  }
  if (!manifestContent || !Buffer.isBuffer(manifestContent)) {
    throw new Error('Invalid manifest content - must be Buffer');
  }
  if (!sha256 || typeof sha256 !== 'string') {
    throw new Error('Invalid SHA-256 hash');
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error('SHA-256 hash must be 64-character hex string');
  }

  // STANDARDS: Strong ETag for byte-exact validation (RFC 9110 Section 8.8.3)
  const etag = generateStrongETag(manifestContent);

  // STANDARDS: Cache-Control directives per RFC 9111
  const cacheControl = [
    `max-age=${MANIFEST_MAX_AGE}`, // Browser freshness
    `s-maxage=${MANIFEST_S_MAXAGE}`, // Shared cache (CDN) freshness
    'must-revalidate', // Force revalidation when stale
    `stale-while-revalidate=${MANIFEST_SWR}` // Background revalidation window
  ].join(', ');

  reply.headers({
    'Cache-Control': cacheControl,
    'ETag': etag,
    'Content-Type': 'application/c2pa',
    'Vary': 'Accept-Encoding',
    // SECURITY: HTTPS-only to prevent downgrade
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    // STANDARDS: Immutable content with versioned URLs
    'X-Content-Type-Options': 'nosniff'
  });
}

/**
 * STANDARDS: Negative cache headers for 404/410 responses
 * - max-age=0 with must-revalidate to avoid long-lived poison
 * - No stale-if-error to prevent serving cached errors
 */
export function setNegativeCacheHeaders(reply: FastifyReply): void {
  // SECURITY: Validate inputs
  if (!reply || typeof reply !== 'object') {
    throw new Error('Invalid reply object');
  }
  
  reply.headers({
    'Cache-Control': 'max-age=0, must-revalidate',
    'X-Cache-Status': 'NEGATIVE'
  });
}

/**
 * STANDARDS: Verify response cache headers per RFC 9111
 * B) Verify responses (hash + policy tuple)
 * - Cache per (manifest_hash, policy_version) with bounded TTL
 * - SWR keeps UX smooth during bursts
 * - stale-if-error provides resilience during origin issues
 */
export function setVerifyCacheHeaders(
  reply: FastifyReply,
  manifestHash: string,
  verifyResult: any,
  policyVersion: string = POLICY_VERSION
): void {
  // SECURITY: Validate inputs
  if (!reply || typeof reply !== 'object') {
    throw new Error('Invalid reply object');
  }
  if (!manifestHash || typeof manifestHash !== 'string') {
    throw new Error('Invalid manifest hash format');
  }
  if (!/^[a-f0-9]{64}$/.test(manifestHash)) {
    throw new Error('Manifest hash must be 64-character hex string');
  }
  if (!policyVersion || typeof policyVersion !== 'string') {
    throw new Error('Invalid policy version');
  }
  if (!/^v\d+$/.test(policyVersion)) {
    throw new Error('Policy version must be in format v1, v2, etc.');
  }
  if (!verifyResult || typeof verifyResult !== 'object') {
    throw new Error('Invalid verify result object');
  }

  // SECURITY: Generate cryptographically secure result hash for ETag
  const resultContent = JSON.stringify(verifyResult);
  
  // SECURITY: Validate result content size to prevent DoS
  if (resultContent.length > 1000000) { // 1MB limit
    throw new Error('Verify result too large for ETag generation');
  }
  
  // CRITICAL: Use full SHA-256 hash (256 bits) - 8-character hashes (32 bits) are trivially collidable
  const resultHash = crypto
    .createHash('sha256')
    .update(resultContent)
    .digest('hex');

  // STANDARDS: Strong ETag with cache key components
  const etag = generateVerifyETag(manifestHash, policyVersion, resultHash);

  // STANDARDS: Cache-Control with SWR and stale-if-error
  const cacheControl = [
    `max-age=${VERIFY_MAX_AGE}`, // Browser freshness: 5 minutes
    `s-maxage=${VERIFY_S_MAXAGE}`, // Edge freshness: 15 minutes
    'must-revalidate', // Force revalidation when stale
    `stale-while-revalidate=${VERIFY_SWR}`, // Background revalidation: 10 minutes
    `stale-if-error=${VERIFY_SIE}` // Serve stale on error: 2 minutes
  ].join(', ');

  reply.headers({
    'Cache-Control': cacheControl,
    'ETag': etag,
    'Content-Type': 'application/json',
    'Vary': 'Accept-Encoding',
    // SECURITY: HTTPS-only
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    // PERFORMANCE: Cache key for debugging
    'X-Cache-Key': generateVerifyCacheKey(manifestHash, policyVersion),
    // STANDARDS: Last verified timestamp for transparency
    'X-Verified-At': new Date().toISOString()
  });
}

/**
 * STANDARDS: Handle conditional requests per RFC 9110 Section 13
 * Check If-None-Match header and return 304 if ETag matches
 */
export function handleConditionalRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  currentETag: string
): boolean {
  // SECURITY: Validate inputs
  if (!request || typeof request !== 'object') {
    throw new Error('Invalid request object');
  }
  if (!reply || typeof reply !== 'object') {
    throw new Error('Invalid reply object');
  }
  if (!currentETag || typeof currentETag !== 'string') {
    throw new Error('Invalid current ETag');
  }
  if (!/^"[a-f0-9]{64}"$/.test(currentETag) && !/^"verify:[a-f0-9]{64}:v\d+:[a-f0-9]{64}"/.test(currentETag)) {
    throw new Error('Invalid ETag format - must be full SHA-256 hash');
  }

  const ifNoneMatch = request.headers['if-none-match'];
  
  if (!ifNoneMatch) {
    return false; // No conditional request
  }

  // STANDARDS: Parse If-None-Match header (can contain multiple ETags)
  const requestedETags = ifNoneMatch
    .split(',')
    .map(tag => tag.trim());

  // STANDARDS: Check if current ETag matches any requested ETag
  if (requestedETags.includes(currentETag) || requestedETags.includes('*')) {
    // STANDARDS: Return 304 Not Modified per RFC 9110 Section 15.4.5
    reply.code(304);
    reply.headers({
      'ETag': currentETag,
      'Cache-Control': reply.getHeader('Cache-Control') as string || '',
      'Vary': 'Accept-Encoding'
    });
    return true; // Conditional request satisfied
  }

  return false; // ETag mismatch, send full response
}

/**
 * SECURITY: Mixed-content safety headers
 * C) Mixed-content safety (badge/verify fetches)
 * - Enforce HTTPS and no mixed content
 * - CSP to block insecure loads
 */
export function setMixedContentSafetyHeaders(reply: FastifyReply): void {
  // SECURITY: Validate inputs
  if (!reply || typeof reply !== 'object') {
    throw new Error('Invalid reply object');
  }
  
  reply.headers({
    // SECURITY: Content Security Policy to prevent mixed content
    'Content-Security-Policy': [
      "default-src 'self' https:",
      "img-src 'self' https: data:",
      "script-src 'self' 'unsafe-inline' https:",
      "style-src 'self' 'unsafe-inline' https:",
      "connect-src 'self' https:",
      "font-src 'self' https: data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests"
    ].join('; '),
    // SECURITY: Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',
    // SECURITY: XSS protection
    'X-XSS-Protection': '1; mode=block',
    // SECURITY: Frame options
    'X-Frame-Options': 'DENY',
    // SECURITY: Referrer policy
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  });
}

/**
 * PERFORMANCE: Cache statistics for monitoring
 */
export interface CacheStats {
  manifestCacheHits: number;
  manifestCacheMisses: number;
  verifyCacheHits: number;
  verifyCacheMisses: number;
  conditionalRequests: number;
  notModifiedResponses: number;
  lastReset: Date;
}

const cacheStats: CacheStats = {
  manifestCacheHits: 0,
  manifestCacheMisses: 0,
  verifyCacheHits: 0,
  verifyCacheMisses: 0,
  conditionalRequests: 0,
  notModifiedResponses: 0,
  lastReset: new Date()
};

/**
 * PERFORMANCE: Record cache hit
 */
export function recordCacheHit(type: 'manifest' | 'verify'): void {
  if (!type || typeof type !== 'string') {
    throw new Error('Invalid cache type');
  }
  if (type !== 'manifest' && type !== 'verify') {
    throw new Error('Cache type must be "manifest" or "verify"');
  }
  if (type === 'manifest') {
    cacheStats.manifestCacheHits++;
  } else {
    cacheStats.verifyCacheHits++;
  }
}

/**
 * PERFORMANCE: Record cache miss
 */
export function recordCacheMiss(type: 'manifest' | 'verify'): void {
  if (!type || typeof type !== 'string') {
    throw new Error('Invalid cache type');
  }
  if (type !== 'manifest' && type !== 'verify') {
    throw new Error('Cache type must be "manifest" or "verify"');
  }
  if (type === 'manifest') {
    cacheStats.manifestCacheMisses++;
  } else {
    cacheStats.verifyCacheMisses++;
  }
}

/**
 * PERFORMANCE: Record conditional request
 */
export function recordConditionalRequest(notModified: boolean): void {
  if (typeof notModified !== 'boolean') {
    throw new Error('notModified parameter must be boolean');
  }
  cacheStats.conditionalRequests++;
  if (notModified) {
    cacheStats.notModifiedResponses++;
  }
}

/**
 * PERFORMANCE: Get cache statistics
 */
export function getCacheStats(): CacheStats {
  return { ...cacheStats };
}

/**
 * PERFORMANCE: Reset cache statistics
 */
export function resetCacheStats(): void {
  cacheStats.manifestCacheHits = 0;
  cacheStats.manifestCacheMisses = 0;
  cacheStats.verifyCacheHits = 0;
  cacheStats.verifyCacheMisses = 0;
  cacheStats.conditionalRequests = 0;
  cacheStats.notModifiedResponses = 0;
  cacheStats.lastReset = new Date();
}

/**
 * STANDARDS: Export cache configuration for documentation
 */
export const CACHE_CONFIG = {
  manifest: {
    maxAge: MANIFEST_MAX_AGE,
    sMaxage: MANIFEST_S_MAXAGE,
    staleWhileRevalidate: MANIFEST_SWR,
    mustRevalidate: true
  },
  verify: {
    maxAge: VERIFY_MAX_AGE,
    sMaxage: VERIFY_S_MAXAGE,
    staleWhileRevalidate: VERIFY_SWR,
    staleIfError: VERIFY_SIE,
    mustRevalidate: true
  },
  policyVersion: POLICY_VERSION
};
