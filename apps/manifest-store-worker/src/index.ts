import { ManifestStore } from '../../../packages/manifest-store/dist/manifest-store.js';
import type { ManifestStoreConfig, SignedUrlRequest, ListObjectsOptions } from '../../../packages/manifest-store/dist/types.js';

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

// Simple in-memory rate limiting (in production, use KV or D1)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(clientId: string, limit: number = 100, windowMs: number = 60000): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(clientId);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(clientId, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (record.count >= limit) {
    return false;
  }
  
  record.count++;
  return true;
}

function addSecurityHeaders(headers: Headers): void {
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-XSS-Protection', '1; mode=block');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function createSecurityHeaders(): Headers {
  const headers = new Headers();
  addSecurityHeaders(headers);
  return headers;
}

function createHeadersWithSecurity(contentType: string): Headers {
  const headers = new Headers({
    'Content-Type': contentType
  });
  addSecurityHeaders(headers);
  return headers;
}

function getClientId(request: Request): string {
  // Use IP address or a combination of headers for client identification
  const cfConnectingIp = request.headers.get('CF-Connecting-IP');
  const xForwardedFor = request.headers.get('X-Forwarded-For');
  const userAgent = request.headers.get('User-Agent') || '';
  
  return cfConnectingIp || xForwardedFor?.split(',')[0] || userAgent;
}

interface Env {
  // Configuration
  MANIFEST_BASE_URL: string;
  BUCKET_NAME: string;
  REGION: string;
  HMAC_SECRET: string;
  
  // Feature flags
  WRITE_ONCE_ENABLED: string;
  SIGNED_URL_TTL: string;
  NEGATIVE_CACHE_TTL: string;
  MAX_OBJECT_SIZE: string;
  
  // R2 binding (in production)
  // R2: R2Bucket;
}

const DEFAULT_CONFIG: ManifestStoreConfig = {
  baseUrl: 'https://manifests.survival.test',
  bucket: 'c2-manifests',
  region: 'auto',
  writeOnceEnabled: true,
  signedUrlTtl: 3600000, // 1 hour
  negativeCacheTtl: 300000, // 5 minutes
  maxObjectSize: 100 * 1024 * 1024, // 100MB
  allowedMimeTypes: [
    'application/c2pa',
    'application/json',
    'application/octet-stream'
  ]
};

export async function handleRequest(request: Request, env: Record<string, string>, ctx?: ExecutionContext): Promise<Response> {
    // Apply rate limiting
    const clientId = getClientId(request);
    if (!checkRateLimit(clientId, 1000, 60000)) { // 1000 requests per minute
      return new Response('Rate limit exceeded', {
        status: 429,
        headers: {
          'Content-Type': 'text/plain',
          'Retry-After': '60'
        }
      });
    }

    const store = new ManifestStore({
      ...DEFAULT_CONFIG,
      baseUrl: env.MANIFEST_BASE_URL || DEFAULT_CONFIG.baseUrl,
      bucket: env.BUCKET_NAME || DEFAULT_CONFIG.bucket,
      region: env.REGION || DEFAULT_CONFIG.region,
      writeOnceEnabled: env.WRITE_ONCE_ENABLED !== 'false',
      signedUrlTtl: Math.max(0, parseInt(env.SIGNED_URL_TTL || '3600000', 10)),
      negativeCacheTtl: Math.max(0, parseInt(env.NEGATIVE_CACHE_TTL || '300000', 10)),
      maxObjectSize: Math.max(0, parseInt(env.MAX_OBJECT_SIZE || (100 * 1024 * 1024).toString(), 10)),
    });

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Handle OPTIONS requests for CORS
      if (request.method === 'OPTIONS') {
        const response = new Response(null, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-C2-Tenant, X-C2-Author',
            'Access-Control-Max-Age': '86400'
          }
        });
        addSecurityHeaders(response.headers);
        return response;
      }

      // Handle different endpoints
      if (path === '/signed-url' && request.method === 'POST') {
        return handleSignedUrl(request, store);
      }

      if (path === '/integrity-check' && request.method === 'POST') {
        return handleIntegrityCheck(request, store);
      }

      if (path === '/list' && request.method === 'GET') {
        return handleListObjects(request, store);
      }

      if (path === '/metrics' && request.method === 'GET') {
        return handleMetrics(request, store);
      }

      if (path === '/audit' && request.method === 'GET') {
        return handleAuditLogs(request, store);
      }

      if (path === '/health' && request.method === 'GET') {
        const response = new Response(JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        });
        addSecurityHeaders(response.headers);
        return response;
      }

      // Handle manifest access (GET/HEAD)
      if (path.startsWith('/') && path.endsWith('.c2pa')) {
        const objectKey = path.substring(1);
        
        // CRITICAL SECURITY: Prevent path traversal attacks
        if (objectKey.includes('..') || objectKey.includes('\\') || objectKey.includes('//')) {
          return new Response('Invalid object key format', {
            status: 400,
            headers: createHeadersWithSecurity('text/plain')
          });
        }
        
        // Additional validation: only allow alphanumeric, hyphens, underscores, and dots
        if (!/^[a-zA-Z0-9._-]+\.c2pa$/.test(objectKey)) {
          return new Response('Invalid object key format', {
            status: 400,
            headers: createHeadersWithSecurity('text/plain')
          });
        }
        
        if (request.method === 'HEAD') {
          return handleHeadManifest(objectKey, store);
        }
        
        if (request.method === 'GET') {
          return handleGetManifest(objectKey, store);
        }
      }

      // Handle PUT for manifest upload
      if (path.startsWith('/') && path.endsWith('.c2pa') && request.method === 'PUT') {
        const objectKey = path.substring(1);
        
        // CRITICAL SECURITY: Prevent path traversal attacks on PUT
        if (objectKey.includes('..') || objectKey.includes('\\') || objectKey.includes('//')) {
          return new Response('Invalid object key format', {
            status: 400,
            headers: createHeadersWithSecurity('text/plain')
          });
        }
        
        // Additional validation: only allow alphanumeric, hyphens, underscores, and dots
        if (!/^[a-zA-Z0-9._-]+\.c2pa$/.test(objectKey)) {
          return new Response('Invalid object key format', {
            status: 400,
            headers: createHeadersWithSecurity('text/plain')
          });
        }
        
        return handlePutManifest(objectKey, request, store);
      }

      return new Response('Not Found', { 
        status: 404,
        headers: createHeadersWithSecurity('text/plain')
      });

    } catch (error) {
      console.error('Manifest store error:', error);
      return new Response(
        JSON.stringify({ 
          error: error instanceof Error ? error.message : 'Internal server error' 
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
          }
        }
      );
    }
  }

