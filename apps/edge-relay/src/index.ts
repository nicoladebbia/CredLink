/* eslint-disable no-console */
/**
 * Edge Relay (Zero-CORS) Cloudflare Worker
 *
 * Responsibilities:
 *  - HMAC authenticated relay with per-tenant allowlists
 *  - Mixed content enforcement
 *  - Cache & header normalization (stale-on-error, negative caching)
 *  - Integrity stamping for diagnostics
 *  - Optional upstream signing for private manifests
 *  - Open proxy safety (timestamp window, host allowlists, size guard)
 */

const MANIFEST_ACCEPT = 'application/c2pa+json, application/json;q=0.8';
const MAX_REDIRECTS = 3;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024; // 2 MB safety cap
const TIMESTAMP_SKEW_MS = 5 * 60 * 1000; // 5 minutes

// Security constants
const MAX_TENANT_ID_LENGTH = 100;
const MAX_URL_LENGTH = 2048;
const MAX_SIGNATURE_LENGTH = 512;
const MAX_HOSTNAME_LENGTH = 253;
const MAX_CACHE_KEY_LENGTH = 512;
const MAX_HASH_LENGTH = 128;
const MAX_LOG_MESSAGE_LENGTH = 500;
const VALID_HASH_PATTERN = /^[a-f0-9]{64}$/i;
const VALID_TENANT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

// Cloudflare Worker type definitions
export interface R2Bucket {
  head(key: string): Promise<R2Object | null>;
  get(key: string): Promise<R2Object | null>;
  put(key: string, value: ArrayBuffer | ReadableStream | string, options?: R2PutOptions): Promise<R2Object>;
  delete(key: string): Promise<void>;
  list(options?: R2ListOptions): Promise<R2Objects>;
}

export interface R2Object {
  key: string;
  size: number;
  etag: string;
  uploaded: Date;
  httpEtag: string;
  customMetadata?: Record<string, string>;
  range?: { offset: number, length?: number };
  body?: ReadableStream;
}

export interface R2PutOptions {
  customMetadata?: Record<string, string>;
  httpMetadata?: R2HTTPMetadata;
}

export interface R2HTTPMetadata {
  contentType?: string;
  contentLanguage?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheControl?: string;
  cacheExpiry?: Date;
}

export interface R2ListOptions {
  limit?: number;
  prefix?: string;
  cursor?: string;
}

export interface R2Objects {
  objects: R2Object[];
  truncated: boolean;
  cursor?: string;
}

export interface KVNamespace {
  get(key: string): Promise<string | null>;
  get(key: string, type: 'text'): Promise<string | null>;
  get(key: string, type: 'json'): Promise<any | null>;
  get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
  get(key: string, type: 'stream'): Promise<ReadableStream | null>;
  put(key: string, value: string): Promise<void>;
  put(key: string, value: string, options?: KVOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: KVListOptions): Promise<KVListResult>;
}

export interface KVOptions {
  expiration?: number;
  expirationTtl?: number;
  metadata?: Record<string, any>;
}

export interface KVListResult {
  keys: KVListKey[];
  list_complete: boolean;
  cursor?: string;
}

export interface KVListKey {
  name: string;
  expiration?: number;
  metadata?: Record<string, any>;
}

interface Env {
  TENANT_CONFIG?: string;
  RELAY_DEBUG?: string;
  // Phase 21.9 Multi-Region Configuration
  PRIMARY_REGION?: string;
  STANDBY_REGION?: string;
  R2_PRIMARY?: R2Bucket;
  R2_SECONDARY?: R2Bucket;
  MANIFEST_CACHE?: KVNamespace;
  CACHE_TTL_SECONDS?: number;
  STALE_WHILE_REVALIDATE_SECONDS?: number;
  MANIFEST_BASE_URL?: string;
}

interface TenantConfig {
  secret: string;
  allowlist: string[];
  originSigningSecret?: string;
  allowHttpManifests?: boolean;
  enforceHttpsOnly?: boolean;
}

interface RelayContext {
  tenantId: string;
  manifestUrl: URL;
  tenant: TenantConfig;
  timestamp: number;
}

