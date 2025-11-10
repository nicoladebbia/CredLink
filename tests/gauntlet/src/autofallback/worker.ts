/**
 * Phase 6 - Optimizer Auto-Fallback: Cloudflare Worker
 * Enterprise-grade edge detection and policy enforcement
 */

import { detectSignals, routeFrom, isPreservePath } from './detectors';
import { ensureManifestLink, injectBadge, maybeEmbedProbe } from './html';
import { Env, IngestEvent, BreakGlassConfig } from './types';
import { RateLimiter, RATE_LIMITS } from './rate-limiter';
import { SecurityValidator } from './security';
import { ServiceCircuitBreaker } from './circuit-breaker';
import { HealthChecker, DEFAULT_HEALTH_CONFIG } from './health-check';
import { productionMonitor, MetricSnapshot } from './monitoring';
import { logger, LogLevel } from './logging';
import { disasterRecovery } from './backup';

// Initialize production components
const rateLimiters = {
  api: RateLimiter.middleware(RATE_LIMITS.API),
  admin: RateLimiter.middleware(RATE_LIMITS.ADMIN),
  general: RateLimiter.middleware(RATE_LIMITS.GENERAL)
};

const healthChecker = new HealthChecker(DEFAULT_HEALTH_CONFIG, '1.0.0');

// Admin request handler with comprehensive security
async function handleAdminRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const correlationId = logger.generateCorrelationId();
  const startTime = performance.now();
  
  logger.info('Admin request received', {
    correlationId,
    route: url.pathname,
    method: request.method,
    userAgent: request.headers.get('User-Agent')
  });
  
  try {
    // Rate limiting
    const rateLimitResult = rateLimiters.admin(request);
    if (!rateLimitResult.allowed) {
      logger.logRateLimitEvent('admin', rateLimitResult.toString(), RATE_LIMITS.ADMIN.maxRequests, rateLimitResult.used);
      
      return new Response('Rate limit exceeded', { 
        status: 429,
        headers: {
          'X-RateLimit-Limit': RATE_LIMITS.ADMIN.maxRequests.toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
          'X-Correlation-ID': correlationId
        }
      });
    }
    
    // Security validation
    const routeValidation = SecurityValidator.validateRoute(
      url.searchParams.get('route') || 'default'
    );
    
    if (!routeValidation.valid) {
      logger.logSecurityEvent('invalid_route', 'admin', { 
        route: url.searchParams.get('route'),
        errors: routeValidation.errors 
      });
      
      return new Response(`Invalid route: ${routeValidation.errors.join(', ')}`, { 
        status: 400,
        headers: { 'X-Correlation-ID': correlationId }
      });
    }
    
    // Authorization check
    const authHeader = request.headers.get('Authorization');
    const tokenValidation = SecurityValidator.validateToken(
      authHeader?.slice(7) || '', 
      env.ADMIN_TOKEN
    );
    
    if (!tokenValidation.valid) {
      logger.logSecurityEvent('invalid_token', 'admin', { 
        tokenLength: authHeader?.length || 0
      });
      
      return new Response('Forbidden', { 
        status: 403,
        headers: { 'X-Correlation-ID': correlationId }
      });
    }
    
    const routeKey = routeValidation.sanitized;
    
    let response: Response;
    
    switch (url.pathname) {
      case '/_c2/policy':
        response = await ServiceCircuitBreaker.fetchWithCircuitBreaker(
          'ADMIN_API',
          `https://do/policy?route=${encodeURIComponent(routeKey)}`,
          {
            method: 'GET',
            headers: { 
              'Content-Type': 'application/json',
              'X-Correlation-ID': correlationId
            }
          }
        );
        break;
        
      case '/_c2/admin':
        response = await ServiceCircuitBreaker.fetchWithCircuitBreaker(
          'ADMIN_API',
          `https://do/admin?route=${encodeURIComponent(routeKey)}`,
          {
            method: 'GET',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': authHeader!,
              'X-Correlation-ID': correlationId
            }
          }
        );
        break;
        
      case '/_c2/health':
        const healthResult = await healthChecker.runHealthChecks(env);
        response = HealthChecker.generateHealthResponse(healthResult);
        break;
        
      case '/_c2/metrics':
        const format = url.searchParams.get('format') as 'json' | 'prometheus' | 'grafana' || 'json';
        const metrics = productionMonitor.exportMetrics(format);
        response = new Response(metrics, {
          headers: { 
            'Content-Type': format === 'prometheus' ? 'text/plain' : 'application/json',
            'X-Correlation-ID': correlationId
          }
        });
        break;
        
      case '/_c2/backup':
        if (request.method === 'POST') {
          const backup = await disasterRecovery.createBackup('full');
          response = new Response(JSON.stringify(backup), {
            headers: { 
              'Content-Type': 'application/json',
              'X-Correlation-ID': correlationId
            }
          });
        } else {
          response = new Response('Method not allowed', { 
            status: 405,
            headers: { 'X-Correlation-ID': correlationId }
          });
        }
        break;
        
      default:
        response = new Response('Not found', { 
          status: 404,
          headers: { 'X-Correlation-ID': correlationId }
        });
    }
    
    // Log successful admin request
    const duration = performance.now() - startTime;
    logger.info('Admin request completed', {
      correlationId,
      route: url.pathname,
      status: response.status,
      performance: {
        duration,
        operation: 'admin_request'
      }
    });
    
    // Add correlation ID to response
    response.headers.set('X-Correlation-ID', correlationId);
    
    return response;
    
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error('Admin request failed', error as Error, {
      correlationId,
      route: url.pathname,
      performance: {
        duration,
        operation: 'admin_request'
      }
    });
    
    return new Response('Internal server error', { 
      status: 500,
      headers: { 'X-Correlation-ID': correlationId }
    });
  }
}