async function handleSignedUrl(request: Request, store: ManifestStore): Promise<Response> {
  try {
    const body = await request.json() as SignedUrlRequest;

    // Validate request body
    if (!body.objectKey || !body.contentType || !body.tenantId || !body.author) {
      return new Response('Missing required fields', { status: 400 });
    }

    // Validate content length
    if (body.contentLength && (body.contentLength < 0 || body.contentLength > 100 * 1024 * 1024)) {
      return new Response('Invalid content length', { status: 400 });
    }

    const signedUrl = await store.generateSignedUrl(body);
    
    const response = new Response(JSON.stringify(signedUrl), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type, X-C2-Signature'
      }
    });
    
    addSecurityHeaders(response.headers);
    return response;
  } catch (error) {
    return new Response('Invalid JSON request', { status: 400 });
  }
}

async function handleIntegrityCheck(request: Request, store: ManifestStore): Promise<Response> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const objectKey = formData.get('objectKey') as string;

    if (!file || !objectKey) {
      return new Response('Missing file or objectKey', { status: 400 });
    }

    // Validate object key format
    if (!objectKey.match(/^[a-f0-9]{64}\.c2pa$/)) {
      return new Response('Invalid object key format', { status: 400 });
    }

    // Validate file size
    if (file.size > 100 * 1024 * 1024) {
      return new Response('File too large', { status: 413 });
    }

    const content = new Uint8Array(await file.arrayBuffer());
    const result = await store.checkIntegrity(objectKey, content as any);

    const response = new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });
    
    addSecurityHeaders(response.headers);
    return response;
  } catch (error) {
    return new Response('Invalid form data', { status: 400 });
  }
}

async function handleListObjects(request: Request, store: ManifestStore): Promise<Response> {
  try {
    const url = new URL(request.url);
    
    // Validate date inputs
    const createdAfter = url.searchParams.get('createdAfter');
    const createdBefore = url.searchParams.get('createdBefore');
    
    if (createdAfter && isNaN(Date.parse(createdAfter))) {
      return new Response('Invalid createdAfter date', { status: 400 });
    }
    
    if (createdBefore && isNaN(Date.parse(createdBefore))) {
      return new Response('Invalid createdBefore date', { status: 400 });
    }
    
    const options: ListObjectsOptions = {
      prefix: url.searchParams.get('prefix') || undefined,
      limit: Math.min(Math.max(1, parseInt(url.searchParams.get('limit') || '1000', 10)), 10000),
      continuationToken: url.searchParams.get('continuationToken') || undefined,
      tenantId: url.searchParams.get('tenantId') || undefined,
      createdAfter: createdAfter || undefined,
      createdBefore: createdBefore || undefined,
    };

    const result = await store.listObjects(options);

    const response = new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60' // Cache for 1 minute
      }
    });
    
    addSecurityHeaders(response.headers);
    return response;
  } catch (error) {
    return new Response('Invalid request', { status: 400 });
  }
}

