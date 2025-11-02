/**
 * Side-Channel Attack Protection Middleware
 * Prevents timing attacks, cache attacks, and other side-channel vulnerabilities
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { addRandomDelay, secureCompare } from '../utils/timing';

export interface SideChannelProtectionConfig {
  enableTimingProtection: boolean;
  enableCacheProtection: boolean;
  enableErrorNormalization: boolean;
  minResponseTime: number;
  maxResponseTime: number;
  randomDelayRange: [number, number];
}

const DEFAULT_CONFIG: SideChannelProtectionConfig = {
  enableTimingProtection: true,
  enableCacheProtection: true,
  enableErrorNormalization: true,
  minResponseTime: 50,           // Minimum response time in ms
  maxResponseTime: 500,          // Maximum response time in ms
  randomDelayRange: [10, 100]    // Random delay range in ms
};

/**
 * Response cache to prevent cache-based side channels
 */
const responseCache = new Map<string, { data: any; timestamp: number }>();

/**
 * Normalize error responses to prevent information disclosure
 */
function normalizeErrorResponse(error: any, request: FastifyRequest): any {
  // Always return the same error structure regardless of actual error
  const normalizedError = {
    error: 'Request failed',
    message: 'An error occurred while processing your request',
    timestamp: new Date().toISOString(),
    request_id: request.headers['x-request-id'] || 'unknown'
  };
  
  // Log the actual error internally
  console.error('Internal error:', {
    actualError: error.message || error,
    stack: error.stack,
    url: request.url,
    method: request.method,
    ip: request.ip
  });
  
  return normalizedError;
}

/**
 * Generate cache key for request
 */
function generateCacheKey(request: FastifyRequest): string {
  const components = [
    request.method,
    request.url,
    JSON.stringify(request.query || {}),
    request.headers['authorization']?.substring(0, 20) || 'no-auth' // Partial auth for cache key
  ];
  
  return components.join('|');
}

/**
 * Check for cache-based timing attacks
 */
function checkCacheAttack(request: FastifyRequest): boolean {
  const key = generateCacheKey(request);
  const cached = responseCache.get(key);
  
  if (!cached) {
    return false;
  }
  
  // Check if request is too frequent (possible cache attack)
  const now = Date.now();
  const timeSinceLast = now - cached.timestamp;
  
  return timeSinceLast < 100; // Less than 100ms indicates possible automated attack
}

/**
 * Ensure consistent response timing
 */
async function ensureConsistentTiming(startTime: number, config: SideChannelProtectionConfig): Promise<void> {
  const elapsed = Date.now() - startTime;
  
  if (elapsed < config.minResponseTime) {
    // Add delay to meet minimum response time
    const delay = config.minResponseTime - elapsed;
    await new Promise(resolve => setTimeout(resolve, delay));
  } else if (elapsed > config.maxResponseTime) {
    // Log unusually slow responses (possible attack)
    console.warn('🚨 SLOW RESPONSE DETECTED:', {
      elapsed,
      threshold: config.maxResponseTime,
      possibleAttack: elapsed > config.maxResponseTime * 2
    });
  }
}

/**
 * Add random noise to response timing
 */
