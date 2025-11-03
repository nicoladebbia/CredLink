/**
 * Phase 38 - Token Bucket Rate Limiting
 * Implements srTCM/TRTCM concepts for burst + sustained rate control
 * Maps to OWASP API4:2023 - Unrestricted Resource Consumption
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { Redis } from 'ioredis';
import { createHash } from 'crypto';

// Token Bucket Configuration following IETF RFC 2697/2698 concepts
interface TokenBucketConfig {
  // Burst capacity (tokens)
  burstSize: number;
  // Sustained rate (tokens/second)
  sustainedRate: number;
  // Refill interval in milliseconds
  refillInterval: number;
  // Maximum tokens allowed
  maxTokens: number;
}

// Endpoint-specific configurations
const RATE_LIMIT_CONFIGS: Record<string, TokenBucketConfig> = {
  // Verify endpoints: 60 req/s burst, 10 req/s sustained
  verify: {
    burstSize: 60,
    sustainedRate: 10,
    refillInterval: 1000, // 1 second
    maxTokens: 60,
  },
  // Auth endpoints: 10 req/s burst, 2 req/s sustained
  auth: {
    burstSize: 10,
    sustainedRate: 2,
    refillInterval: 1000,
    maxTokens: 10,
  },
  // Billing endpoints: 5 req/s burst, 1 req/s sustained
  billing: {
    burstSize: 5,
    sustainedRate: 1,
    refillInterval: 1000,
    maxTokens: 5,
  },
  // Default configuration
  default: {
    burstSize: 30,
    sustainedRate: 5,
    refillInterval: 1000,
    maxTokens: 30,
  },
};

// Redis key structure for token buckets
interface RateLimitKeys {
  tokens: string;        // Current token count
  lastRefill: string;    // Last refill timestamp
  windowStart: string;   // Current window start time
  requestCount: string;  // Request count in current window
}

// Rate limit result interface
interface RateLimitResult {
  allowed: boolean;
  tokensRemaining: number;
  resetTime: Date;
  retryAfter?: number;
  windowUsage: number;
  burstUsage: number;
}

/**
 * Generate consistent Redis keys for rate limiting
 */
function generateRateLimitKeys(
  identifier: string,
  endpointClass: string,
  window: number = 3600000 // 1 hour default
): RateLimitKeys {
  const hash = createHash('sha256').update(`${identifier}:${endpointClass}`).digest('hex').substring(0, 16);
  const currentWindow = Math.floor(Date.now() / window) * window;
  
  return {
    tokens: `rate_limit:tokens:${endpointClass}:${hash}`,
    lastRefill: `rate_limit:last_refill:${endpointClass}:${hash}`,
    windowStart: `rate_limit:window:${endpointClass}:${hash}`,
    requestCount: `rate_limit:count:${endpointClass}:${hash}:${currentWindow}`,
  };
}

/**
 * Token Bucket Algorithm Implementation
 * Follows IETF RFC 2697 (Single Rate Three Color Marker - srTCM)
 * and RFC 2698 (Two Rate Three Color Marker - trTCM) concepts
 */
async function tokenBucketCheck(
  redis: Redis,
  keys: RateLimitKeys,
  config: TokenBucketConfig,
  tokensRequested: number = 1
): Promise<RateLimitResult> {
  const now = Date.now();
  const luaScript = `
    local tokens_key = KEYS[1]
    local last_refill_key = KEYS[2]
    local window_key = KEYS[3]
    local count_key = KEYS[4]
    
    local burst_size = tonumber(ARGV[1])
    local sustained_rate = tonumber(ARGV[2])
    local refill_interval = tonumber(ARGV[3])
    local max_tokens = tonumber(ARGV[4])
    local tokens_requested = tonumber(ARGV[5])
    local now = tonumber(ARGV[6])
    
    -- Get current state
    local tokens = tonumber(redis.call('GET', tokens_key) or max_tokens)
    local last_refill = tonumber(redis.call('GET', last_refill_key) or now)
    
    -- Calculate time elapsed and tokens to add
    local time_elapsed = now - last_refill
    local tokens_to_add = math.floor((time_elapsed / refill_interval) * sustained_rate)
    
    -- Refill tokens (capped at max_tokens)
    if tokens_to_add > 0 then
      tokens = math.min(max_tokens, tokens + tokens_to_add)
      redis.call('SET', tokens_key, tokens)
      redis.call('SET', last_refill_key, now)
    end
    
    -- Check if request can be processed
    local allowed = tokens >= tokens_requested
    local tokens_remaining = tokens
    
    if allowed then
      tokens = tokens - tokens_requested
      redis.call('SET', tokens_key, tokens)
    end
    
    -- Update request count for window
    local request_count = tonumber(redis.call('INCR', count_key) or 1)
    redis.call('EXPIRE', count_key, math.ceil(refill_interval * 10 / 1000))
    
    -- Calculate reset time (when bucket will be full again)
    local tokens_needed = max_tokens - tokens
    local time_to_full = math.ceil(tokens_needed / sustained_rate * refill_interval)
    local reset_time = now + time_to_full
    
    -- Calculate usage metrics
    local burst_usage = (max_tokens - tokens_remaining) / max_tokens
    local window_usage = request_count / (burst_size * 10) -- Normalized to expected window usage
    
    return {
      allowed,
      tokens_remaining,
      reset_time,
      request_count,
      burst_usage,
      window_usage
    }
  `;
  
  try {
    const result = await redis.eval(
      luaScript,
      4,
      keys.tokens,
      keys.lastRefill,
      keys.windowStart,
      keys.requestCount,
      config.burstSize,
      config.sustainedRate,
      config.refillInterval,
      config.maxTokens,
      tokensRequested,
      now
    ) as any[];
    
    return {
      allowed: result[0] === 1,
      tokensRemaining: result[1],
      resetTime: new Date(result[2]),
      windowUsage: result[5],
      burstUsage: result[6],
      retryAfter: result[0] === 0 ? Math.ceil((result[2] - now) / 1000) : undefined,
    };
  } catch (error) {
    console.error('Token bucket check failed:', error);
    // Fail open - allow request if Redis is down
    return {
      allowed: true,
      tokensRemaining: config.maxTokens,
      resetTime: new Date(Date.now() + config.refillInterval),
      windowUsage: 0,
      burstUsage: 0,
    };
  }
}