// Enhanced break-glass configuration with monitoring
async function getBreakGlassConfig(env: Env, routeKey: string): Promise<BreakGlassConfig | null> {
  const startTime = performance.now();
  
  try {
    const key = `breakglass:${routeKey}`;
    const value = await ServiceCircuitBreaker.fetchWithCircuitBreaker(
      'KV_STORAGE',
      `https://kv/${key}`
    );
    
    if (value) {
      // Validate the configuration
      const config = JSON.parse(value);
      const reasonValidation = SecurityValidator.validateReason(config.reason);
      
      if (!reasonValidation.valid) {
        logger.warn('Invalid break-glass reason', {
          route: routeKey,
          errors: reasonValidation.errors
        });
        return null;
      }
      
      const validatedConfig = {
        ...config,
        reason: reasonValidation.sanitized
      };
      
      logger.debug('Break-glass config loaded', {
        route: routeKey,
        mode: validatedConfig.mode,
        performance: {
          duration: performance.now() - startTime,
          operation: 'breakglass_lookup'
        }
      });
      
      return validatedConfig;
    }
    
    return null;
  } catch (error) {
    logger.error('Failed to get break-glass config', error as Error, {
      route: routeKey,
      performance: {
        duration: performance.now() - startTime,
        operation: 'breakglass_lookup'
      }
    });
    return null;
  }
}

// Enhanced policy caching with monitoring
async function getPolicyCached(env: Env, routeKey: string, breakGlass: BreakGlassConfig | null): Promise<{
  route: string;
  mode: string;
  reason?: string;
  cachedAt: number;
  error?: string;
}> {
  const startTime = performance.now();
  
  try {
    // Check break-glass first
    if (breakGlass) {
      logger.logPolicyDecision(routeKey, 'CACHED', breakGlass.mode, `Break-glass override: ${breakGlass.reason}`, 0);
      
      return {
        route: routeKey,
        mode: breakGlass.mode,
        reason: `Break-glass override: ${breakGlass.reason}`,
        cachedAt: Date.now()
      };
    }
    
    // Check cache with circuit breaker
    const cacheKey = `policy:${routeKey}`;
    const cached = await ServiceCircuitBreaker.fetchWithCircuitBreaker(
      'KV_STORAGE',
      `https://kv/${cacheKey}`
    );
    
    if (cached) {
      const parsed = JSON.parse(cached);
      // Check if cache is still valid (2 second TTL)
      if (Date.now() - parsed.cachedAt < 2000) {
        logger.debug('Policy cache hit', {
          route: routeKey,
          mode: parsed.mode,
          performance: {
            duration: performance.now() - startTime,
            operation: 'policy_cache_hit'
          }
        });
        
        return parsed;
      }
    }
    
    // Fail open - return normal mode
    const defaultPolicy = {
      route: routeKey,
      mode: env.REMOTE_ONLY_DEFAULT === '1' ? 'FALLBACK_REMOTE_ONLY' : 'NORMAL',
      cachedAt: Date.now()
    };
    
    logger.debug('Using default policy', {
      route: routeKey,
      mode: defaultPolicy.mode,
      performance: {
        duration: performance.now() - startTime,
        operation: 'policy_default'
      }
    });
    
    return defaultPolicy;
  } catch (error) {
    logger.error('Failed to get cached policy', error as Error, {
      route: routeKey,
      performance: {
        duration: performance.now() - startTime,
        operation: 'policy_cache_lookup'
      }
    });
    
    // Fail open - return normal mode
    return {
      route: routeKey,
      mode: 'NORMAL',
      error: 'Cache unavailable',
      cachedAt: Date.now()
    };
  }
}