async function addTimingNoise(config: SideChannelProtectionConfig): Promise<void> {
  if (config.randomDelayRange[0] > 0) {
    const [min, max] = config.randomDelayRange;
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

/**
 * Side-channel attack protection middleware
 */
export function addSideChannelProtection(config: Partial<SideChannelProtectionConfig> = {}) {
  const options = { ...DEFAULT_CONFIG, ...config };
  
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const startTime = Date.now();
    
    // 🚨 CRITICAL: Check for cache-based timing attacks
    if (options.enableCacheProtection && checkCacheAttack(request)) {
      console.warn('🚨 CACHE-BASED TIMING ATTACK DETECTED:', {
        url: request.url,
        method: request.method,
        ip: request.ip,
        userAgent: request.headers['user-agent']
      });
      
      // Add extra delay to thwart attack
      await addRandomDelay(100, 500);
    }
    
    // Store request in cache
    const cacheKey = generateCacheKey(request);
    responseCache.set(cacheKey, { data: true, timestamp: Date.now() });
    
    // Clean old cache entries
    const cutoff = Date.now() - 60000; // 1 minute
    for (const [key, entry] of responseCache.entries()) {
      if (entry.timestamp < cutoff) {
        responseCache.delete(key);
      }
    }
    
    // 🚨 CRITICAL: Override reply.send to normalize errors and ensure timing
    const originalSend = reply.send.bind(reply);
    reply.send = async function(payload: any) {
      try {
        // Normalize error responses
        if (options.enableErrorNormalization && 
            (reply.statusCode >= 400 || payload?.error || payload?.message)) {
          payload = normalizeErrorResponse(payload, request);
        }
        
        // Ensure consistent response timing
        if (options.enableTimingProtection) {
          await ensureConsistentTiming(startTime, options);
          await addTimingNoise(options);
        }
        
        return originalSend(payload);
      } catch (error) {
        // Double protection for send errors
        const normalizedError = normalizeErrorResponse(error, request);
        return originalSend(normalizedError);
      }
    };
    
    // Add security headers
    reply.header('X-Side-Channel-Protection', 'active');
    reply.header('X-Timing-Protection', options.enableTimingProtection ? 'enabled' : 'disabled');
  };
}

/**
 * Strict side-channel protection for sensitive endpoints
 */
export const strictSideChannelProtection = addSideChannelProtection({
  enableTimingProtection: true,
  enableCacheProtection: true,
  enableErrorNormalization: true,
  minResponseTime: 100,          // Higher minimum for sensitive ops
  maxResponseTime: 1000,         // Higher threshold
  randomDelayRange: [50, 200]    // More noise
});

/**
 * Standard side-channel protection for general endpoints
 */
export const standardSideChannelProtection = addSideChannelProtection(DEFAULT_CONFIG);

/**
 * Lightweight side-channel protection for public endpoints
 */
export const lightweightSideChannelProtection = addSideChannelProtection({
  enableTimingProtection: true,
  enableCacheProtection: false,  // Disabled for public endpoints
  enableErrorNormalization: true,
  minResponseTime: 20,           // Lower minimum for performance
  maxResponseTime: 200,          // Lower threshold
  randomDelayRange: [5, 25]      // Less noise
});

/**
 * Detect potential side-channel attacks
 */
export function detectSideChannelAttack(request: FastifyRequest): {
  isAttack: boolean;
  attackType: string[];
  confidence: number;
} {
  const attacks: string[] = [];
  let confidence = 0;
  
  // Check for rapid requests (timing attack)
  const userAgent = request.headers['user-agent'] || '';
  if (userAgent.includes('curl') || userAgent.includes('wget') || !userAgent) {
    attacks.push('automated_timing_attack');
    confidence += 0.3;
  }
  
  // Check for missing timing headers
  if (!request.headers['x-timestamp']) {
    attacks.push('missing_timing_headers');
    confidence += 0.2;
  }
  
  // Check for suspicious request patterns
  const url = request.url;
  if (url.includes('password') || url.includes('token') || url.includes('auth')) {
    attacks.push('sensitive_endpoint_probe');
    confidence += 0.4;
  }
  
  return {
    isAttack: attacks.length > 0,
    attackType: attacks,
    confidence: Math.min(confidence, 1.0)
  };
}

/**
 * Monitor side-channel attack attempts
 */
export function monitorSideChannelAttacks(request: FastifyRequest): void {
  const detection = detectSideChannelAttack(request);
  
  if (detection.isAttack && detection.confidence > 0.7) {
    console.warn('🚨 HIGH-CONFIDENCE SIDE-CHANNEL ATTACK DETECTED:', {
      attackTypes: detection.attackType,
      confidence: detection.confidence,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      url: request.url,
      method: request.method
    });
  }
}

/**
 * Add timing noise to any async operation
 */
export async function addTimingNoiseToOperation<T>(
  operation: Promise<T>,
  config: SideChannelProtectionConfig = DEFAULT_CONFIG
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await operation;
    
    // Add noise based on operation time
    const elapsed = Date.now() - startTime;
    const [min, max] = config.randomDelayRange;
    const noise = Math.floor(Math.random() * (max - min + 1)) + min;
    
    await new Promise(resolve => setTimeout(resolve, noise));
    
    return result;
  } catch (error) {
    // Add noise even to failed operations
    await addTimingNoise(config);
    throw error;
  }
}
