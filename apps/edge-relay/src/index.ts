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

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface Env {
  TENANT_CONFIG?: string;
  RELAY_DEBUG?: string;
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
        debug(env, relayContext.tenantId, `cache hit for ${relayContext.manifestUrl.href}`);
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
        return problem(error.status, error.code, error.detail);
      }

      console.error('Edge relay error:', error);
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

  if (!u || !tenantId || !signature || !tsParam) {
    throw new RelayProblem(400, 'RelayBadParams', 'u, t, sig, and ts are required');
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
    manifestUrl = new URL(u);
  } catch {
    throw new RelayProblem(400, 'RelayInvalidUrl', 'manifest URL is invalid');
  }

  if (!['https:', 'http:'].includes(manifestUrl.protocol)) {
    throw new RelayProblem(400, 'RelayUnsupportedProtocol', 'manifest URL must be http or https');
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

  return tenant;
}

async function verifyTenantAccess(tenantId: string, tenant: TenantConfig, manifestUrl: URL): Promise<void> {
  const { host } = manifestUrl;

  const allowed = tenant.allowlist.some(entry => hostMatches(entry, manifestUrl));
  if (!allowed) {
    console.warn(`tenant ${tenantId} denied host ${host}`);
    throw new RelayProblem(403, 'RelayHostDenied', 'Manifest host denied for tenant');
  }

  if (tenant.enforceHttpsOnly && manifestUrl.protocol !== 'https:') {
    throw new RelayProblem(497, 'MixedContentBlocked', 'tenant requires HTTPS manifests');
  }
}

function hostMatches(entry: string, manifestUrl: URL): boolean {
  if (!entry) return false;

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
  upstreamHeaders.set('X-C2-Relay-Tenant', relayContext.tenantId);

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

      const nextUrl = new URL(location, currentUrl);

      if (nextUrl.protocol !== 'https:') {
        throw new RelayProblem(497, 'MixedContentBlocked', 'redirected to insecure scheme');
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
    console.warn('upstream network failure', error);
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
  return new Request(url.toString(), { headers });
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
  return new Response(
    JSON.stringify({
      type: `https://c2c/problems/${code}`,
      title: code,
      detail
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
    console.log(`[relay:${tenantId}] ${message}`);
  }
}