/**
 * Extract client identifier for rate limiting
 */
function extractClientIdentifier(request: FastifyRequest): string {
  // Priority order for client identification
  const sources = [
    // Authenticated tenant ID (highest priority)
    () => (request as any).tenant?.tenantId,
    // API key hash
    () => {
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const apiKey = authHeader.substring(7);
        return createHash('sha256').update(apiKey).digest('hex').substring(0, 16);
      }
      return null;
    },
    // Client IP with user agent - SECURITY HARDENED
    () => {
      // CRITICAL: Validate and sanitize IP addresses to prevent injection
      const rawIp = request.ip || 
                   (Array.isArray(request.headers['x-forwarded-for']) 
                     ? request.headers['x-forwarded-for'][0] 
                     : request.headers['x-forwarded-for'])?.split(',')[0]?.trim() ||
                   request.headers['x-real-ip'] ||
                   'unknown';
      
      // Ensure rawIp is a string for validation
      const ipString = typeof rawIp === 'string' ? rawIp : 'unknown';
      
      // Validate IP format to prevent injection
      const ip = ipString === 'unknown' ? 'unknown' : 
                 /^(\d{1,3}\.){3}\d{1,3}$|^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(ipString) ? ipString : 
                 'invalid';
      
      // Sanitize user agent to prevent injection
      const userAgent = (request.headers['user-agent'] || 'unknown')
        .toString()
        .replace(/[^\w\s\-._]/g, '') // Remove potentially dangerous characters
        .substring(0, 100); // Limit length
      
      return createHash('sha256').update(`${ip}:${userAgent}`).digest('hex').substring(0, 16);
    },
  ];
  
  for (const source of sources) {
    const identifier = source();
    if (identifier && identifier !== 'unknown') {
      return identifier;
    }
  }
  
  return 'anonymous';
}

/**
 * Determine endpoint class for rate limiting
 */
function determineEndpointClass(request: FastifyRequest): string {
  const path = request.url;
  const method = request.method;
  
  // Billing endpoints
  if (path.includes('/billing') || path.includes('/stripe') || path.includes('/webhooks')) {
    return 'billing';
  }
  
  // Authentication endpoints
  if (path.includes('/auth') || path.includes('/login') || path.includes('/api-keys')) {
    return 'auth';
  }
  
  // Verify endpoints
  if (path.includes('/verify') || path.includes('/manifest')) {
    return 'verify';
  }
  
  // Default classification
  return 'default';
}

/**
 * Enhanced Rate Limiting Middleware
 * Implements multi-identifier strategy and token bucket algorithm
 */