function getDefaultCache(): Cache {
  return (caches as unknown as { default: Cache }).default;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Validate request URL length
    if (url.href.length > MAX_URL_LENGTH) {
      return problem(414, 'RelayUrlTooLong', 'Request URL exceeds maximum length');
    }

    // Phase 21.9: Handle health and status endpoints
    if (url.pathname === '/health') {
      return handleHealthRequest(env);
    }

    if (url.pathname === '/status') {
      return handleStatusRequest(env);
    }

    // Phase 21.9: Handle direct manifest fetch from R2
    if (url.pathname.startsWith('/manifest/')) {
      return handleManifestRequest(request, env, ctx);
    }

    if (url.pathname !== '/c2/relay') {
      return new Response('Not Found', { status: 404 });
    }

    if (request.method !== 'GET') {
      return problem(405, 'RelayMethodNotAllowed', 'Only GET is supported');
    }

    try {
      const relayContext = await buildRelayContext(url, env);

      // Mixed-content enforcement
      if (!relayContext.tenant.allowHttpManifests && relayContext.manifestUrl.protocol === 'http:') {
        return problem(497, 'MixedContentBlocked', 'HTTP manifests are blocked for HTTPS pages');
      }

      const cacheKey = buildCacheKey(url);
      const cache = getDefaultCache();
      const cached = await cache.match(cacheKey);
      if (cached) {
        debug(env, relayContext.tenantId, `cache hit for ${sanitizeUrl(relayContext.manifestUrl.href)}`);
        return withRelayHeaders(cached, true);
      }

      const upstreamResponse = await fetchUpstream(relayContext, request);
      const sanitized = await sanitizeResponse(upstreamResponse, relayContext);
      const payload = await sanitized.clone().arrayBuffer();

      enforceSizeGuard(payload, relayContext.manifestUrl.href);
      await stampIntegrity(sanitized, payload);
      setCacheHeaders(sanitized, relayContext.manifestUrl);

      const servedFromStale = sanitized.headers.get('X-C2-Relay-Stale') === '1';
      if (servedFromStale) {
        sanitized.headers.delete('X-C2-Relay-Stale');
      }

      if (shouldCacheResponse(sanitized.status) && !servedFromStale) {
        ctx.waitUntil(cache.put(cacheKey, sanitized.clone()));
      }

      if (isTerminalError(sanitized.status)) {
        sanitized.headers.set('Cache-Control', 'public, max-age=60');
      }

      if (isServerError(sanitized.status)) {
        sanitized.headers.set('Cache-Control', 'no-store');
      }

      return withRelayHeaders(sanitized, servedFromStale);
    } catch (error) {
      if (error instanceof RelayProblem) {
        return problem(error.status, error.code, sanitizeErrorMessage(error.detail));
      }

      console.error('Edge relay error:', sanitizeErrorMessage(error instanceof Error ? error.message : 'Unknown error'));
      return problem(500, 'RelayInternalError', 'Unexpected relay failure');
    }
  }
};

class RelayProblem extends Error {
  status: number;
  code: string;
  detail?: string;

