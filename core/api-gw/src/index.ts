/**
 * API Gateway - IP allowlists, rate limits, and key scope enforcement
 * Implements OWASP REST Security cheatsheet guidance
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { check, Subject } from '@credlink/rbac';

interface APIKey {
  id: string;
  org_id: string;
  name: string;
  key_hash: string;
  scopes: string[];
  cidr_allow: string[];
  active: boolean;
  created_at: string;
  expires_at?: string;
  last_used?: string;
  rate_limit?: {
    requests: number;
    window: number; // seconds
  };
}

interface RateLimitEntry {
  count: number;
  reset_time: number;
}

const app = new Hono();

// Secure storage for development (use proper database in production)
const secureStorage = {
  apiKeys: new Map<string, APIKey>(),
  rateLimits: new Map<string, RateLimitEntry>(),
  
  async getAPIKey(keyHash: string): Promise<APIKey | null> {
    if (!keyHash || typeof keyHash !== 'string') {
      return null;
    }
    return this.apiKeys.get(keyHash) || null;
  },
  
  async createAPIKey(key: APIKey): Promise<void> {
    if (!key || !key.key_hash) {
      throw new Error('Invalid API key data');
    }
    this.apiKeys.set(key.key_hash, key);
  },
  
  async updateAPIKey(keyHash: string, updates: Partial<APIKey>): Promise<boolean> {
    if (!keyHash || typeof keyHash !== 'string') {
      return false;
    }
    const key = this.apiKeys.get(keyHash);
    if (key) {
      this.apiKeys.set(keyHash, { ...key, ...updates });
      return true;
    }
    return false;
  },
  
  async deleteAPIKey(keyHash: string): Promise<boolean> {
    if (!keyHash || typeof keyHash !== 'string') {
      return false;
    }
    return this.apiKeys.delete(keyHash);
  },
  
  async getRateLimit(identifier: string): Promise<RateLimitEntry | null> {
    if (!identifier || typeof identifier !== 'string') {
      return null;
    }
    return this.rateLimits.get(identifier) || null;
  },
  
  async setRateLimit(identifier: string, entry: RateLimitEntry): Promise<void> {
    if (!identifier || typeof identifier !== 'string' || !entry) {
      return;
    }
    this.rateLimits.set(identifier, entry);
  }
};

// Seed some test API keys with proper validation
try {
  secureStorage.createAPIKey({
    id: 'key_123',
    org_id: 'org_123',
    name: 'Production API Key',
    key_hash: 'hash_123',
    scopes: ['sign:assets', 'read:manifests'],
    cidr_allow: ['203.0.113.0/24', '198.51.100.0/24'],
    active: true,
    created_at: new Date().toISOString(),
    rate_limit: {
      requests: 1000,
      window: 3600
    }
  });
} catch (error) {
  console.error('Failed to seed test API key:', error);
}

/**
 * IP Address Utilities
 */
export class IPUtils {
  /**
   * Check if IP address is in CIDR range
   */
  static isIPInCIDR(ip: string, cidr: string): boolean {
    // Input validation
    if (!ip || !cidr || typeof ip !== 'string' || typeof cidr !== 'string') {
      return false;
    }
    
    const parts = cidr.split('/');
    if (parts.length !== 2) {
      return false;
    }
    
    const [network, prefixLengthStr] = parts;
    const prefix = parseInt(prefixLengthStr, 10);
    
    // Validate CIDR format
    if (isNaN(prefix) || prefix < 0 || prefix > 32) {
      return false;
    }
    
    // Validate IP format
    if (!this.isValidIPv4(ip) || !this.isValidIPv4(network)) {
      return false;
    }
    
    // Convert IP to 32-bit number
    const ipNum = this.ipToNumber(ip);
    const networkNum = this.ipToNumber(network);
    
    // Create mask
    const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
    
    // Check if IP is in network
    return (ipNum & mask) === (networkNum & mask);
  }
  