export async function enhancedRateLimitMiddleware(
  redis: Redis,
  customConfigs?: Record<string, Partial<TokenBucketConfig>>
) {
  const configs = { ...RATE_LIMIT_CONFIGS, ...customConfigs };
  
  return async function rateLimitMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      // Extract client identifier
      const clientId = extractClientIdentifier(request);
      
      // Determine endpoint class
      const endpointClass = determineEndpointClass(request);
      const config = configs[endpointClass] || configs.default;
      
      // Ensure config is complete
      const fullConfig: TokenBucketConfig = {
        burstSize: config.burstSize || 20,
        sustainedRate: config.sustainedRate || 10,
        refillInterval: config.refillInterval || 60,
        maxTokens: config.maxTokens || 100,
      };
      
      // Generate rate limit keys
      const keys = generateRateLimitKeys(clientId, endpointClass);
      
      // Perform token bucket check
      const result = await tokenBucketCheck(redis, keys, fullConfig);
      
      // Set rate limit headers
      reply.header('X-RateLimit-Limit', fullConfig.burstSize);
      reply.header('X-RateLimit-Remaining', Math.max(0, result.tokensRemaining));
      reply.header('X-RateLimit-Reset', Math.ceil(result.resetTime.getTime() / 1000));
      reply.header('X-RateLimit-Window-Usage', Math.round(result.windowUsage * 100) + '%');
      reply.header('X-RateLimit-Burst-Usage', Math.round(result.burstUsage * 100) + '%');
      
      // Log rate limit events for monitoring
      if (result.burstUsage > 0.8) {
        console.warn(`High rate limit usage: ${clientId} on ${endpointClass} (${Math.round(result.burstUsage * 100)}%)`);
      }
      
      // Block request if rate limit exceeded
      if (!result.allowed) {
        reply.status(429).send({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: result.retryAfter,
          endpointClass,
          resetTime: result.resetTime.toISOString(),
        });
        return;
      }
      
    } catch (error) {
      console.error('Rate limiting middleware error:', error);
      // Fail open - don't block requests if rate limiting fails
    }
  };
}

/**
 * Budget Cap Implementation for Financial Protection
 * Prevents denial-of-wallet attacks by enforcing daily spending limits
 */
export class BudgetCapManager {
  private redis: Redis;
  private dailyCaps: Map<string, number> = new Map();
  
  constructor(redis: Redis) {
    this.redis = redis;
    // Initialize default daily caps (in USD cents)
    this.dailyCaps.set('free', 1000);     // $10/day
    this.dailyCaps.set('basic', 5000);    // $50/day
    this.dailyCaps.set('pro', 20000);     // $200/day
    this.dailyCaps.set('enterprise', 100000); // $1000/day
  }
  
  /**
   * Check if tenant has remaining budget for operation
   */
  async checkBudget(tenantId: string, plan: string, costCents: number): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
    const dailyCap = this.dailyCaps.get(plan) || this.dailyCaps.get('free')!;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const budgetKey = `budget:${tenantId}:${today}`;
    
    try {
      const currentSpend = parseInt(await this.redis.get(budgetKey) || '0');
      const remaining = Math.max(0, dailyCap - currentSpend);
      const allowed = remaining >= costCents;
      
      return {
        allowed,
        remaining,
        resetTime: new Date(new Date(today).getTime() + 24 * 60 * 60 * 1000),
      };
    } catch (error) {
      console.error('Budget check failed:', error);
      // Fail open for budget checks to avoid service disruption
      return {
        allowed: true,
        remaining: dailyCap,
        resetTime: new Date(new Date(today).getTime() + 24 * 60 * 60 * 1000),
      };
    }
  }
  
  /**
   * Record cost against tenant budget
   */
  async recordCost(tenantId: string, costCents: number): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const budgetKey = `budget:${tenantId}:${today}`;
    
    try {
      await this.redis.incrby(budgetKey, costCents);
      await this.redis.expire(budgetKey, 24 * 60 * 60 + 3600); // 25 hours to handle timezone changes
    } catch (error) {
      console.error('Failed to record cost:', error);
    }
  }
  
  /**
   * Get current budget usage for tenant
   */
  async getBudgetUsage(tenantId: string, plan: string): Promise<{ used: number; limit: number; percentage: number }> {
    const dailyCap = this.dailyCaps.get(plan) || this.dailyCaps.get('free')!;
    const today = new Date().toISOString().split('T')[0];
    const budgetKey = `budget:${tenantId}:${today}`;
    
    try {
      const currentSpend = parseInt(await this.redis.get(budgetKey) || '0');
      return {
        used: currentSpend,
        limit: dailyCap,
        percentage: Math.round((currentSpend / dailyCap) * 100),
      };
    } catch (error) {
      console.error('Failed to get budget usage:', error);
      return { used: 0, limit: dailyCap, percentage: 0 };
    }
  }
}

/**
 * Abuse Detection Metrics
 */
export interface AbuseMetrics {
  totalRequests: number;
  blockedRequests: number;
  highUsageTenants: Array<{
    tenantId: string;
    usagePercentage: number;
    endpointClass: string;
  }>;
  budgetAlerts: Array<{
    tenantId: string;
    usagePercentage: number;
    remainingBudget: number;
  }>;
}

/**
 * Collect abuse detection metrics for monitoring
 */
export async function collectAbuseMetrics(redis: Redis): Promise<AbuseMetrics> {
  // Implementation would collect metrics from Redis and other sources
  // This is a placeholder for the actual metrics collection
  return {
    totalRequests: 0,
    blockedRequests: 0,
    highUsageTenants: [],
    budgetAlerts: [],
  };
}