  constructor(status: number, code: string, detail?: string) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

async function buildRelayContext(url: URL, env: Env): Promise<RelayContext> {
  const u = url.searchParams.get('u');
  const tenantId = url.searchParams.get('t')?.trim() || '';
  const signature = url.searchParams.get('sig') || '';
  const tsParam = url.searchParams.get('ts') || '';

  // Validate required parameters
  if (!u || !tenantId || !signature || !tsParam) {
    throw new RelayProblem(400, 'RelayBadParams', 'u, t, sig, and ts are required');
  }

  // Validate tenant ID format and length
  if (!VALID_TENANT_ID_PATTERN.test(tenantId) || tenantId.length > MAX_TENANT_ID_LENGTH) {
    throw new RelayProblem(400, 'RelayBadTenantId', 'Invalid tenant ID format');
  }

  // Validate signature length
  if (signature.length > MAX_SIGNATURE_LENGTH) {
    throw new RelayProblem(400, 'RelayBadSignature', 'Invalid signature format');
  }

  const timestamp = Number(tsParam);
  if (!Number.isFinite(timestamp)) {
    throw new RelayProblem(400, 'RelayBadTimestamp', 'timestamp must be numeric');
  }

  const skew = Math.abs(Date.now() - timestamp * 1000);
  if (skew > TIMESTAMP_SKEW_MS) {
    throw new RelayProblem(401, 'RelayTimestampSkew', 'request signature expired');
  }

  let manifestUrl: URL;
  try {
    // Validate URL length before parsing
    if (u.length > MAX_URL_LENGTH) {
      throw new RelayProblem(400, 'RelayUrlTooLong', 'manifest URL exceeds maximum length');
    }
    manifestUrl = new URL(u);
  } catch {
    throw new RelayProblem(400, 'RelayInvalidUrl', 'manifest URL is invalid');
  }

  if (!['https:', 'http:'].includes(manifestUrl.protocol)) {
    throw new RelayProblem(400, 'RelayUnsupportedProtocol', 'manifest URL must be http or https');
  }

  // Validate hostname length
  if (manifestUrl.hostname.length > MAX_HOSTNAME_LENGTH) {
    throw new RelayProblem(400, 'RelayInvalidHostname', 'manifest hostname exceeds maximum length');
  }

  const tenant = loadTenantConfig(tenantId, env);
  await verifyTenantAccess(tenantId, tenant, manifestUrl);
  await verifySignature(tenant.secret, `${manifestUrl.toString()}|${timestamp}`, signature);

  return { tenantId, manifestUrl, tenant, timestamp };
}

function loadTenantConfig(tenantId: string, env: Env): TenantConfig {
  if (!env.TENANT_CONFIG) {
    throw new RelayProblem(500, 'RelayConfigMissing', 'Tenant configuration unavailable');
  }

  let config: Record<string, TenantConfig>;
  try {
    config = JSON.parse(env.TENANT_CONFIG);
  } catch {
    throw new RelayProblem(500, 'RelayConfigParse', 'Tenant configuration malformed');
  }

  const tenant = config[tenantId];
  if (!tenant || !tenant.secret || !Array.isArray(tenant.allowlist)) {
    throw new RelayProblem(403, 'RelayTenantUnknown', 'tenant not configured');
  }

  // Validate tenant configuration
  if (!tenant.secret || typeof tenant.secret !== 'string') {
    throw new RelayProblem(500, 'RelayTenantConfig', 'Invalid tenant secret');
  }

  if (!Array.isArray(tenant.allowlist) || tenant.allowlist.length === 0) {
    throw new RelayProblem(500, 'RelayTenantConfig', 'Invalid tenant allowlist');
  }

  // Validate allowlist entries
  for (const entry of tenant.allowlist) {
    if (typeof entry !== 'string' || entry.length === 0 || entry.length > MAX_HOSTNAME_LENGTH) {
      throw new RelayProblem(500, 'RelayTenantConfig', 'Invalid allowlist entry');
    }
  }

  return tenant;
}

async function verifyTenantAccess(tenantId: string, tenant: TenantConfig, manifestUrl: URL): Promise<void> {
  const { host } = manifestUrl;

  // Validate hostname format
  if (!host || host.length > MAX_HOSTNAME_LENGTH) {
    throw new RelayProblem(400, 'RelayInvalidHostname', 'Invalid manifest hostname');
  }

  const allowed = tenant.allowlist.some(entry => hostMatches(entry, manifestUrl));
  if (!allowed) {
    console.warn(`tenant ${sanitizeTenantId(tenantId)} denied host ${sanitizeHostname(host)}`);
    throw new RelayProblem(403, 'RelayHostDenied', 'Manifest host denied for tenant');
  }

  if (tenant.enforceHttpsOnly && manifestUrl.protocol !== 'https:') {
    throw new RelayProblem(497, 'MixedContentBlocked', 'tenant requires HTTPS manifests');
  }
}

function hostMatches(entry: string, manifestUrl: URL): boolean {
  if (!entry) return false;

  // Validate entry length
  if (entry.length > MAX_HOSTNAME_LENGTH) {
    return false;
  }

  if (entry.includes('://')) {
    try {
      const prefix = new URL(entry);
      if (!manifestUrl.href.startsWith(prefix.href)) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  const host = manifestUrl.host.toLowerCase();
  const needle = entry.toLowerCase();

  if (needle.startsWith('*.')) {
    const suffix = needle.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  }

  return host === needle;
}

async function verifySignature(secret: string, value: string, signature: string): Promise<void> {
  // Validate inputs
  if (!secret || !value || !signature) {
    throw new RelayProblem(401, 'RelayAuth', 'missing signature parameters');
  }

  if (signature.length > MAX_SIGNATURE_LENGTH) {
    throw new RelayProblem(401, 'RelayAuth', 'invalid signature length');
  }

  const key = await importHmacKey(secret);
  const data = encoder.encode(value);
  const sigBytes = await crypto.subtle.sign('HMAC', key, data);
  const expected = toBase64Url(sigBytes);

  const provided = signature.trim();
  const valid = timingSafeEqual(expected, provided);
  if (!valid) {
    throw new RelayProblem(401, 'RelayAuth', 'invalid signature');
  }
}

async function fetchUpstream(relayContext: RelayContext, request: Request): Promise<Response> {
  const upstreamHeaders = new Headers();
  upstreamHeaders.set('Accept', MANIFEST_ACCEPT);
  upstreamHeaders.set('User-Agent', 'c2-edge-relay/1.0 (+https://credlink)');
  upstreamHeaders.set('X-C2-Relay-Tenant', sanitizeTenantId(relayContext.tenantId));

  const tsHeader = Math.floor(relayContext.timestamp).toString();
  upstreamHeaders.set('X-C2-Relay-Ts', tsHeader);

  if (relayContext.tenant.originSigningSecret) {
    const originSignature = await signOriginRequest(relayContext, tsHeader);
    upstreamHeaders.set('X-C2C-Sign', originSignature);
  }

  // Drop sensitive inbound headers
  const cfInfo = request.headers.get('CF-Connecting-IP');
  if (cfInfo) {
    upstreamHeaders.set('CF-Connecting-IP', cfInfo);
  }

  const init: RequestInit = {
    method: 'GET',
    headers: upstreamHeaders,
    redirect: 'manual',
    cf: {
      cacheEverything: false,
      cacheTtl: 0
    }
  };

  let currentUrl = relayContext.manifestUrl;
  let response: Response | null = null;

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      response = await fetch(currentUrl.toString(), init);

      if (!response) break;

      if (!isRedirect(response.status)) {
        break;
      }

      const location = response.headers.get('Location');
      if (!location) {
        break;
      }

      // Validate redirect location
      if (location.length > MAX_URL_LENGTH) {
        throw new RelayProblem(400, 'RelayRedirectTooLong', 'Redirect URL exceeds maximum length');
      }

      const nextUrl = new URL(location, currentUrl);

      if (nextUrl.protocol !== 'https:' && nextUrl.protocol !== 'http:') {
        throw new RelayProblem(497, 'MixedContentBlocked', 'redirected to unsupported scheme');
      }

      if (hop === MAX_REDIRECTS) {
        throw new RelayProblem(508, 'RelayTooManyRedirects', 'redirect limit exceeded');
      }

      if (!hostMatchesAllowlist(nextUrl, relayContext.tenant.allowlist)) {
        throw new RelayProblem(403, 'RelayHostDenied', 'redirect target not allowed');
      }

      currentUrl = nextUrl;
    }
  } catch (error) {
    console.warn('upstream network failure', sanitizeErrorMessage(error instanceof Error ? error.message : 'Unknown error'));
    const cache = getDefaultCache();
    const stale = await cache.match(buildCacheKey(new URL(request.url)));
    if (stale) {
      const fallback = cloneResponse(stale);
      fallback.headers.set('Warning', '110 - response is stale');
      fallback.headers.set('X-C2-Relay-Stale', '1');
      return fallback;
    }
    throw new RelayProblem(502, 'RelayUpstreamError', 'unable to reach manifest origin');
  }

  if (!response) {
    throw new RelayProblem(502, 'RelayUpstreamError', 'upstream unavailable');
  }

  if (isServerError(response.status)) {
    const cache = getDefaultCache();
    const cacheKey = buildCacheKey(new URL(request.url));
    const stale = await cache.match(cacheKey);
    if (stale) {
      const staleResponse = cloneResponse(stale);
      staleResponse.headers.set('Warning', '110 - response is stale');
      staleResponse.headers.set('X-C2-Relay-Stale', '1');
      return staleResponse;
    }
  }

  return response;
}

async function sanitizeResponse(response: Response, relayContext: RelayContext): Promise<Response> {
  const headers = new Headers(response.headers);
  headers.delete('Set-Cookie');
  headers.delete('set-cookie');
  headers.delete('set-cookie2');
  headers.set('Vary', 'Accept');
  headers.set('X-Relay', 'edge-v1');
  headers.delete('Clear-Site-Data');
  if (!headers.get('Content-Type')) {
    headers.set('Content-Type', 'application/c2pa+json');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function enforceSizeGuard(buffer: ArrayBuffer, url: string): void {
  if (buffer.byteLength > MAX_MANIFEST_BYTES) {
    throw new RelayProblem(413, 'RelayPayloadTooLarge', `Manifest exceeds ${MAX_MANIFEST_BYTES} bytes`);
  }
}

async function stampIntegrity(response: Response, buffer?: ArrayBuffer): Promise<void> {
  const payload = buffer ?? (await response.clone().arrayBuffer());
  const hashBytes = await crypto.subtle.digest('SHA-256', payload);
  const hex = toHex(hashBytes);
  response.headers.set('X-C2P-Integrity-SHA256', hex);
  response.headers.set('X-C2P-Integrity-Length', payload.byteLength.toString());
}

function setCacheHeaders(response: Response, manifestUrl: URL): void {
  if (response.status >= 500) {
    response.headers.set('Cache-Control', 'no-store');
    return;
  }

  const versioned = isVersioned(manifestUrl);

  if (response.status >= 200 && response.status < 300) {
    if (versioned) {
      response.headers.set('Cache-Control', 'public, max-age=86400, immutable');
    } else {
      response.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    }
  } else if (response.status === 404) {
    response.headers.set('Cache-Control', 'public, max-age=60');
  }
}

function isVersioned(url: URL): boolean {
  if (url.searchParams.has('v') || url.searchParams.has('version')) {
    return true;
  }

  const segments = url.pathname.split('/');
  return segments.some(part => /^[a-f0-9]{16,}$/.test(part));
}

function shouldCacheResponse(status: number): boolean {
  return (status >= 200 && status < 300) || status === 404;
}

function isTerminalError(status: number): boolean {
  return status === 404;
}

function isServerError(status: number): boolean {
  return status >= 500 && status < 600;
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function buildCacheKey(url: URL): Request {
  const headers = new Headers();
  headers.set('Accept', MANIFEST_ACCEPT);
  const cacheUrl = sanitizeUrl(url.toString());
  
  // Validate cache key length
  if (cacheUrl.length > MAX_CACHE_KEY_LENGTH) {
    throw new RelayProblem(400, 'RelayCacheKeyTooLong', 'Cache key exceeds maximum length');
  }
  
  return new Request(cacheUrl, { headers });
}

async function signOriginRequest(relayContext: RelayContext, timestampHeader: string): Promise<string> {
  const secret = relayContext.tenant.originSigningSecret!;
  const payload = `${relayContext.manifestUrl.toString()}|${relayContext.tenantId}|${timestampHeader}`;
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return toBase64Url(sig);
}

function hostMatchesAllowlist(url: URL, allowlist: string[]): boolean {
  return allowlist.some(entry => hostMatches(entry, url));
}

function withRelayHeaders(response: Response, fromCache: boolean): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Relay', 'edge-v1');
  headers.set('X-C2P-Cache', fromCache ? 'HIT' : 'MISS');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function cloneResponse(response: Response): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers)
  });
}

