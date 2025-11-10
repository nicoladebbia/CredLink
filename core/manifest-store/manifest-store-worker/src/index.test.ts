import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';

// Test the worker by importing and testing the handleRequest function
test('worker module can be imported', async () => {
  const workerModule = await import('./index.js');
  assert.ok(typeof workerModule.handleRequest === 'function');
  assert.ok(typeof workerModule.default === 'object');
});

test('worker handles OPTIONS request', async () => {
  const { handleRequest } = await import('./index.js');
  
  const request = new Request('https://worker.example.com', {
    method: 'OPTIONS'
  });
  
  const env = {
    MANIFEST_BASE_URL: 'https://test.example.com',
    BUCKET_NAME: 'test-bucket',
    REGION: 'us-east-1',
    WRITE_ONCE_ENABLED: 'true',
    SIGNED_URL_TTL: '3600000',
    NEGATIVE_CACHE_TTL: '300000',
    MAX_OBJECT_SIZE: '104857600'
  };

  const response = await handleRequest(request, env);
  
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, POST, PUT, DELETE, OPTIONS');
  assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Content-Type, Authorization, X-C2-Tenant, X-C2-Author');
});

test('worker handles health check', async () => {
  const { handleRequest } = await import('./index.js');
  
  const request = new Request('https://worker.example.com/health', {
    method: 'GET'
  });
  
  const env = {
    MANIFEST_BASE_URL: 'https://test.example.com',
    BUCKET_NAME: 'test-bucket',
    REGION: 'us-east-1',
    WRITE_ONCE_ENABLED: 'true',
    SIGNED_URL_TTL: '3600000',
    NEGATIVE_CACHE_TTL: '300000',
    MAX_OBJECT_SIZE: '104857600'
  };

  const response = await handleRequest(request, env);
  
  assert.equal(response.status, 200);
  
  const result = await response.json();
  assert.equal(result.status, 'healthy');
  assert.ok(result.timestamp);
  assert.equal(result.version, '1.0.0');
});

test('worker includes security headers', async () => {
  const { handleRequest } = await import('./index.js');
  
  const request = new Request('https://worker.example.com/health', {
    method: 'GET'
  });
  
  const env = {
    MANIFEST_BASE_URL: 'https://test.example.com',
    BUCKET_NAME: 'test-bucket',
    REGION: 'us-east-1',
    WRITE_ONCE_ENABLED: 'true',
    SIGNED_URL_TTL: '3600000',
    NEGATIVE_CACHE_TTL: '300000',
    MAX_OBJECT_SIZE: '104857600'
  };

  const response = await handleRequest(request, env);
  
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('X-XSS-Protection'), '1; mode=block');
  assert.equal(response.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
  assert.equal(response.headers.get('Permissions-Policy'), 'camera=(), microphone=(), geolocation=()');
});

test('worker handles signed URL generation', async () => {
  const { handleRequest } = await import('./index.js');
  
  // Generate a valid hash for testing
  const content = new TextEncoder().encode('test content');
  const hashBuffer = await crypto.subtle.digest('SHA-256', content);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  const request = new Request('https://worker.example.com/signed-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      objectKey: hash + '.c2pa',
      contentType: 'application/c2pa',
      contentLength: 1024,
      tenantId: 'test-tenant',
      author: 'test-author',
      signature: 'test-signature'
    })
  });
  
  const env = {
    MANIFEST_BASE_URL: 'https://test.example.com',
    BUCKET_NAME: 'test-bucket',
    REGION: 'us-east-1',
    WRITE_ONCE_ENABLED: 'true',
    SIGNED_URL_TTL: '3600000',
    NEGATIVE_CACHE_TTL: '300000',
    MAX_OBJECT_SIZE: '104857600'
  };

  const response = await handleRequest(request, env);
  
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'application/json');
  
  const result = await response.json();
  assert.equal(result.method, 'PUT');
  assert.ok(result.url);
  assert.ok(result.expires);
  assert.ok(result.headers);
  assert.equal(result.headers['Content-Type'], 'application/c2pa');
  assert.equal(result.headers['X-C2-Tenant'], 'test-tenant');
  assert.equal(result.headers['X-C2-Author'], 'test-author');
});

test('worker rejects invalid object key format', async () => {
  const { handleRequest } = await import('./index.js');
  
  const request = new Request('https://worker.example.com/signed-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      objectKey: 'invalid-key.c2pa',
      contentType: 'application/c2pa',
      contentLength: 1024,
      tenantId: 'test-tenant',
      author: 'test-author',
      signature: 'test-signature'
    })
  });
  
  const env = {
    MANIFEST_BASE_URL: 'https://test.example.com',
    BUCKET_NAME: 'test-bucket',
    REGION: 'us-east-1',
    WRITE_ONCE_ENABLED: 'true',
    SIGNED_URL_TTL: '3600000',
    NEGATIVE_CACHE_TTL: '300000',
    MAX_OBJECT_SIZE: '104857600'
  };

  const response = await handleRequest(request, env);
  
  assert.equal(response.status, 400);
  const text = await response.text();
  assert.ok(text.includes('Invalid JSON request') || text.includes('Invalid object key'));
});

test('worker applies rate limiting', async () => {
  const { handleRequest } = await import('./index.js');
  
  const request = new Request('https://worker.example.com/health', {
    method: 'GET'
  });
  
  const env = {
    MANIFEST_BASE_URL: 'https://test.example.com',
    BUCKET_NAME: 'test-bucket',
    REGION: 'us-east-1',
    WRITE_ONCE_ENABLED: 'true',
    SIGNED_URL_TTL: '3600000',
    NEGATIVE_CACHE_TTL: '300000',
    MAX_OBJECT_SIZE: '104857600'
  };

  // Make multiple requests to trigger rate limiting
  const promises = Array.from({ length: 1001 }, () => handleRequest(request, env));
  const results = await Promise.all(promises);
  
  // Should have at least one rate limited response
  const rateLimitedResponses = results.filter(r => r.status === 429);
  assert.ok(rateLimitedResponses.length > 0);
  
  const rateLimitedResponse = rateLimitedResponses[0];
  assert.equal(rateLimitedResponse.headers.get('Content-Type'), 'text/plain');
  assert.equal(rateLimitedResponse.headers.get('Retry-After'), '60');
  
  const text = await rateLimitedResponse.text();
  assert.equal(text, 'Rate limit exceeded');
});

test('worker handles 404 for unknown routes', async () => {
  const { handleRequest } = await import('./index.js');
  
  // Use a unique IP to avoid rate limiting
  const request = new Request('https://worker.example.com/unknown', {
    method: 'GET',
    headers: {
      'X-Forwarded-For': '192.168.1.999',
      'User-Agent': 'test-agent-unique'
    }
  });
  
  const env = {
    MANIFEST_BASE_URL: 'https://test.example.com',
    BUCKET_NAME: 'test-bucket',
    REGION: 'us-east-1',
    WRITE_ONCE_ENABLED: 'true',
    SIGNED_URL_TTL: '3600000',
    NEGATIVE_CACHE_TTL: '300000',
    MAX_OBJECT_SIZE: '104857600'
  };

  const response = await handleRequest(request, env);
  
  assert.equal(response.status, 404);
  const text = await response.text();
  assert.equal(text, 'Not Found');
});
