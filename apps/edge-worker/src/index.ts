import { 
  normalizeHeaders, 
  extractLinkHeader, 
  createCacheHeaders, 
  assignExperimentArm, 
  bucketRoute,
  experimentTracer,
  tracer,
  type TraceAttributes,
  type SpanData
} from '@c2/utils';

interface Env {
  REMOTE_ONLY?: string;
  PRESERVE_PATHS?: string;
  DROP_IF_LINK_MISSING?: string;
  BREAK_GLASS_HOSTS?: string;
  MANIFEST_BASE?: string;
  BREAK_GLASS_KV?: KVNamespace;
  HMAC_SECRET?: string;
  // Phase 40 experiment configuration
  PHASE40_ENABLED?: string;
  EXPERIMENT_SEED?: string;
  TENANT_ID?: string;
  PRESERVE_CONTROLS?: string;
  ANALYTICS_KV?: KVNamespace;
}

export { };

interface BreakGlassEntry {
  hostname: string;
  reason: string;
  opened_by: string;
  opened_at: string;
  ttl_minutes: number;
  signature: string;
}

interface ExperimentConfig {
  enabled: boolean;
  seed: number;
  tenant_id: string;
  preserve_controls: PreserveControls;
}

interface PreserveControls {
  cloudflare_preserve_enabled: boolean;
  wp_image_strip_meta_disabled: boolean;
  fastly_io_default_strips: boolean;
}

interface ExperimentMetrics {
  arm: 'A_EMBED' | 'B_REMOTE';
  tenant_id: string;
  route_bucket: number;
  pathname: string;
  preserve_capable: boolean;
  embed_attempted: boolean;
  remote_fallback: boolean;
  timestamp: number;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startTime = Date.now();
    
    try {
      // SECURITY: Validate request object
      if (!req || !req.url) {
        return new Response('Invalid request', { 
          status: 400,
          headers: {
            'Content-Type': 'text/plain'
          }
        });
      }
      
      const url = new URL(req.url);
      const hostname = url.hostname;
      const pathname = url.pathname;
      
      // SECURITY: Enforce URL length limits
      if (req.url.length > 2048) {
        return new Response('URL too long', { 
          status: 414,
          headers: {
            'Content-Type': 'text/plain'
          }
        });
      }

      // Security: Validate hostname to prevent SSRF
      if (!isValidHostname(hostname)) {
        // SECURITY: Don't leak hostname validation details
        return new Response('Invalid request', { 
          status: 400,
          headers: {
            'Content-Type': 'text/plain'
          }
        });
      }
      
      // SECURITY: Validate pathname length
      if (pathname.length > 1024) {
        return new Response('Path too long', { 
          status: 414,
          headers: {
            'Content-Type': 'text/plain'
          }
        });
      }

      // Load Phase 40 experiment configuration
      const experiment = loadExperimentConfig(env);
      
      // Check break-glass protocol
      if (await isBreakGlassActive(env, hostname)) {
        // SECURITY: Log break-glass activation without leaking sensitive info
        console.log(`Break-glass activated for validation`);
        // SECURITY: Use sanitized fetch to prevent SSRF
        return sanitizedFetch(req);
      }

      // Forward to origin with timeout and error handling
      let originRes: Response;
      try {
        originRes = await fetch(req, {
          signal: AbortSignal.timeout(30000) // Security: 30 second timeout
        });
      } catch (fetchError) {
        // SECURITY: Don't leak error details in response
        console.error('Origin fetch failed:', fetchError);
        return new Response('Service temporarily unavailable', { 
          status: 503,
          headers: {
            'Content-Type': 'text/plain'
          }
        });
      }

      // Only process image assets
      const contentType = originRes.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) {
        return originRes;
      }

      // Get manifest hash from response headers
      const manifestHash = originRes.headers.get('x-manifest-hash');
      if (!manifestHash) {
        return originRes; // Nothing to do if no manifest hash
      }

      // Security: Validate manifest hash format
      if (!isValidHash(manifestHash)) {
        return new Response('Invalid manifest hash format', { 
          status: 400,
          headers: {
            'Content-Type': 'text/plain',
            'X-Error': 'Invalid manifest hash'
          }
        });
      }

      // Phase 40: Experiment assignment and processing
      let finalArm: 'A_EMBED' | 'B_REMOTE' = 'B_REMOTE'; // Default to remote
      let metrics: ExperimentMetrics | null = null;
      let rootSpan: any = null;
      