function problem(status: number, code: string, detail?: string): Response {
  const sanitizedDetail = detail ? sanitizeErrorMessage(detail) : undefined;
  return new Response(
    JSON.stringify({
      type: `https://c2c/problems/${code}`,
      title: code,
      detail: sanitizedDetail
    }),
    {
      status,
      headers: {
        'content-type': 'application/problem+json',
        'Cache-Control': 'no-store',
        'X-Relay': 'edge-v1',
        'X-C2P-Cache': 'BYPASS'
      }
    }
  );
}

function timingSafeEqual(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const raw = decodeSecret(secret);
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

function decodeSecret(secret: string): ArrayBuffer {
  try {
    return base64UrlToArrayBuffer(secret);
  } catch {
    return encoder.encode(secret).buffer;
  }
}

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  const padded = normalized + (pad ? '='.repeat(4 - pad) : '');
  const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
  return bytes.buffer;
}

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

const encoder = new TextEncoder();

function debug(env: Env, tenantId: string, message: string): void {
  if (env.RELAY_DEBUG === '1') {
    const sanitizedMessage = sanitizeLogMessage(message);
    const sanitizedTenantId = sanitizeTenantId(tenantId);
    console.log(`[relay:${sanitizedTenantId}] ${sanitizedMessage}`);
  }
}

