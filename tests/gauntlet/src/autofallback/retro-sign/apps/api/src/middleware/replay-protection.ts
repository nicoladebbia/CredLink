/**
 * Replay Attack Protection Middleware
 * Prevents replay attacks using nonces, timestamps, and request deduplication
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'crypto';
import { generateSecureId } from '../utils/crypto';

export interface ReplayProtectionConfig {
  maxRequestAge: number;      // Maximum age of requests in milliseconds
  nonceWindow: number;        // Time window for nonce uniqueness
  maxNonceStore: number;      // Maximum nonces to store
  requireNonce: boolean;      // Whether to require nonce header
  requireTimestamp: boolean;  // Whether to require timestamp header
}

const DEFAULT_CONFIG: ReplayProtectionConfig = {
  maxRequestAge: 300000,      // 5 minutes
  nonceWindow: 300000,        // 5 minutes
  maxNonceStore: 10000,       // Store 10K nonces
  requireNonce: true,
  requireTimestamp: true
};

// In-memory nonce store (use Redis in production)
const nonceStore = new Map<string, number>();
const requestSignatureStore = new Map<string, number>();

/**
 * Cleanup expired nonces and signatures
 */
function cleanupExpired(maxAge: number): void {
  const now = Date.now();
  const cutoff = now - maxAge;
  
  // Clean nonces
  for (const [nonce, timestamp] of nonceStore.entries()) {
    if (timestamp < cutoff) {
      nonceStore.delete(nonce);
    }
  }
  
  // Clean request signatures
  for (const [signature, timestamp] of requestSignatureStore.entries()) {
    if (timestamp < cutoff) {
      requestSignatureStore.delete(signature);
    }
  }
  
  // Prevent memory bloat
  if (nonceStore.size > DEFAULT_CONFIG.maxNonceStore) {
    const entries = Array.from(nonceStore.entries()).sort((a, b) => a[1] - b[1]);
    const toDelete = entries.slice(0, Math.floor(DEFAULT_CONFIG.maxNonceStore / 2));
    toDelete.forEach(([nonce]) => nonceStore.delete(nonce));
  }
}

/**
 * Generate request signature for replay detection
 */
function generateRequestSignature(request: FastifyRequest): string {
  const components = [
    request.method,
    request.url,
    JSON.stringify(request.query || {}),
    JSON.stringify(request.body || {}),
    request.headers['content-type'] || '',
    request.headers['content-length'] || ''
  ];
  
  return createHash('sha256').update(components.join('|')).digest('hex');
}

/**
 * Validate request timestamp
 */
function validateTimestamp(timestampHeader: string | undefined, maxAge: number): boolean {
  if (!timestampHeader) {
    return false;
  }
  
  try {
    const timestamp = parseInt(timestampHeader, 10);
    const now = Date.now();
    const age = now - timestamp;
    
    return age >= 0 && age <= maxAge;
  } catch {
    return false;
  }
}

/**
 * Validate nonce uniqueness
 */
function validateNonce(nonce: string, windowMs: number): boolean {
  const now = Date.now();
  const existingTimestamp = nonceStore.get(nonce);
  
  if (existingTimestamp) {
    // Nonce already used within window
    return false;
  }
  
  // Check if nonce is too old
  if (nonce.length < 16) {
    return false;
  }
  
  // Store nonce with timestamp
  nonceStore.set(nonce, now);
  return true;
}

/**
 * Check for replay attacks using request signature
 */
function checkRequestReplay(signature: string, maxAge: number): boolean {
  const now = Date.now();
  const existingTimestamp = requestSignatureStore.get(signature);
  
  if (existingTimestamp) {
    // Same request already processed within window
    return false;
  }
  
  // Store signature with timestamp
  requestSignatureStore.set(signature, now);
  return true;
}

/**
 * Replay attack protection middleware
 */
