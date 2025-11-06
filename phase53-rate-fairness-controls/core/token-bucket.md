# Phase 53 — Token Bucket Implementation

## Per-Tenant Token Buckets (Local + Global)

### Core Token Bucket Implementation
```typescript
import { Redis } from 'ioredis';
import { EventEmitter } from 'events';

/**
 * Token bucket rate limiter with local + global coordination
 * Implements Envoy-recommended two-stage approach
 */
export class TokenBucketRateLimiter extends EventEmitter {
  private readonly redis: Redis;
  private readonly localBuckets: Map<string, LocalBucket> = new Map();
  private readonly config: RateLimitConfig;

  constructor(redis: Redis, config: RateLimitConfig) {
    super();
    this.redis = redis;
    this.config = config;
    
    // Cleanup expired local buckets every minute
    setInterval(() => this.cleanupLocalBuckets(), 60000);
  }

  /**
   * Check if request is allowed and consume tokens
   * Returns decision with remaining tokens and retry-after
   */
  async checkAndConsume(
    tenantId: string,
    tokens: number = 1,
    tier: TenantTier = 'starter'
  ): Promise<RateLimitDecision> {
    const now = Date.now();
    
    // Stage 1: Check local bucket (edge/instance level)
    const localDecision = this.checkLocalBucket(tenantId, tokens, tier, now);
    if (!localDecision.allowed) {
      return localDecision;
    }

    // Stage 2: Check global bucket (central Redis)
    const globalDecision = await this.checkGlobalBucket(tenantId, tokens, tier, now);
    if (!globalDecision.allowed) {
      // Rollback local consumption
      this.rollbackLocalConsumption(tenantId, tokens);
      return globalDecision;
    }

    // Both stages passed - request allowed
    return {
      allowed: true,
      remaining: Math.min(localDecision.remaining, globalDecision.remaining),
      resetTime: Math.min(localDecision.resetTime, globalDecision.resetTime),
      retryAfter: 0,
      reason: 'allowed'
    };
  }

  /**
   * Local token bucket for micro-burst absorption
   * Small bucket close to where requests land
   */
  private checkLocalBucket(
    tenantId: string,
    tokens: number,
    tier: TenantTier,
    now: number
  ): RateLimitDecision {
    let bucket = this.localBuckets.get(tenantId);
    
    if (!bucket) {
      const tierConfig = this.config.tiers[tier];
      bucket = new LocalBucket(
        tierConfig.steadyRps,
        tierConfig.burstTokens,
        now
      );
      this.localBuckets.set(tenantId, bucket);
    }

    return bucket.consume(tokens, now);
  }

  /**
   * Global token bucket for cross-cluster coordination
   * Central counter with coarser window
   */
  private async consumeGlobal(
    tenantId: string,
    tokens: number,
    tier: TenantTier,
    now: number
  ): Promise<RateLimitDecision> {
    // Validate tenant ID to prevent Redis key injection
    if (!tenantId || typeof tenantId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
      throw new Error('Invalid tenant ID format');
    }
    
    // Validate token count
    if (tokens < 1 || tokens > 10000) {
      throw new Error('Token count must be between 1 and 10000');
    }
    
    const tierConfig = this.config.tiers[tier];
    const key = `ratelimit:global:${tenantId}`;
    
    // Use Redis Lua script for atomic token consumption
    const luaScript = `
      local key = KEYS[1]
      local tokens = tonumber(ARGV[1])
      local capacity = tonumber(ARGV[2])
      local refill_rate = tonumber(ARGV[3])
      local now = tonumber(ARGV[4])
      
      local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
      local current_tokens = tonumber(bucket[1]) or capacity
      local last_refill = tonumber(bucket[2]) or now
      
      -- Calculate tokens to add based on time elapsed
      local time_elapsed = now - last_refill
      local tokens_to_add = math.floor(time_elapsed * refill_rate / 1000)
      current_tokens = math.min(capacity, current_tokens + tokens_to_add)
      
      -- Check if we have enough tokens
      if current_tokens >= tokens then
        current_tokens = current_tokens - tokens
        redis.call('HSET', key, 'tokens', current_tokens, 'last_refill', now)
        redis.call('EXPIRE', key, 3600) -- 1 hour expiry
        return {1, current_tokens, 0}
      else
        -- Calculate retry after based on refill rate
        local retry_after = math.ceil((tokens - current_tokens) * 1000 / refill_rate)
        redis.call('HSET', key, 'tokens', current_tokens, 'last_refill', now)
        redis.call('EXPIRE', key, 3600)
        return {0, current_tokens, retry_after}
      end
    `;

    try {
      const result = await this.redis.eval(
        luaScript,
        1,
        key,
        tokens,
        tierConfig.burstTokens,
        tierConfig.steadyRps,
        now
      ) as [number, number, number];

      const [allowed, remaining, retryAfter] = result;

      return {
        allowed: allowed === 1,
        remaining,
        resetTime: now + (retryAfter * 1000),
        retryAfter,
        reason: allowed === 1 ? 'allowed' : 'global_limit_exceeded'
      };
    } catch (error) {
      // On Redis error, allow request but log
      this.emit('redis_error', error);
      return {
        allowed: true,
        remaining: 0,
        resetTime: now + 5000,
        retryAfter: 0,
        reason: 'redis_fallback'
      };
    }
  }

  private rollbackLocalConsumption(tenantId: string, tokens: number): void {
    const bucket = this.localBuckets.get(tenantId);
    if (bucket) {
      bucket.rollback(tokens);
    }
  }

  private cleanupLocalBuckets(): void {
    const now = Date.now();
    const expireTime = 5 * 60 * 1000; // 5 minutes

    for (const [tenantId, bucket] of this.localBuckets.entries()) {
      if (now - bucket.lastAccess > expireTime) {
        this.localBuckets.delete(tenantId);
      }
    }
  }
}

/**
 * Local token bucket for edge-level rate limiting
 */
class LocalBucket {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillRate: number;
  private lastRefill: number;
  public readonly lastAccess: number;

  constructor(capacity: number, refillRate: number, now: number) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefill = now;
    this.lastAccess = now;
  }

  consume(tokens: number, now: number): RateLimitDecision {
    // Refill tokens based on elapsed time
    const timeElapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor(timeElapsed * this.refillRate / 1000);
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
    this.lastAccess = now;

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return {
        allowed: true,
        remaining: this.tokens,
        resetTime: now + Math.ceil((this.capacity - this.tokens) * 1000 / this.refillRate) * 1000,
        retryAfter: 0,
        reason: 'allowed'
      };
    } else {
      const retryAfter = Math.ceil((tokens - this.tokens) * 1000 / this.refillRate);
      return {
        allowed: false,
        remaining: this.tokens,
        resetTime: now + (retryAfter * 1000),
        retryAfter,
        reason: 'local_limit_exceeded'
      };
    }
  }

  rollback(tokens: number): void {
    this.tokens = Math.min(this.capacity, this.tokens + tokens);
  }
}

/**
 * Global burst pool for cross-cluster surge protection
 */
export class GlobalBurstPool {
  private readonly redis: Redis;
  private readonly config: GlobalPoolConfig;

  constructor(redis: Redis, config: GlobalPoolConfig) {
    this.redis = redis;
    this.config = config;
  }

  async checkGlobalPool(tokens: number): Promise<RateLimitDecision> {
    const key = 'ratelimit:global:burst_pool';
    const now = Date.now();

    const luaScript = `
      local key = KEYS[1]
      local tokens = tonumber(ARGV[1])
      local capacity = tonumber(ARGV[2])
      local refill_rate = tonumber(ARGV[3])
      local now = tonumber(ARGV[4])
      
      local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
      local current_tokens = tonumber(bucket[1]) or capacity
      local last_refill = tonumber(bucket[2]) or now
      
      -- Refill based on elapsed time
      local time_elapsed = now - last_refill
      local tokens_to_add = math.floor(time_elapsed * refill_rate / 1000)
      current_tokens = math.min(capacity, current_tokens + tokens_to_add)
      
      if current_tokens >= tokens then
        current_tokens = current_tokens - tokens
        redis.call('HSET', key, 'tokens', current_tokens, 'last_refill', now)
        redis.call('EXPIRE', key, 300) -- 5 minute expiry
        return {1, current_tokens, 0}
      else
        local retry_after = math.ceil((tokens - current_tokens) * 1000 / refill_rate)
        redis.call('HSET', key, 'tokens', current_tokens, 'last_refill', now)
        redis.call('EXPIRE', key, 300)
        return {0, current_tokens, retry_after}
      end
    `;

    try {
      const result = await this.redis.eval(
        luaScript,
        1,
        key,
        tokens,
        this.config.burstTokens,
        this.config.steadyRps,
        now
      ) as [number, number, number];

      const [allowed, remaining, retryAfter] = result;

      return {
        allowed: allowed === 1,
        remaining,
        resetTime: now + (retryAfter * 1000),
        retryAfter,
        reason: allowed === 1 ? 'global_pool_allowed' : 'global_pool_exhausted'
      };
    } catch (error) {
      // Fail open on Redis errors
      return {
        allowed: true,
        remaining: 0,
        resetTime: now + 5000,
        retryAfter: 0,
        reason: 'global_pool_fallback'
      };
    }
  }
}

// Type definitions
export interface RateLimitConfig {
  tiers: Record<TenantTier, TierConfig>;
  globalPool: GlobalPoolConfig;
}

export interface TierConfig {
  steadyRps: number;
  burstTokens: number;
  weight: number;
}

export interface GlobalPoolConfig {
  steadyRps: number;
  burstTokens: number;
}

export type TenantTier = 'starter' | 'growth' | 'scale';

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter: number;
  reason: string;
}

// Default configuration per specification
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  tiers: {
    starter: {
      steadyRps: 300,
      burstTokens: 1200,
      weight: 1.0
    },
    growth: {
      steadyRps: 360, // 1.2x starter
      burstTokens: 1440,
      weight: 1.2
    },
    scale: {
      steadyRps: 600, // 2x starter
      burstTokens: 2400,
      weight: 2.0
    }
  },
  globalPool: {
    steadyRps: 50000,
    burstTokens: 50000
  }
};
```