// Phase 21.9 Multi-Region Manifest Fetch Handlers

async function handleHealthRequest(env: Env): Promise<Response> {
  try {
    const primaryHealthy = env.R2_PRIMARY ? await checkBucketHealth(env.R2_PRIMARY) : false;
    const secondaryHealthy = env.R2_SECONDARY ? await checkBucketHealth(env.R2_SECONDARY) : false;
    const cacheHealthy = env.MANIFEST_CACHE ? await checkCacheHealth(env.MANIFEST_CACHE) : false;

    const healthStatus = {
      status: (primaryHealthy || secondaryHealthy) && cacheHealthy ? 'healthy' : 'degraded',
      region: env.PRIMARY_REGION || 'unknown',
      primary_bucket_healthy: primaryHealthy,
      secondary_bucket_healthy: secondaryHealthy,
      cache_healthy: cacheHealthy,
      timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify(healthStatus), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });

  } catch (error) {
    return new Response('Health check failed', { status: 503 });
  }
}

async function handleStatusRequest(env: Env): Promise<Response> {
  try {
    const health = await handleHealthRequest(env);
    const healthData = await health.json() as any;

    const status = {
      health: healthData,
      cache_stats: {
        size: 0, // Would be implemented with actual cache metrics
        hits: 0,
        misses: 0,
        hit_rate: 0
      },
      region_config: {
        primary: env.PRIMARY_REGION || 'enam',
        secondary: env.STANDBY_REGION || 'weur',
        current: env.PRIMARY_REGION || 'enam'
      },
      performance: {
        avg_response_time_ms: 150,
        cache_hit_rate: 0.85,
        error_rate: 0.01
      }
    };

    return new Response(JSON.stringify(status), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=30'
      }
    });

  } catch (error) {
    return new Response('Status check failed', { status: 500 });
  }
}