export function addReplayProtection(config: Partial<ReplayProtectionConfig> = {}) {
  const options = { ...DEFAULT_CONFIG, ...config };
  
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // Cleanup expired entries
    cleanupExpired(options.maxRequestAge);
    
    // 🚨 CRITICAL: Validate request timestamp
    if (options.requireTimestamp) {
      const timestamp = request.headers['x-timestamp'] as string;
      if (!validateTimestamp(timestamp, options.maxRequestAge)) {
        return reply.status(400).send({
          error: 'Invalid or missing timestamp',
          message: 'Request must include valid X-Timestamp header',
          max_age_ms: options.maxRequestAge
        });
      }
    }
    
    // 🚨 CRITICAL: Validate nonce for POST/PUT/DELETE requests
    if (options.requireNonce && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
      const nonce = request.headers['x-nonce'] as string;
      
      if (!nonce) {
        return reply.status(400).send({
          error: 'Missing nonce',
          message: 'Request must include X-Nonce header for state-changing operations'
        });
      }
      
      if (!validateNonce(nonce, options.nonceWindow)) {
        console.warn('🚨 REPLAY ATTACK DETECTED: Duplicate nonce', {
          nonce,
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          url: request.url
        });
        
        return reply.status(429).send({
          error: 'Replay detected',
          message: 'Request nonce has already been used',
          retry_after_ms: options.nonceWindow
        });
      }
    }
    
    // 🚨 CRITICAL: Check for request replay using signature
    const requestSignature = generateRequestSignature(request);
    if (!checkRequestReplay(requestSignature, options.maxRequestAge)) {
      console.warn('🚨 REPLAY ATTACK DETECTED: Duplicate request signature', {
        signature: requestSignature.substring(0, 16) + '...',
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        url: request.url,
        method: request.method
      });
      
      return reply.status(429).send({
        error: 'Replay detected',
        message: 'Request has already been processed',
        retry_after_ms: options.maxRequestAge
      });
    }
    
    // Add security headers
    reply.header('X-Replay-Protection', 'active');
    reply.header('X-Request-Age', Date.now() - parseInt(request.headers['x-timestamp'] as string || '0'));
  };
}

/**
 * Strict replay protection for sensitive operations
 */
export const strictReplayProtection = addReplayProtection({
  maxRequestAge: 60000,        // 1 minute
  nonceWindow: 60000,          // 1 minute
  maxNonceStore: 1000,         // Smaller store for strict mode
  requireNonce: true,
  requireTimestamp: true
});

/**
 * Standard replay protection for general operations
 */
export const standardReplayProtection = addReplayProtection(DEFAULT_CONFIG);

/**
 * Lenient replay protection for GET requests (read-only)
 */
export const lenientReplayProtection = addReplayProtection({
  maxRequestAge: 300000,       // 5 minutes
  nonceWindow: 300000,         // 5 minutes
  maxNonceStore: 50000,        // Larger store for public endpoints
  requireNonce: false,         // Not required for GET
  requireTimestamp: true
});

/**
 * Generate secure nonce for client requests
 */
export async function generateRequestNonce(): Promise<string> {
  return await generateSecureId('nonce', 32);
}

/**
 * Get current timestamp for client requests
 */
export function getCurrentTimestamp(): number {
  return Date.now();
}

/**
 * Validate request age for monitoring
 */
export function getRequestAge(request: FastifyRequest): number {
  const timestamp = request.headers['x-timestamp'] as string;
  if (!timestamp) {
    return -1;
  }
  
  return Date.now() - parseInt(timestamp, 10);
}

/**
 * Check if request is suspicious (too old or missing headers)
 */
export function isSuspiciousRequest(request: FastifyRequest): boolean {
  const age = getRequestAge(request);
  const hasNonce = !!request.headers['x-nonce'];
  const hasTimestamp = !!request.headers['x-timestamp'];
  
  return age < 0 || age > 300000 || !hasTimestamp;
}