      if (experiment.enabled) {
        // Create root span for the request
        const headers = new Headers(req.headers);
        const traceContext = tracer.fromTraceContextHeaders(headers);
        rootSpan = tracer.createSpan('edge_worker_request', {
          'tenant.id': experiment.tenant_id,
          'route.pathname': pathname,
          'exp.enabled': true
        }, traceContext?.spanId);

        const experimentResult = processExperimentAssignment(
          pathname, 
          experiment, 
          originRes.headers,
          rootSpan
        );
        
        finalArm = experimentResult.arm;
        metrics = experimentResult.metrics;
        
        // Log experiment assignment for analysis
        await logExperimentMetrics(env.ANALYTICS_KV, metrics);
        
        // End the experiment assignment span
        tracer.endSpan(rootSpan);
      }

      // Build manifest URL
      const manifestBase = env.MANIFEST_BASE || 'https://manifests.survival.test';
      const manifestUrl = `${manifestBase}/${manifestHash}.c2pa`;

      // Create new headers with modifications
      const newHeaders = new Headers(originRes.headers);

      // Phase 40: Link header injection based on experiment arm
      if (finalArm === 'B_REMOTE' || !experiment.preserve_controls.cloudflare_preserve_enabled) {
        // Always add remote Link (ensures discovery) for arm B or as fallback
        const linkVal = `<${manifestUrl}>; rel="c2pa-manifest"`;
        const existingLink = newHeaders.get('link');
        if (!existingLink || !existingLink.includes('rel="c2pa-manifest"')) {
          newHeaders.append('link', linkVal);
        }
      }

      // Apply policy headers
      const policy = {
        remote_only: env.REMOTE_ONLY === 'true',
        preserve_paths: env.PRESERVE_PATHS?.split(',') || [],
        drop_if_link_missing: env.DROP_IF_LINK_MISSING === 'true',
        break_glass_hosts: env.BREAK_GLASS_HOSTS?.split(',') || []
      };

      if (policy.remote_only && !isPreservePath(pathname, policy.preserve_paths)) {
        newHeaders.set('content-security-policy', "default-src 'none'; img-src 'self' data:; frame-ancestors 'none'");
        newHeaders.set('x-c2-policy', 'remote-only');
      } else {
        newHeaders.set('x-c2-policy', 'preserve-allowed');
      }

      // Set cache headers for immutable assets (RFC 9111 compliance)
      const cacheHeaders = createCacheHeaders(true);
      Object.entries(cacheHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });

      // Add timing and experiment headers
      newHeaders.set('x-c2-edge-timing', (Date.now() - startTime).toString());
      
      if (experiment.enabled && metrics) {
        newHeaders.set('x-c2-experiment-arm', metrics.arm);
        newHeaders.set('x-c2-experiment-bucket', metrics.route_bucket.toString());
        newHeaders.set('x-c2-experiment-tenant', metrics.tenant_id);
        
        // Add trace context headers for downstream services
        if (rootSpan) {
          const traceHeaders = tracer.toTraceContextHeaders(rootSpan);
          Object.entries(traceHeaders).forEach(([key, value]: [string, string]) => {
            newHeaders.set(key, value);
          });
          
          // Trace manifest processing completion
          experimentTracer.traceManifestProcessing(
            experiment.tenant_id,
            manifestHash,
            contentType,
            finalArm,
            Date.now() - startTime
          );
        }
      }

      // Security: Add additional headers
      newHeaders.set('X-Content-Type-Options', 'nosniff');
      newHeaders.set('X-Frame-Options', 'DENY');
      newHeaders.set('X-XSS-Protection', '1; mode=block');
      newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');

      return new Response(originRes.body, {
        status: originRes.status,
        statusText: originRes.statusText,
        headers: newHeaders
      });
    } catch (error) {
      console.error('Edge worker error:', error);
      return new Response('Internal server error', { 
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
          'X-Error': 'Internal server error'
        }
      });
    }
  }
};

/**
 * Load Phase 40 experiment configuration from environment
 */