// Enhanced policy enforcement with monitoring
async function enforcePolicy(response: Response, policy: {
  route: string;
  mode: string;
  reason?: string;
  cachedAt: number;
  error?: string;
}, env: Env, url: URL): Promise<Response> {
  const startTime = performance.now();
  
  try {
    let modifiedResponse = response;
    
    // If in fallback mode and badge is required, inject badge
    if (policy.mode === 'FALLBACK_REMOTE_ONLY' && env.BADGE_REQUIRED === '1') {
      modifiedResponse = await injectBadge(response);
      
      // Tighten CSP
      const csp = "default-src 'none'; img-src 'self' data: https:; style-src 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'";
      modifiedResponse.headers.set('Content-Security-Policy', csp);
      
      logger.debug('Badge injected and CSP tightened', {
        route: url.pathname,
        policy: policy.mode
      });
    }
    
    // Add policy header for debugging
    modifiedResponse.headers.set('X-C2-Policy', policy.mode.toLowerCase());
    
    // Log policy enforcement
    logger.debug('Policy enforced', {
      route: url.pathname,
      mode: policy.mode,
      performance: {
        duration: performance.now() - startTime,
        operation: 'policy_enforcement'
      }
    });
    
    return modifiedResponse;
  } catch (error) {
    logger.error('Policy enforcement failed', error as Error, {
      route: url.pathname,
      policy: policy.mode,
      performance: {
        duration: performance.now() - startTime,
        operation: 'policy_enforcement'
      }
    });
    
    // Return original response if enforcement fails
    return response;
  }
}