  /**
   * Validate IPv4 address format
   */
  static isValidIPv4(ip: string): boolean {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(ip);
  }
  
  /**
   * Convert IPv4 address to number
   */
  static ipToNumber(ip: string): number {
    if (!this.isValidIPv4(ip)) {
      throw new Error('Invalid IPv4 address');
    }
    const parts = ip.split('.').map(part => parseInt(part, 10));
    if (parts.some(part => isNaN(part) || part < 0 || part > 255)) {
      throw new Error('Invalid IPv4 address components');
    }
    return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
  }
  
  /**
   * Get client IP address from request
   */
  static getClientIP(request: Request): string {
    // Check various headers for real IP in order of preference
    const headers = [
      'CF-Connecting-IP',
      'X-Real-IP',
      'X-Forwarded-For',
      'X-Client-IP',
      'True-Client-IP',
      'X-Cluster-Client-IP'
    ];
    
    for (const header of headers) {
      const ip = request.headers.get(header);
      if (ip && typeof ip === 'string') {
        // X-Forwarded-For can contain multiple IPs, take the first
        const firstIP = ip.split(',')[0].trim();
        if (this.isValidIPv4(firstIP)) {
          return firstIP;
        }
      }
    }
    
    // Fallback - should not happen in production with proper proxy setup
    // Return a safe default that will fail CIDR checks
    return '0.0.0.0';
  }
}

/**
 * Rate Limiting
 */
export class RateLimiter {
  /**
   * Check rate limit
   */
  static async checkRateLimit(
    identifier: string,
    limit: { requests: number; window: number }
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    // Input validation
    if (!identifier || typeof identifier !== 'string' || 
        !limit || typeof limit.requests !== 'number' || typeof limit.window !== 'number' ||
        limit.requests <= 0 || limit.window <= 0) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: Math.floor(Date.now() / 1000) + 3600
      };
    }
    
    const now = Math.floor(Date.now() / 1000);
    const entry = await secureStorage.getRateLimit(identifier);
    
    if (!entry || now > entry.reset_time) {
      // Reset or create new entry
      const newEntry: RateLimitEntry = {
        count: 1,
        reset_time: now + limit.window
      };
      await secureStorage.setRateLimit(identifier, newEntry);
      
      return {
        allowed: true,
        remaining: limit.requests - 1,
        resetTime: newEntry.reset_time
      };
    }
    
    // Check if under limit
    if (entry.count >= limit.requests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.reset_time
      };
    }
    
    // Increment counter
    const updatedEntry: RateLimitEntry = {
      count: entry.count + 1,
      reset_time: entry.reset_time
    };
    await secureStorage.setRateLimit(identifier, updatedEntry);
    
    return {
      allowed: true,
      remaining: limit.requests - updatedEntry.count,
      resetTime: entry.reset_time
    };
  }
}

/**
 * Authentication Middleware
 */
async function authenticateAPIKey(c: any): Promise<{ subject: Subject; apiKey: APIKey } | null> {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  const apiKey = authHeader.substring(7);
  
  // Validate API key format
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
    return null;
  }
  
  // Hash the API key using SHA-256 (in production would use proper hashing)
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  const keyData = await secureStorage.getAPIKey(keyHash);
  
  if (!keyData || !keyData.active) {
    return null;
  }

  // Check expiration
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return null;
  }

  // Check IP allowlist
  const clientIP = IPUtils.getClientIP(c.req.raw);
  if (keyData.cidr_allow && keyData.cidr_allow.length > 0) {
    const allowed = keyData.cidr_allow.some(cidr => IPUtils.isIPInCIDR(clientIP, cidr));
    if (!allowed) {
      return null;
    }
  }

  // Check rate limit
  if (keyData.rate_limit) {
    const rateLimitResult = await RateLimiter.checkRateLimit(
      keyData.id,
      keyData.rate_limit
    );
    
    if (!rateLimitResult.allowed) {
      return null;
    }
    
    // Add rate limit headers
    c.header('X-RateLimit-Limit', keyData.rate_limit.requests.toString());
    c.header('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
    c.header('X-RateLimit-Reset', rateLimitResult.resetTime.toString());
  }

  // Update last used timestamp
  await secureStorage.updateAPIKey(keyHash, {
    last_used: new Date().toISOString()
  });

  const subject: Subject = {
    user_id: `api_key_${keyData.id}`,
    org_id: keyData.org_id,
    roles: ['integrator'],
    ip_address: clientIP,
    api_key_id: keyData.id
  };

  return { subject, apiKey: keyData };
}