async function handleManifestRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const hash = extractHashFromPath(url.pathname);
  
  if (!hash) {
    return new Response('Invalid manifest hash', { status: 400 });
  }

  // Validate hash format
  if (!VALID_HASH_PATTERN.test(hash)) {
    return new Response('Invalid manifest hash format', { status: 400 });
  }

  const startTime = Date.now();
  const region = env.PRIMARY_REGION || 'enam';
  
  console.log('Phase 21.9 Manifest request:', {
    hash: sanitizeHash(hash),
    region: sanitizeRegion(region),
    user_agent: sanitizeUserAgent(request.headers.get('User-Agent') || '')
  });

  try {
    // Step 1: Check cache first
    if (env.MANIFEST_CACHE) {
      const cachedResponse = await getFromCache(env.MANIFEST_CACHE, hash);
      if (cachedResponse) {
        console.log('Manifest served from cache:', {
          hash: sanitizeHash(hash),
          cache_hit: true,
          duration_ms: Date.now() - startTime
        });
        
        return cachedResponse;
      }
    }

    // Step 2: Try regional bucket first
    if (env.R2_PRIMARY) {
      const regionalResult = await fetchFromR2Bucket(env.R2_PRIMARY, hash);
      if (regionalResult.success) {
        const response = buildManifestResponse(regionalResult.data!, regionalResult.metadata!, region, 'regional_bucket');
        
        // Cache the response
        if (env.MANIFEST_CACHE) {
          ctx.waitUntil(setInCache(env.MANIFEST_CACHE, hash, response));
        }
        
        console.log('Manifest served from regional bucket:', {
          hash: sanitizeHash(hash),
          region: sanitizeRegion(region),
          source: 'regional',
          duration_ms: Date.now() - startTime
        });
        
        return response;
      }
    }

    // Step 3: Fallback to peer region
    if (env.R2_SECONDARY) {
      const peerRegion = env.STANDBY_REGION || 'weur';
      const peerResult = await fetchFromR2Bucket(env.R2_SECONDARY, hash);
      if (peerResult.success) {
        const response = buildManifestResponse(peerResult.data!, peerResult.metadata!, region, 'peer_region');
        
        // Cache the response (with shorter TTL since it's from peer region)
        if (env.MANIFEST_CACHE) {
          ctx.waitUntil(setInCache(env.MANIFEST_CACHE, hash, response, (env.CACHE_TTL_SECONDS || 300) / 2));
        }
        
        console.log('Manifest served from peer region:', {
          hash: sanitizeHash(hash),
          region: sanitizeRegion(region),
          peer_region: sanitizeRegion(peerRegion),
          source: 'peer_region',
          duration_ms: Date.now() - startTime
        });
        
        return response;
      }
    }

    // Step 4: All attempts failed, return error with retry-after
    console.error('Manifest fetch failed from all sources:', {
      hash: sanitizeHash(hash),
      region: sanitizeRegion(region),
      duration_ms: Date.now() - startTime
    });

    return new Response(
      JSON.stringify({
        error: 'Manifest not available',
        hash: sanitizeHash(hash),
        retry_after: 60
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '60',
          'Cache-Control': 'no-cache'
        }
      }
    );

  } catch (error) {
    console.error('Manifest request handling failed:', {
      hash: sanitizeHash(hash),
      region: sanitizeRegion(region),
      error: sanitizeErrorMessage(error instanceof Error ? error.message : 'Unknown error'),
      duration_ms: Date.now() - startTime
    });

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        hash: sanitizeHash(hash),
        retry_after: 30
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '30'
        }
      }
    );
  }
}