// Record metrics for monitoring
function recordMetrics(routeKey: string, policy: {
  route: string;
  mode: string;
  reason?: string;
  cachedAt: number;
  error?: string;
}, signals: {
  id: string;
  weight: number;
}[], responseTime: number): void {
  const snapshot: MetricSnapshot = {
    timestamp: Date.now(),
    route: routeKey,
    mode: policy.mode,
    score: signals.reduce((sum, s) => sum + s.weight, 0),
    samples: 1,
    embedSurvival: Math.random() * 0.3 + 0.7, // Simulated 70-100%
    responseTime,
    errorRate: 0,
    circuitBreakerStatus: ServiceCircuitBreaker.getAllStats(),
    rateLimitStatus: {
      general: { used: 1, limit: RATE_LIMITS.GENERAL.maxRequests },
      admin: { used: 0, limit: RATE_LIMITS.ADMIN.maxRequests },
      api: { used: 0, limit: RATE_LIMITS.API.maxRequests }
    },
    memoryUsage: Math.random() * 0.5, // Simulated
    cpuUsage: Math.random() * 0.3 // Simulated
  };
  
  productionMonitor.recordMetrics(snapshot);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const correlationId = logger.generateCorrelationId();
    const startTime = performance.now();
    
    // Add correlation ID to request context
    request.headers.set('X-Correlation-ID', correlationId);
    
    try {
      // Handle health checks
      if (url.pathname === '/_c2/health') {
        const healthResult = await healthChecker.runHealthChecks(env);
        const response = HealthChecker.generateHealthResponse(healthResult);
        response.headers.set('X-Correlation-ID', correlationId);
        return response;
      }
      
      // Handle admin API routes
      if (url.pathname.startsWith('/_c2/')) {
        const response = await handleAdminRequest(request, env);
        response.headers.set('X-Correlation-ID', correlationId);
        return response;
      }
      
      // Rate limiting for general traffic
      const rateLimitResult = rateLimiters.general(request);
      if (!rateLimitResult.allowed) {
        logger.logRateLimitEvent('general', correlationId, RATE_LIMITS.GENERAL.maxRequests, rateLimitResult.used);
        
        return new Response('Rate limit exceeded', { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': RATE_LIMITS.GENERAL.maxRequests.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
            'X-Correlation-ID': correlationId
          }
        });
      }
      
      // Validate route
      const routeValidation = SecurityValidator.validateRoute(routeFrom(url));
      if (!routeValidation.valid) {
        logger.logSecurityEvent('invalid_route', 'worker', { 
          route: routeFrom(url),
          errors: routeValidation.errors,
          correlationId
        });
        
        return new Response('Invalid route', { 
          status: 400,
          headers: { 'X-Correlation-ID': correlationId }
        });
      }
      
      const routeKey = routeValidation.sanitized;
      
      // Check for break-glass override first
      const breakGlass = await getBreakGlassConfig(env, routeKey);
      
      // Fetch the origin/CDN response with circuit breaker
      let response = await ServiceCircuitBreaker.fetchWithCircuitBreaker(
        'CDN',
        request.url,
        {
          method: request.method,
          headers: SecurityValidator.sanitizeHeaders(request.headers),
          body: request.body
        }
      );
      
      // Create a copy for signal detection (to avoid consuming the body)
      const responseClone = response.clone();
      
      // Compute signals from response headers and URL
      const signals = detectSignals(url, responseClone.headers);
      
      // HTML fallback for manifest link
      if (isHtml(response)) {
        response = await ensureManifestLink(response, env, url);
        
        // Check if link was dropped
        const hasManifestLink = response.headers.get('X-Manifest-Hash');
        const originalHadLink = responseClone.headers.get('X-Manifest-Hash');
        
        if (originalHadLink && !hasManifestLink) {
          signals.push({ id: 'LINK_DROPPED', weight: 15 });
          logger.warn('Manifest link dropped', {
            route: routeKey,
            correlationId
          });
        }
      }
      
      // Determine if this is a preserve path
      const isPreserve = isPreservePath(url.pathname);
      
      // Lightweight embed probe for preserve pages (sampled)
      const embedProbe = await maybeEmbedProbe(response);
      if (isPreserve && embedProbe === false) {
        signals.push({ id: 'EMBED_FAIL', weight: 50 });
        logger.warn('Embed probe failed', {
          route: routeKey,
          correlationId
        });
      }
      
      // Get current policy (cached in KV for performance)
      const policy = await getPolicyCached(env, routeKey, breakGlass);
      
      // Enforce policy on response
      const enforcedResponse = await enforcePolicy(response, policy, env, url);
      
      // Record metrics
      const responseTime = performance.now() - startTime;
      recordMetrics(routeKey, policy, signals, responseTime);
      
      // Log successful request
      logger.logRequest(request, enforcedResponse, responseTime);
      
      // Add correlation ID to response
      enforcedResponse.headers.set('X-Correlation-ID', correlationId);
      
      // Async enqueue sample to Durable Object (non-blocking)
      const ingestEvent: IngestEvent = {
        route: routeKey,
        tsSec: Math.floor(Date.now() / 1000),
        signals,
        isPreserve,
        embedProbe
      };
      
      ctx.waitUntil(
        ServiceCircuitBreaker.fetchWithCircuitBreaker(
          'ADMIN_API',
          'https://do/ingest',
          {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-Correlation-ID': correlationId
            },
            body: JSON.stringify(ingestEvent)
          }
        ).catch(error => {
          logger.error('Failed to enqueue sample', error, {
            route: routeKey,
            correlationId
          });
        })
      );
      
      return enforcedResponse;
      
    } catch (error) {
      const responseTime = performance.now() - startTime;
      
      logger.error('Worker error', error as Error, {
        correlationId,
        route: url.pathname,
        performance: {
          duration: responseTime,
          operation: 'http_request'
        }
      });
      
      // Fail open - return original response without policy enforcement
      try {
        const fallbackResponse = await fetch(request);
        fallbackResponse.headers.set('X-Correlation-ID', correlationId);
        fallbackResponse.headers.set('X-C2-Fallback', 'error');
        return fallbackResponse;
      } catch (fetchError) {
        logger.critical('Fetch failed completely', fetchError as Error, {
          correlationId,
          route: url.pathname
        });
        
        return new Response('Service unavailable', { 
          status: 503,
          headers: { 
            'X-Correlation-ID': correlationId,
            'Retry-After': '60'
          }
        });
      }
    }
  }
};

async function getBreakGlassConfig(env: Env, routeKey: string): Promise<BreakGlassConfig | null> {
  try {
    const key = `breakglass:${routeKey}`;
    return await env.C2_BREAKGLASS.get(key);
  } catch (error) {
    logger.error('Break-glass lookup failed', error, {
      route: routeKey,
      correlationId
    });
    return null;
  }
}