### Integration with Envoy Proxy
```typescript
/**
 * Envoy external rate limit service integration
 * Implements Envoy's rate limit service proto
 */
export class EnvoyRateLimitService {
  private readonly tokenBucket: TokenBucketRateLimiter;
  private readonly globalPool: GlobalBurstPool;
  private readonly config: RateLimitConfig;

  constructor(
    tokenBucket: TokenBucketRateLimiter,
    globalPool: GlobalBurstPool,
    config: RateLimitConfig
  ) {
    this.tokenBucket = tokenBucket;
    this.globalPool = globalPool;
    this.config = config;
  }

  /**
   * Handle Envoy rate limit request
   * Returns response in Envoy's expected format
   */
  async handleRateLimitRequest(request: EnvoyRateLimitRequest): Promise<EnvoyRateLimitResponse> {
    const descriptor = request.descriptors[0];
    const tenantId = this.extractTenantId(descriptor);
    const tier = this.extractTier(descriptor);
    
    // Check per-tenant limits
    const tenantDecision = await this.tokenBucket.checkAndConsume(tenantId, 1, tier);
    if (!tenantDecision.allowed) {
      return {
        overallCode: EnvoyRateLimitCode.OVER_LIMIT,
        statuses: [{
          code: EnvoyRateLimitCode.OVER_LIMIT,
          currentLimit: {
            requestsPerUnit: this.getTierConfig(tier).steadyRps,
            unit: EnvoyRateLimitUnit.SECOND
          },
          limitRemaining: tenantDecision.remaining
        }],
        headers: this.buildRateLimitHeaders(tenantDecision, tier)
      };
    }

    // Check global burst pool
    const globalDecision = await this.globalPool.checkGlobalPool(1);
    if (!globalDecision.allowed) {
      return {
        overallCode: EnvoyRateLimitCode.OVER_LIMIT,
        statuses: [{
          code: EnvoyRateLimitCode.OVER_LIMIT,
          currentLimit: {
            requestsPerUnit: this.config.globalPool.steadyRps,
            unit: EnvoyRateLimitUnit.SECOND
          },
          limitRemaining: globalDecision.remaining
        }],
        headers: this.buildRateLimitHeaders(globalDecision, tier)
      };
    }

    // Request allowed
    return {
      overallCode: EnvoyRateLimitCode.OK,
      statuses: [{
        code: EnvoyRateLimitCode.OK,
        currentLimit: {
          requestsPerUnit: this.getTierConfig(tier).steadyRps,
          unit: EnvoyRateLimitUnit.SECOND
        },
        limitRemaining: tenantDecision.remaining
      }],
      headers: this.buildRateLimitHeaders(tenantDecision, tier)
    };
  }

  private extractTenantId(descriptor: RateLimitDescriptor): string {
    return descriptor.entries?.tenant_id || 'anonymous';
  }

  private extractTier(descriptor: RateLimitDescriptor): TenantTier {
    return descriptor.entries?.tier || 'starter';
  }

  private getTierConfig(tier: TenantTier): TierConfig {
    return this.config.tiers[tier];
  }

  private buildRateLimitHeaders(decision: RateLimitDecision, tier: TenantTier): Record<string, string> {
    const headers: Record<string, string> = {};
    
    if (!decision.allowed) {
      headers['retry-after'] = decision.retryAfter.toString();
    }
    
    headers['x-ratelimit-limit'] = `${this.getTierConfig(tier).steadyRps}, burst=${this.getTierConfig(tier).burstTokens}`;
    headers['x-ratelimit-remaining'] = decision.remaining.toString();
    headers['x-ratelimit-reset'] = Math.ceil(decision.resetTime / 1000).toString();
    
    return headers;
  }
}

// Envoy proto interfaces (simplified)
interface EnvoyRateLimitRequest {
  descriptors: Array<{
    entries?: Record<string, string>;
  }>;
}

interface EnvoyRateLimitResponse {
  overallCode: EnvoyRateLimitCode;
  statuses: Array<{
    code: EnvoyRateLimitCode;
    currentLimit?: {
      requestsPerUnit: number;
      unit: EnvoyRateLimitUnit;
    };
    limitRemaining?: number;
  }>;
  headers?: Record<string, string>;
}

enum EnvoyRateLimitCode {
  OK = 'OK',
  OVER_LIMIT = 'OVER_LIMIT'
}

enum EnvoyRateLimitUnit {
  SECOND = 'SECOND',
  MINUTE = 'MINUTE',
  HOUR = 'HOUR',
  DAY = 'DAY'
}
```
