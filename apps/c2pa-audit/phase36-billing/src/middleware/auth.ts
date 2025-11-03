/**
 * Phase 36 Billing - Authentication Middleware
 * API key authentication for tenant access
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { Redis } from 'ioredis';
import { createHash, timingSafeEqual } from 'crypto';

// Mock Redis instance for middleware (in production, this would be injected) - CRITICAL: Use TLS
const redisConfig: any = {
  host: process.env['REDIS_HOST'] || 'localhost',
  port: parseInt(process.env['REDIS_PORT'] || '6379'),
  db: parseInt(process.env['REDIS_DB'] || '0'),
  password: process.env['REDIS_PASSWORD'],
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000,
  connectTimeout: 10000,
  commandTimeout: 5000,
  family: 4,
  enableAutoPipelining: true,
};

// Enable TLS in production environments
if (process.env['NODE_ENV'] === 'production' || process.env['REDIS_TLS'] === 'true') {
  redisConfig.tls = {
    rejectUnauthorized: true,
    checkServerIdentity: () => undefined,
  };
}

const redis = new Redis(redisConfig);

/**
 * Authentication middleware for API key validation
 */
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const authHeader = request.headers['authorization'];
    
    if (!authHeader) {
      reply.status(401).send({
        code: 'MISSING_API_KEY',
        message: 'Authorization header is required',
      });
      return;
    }

    // Extract Bearer token
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/);
    if (!bearerMatch) {
      reply.status(401).send({
        code: 'INVALID_AUTH_FORMAT',
        message: 'Authorization header must be in format: Bearer <api_key>',
      });
      return;
    }

    const apiKey = bearerMatch[1];

    // CRITICAL: Enhanced API key format validation with entropy requirements
    if (!/^c2pa_[a-z0-9]{8}_[a-f0-9]{64}[A-Za-z0-9]{22}$/.test(apiKey)) {
      reply.status(401).send({
        code: 'INVALID_API_KEY',
        message: 'Invalid API key format',
      });
      return;
    }
    
    // CRITICAL: Additional entropy validation
    const uniqueChars = new Set(apiKey).size;
    if (uniqueChars < apiKey.length * 0.3) { // At least 30% unique characters
      reply.status(401).send({
        code: 'WEAK_API_KEY',
        message: 'API key does not meet entropy requirements',
      });
      return;
    }

    // CRITICAL: Hash API key for lookup (timing attack protection)
    const hashedApiKey = createHash('sha256').update(apiKey).digest('hex');
    
    // Look up tenant by hashed API key
    const tenantData = await redis.get(`api_key:${hashedApiKey}`);
    if (!tenantData) {
      reply.status(401).send({
        code: 'INVALID_API_KEY',
        message: 'API key not found or expired',
      });
      return;
    }

    const tenant = JSON.parse(tenantData);

    // Check tenant status
    if (tenant.status === 'canceled' || tenant.status === 'suspended') {
      reply.status(403).send({
        code: 'ACCOUNT_INACTIVE',
        message: 'Account is not active',
      });
      return;
    }

    // Attach tenant info to request
    (request as any).tenant = {
      tenantId: tenant.tenant_id,
      stripeCustomerId: tenant.stripe_customer_id,
      stripeSubscriptionId: tenant.stripe_subscription_id,
      plan: tenant.plan,
      status: tenant.status,
    };

  } catch (error) {
    console.error('Auth middleware error:', error);
    reply.status(401).send({
      code: 'AUTH_ERROR',
      message: 'Authentication failed',
    });
  }
}

/**
 * Optional authentication middleware (doesn't fail if no auth)
 */
export async function optionalAuthMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const authHeader = request.headers['authorization'];
    
    if (!authHeader) {
      return;
    }

    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/);
    if (!bearerMatch) {
      return;
    }

    const apiKey = bearerMatch[1];

    if (!/^c2pa_[a-z0-9]{8}_[a-f0-9]{64}[A-Za-z0-9]{22}$/.test(apiKey)) {
      return;
    }
    
    // CRITICAL: Hash API key for lookup even in optional auth
    const hashedApiKey = createHash('sha256').update(apiKey).digest('hex');
    const tenantData = await redis.get(`api_key:${hashedApiKey}`);
    if (!tenantData) {
      return;
    }

    const tenant = JSON.parse(tenantData);

    if (tenant.status === 'canceled' || tenant.status === 'suspended') {
      return;
    }

    (request as any).tenant = {
      tenantId: tenant.tenant_id,
      stripeCustomerId: tenant.stripe_customer_id,
      stripeSubscriptionId: tenant.stripe_subscription_id,
      plan: tenant.plan,
      status: tenant.status,
    };

  } catch (error) {
    // Optional auth should not fail the request
    console.error('Optional auth middleware error:', error);
  }
}