/**
 * Scope checking middleware
 */
function requireScope(scope: string) {
  return async (c: any, next: any) => {
    // Input validation
    if (!scope || typeof scope !== 'string') {
      return c.json({ error: 'Invalid scope configuration' }, 500);
    }
    
    const auth = await authenticateAPIKey(c);
    
    if (!auth) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Check if API key has required scope
    if (!auth.apiKey.scopes || !Array.isArray(auth.apiKey.scopes) || !auth.apiKey.scopes.includes(scope)) {
      return c.json({ error: 'Insufficient scope' }, 403);
    }

    // Add auth info to context
    (c as any).set('subject', auth.subject);
    (c as any).set('apiKey', auth.apiKey);
    
    await next();
  };
}

/**
 * Gateway Routes
 */

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// API Key management
app.post('/org/:orgId/api-keys', async (c) => {
  const orgId = c.req.param('orgId');
  
  // Input validation
  if (!orgId || typeof orgId !== 'string') {
    return c.json({ error: 'Invalid organization ID' }, 400);
  }
  
  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: 'Invalid request body' }, 400);
  }
  
  const { name, scopes, cidr_allow, rate_limit } = body;
  
  // Validate required fields
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return c.json({ error: 'API key name is required' }, 400);
  }
  
  // Validate scopes
  if (scopes && (!Array.isArray(scopes) || scopes.some(s => typeof s !== 'string'))) {
    return c.json({ error: 'Invalid scopes format' }, 400);
  }
  
  // Validate CIDR allowlist
  if (cidr_allow && (!Array.isArray(cidr_allow) || cidr_allow.some(c => typeof c !== 'string'))) {
    return c.json({ error: 'Invalid CIDR allowlist format' }, 400);
  }
  
  // Validate rate limit
  if (rate_limit && (typeof rate_limit.requests !== 'number' || typeof rate_limit.window !== 'number' || 
      rate_limit.requests <= 0 || rate_limit.window <= 0)) {
    return c.json({ error: 'Invalid rate limit format' }, 400);
  }
  
  // Generate secure API key
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const apiKey = `c2_${Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')}`;
  
  // Hash the API key
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  const keyData: APIKey = {
    id: `key_${crypto.randomUUID()}`,
    org_id: orgId.trim(),
    name: name.trim(),
    key_hash: keyHash,
    scopes: scopes || [],
    cidr_allow: cidr_allow || [],
    active: true,
    created_at: new Date().toISOString(),
    rate_limit
  };
  
  await secureStorage.createAPIKey(keyData);
  
  return c.json({
    id: keyData.id,
    name: keyData.name,
    api_key: apiKey, // Only return key once
    scopes: keyData.scopes,
    cidr_allow: keyData.cidr_allow,
    created_at: keyData.created_at
  });
});