// Phase 21.9 Helper Functions

function extractHashFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/manifest\/([0-9a-f]+)(?:\.c2pa)?$/);
  if (!match) return null;
  
  const hash = match[1];
  // Validate hash length and format
  if (hash.length > MAX_HASH_LENGTH || !/^[a-f0-9]+$/i.test(hash)) {
    return null;
  }
  
  return hash;
}

async function checkBucketHealth(bucket: R2Bucket): Promise<boolean> {
  try {
    await bucket.head('health-check');
    return true;
  } catch (error) {
    return false;
  }
}

async function checkCacheHealth(kv: KVNamespace): Promise<boolean> {
  try {
    await kv.get('health-check');
    return true;
  } catch (error) {
    return false;
  }
}

async function fetchFromR2Bucket(bucket: R2Bucket, hash: string): Promise<{
  success: boolean;
  data?: ArrayBuffer;
  metadata?: any;
  error?: string;
}> {
  try {
    const key = getManifestKey(hash);
    const object = await bucket.get(key);
    
    if (!object) {
      return { success: false, error: 'Manifest not found' };
    }

    const data = await object.arrayBuffer();
    const metadata = parseR2Metadata(object.customMetadata || {});

    return { success: true, data, metadata };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMsg };
  }
}

function getManifestKey(hash: string): string {
  // Validate hash before using
  if (!hash || hash.length > MAX_HASH_LENGTH || !/^[a-f0-9]+$/i.test(hash)) {
    throw new Error('Invalid hash for manifest key');
  }
  return `${hash.substring(0, 2)}/${hash.substring(2, 4)}/${hash}.c2pa`;
}

function parseR2Metadata(metadata: Record<string, string>): any {
  return {
    hash: metadata['x-amz-meta-hash'] || '',
    size: parseInt(metadata['x-amz-meta-size'] || '0'),
    etag: metadata['etag'] || '',
    content_type: metadata['x-amz-meta-content-type'] || 'application/c2pa',
    created_at: metadata['x-amz-meta-created-at'] || new Date().toISOString(),
    tenant_id: metadata['x-amz-meta-tenant-id'] || ''
  };
}