function loadExperimentConfig(env: Env): ExperimentConfig {
  const enabled = env.PHASE40_ENABLED === 'true';
  const seed = parseInt(env.EXPERIMENT_SEED || '42', 10);
  const tenant_id = env.TENANT_ID || 'unknown';
  
  // Parse preserve controls (JSON string or defaults)
  let preserve_controls: PreserveControls = {
    cloudflare_preserve_enabled: false,
    wp_image_strip_meta_disabled: false,
    fastly_io_default_strips: true // Default: Fastly IO strips metadata
  };
  
  if (env.PRESERVE_CONTROLS) {
    try {
      preserve_controls = { ...preserve_controls, ...JSON.parse(env.PRESERVE_CONTROLS) };
    } catch (error) {
      console.error('Failed to parse PRESERVE_CONTROLS:', error);
    }
  }
  
  return {
    enabled,
    seed,
    tenant_id,
    preserve_controls
  };
}

/**
 * Process Phase 40 experiment assignment with deterministic bucketing and OpenTelemetry tracing
 */
function processExperimentAssignment(
  pathname: string, 
  experiment: ExperimentConfig,
  responseHeaders: Headers,
  parentSpan?: SpanData
): { arm: 'A_EMBED' | 'B_REMOTE'; metrics: ExperimentMetrics } {
  // Deterministic route bucketing using murmur3
  const routeBucket = bucketRoute(pathname, experiment.seed);
  const arm = assignExperimentArm(pathname, experiment.seed);
  
  // Check if route is preserve-capable based on vendor controls
  const preserveCapable = isPreserveCapable(experiment.preserve_controls, responseHeaders);
  
  // Embed only attempted on A arm with preserve controls enabled
  const embedAttempted = arm === 'A_EMBED' && preserveCapable;
  const remoteFallback = arm === 'A_EMBED' && !preserveCapable;
  
  const finalArm = embedAttempted ? 'A_EMBED' : 'B_REMOTE';
  
  const metrics: ExperimentMetrics = {
    arm: finalArm,
    tenant_id: experiment.tenant_id,
    route_bucket: routeBucket,
    pathname,
    preserve_capable: preserveCapable,
    embed_attempted: embedAttempted,
    remote_fallback: remoteFallback,
    timestamp: Date.now()
  };
  
  // Trace experiment assignment with OpenTelemetry
  if (experiment.enabled) {
    try {
      experimentTracer.traceExperimentAssignment(
        experiment.tenant_id,
        pathname,
        finalArm,
        routeBucket
      );
      
      // Trace preservation control check (method not implemented yet)
      // TODO: Implement tracePreservationCheck method in ExperimentTracer
    } catch (error) {
      console.error('Failed to trace experiment assignment:', error);
    }
  }
  
  return { arm: finalArm, metrics };
}

/**
 * Determine if route is preserve-capable based on vendor controls
 */
function isPreserveCapable(controls: PreserveControls, responseHeaders: Headers): boolean {
  // Check Cloudflare Preserve Content Credentials header
  const cfPreserveHeader = responseHeaders.get('cf-preserve-credentials');
  const cloudflarePreserve = controls.cloudflare_preserve_enabled && cfPreserveHeader === 'true';
  
  // Check WordPress image_strip_meta filter (via custom header)
  const wpMetaHeader = responseHeaders.get('x-wp-strip-meta');
  const wpPreserve = controls.wp_image_strip_meta_disabled && wpMetaHeader === 'false';
  
  // Fastly IO strips by default - only preserve if explicitly disabled
  const fastlyHeader = responseHeaders.get('x-fastly-io');
  const fastlyPreserve = !controls.fastly_io_default_strips && fastlyHeader === 'preserve';
  
  return cloudflarePreserve || wpPreserve || fastlyPreserve;
}

/**
 * Log experiment metrics to analytics KV for later analysis
 */
async function logExperimentMetrics(analyticsKV: KVNamespace | undefined, metrics: ExperimentMetrics): Promise<void> {
  if (!analyticsKV) return;
  
  try {
    const key = `exp:${metrics.tenant_id}:${Date.now()}:${metrics.route_bucket}`;
    await analyticsKV.put(key, JSON.stringify(metrics), {
      expirationTtl: 14 * 24 * 60 * 60 // 14 days retention
    });
  } catch (error) {
    console.error('Failed to log experiment metrics:', error);
  }
}

/**
 * SECURITY: Sanitized fetch to prevent SSRF attacks
 */
function sanitizedFetch(req: Request): Promise<Response> {
  // SECURITY: Clone request to modify it safely
  const sanitizedReq = new Request(req);
  
  // SECURITY: Remove dangerous headers that could cause SSRF
  const dangerousHeaders = ['host', 'authorization', 'cookie'];
  for (const header of dangerousHeaders) {
    sanitizedReq.headers.delete(header);
  }
  
  // SECURITY: Add timeout to prevent hanging requests
  return fetch(sanitizedReq, {
    signal: AbortSignal.timeout(10000) // 10 second timeout for break-glass
  });
}

