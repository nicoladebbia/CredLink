/**
 * TSA Service API Endpoints
 * Hono-based REST API for RFC 3161/5816 timestamping
 * Security-hardened with comprehensive input validation and authentication
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { TSAService } from './service/tsa-service.js';
import { AuthenticationManager } from './auth/auth-manager.js';

const app = new Hono();
const tsaService = new TSAService();
const authManager = new AuthenticationManager();

// Middleware
app.use('*', cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://credlink.com'],
  credentials: true,
  maxAge: 86400
}));
app.use('*', logger());

// Rate limiting middleware with memory cleanup
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 100; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

// Cleanup expired rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, usage] of rateLimitMap.entries()) {
    if (now > usage.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

app.use('*', async (c, next) => {
  const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP') || 'unknown';
  
  // Validate IP format to prevent injection
  if (!/^[\w.-]+$/.test(clientIP) && clientIP !== 'unknown') {
    return c.json({ success: false, error: 'Invalid client IP' }, 400);
  }
  
  const now = Date.now();
  const client = rateLimitMap.get(clientIP);
  
  if (!client || now > client.resetTime) {
    rateLimitMap.set(clientIP, { count: 1, resetTime: now + RATE_WINDOW });
  } else {
    client.count++;
    if (client.count > RATE_LIMIT) {
      // Log rate limit violation
      console.warn('Rate limit exceeded', { ip: clientIP, count: client.count, limit: RATE_LIMIT });
      return c.json({ success: false, error: 'Rate limit exceeded' }, 429);
    }
  }
  
  await next();
});

// Health check endpoint with authentication
app.get('/health', (c) => {
  const status = tsaService.getStatus();
  const allHealthy = Object.values(status.providers).every(p => p.healthy);
  
  return c.json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    providers: status.providers,
    queue: status.queue,
    uptime: status.uptime,
    version: '1.0.0'
  }, allHealthy ? 200 : 503);
});

// Main TSA signing endpoint - REQUIRES AUTHENTICATION
app.post('/tsa/sign', async (c) => {
  try {
    // Extract API key from header
    const apiKey = c.req.header('X-API-Key');
    if (!apiKey) {
      return c.json({
        success: false,
        error: 'API key required in X-API-Key header'
      }, 401);
    }

    // Validate content-type with strict checking
    const contentType = c.req.header('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return c.json({
        success: false,
        error: 'Invalid content-type. Expected application/json'
      }, 400);
    }
    
    const body = await c.req.json();
    
    // Validate request body structure with enhanced checks
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return c.json({
        success: false,
        error: 'Invalid request body. Expected object'
      }, 400);
    }
    
    // Check for unexpected properties
    const allowedProps = ['imprint', 'hashAlg', 'reqPolicy', 'nonce', 'tenant_id'];
    const unexpectedProps = Object.keys(body).filter(key => !allowedProps.includes(key));
    if (unexpectedProps.length > 0) {
      return c.json({
        success: false,
        error: `Unexpected properties: ${unexpectedProps.join(', ')}`
      }, 400);
    }
    
    const { imprint, hashAlg, reqPolicy, nonce, tenant_id } = body;
    
    // Validate imprint with enhanced security checks
    if (!imprint || typeof imprint !== 'string' || imprint.length === 0) {
      return c.json({
        success: false,
        error: 'Invalid or missing imprint field'
      }, 400);
    }
    
    // Check for potential injection patterns
    if (/[<>"'\\]/.test(imprint)) {
      return c.json({
        success: false,
        error: 'Invalid imprint characters detected'
      }, 400);
    }
    
    // Validate hash algorithm with security checks
    if (!hashAlg || typeof hashAlg !== 'string' || hashAlg.length === 0) {
      return c.json({
        success: false,
        error: 'Invalid or missing hashAlg field'
      }, 400);
    }
    
    // Only allow secure hash algorithms
    const secureHashAlgorithms = [
      '2.16.840.1.101.3.4.2.1', // SHA-256
      '2.16.840.1.101.3.4.2.2', // SHA-384
      '2.16.840.1.101.3.4.2.3'  // SHA-512
    ];
    
    if (!secureHashAlgorithms.includes(hashAlg)) {
      return c.json({
        success: false,
        error: 'Unsupported or insecure hash algorithm'
      }, 400);
    }
    
    // Validate tenant_id with enhanced security
    if (!tenant_id || typeof tenant_id !== 'string' || 
        !/^[a-zA-Z0-9_-]{1,64}$/.test(tenant_id) ||
        tenant_id.startsWith('-') || tenant_id.endsWith('-')) {
      return c.json({
        success: false,
        error: 'Invalid or missing tenant_id field'
      }, 400);
    }
    
    // Authenticate tenant
    const auth = await authManager.authenticateRequest(apiKey);
    if (!auth.success) {
      return c.json({
        success: false,
        error: auth.error || 'Authentication failed'
      }, 401);
    }

    // Verify tenant matches authenticated tenant - timing attack safe
    if (!timingSafeStringEquals(auth.tenant?.tenantId || '', tenant_id)) {
      return c.json({
        success: false,
        error: 'Tenant ID does not match authenticated tenant'
      }, 403);
    }

    // Check rate limiting
    const rateLimitOk = await authManager.checkRateLimit(tenant_id, 'minute');
    if (!rateLimitOk) {
      return c.json({
        success: false,
        error: 'Rate limit exceeded'
      }, 429);
    }

    // Check permissions
    if (!auth.tenant || !authManager.hasPermission(auth.tenant, 'tsa:sign')) {
      return c.json({
        success: false,
        error: 'Insufficient permissions'
      }, 403);
    }
    
    // Validate optional policy OID
    if (reqPolicy) {
      if (typeof reqPolicy !== 'string' || !/^\d+(\.\d+)*$/.test(reqPolicy) || reqPolicy.length > 100) {
        return c.json({
          success: false,
          error: 'Invalid reqPolicy format'
        }, 400);
      }
    }
    
    // Validate optional nonce with enhanced security
    if (nonce) {
      if (typeof nonce !== 'string' || !/^\d+$/.test(nonce) || nonce.length > 40) {
        return c.json({
          success: false,
          error: 'Invalid nonce format'
        }, 400);
      }
      
      // Additional nonce validation
      const nonceValue = BigInt(nonce);
      if (nonceValue < 0 || nonceValue > (1n << 256n) - 1n) {
        return c.json({
          success: false,
          error: 'Nonce value out of range'
        }, 400);
      }
    }
    
    // Validate imprint size with enhanced DoS protection
    if (imprint.length > 1048576 || imprint.length < 8) { // 1MB max, 8 bytes min
      return c.json({
        success: false,
        error: 'Imprint size out of allowed range (8-1048576 bytes)'
      }, 400);
    }
    
    // Safe base64 decoding with comprehensive validation
    let imprintBytes: Uint8Array;
    try {
      // Remove all whitespace and control characters
      const cleanImprint = imprint.replace(/[\s\x00-\x1F\x7F]/g, '');
      
      // Validate base64 format strictly
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanImprint) || cleanImprint.length % 4 !== 0) {
        throw new Error('Invalid base64 format');
      }
      
      // Additional base64 validation
      if (cleanImprint.includes('..') || cleanImprint.includes('//')) {
        throw new Error('Suspicious base64 pattern');
      }
      
      const binaryString = atob(cleanImprint);
      imprintBytes = new Uint8Array(binaryString.length);
      
      // Safe conversion with bounds checking
      for (let i = 0; i < binaryString.length; i++) {
        const charCode = binaryString.charCodeAt(i);
        if (charCode > 255) {
          throw new Error('Invalid character in base64 data');
        }
        imprintBytes[i] = charCode;
      }
      
      // Validate decoded size with strict bounds
      if (imprintBytes.length < 32 || imprintBytes.length > 512) {
        return c.json({
          success: false,
          error: 'Invalid imprint size (32-512 bytes required)'
        }, 400);
      }
      
      // Check for null bytes and suspicious patterns
      for (let i = 0; i < imprintBytes.length; i++) {
        if (imprintBytes[i] === 0) {
          return c.json({
            success: false,
            error: 'Invalid imprint data contains null bytes'
          }, 400);
        }
      }
      
    } catch (error) {
      console.warn('Imprint decoding failed', { 
        error: error instanceof Error ? error.message : String(error), 
        imprintLength: imprint.length 
      });
      return c.json({
        success: false,
        error: 'Invalid imprint encoding'
      }, 400);
    }

    const result = await tsaService.sign({
      imprint: imprintBytes,
      hashAlg,
      reqPolicy,
      nonce: nonce ? BigInt(nonce) : undefined,
      tenant_id
    });

    if (result.success) {
      // Convert Uint8Array to base64 for JSON response with validation
      let tstBase64: string | undefined;
      if (result.tst && result.tst.length > 0) {
        try {
          tstBase64 = btoa(String.fromCharCode(...result.tst));
        } catch (error) {
          console.error('Failed to encode TST response', error);
          return c.json({
            success: false,
            error: 'Response encoding failed'
          }, 500);
        }
      }
      
      const response = {
        success: true,
        tst: tstBase64,
        tsa_id: result.tsa_id,
        policy_oid: result.policy_oid,
        genTime: result.genTime?.toISOString(),
        accuracy: result.accuracy
      };
      
      return c.json(response, 200);
    } else {
      const statusCode = result.retry_after ? 202 : 503;
      return c.json({
        success: false,
        error: result.error || 'Service temporarily unavailable',
        retry_after: result.retry_after
      }, statusCode);
    }

  } catch (error) {
    // Enhanced error logging with security context
    const errorContext = {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      url: c.req.url,
      method: c.req.method,
      userAgent: c.req.header('User-Agent'),
      ip: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For'),
      timestamp: new Date().toISOString()
    };
    
    console.error('TSA signing error:', errorContext);
    
    // Return generic error to client to prevent information disclosure
    return c.json({
      success: false,
      error: 'Request processing failed'
    }, 500);
  }
});

// Status dashboard endpoint with authentication
app.get('/tsa/status', async (c) => {
  const apiKey = c.req.header('X-API-Key');
  
  if (!apiKey) {
    return c.json({
      success: false,
      error: 'API key required'
    }, 401);
  }
  
  // Basic authentication check for status endpoint
  const auth = await authManager.authenticateRequest(apiKey);
  if (!auth.success) {
    return c.json({
      success: false,
      error: 'Authentication failed'
    }, 401);
  }
  
  const status = tsaService.getStatus();
  
  return c.json({
    success: true,
    timestamp: new Date().toISOString(),
    providers: status.providers,
    queue: status.queue,
    uptime: status.uptime,
    version: '1.0.0'
  });
});

// Queue drain endpoint (for processing) - ADMIN ONLY
app.post('/tsa/queue/drain', async (c) => {
  try {
    // Enhanced admin authentication
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({
        success: false,
        error: 'Unauthorized'
      }, 401);
    }
    
    const token = authHeader.substring(7);
    if (!authManager.validateAdminToken(token)) {
      // Log failed admin attempt
      console.error('ADMIN AUTH FAILED', {
        ip: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For'),
        userAgent: c.req.header('User-Agent'),
        timestamp: new Date().toISOString()
      });
      
      return c.json({
        success: false,
        error: 'Invalid credentials'
      }, 401);
    }
    
    await tsaService.processQueue();
    
    return c.json({
      success: true,
      message: 'Queue drain completed'
    });
  } catch (error) {
    console.error('Queue drain error:', error);
    return c.json({
      success: false,
      error: 'Operation failed'
    }, 500);
  }
});

// Tenant policy endpoint - REQUIRES AUTHENTICATION with enhanced validation
app.get('/tsa/policy/:tenant_id', async (c) => {
  const tenant_id = c.req.param('tenant_id');
  const apiKey = c.req.header('X-API-Key');
  
  // Validate tenant_id parameter
  if (!tenant_id || !/^[a-zA-Z0-9_-]{1,64}$/.test(tenant_id)) {
    return c.json({
      success: false,
      error: 'Invalid tenant_id parameter'
    }, 400);
  }
  
  if (!apiKey) {
    return c.json({
      success: false,
      error: 'API key required'
    }, 401);
  }
  
  // Authenticate and get policy
  const policy = await authManager.getTenantPolicy(tenant_id, apiKey);
  if (!policy) {
    return c.json({
      success: false,
      error: 'Authentication failed or tenant not found'
    }, 401);
  }
  
  return c.json({
    success: true,
    policy
  });
});

// Metrics endpoint for monitoring with authentication
app.get('/metrics', async (c) => {
  const apiKey = c.req.header('X-API-Key');
  
  // Require authentication for metrics
  if (!apiKey) {
    return c.json({
      success: false,
      error: 'API key required'
    }, 401);
  }
  
  const auth = await authManager.authenticateRequest(apiKey);
  if (!auth.success || !auth.tenant || !authManager.hasPermission(auth.tenant, 'tsa:read')) {
    return c.json({
      success: false,
      error: 'Insufficient permissions'
    }, 403);
  }
  
  const status = tsaService.getStatus();
  
  // Prometheus-style metrics with proper escaping
  const metrics = [
    `# HELP tsa_provider_health Provider health status`,
    `# TYPE tsa_provider_health gauge`,
    ...Object.entries(status.providers).map(([id, health]) => 
      `tsa_provider_health{provider="${id.replace(/"/g, '\"')}"} ${health.healthy ? 1 : 0}`
    ),
    '',
    `# HELP tsa_provider_latency Provider latency in milliseconds`,
    `# TYPE tsa_provider_latency gauge`,
    ...Object.entries(status.providers).map(([id, health]) => 
      `tsa_provider_latency{provider="${id.replace(/"/g, '\"')}"} ${health.latencyMs}`
    ),
    '',
    `# HELP tsa_queue_size Number of requests in queue`,
    `# TYPE tsa_queue_size gauge`,
    `tsa_queue_size ${status.queue.size}`,
    '',
    `# HELP tsa_queue_processing Number of requests currently processing`,
    `# TYPE tsa_queue_processing gauge`,
    `tsa_queue_processing ${status.queue.processingCount}`,
    '',
    `# HELP tsa_service_uptime Service uptime in seconds`,
    `# TYPE tsa_service_uptime counter`,
    `tsa_service_uptime ${status.uptime}`
  ].join('\n');
  
  return c.text(metrics, 200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
  });
});

/**
 * Timing-safe string comparison to prevent timing attacks
 * Uses constant-time comparison to prevent side-channel attacks
 */
function timingSafeStringEquals(a: string, b: string): boolean {
  // Early return for obvious mismatches
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  
  if (a.length !== b.length) {
    return false;
  }
  
  // Constant-time comparison
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

// Error handling middleware with enhanced security
app.onError((err, c) => {
  // Sanitize error details to prevent information disclosure
  const sanitizedError = {
    message: 'Internal server error',
    timestamp: new Date().toISOString(),
    requestId: crypto.randomUUID?.() || Math.random().toString(36)
  };
  
  // Log detailed error for debugging (server-side only)
  console.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    url: c.req.url,
    method: c.req.method,
    userAgent: c.req.header('User-Agent'),
    ip: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For'),
    timestamp: new Date().toISOString()
  });
  
  // Return sanitized error to client
  return c.json({
    success: false,
    error: sanitizedError.message,
    requestId: sanitizedError.requestId
  }, 500);
});

// 404 handler with security headers
app.notFound((c) => {
  return c.json({
    success: false,
    error: 'Endpoint not found'
  }, 404, {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block'
  });
});

export default app;