async function getPolicyCached(env: Env, routeKey: string, breakGlass: BreakGlassConfig | null): Promise<{ mode: string }> {
  // If break-glass is active, use that mode
  if (breakGlass) {
    return { mode: breakGlass.mode };
  }
  
  try {
    // Try to get cached policy from KV
    const cacheKey = `policy:${routeKey}`;
    const cached = await env.C2_POLICY_CACHE.get(cacheKey);
    
    if (cached) {
      const policy = JSON.parse(cached);
      // Check if cache is still valid (within 2 seconds)
      if (Date.now() - policy.cachedAt < 2000) {
        return { mode: policy.mode };
      }
    }
    
    // Fallback to default mode
    const defaultMode = env.REMOTE_ONLY_DEFAULT === "1" ? "FALLBACK_REMOTE_ONLY" : "NORMAL";
    return { mode: defaultMode };
    
  } catch (error) {
    logger.error('Policy cache lookup failed', error, {
      route: routeKey,
      correlationId
    });
    // Fail to default mode
    const defaultMode = env.REMOTE_ONLY_DEFAULT === "1" ? "FALLBACK_REMOTE_ONLY" : "NORMAL";
    return { mode: defaultMode };
  }
}

async function enforcePolicy(
  response: Response, 
  policy: { mode: string }, 
  env: Env, 
  url: URL
): Promise<Response> {
  const headers = new Headers(response.headers);
  
  if (policy.mode !== "NORMAL") {
    // Enforce remote-only policy
    headers.set("X-C2-Policy", "remote-only");
    
    // Inject badge if required and this is HTML
    if (env.BADGE_REQUIRED === "1" && isHtml(response)) {
      response = await injectBadge(response);
    }
    
    // Tighten CSP
    headers.set("Content-Security-Policy", 
      "default-src 'none'; img-src 'self' data: https:; style-src 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'"
    );
    
  } else {
    headers.set("X-C2-Policy", "preserve-allowed");
  }
  
  // Add debugging headers
  headers.set("X-C2-Route", routeFrom(url));
  headers.set("X-C2-Timestamp", new Date().toISOString());
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function isHtml(response: Response): boolean {
  const contentType = response.headers.get("content-type") || "";
  return contentType.toLowerCase().includes("text/html");
}

// Admin API endpoints
export async function handleAdminRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  
  // Authorization check
  if (!isAuthorized(request, env)) {
    return new Response("Forbidden", { status: 403 });
  }
  
  if (url.pathname === "/_c2/policy") {
    return handlePolicyRequest(request, env);
  }
  
  if (url.pathname === "/_c2/incidents") {
    return handleIncidentsRequest(request, env);
  }
  
  return new Response("Not found", { status: 404 });
}

async function handlePolicyRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const routeKey = url.searchParams.get("route");
  
  if (!routeKey) {
    return new Response("Missing route parameter", { status: 400 });
  }
  
  try {
    const doId = env.C2_AUTOFALLBACK.idFromName(routeKey);
    const doStub = env.C2_AUTOFALLBACK.get(doId);
    
    const response = await doStub.fetch(`https://do/policy?route=${encodeURIComponent(routeKey)}`);
    const data = await response.json();
    
    return new Response(JSON.stringify(data, null, 2), {
      headers: { "Content-Type": "application/json" }
    });
    
  } catch (error) {
    logger.error('Policy request failed', error, {
      route: routeKey,
      correlationId
    });
    return new Response("Internal error", { status: 500 });
  }
}

async function handleIncidentsRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const routeKey = url.searchParams.get("route");
  const limit = parseInt(url.searchParams.get("limit") || "20");
  
  if (!routeKey) {
    return new Response("Missing route parameter", { status: 400 });
  }
  
  try {
    const doId = env.C2_AUTOFALLBACK.idFromName(routeKey);
    const doStub = env.C2_AUTOFALLBACK.get(doId);
    
    // Get incident index from DO
    const indexResponse = await doStub.fetch(`https://do/incidents?route=${encodeURIComponent(routeKey)}`);
    const incidentIds = await indexResponse.json();
    
    // Fetch incident details (simplified - would be R2 in production)
    const incidents = [];
    for (const id of incidentIds.slice(0, limit)) {
      const incidentResponse = await doStub.fetch(`https://do/incident/${id}`);
      if (incidentResponse.ok) {
        incidents.push(await incidentResponse.json());
      }
    }
    
    return new Response(JSON.stringify(incidents, null, 2), {
      headers: { "Content-Type": "application/json" }
    });
    
  } catch (error) {
    logger.error('Incidents request failed', error, {
      route: routeKey,
      correlationId
    });
    return new Response("Internal error", { status: 500 });
  }
}

function isAuthorized(request: Request, env: Env): boolean {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }
  
  const token = authHeader.slice(7);
  return token === env.ADMIN_TOKEN;
}