// Rotate API key
app.put('/api-keys/:keyId/rotate', async (c) => {
  const keyId = c.req.param('keyId');
  
  // Input validation
  if (!keyId || typeof keyId !== 'string') {
    return c.json({ error: 'Invalid API key ID' }, 400);
  }
  
  // Find existing key
  let existingKey: APIKey | null = null;
  for (const [hash, key] of secureStorage.apiKeys.entries()) {
    if (key.id === keyId) {
      existingKey = key;
      break;
    }
  }
  
  if (!existingKey) {
    return c.json({ error: 'API key not found' }, 404);
  }
  
  // Generate new secure API key
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const newApiKey = `c2_${Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')}`;
  
  // Hash the new API key
  const encoder = new TextEncoder();
  const data = encoder.encode(newApiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const newKeyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Update key
  const updatedKey: APIKey = {
    ...existingKey,
    key_hash: newKeyHash,
    created_at: new Date().toISOString()
  };
  
  await secureStorage.deleteAPIKey(existingKey.key_hash);
  await secureStorage.createAPIKey(updatedKey);
  
  return c.json({
    id: updatedKey.id,
    name: updatedKey.name,
    api_key: newApiKey, // Only return key once
    scopes: updatedKey.scopes,
    cidr_allow: updatedKey.cidr_allow,
    created_at: updatedKey.created_at
  });
});

// Delete API key
app.delete('/api-keys/:keyId', async (c) => {
  const keyId = c.req.param('keyId');
  
  // Input validation
  if (!keyId || typeof keyId !== 'string') {
    return c.json({ error: 'Invalid API key ID' }, 400);
  }
  
  // Find and delete key
  for (const [hash, key] of secureStorage.apiKeys.entries()) {
    if (key.id === keyId) {
      await secureStorage.deleteAPIKey(hash);
      return c.body(null, 204);
    }
  }
  
  return c.json({ error: 'API key not found' }, 404);
});

/**
 * Protected Routes (Examples)
 */

// Sign endpoint with scope requirement
app.post('/sign', requireScope('sign:assets'), async (c) => {
  const subject = (c as any).get('subject');
  const apiKey = (c as any).get('apiKey');
  
  if (!subject || !apiKey) {
    return c.json({ error: 'Authentication failed' }, 401);
  }
  
  // Additional RBAC check
  const canSign = check(
    subject,
    { verb: 'execute', resource: 'sign', scope: 'sign:assets' },
    { type: 'sign', org_id: subject.org_id },
    { timestamp: new Date(), request_id: `sign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` }
  );
  
  if (!canSign.allow) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  
  const body = await c.req.json().catch(() => null);
  if (!body || !body.manifest || !body.assertion) {
    return c.json({ error: 'Invalid request body' }, 400);
  }
  
  const { manifest, assertion } = body;
  
  // Validate manifest and assertion
  if (typeof manifest !== 'object' || typeof assertion !== 'string') {
    return c.json({ error: 'Invalid manifest or assertion format' }, 400);
  }
  
  // Mock signing logic (in production would use proper cryptographic signing)
  const signature = `sig_${Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('')}`;
  
  return c.json({
    signature,
    manifest_url: `https://store.example.com/manifest/${manifest.id || 'unknown'}`,
    signed_at: new Date().toISOString(),
    key_id: apiKey.id
  });
});

// Read manifests with scope requirement
app.get('/manifests/:id', requireScope('read:manifests'), async (c) => {
  const subject = (c as any).get('subject');
  
  if (!subject) {
    return c.json({ error: 'Authentication failed' }, 401);
  }
  
  // RBAC check
  const canRead = check(
    subject,
    { verb: 'read', resource: 'manifests' },
    { type: 'manifests', org_id: subject.org_id },
    { timestamp: new Date(), request_id: `read_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` }
  );
  
  if (!canRead.allow) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  
  const id = c.req.param('id');
  
  // Input validation
  if (!id || typeof id !== 'string') {
    return c.json({ error: 'Invalid manifest ID' }, 400);
  }
  
  // Validate ID format
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return c.json({ error: 'Invalid manifest ID format' }, 400);
  }
  
  // Mock manifest retrieval (in production would query database)
  return c.json({
    id,
    title: `Manifest ${id}`,
    created_at: new Date().toISOString(),
    assertions: []
  });
});

export default app;