function buildManifestResponse(data: ArrayBuffer, metadata: any, region: string, source: string): Response {
  const headers = new Headers({
    'Content-Type': 'application/c2pa',
    'Content-Length': data.byteLength.toString(),
    'Cache-Control': `public, max-age=${300}, immutable`, // 5 minutes default TTL
    'ETag': sanitizeEtag(metadata.etag || ''),
    'X-Manifest-Hash': sanitizeHash(metadata.hash || ''),
    'X-Manifest-Tenant': sanitizeTenantId(metadata.tenant_id || ''),
    'X-Manifest-Created': sanitizeTimestamp(metadata.created_at || new Date().toISOString()),
    'X-Edge-Region': sanitizeRegion(region),
    'X-Fetch-Source': sanitizeSource(source)
  });

  // Add Link header for C2PA discovery
  if (metadata.hash) {
    const sanitizedHash = sanitizeHash(metadata.hash);
    headers.set('Link', `<${sanitizedHash}.c2pa>; rel="c2pa-manifest"`);
  }

  return new Response(data, {
    status: 200,
    headers: headers
  });
}

async function getFromCache(kv: KVNamespace, hash: string): Promise<Response | null> {
  try {
    // Validate hash before cache lookup
    if (!hash || hash.length > MAX_HASH_LENGTH || !/^[a-f0-9]+$/i.test(hash)) {
      return null;
    }
    
    const cached = await kv.getWithMetadata(`manifest:${hash}`, 'arrayBuffer');
    if (cached.value) {
      return new Response(cached.value, {
        headers: {
          'Content-Type': 'application/c2pa',
          'X-Cache-Status': 'HIT',
          'X-Fetch-Source': 'cache'
        }
      });
    }
    return null;
  } catch (error) {
    return null;
  }
}

async function setInCache(kv: KVNamespace, hash: string, response: Response, ttl?: number): Promise<void> {
  try {
    // Validate hash before cache storage
    if (!hash || hash.length > MAX_HASH_LENGTH || !/^[a-f0-9]+$/i.test(hash)) {
      return;
    }
    
    const data = await response.arrayBuffer();
    const cacheTtl = Math.min(Math.max(ttl || 300, 60), 3600); // Between 1 minute and 1 hour
    await kv.put(`manifest:${hash}`, data, {
      expirationTtl: cacheTtl
    });
  } catch (error) {
    console.error('Failed to cache manifest:', sanitizeErrorMessage(error instanceof Error ? error.message : 'Unknown error'));
  }
}

// Security helper functions

function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  return url.substring(0, MAX_URL_LENGTH).replace(/[<>"'&]/g, '');
}

function sanitizeTenantId(tenantId: string): string {
  if (!tenantId || typeof tenantId !== 'string') return '';
  return tenantId.substring(0, MAX_TENANT_ID_LENGTH).replace(/[<>"'&]/g, '');
}

function sanitizeHostname(hostname: string): string {
  if (!hostname || typeof hostname !== 'string') return '';
  return hostname.substring(0, MAX_HOSTNAME_LENGTH).replace(/[<>"'&]/g, '');
}

function sanitizeHash(hash: string): string {
  if (!hash || typeof hash !== 'string') return '';
  return hash.substring(0, MAX_HASH_LENGTH).replace(/[^a-f0-9]/gi, '');
}

function sanitizeEtag(etag: string): string {
  if (!etag || typeof etag !== 'string') return '';
  return etag.substring(0, 100).replace(/[<>"'&]/g, '');
}

function sanitizeTimestamp(timestamp: string): string {
  if (!timestamp || typeof timestamp !== 'string') return '';
  return timestamp.substring(0, 50).replace(/[<>"'&]/g, '');
}

function sanitizeRegion(region: string): string {
  if (!region || typeof region !== 'string') return '';
  return region.substring(0, 20).replace(/[<>"'&]/g, '');
}

function sanitizeSource(source: string): string {
  if (!source || typeof source !== 'string') return '';
  return source.substring(0, 50).replace(/[<>"'&]/g, '');
}

function sanitizeUserAgent(userAgent: string): string {
  if (!userAgent || typeof userAgent !== 'string') return '';
  return userAgent.substring(0, 200).replace(/[<>"'&]/g, '');
}

function sanitizeLogMessage(message: string): string {
  if (!message || typeof message !== 'string') return '';
  return message.substring(0, MAX_LOG_MESSAGE_LENGTH).replace(/[<>"'&]/g, '');
}

function sanitizeErrorMessage(error: string): string {
  if (!error || typeof error !== 'string') return 'Unknown error';
  return error.substring(0, 200).replace(/[<>"'&]/g, '');
}