/**
 * SECURITY: Enhanced hostname validation to prevent SSRF
 */
function isValidHostname(hostname: string): boolean {
  // SECURITY: Input validation
  if (!hostname || typeof hostname !== 'string') {
    return false;
  }
  
  // SECURITY: Length limits
  if (hostname.length < 1 || hostname.length > 253) {
    return false;
  }
  
  // SECURITY: Prevent dangerous characters
  if (/[<>"'\\]/.test(hostname)) {
    return false;
  }
  
  // SECURITY: Prevent internal IP ranges
  const internalRanges = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^169\.254\./, // Link-local
    /^::1$/, // IPv6 localhost
    /^fc00:/, // IPv6 private
    /^fe80:/ // IPv6 link-local
  ];
  
  if (internalRanges.some(range => range.test(hostname))) {
    return false;
  }
  
  // Allow localhost, 127.0.0.1, and valid domain names
  const validPatterns = [
    /^localhost(:\d+)?$/,
    /^127\.0\.0\.1(:\d+)?$/,
    /^0\.0\.0\.0(:\d+)?$/,
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
  ];
  
  return validPatterns.some(pattern => pattern.test(hostname));
}

/**
 * SECURITY: Enhanced hash format validation
 */
function isValidHash(hash: string): boolean {
  // SECURITY: Input validation
  if (!hash || typeof hash !== 'string') {
    return false;
  }
  
  // SECURITY: Length validation
  if (hash.length !== 64) {
    return false;
  }
  
  // SECURITY: Format validation - only hex characters allowed
  return /^[a-fA-F0-9]{64}$/.test(hash);
}

async function isBreakGlassActive(env: Env, hostname: string): Promise<boolean> {
  if (!env.BREAK_GLASS_KV || !env.HMAC_SECRET) {
    return false;
  }

  try {
    const entry: BreakGlassEntry | null = await env.BREAK_GLASS_KV.get(hostname, 'json');
    if (!entry) {
      return false;
    }

    // Security: Validate entry structure
    if (!isValidBreakGlassEntry(entry)) {
      await env.BREAK_GLASS_KV.delete(hostname);
      return false;
    }

    // Check if entry has expired
    const openedAt = new Date(entry.opened_at);
    const expiresAt = new Date(openedAt.getTime() + entry.ttl_minutes * 60 * 1000);
    
    if (Date.now() > expiresAt.getTime()) {
      // Clean up expired entry
      await env.BREAK_GLASS_KV.delete(hostname);
      return false;
    }

    // Verify signature with proper HMAC
    if (!(await verifyBreakGlassSignature(entry, env.HMAC_SECRET))) {
      await env.BREAK_GLASS_KV.delete(hostname);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking break-glass status:', error);
    return false;
  }
}

// Security: Validate break-glass entry structure
function isValidBreakGlassEntry(entry: any): entry is BreakGlassEntry {
  return (
    entry &&
    typeof entry.hostname === 'string' &&
    typeof entry.reason === 'string' &&
    typeof entry.opened_by === 'string' &&
    typeof entry.opened_at === 'string' &&
    typeof entry.ttl_minutes === 'number' &&
    typeof entry.signature === 'string' &&
    entry.ttl_minutes > 0 &&
    entry.ttl_minutes <= 120 // Max 2 hours
  );
}

function isPreservePath(pathname: string, preservePaths: string[]): boolean {
  return preservePaths.some(p => pathname.startsWith(p));
}

// Security: Proper HMAC signature verification
async function verifyBreakGlassSignature(entry: BreakGlassEntry, secret: string): Promise<boolean> {
  try {
    // Create canonical message for signing
    const canonicalMessage = [
      entry.hostname,
      entry.reason,
      entry.opened_by,
      entry.opened_at,
      entry.ttl_minutes.toString()
    ].join('|');

    // Create expected HMAC using Web Crypto API
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(canonicalMessage);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const expectedHmac = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Security: Use timing-safe comparison to prevent timing attacks
    const expectedBuffer = new Uint8Array(signatureBuffer);
    const actualBuffer = new Uint8Array(
      entry.signature.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
    );

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    // Simple timing-safe comparison for small arrays
    let result = 0;
    for (let i = 0; i < expectedBuffer.length; i++) {
      result |= expectedBuffer[i] ^ actualBuffer[i];
    }
    return result === 0;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}