async function handleMetrics(request: Request, store: ManifestStore): Promise<Response> {
  const metrics = await store.getMetrics();

  const response = new Response(JSON.stringify(metrics), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300', // Cache metrics for 5 minutes
      'Access-Control-Allow-Origin': '*'
    }
  });
  
  addSecurityHeaders(response.headers);
  return response;
}

async function handleAuditLogs(request: Request, store: ManifestStore): Promise<Response> {
  try {
    const url = new URL(request.url);
    
    // Validate date input
    const since = url.searchParams.get('since');
    if (since && isNaN(Date.parse(since))) {
      return new Response('Invalid since date', { status: 400 });
    }
    
    const options = {
      limit: Math.min(Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10)), 1000),
      offset: Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10)),
      tenantId: url.searchParams.get('tenantId') || undefined,
      operation: url.searchParams.get('operation') || undefined,
      since: since || undefined,
    };

    const result = await store.getAuditRecords(options);

    const response = new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60', // Cache audit logs for 1 minute
        'Access-Control-Allow-Origin': '*'
      }
    });
    
    addSecurityHeaders(response.headers);
    return response;
  } catch (error) {
    return new Response('Invalid request', { status: 400 });
  }
}

async function handleHeadManifest(objectKey: string, store: ManifestStore): Promise<Response> {
  const metadata = await store.getManifest(objectKey);
  
  if (!metadata) {
    const response = new Response('Not Found', { 
      status: 404,
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'public, max-age=300' // Cache 404s for 5 minutes (negative caching)
      }
    });
    addSecurityHeaders(response.headers);
    return response;
  }

  const response = new Response(null, {
    status: 200,
    headers: {
      'Content-Type': metadata.contentType,
      'Content-Length': metadata.contentLength.toString(),
      'ETag': metadata.etag,
      'Last-Modified': metadata.lastModified,
      'Cache-Control': 'public, max-age=31536000, immutable', // Cache manifests for 1 year (immutable)
      'X-C2-Hash': metadata.hash,
      'X-C2-Checksum': metadata.checksum,
      'X-C2-Tenant': metadata.tenantId,
      'X-C2-Author': metadata.author,
      'X-C2-Created': metadata.createdAt,
      'Access-Control-Allow-Origin': '*'
    }
  });
  
  addSecurityHeaders(response.headers);
  return response;
}

async function handleGetManifest(objectKey: string, store: ManifestStore): Promise<Response> {
  const metadata = await store.getManifest(objectKey);
  
  if (!metadata) {
    const response = new Response('Not Found', { 
      status: 404,
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'public, max-age=300' // Cache 404s for 5 minutes (negative caching)
      }
    });
    addSecurityHeaders(response.headers);
    return response;
  }

  // In a real implementation, this would serve the actual manifest content
  // For demo purposes, we'll return the metadata
  const response = new Response(JSON.stringify(metadata), {
    status: 200,
    headers: {
      'Content-Type': metadata.contentType,
      'Content-Length': metadata.contentLength.toString(),
      'ETag': metadata.etag,
      'Last-Modified': metadata.lastModified,
      'Cache-Control': 'public, max-age=31536000, immutable', // Cache manifests for 1 year (immutable)
      'X-C2-Hash': metadata.hash,
      'X-C2-Checksum': metadata.checksum,
      'X-C2-Tenant': metadata.tenantId,
      'X-C2-Author': metadata.author,
      'X-C2-Created': metadata.createdAt,
      'Access-Control-Allow-Origin': '*'
    }
  });
  
  addSecurityHeaders(response.headers);
  return response;
}

async function handlePutManifest(objectKey: string, request: Request, store: ManifestStore): Promise<Response> {
  const content = new Uint8Array(await request.arrayBuffer());
  
  // Extract metadata from headers
  const tenantId = request.headers.get('X-C2-Tenant') || 'unknown';
  const author = request.headers.get('X-C2-Author') || 'unknown';
  const signature = request.headers.get('Authorization')?.replace('C2-Signature ', '') || '';
  const contentType = request.headers.get('Content-Type') || 'application/c2pa';
  const contentLength = Math.max(0, parseInt(request.headers.get('Content-Length') || '0', 10));
  
  // Generate hash and checksum using Web Crypto API
  const hashBuffer = await crypto.subtle.digest('SHA-256', content);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // For checksum, use SHA-256 as MD5 is not supported in Web Crypto API
  // In production, this could be a different algorithm or computed server-side
  const checksum = hash; // Using SHA-256 as fallback for MD5
  
  const result = await store.storeManifest(objectKey, content, {
    hash,
    contentType,
    contentLength,
    etag: `"${hash}"`,
    lastModified: new Date().toUTCString(),
    tenantId,
    author,
    signature,
    checksum
  });

  return new Response('Created', {
    status: 201,
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-store',
      'Location': `/${objectKey}`,
      'X-C2-Created': new Date().toISOString()
    }
  });
}

export default {
  async fetch(request: Request, env: Record<string, string>, ctx?: ExecutionContext): Promise<Response> {
    return handleRequest(request, env, ctx);
  }
};
