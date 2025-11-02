/**
 * Shopify Webhook Verification
 * SECURITY: Enhanced with comprehensive validation and security
 * HMAC verification and topic validation with advanced security measures
 */

import crypto from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';

// SECURITY: Configuration constants
const MAX_BODY_SIZE = 1024 * 1024; // 1MB
const MAX_URL_LENGTH = 2048;
const MAX_FIELD_LENGTH = 255;
const VALID_TOPICS = ['products/create', 'products/update', 'app/uninstalled'];
const VALID_SHOP_DOMAIN_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/;
const VALID_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];

// SECURITY: Rate limiting configuration
const WEBHOOK_RATE_LIMIT = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_WEBHOOKS_PER_MINUTE = 100;

/**
 * SECURITY: Validate webhook secret
 */
function validateWebhookSecret(secret: string): boolean {
  if (!secret || typeof secret !== 'string') {
    return false;
  }
  
  // SECURITY: Secret should be at least 32 characters
  if (secret.length < 32) {
    return false;
  }
  
  // SECURITY: Secret should contain only valid characters
  if (!/^[a-zA-Z0-9+/=_-]+$/.test(secret)) {
    return false;
  }
  
  return true;
}

/**
 * SECURITY: Validate HMAC format
 */
function validateHmacFormat(hmac: string): boolean {
  if (!hmac || typeof hmac !== 'string') {
    return false;
  }
  
  // SECURITY: HMAC should be base64 encoded
  try {
    Buffer.from(hmac, 'base64');
    return true;
  } catch {
    return false;
  }
}

/**
 * SECURITY: Validate shop domain format
 */
function validateShopDomain(domain: string): boolean {
  if (!domain || typeof domain !== 'string') {
    return false;
  }
  
  // SECURITY: Check domain length
  if (domain.length > MAX_FIELD_LENGTH) {
    return false;
  }
  
  // SECURITY: Validate Shopify domain pattern
  return VALID_SHOP_DOMAIN_PATTERN.test(domain);
}

/**
 * SECURITY: Validate webhook topic
 */
function validateWebhookTopic(topic: string): boolean {
  if (!topic || typeof topic !== 'string') {
    return false;
  }
  
  // SECURITY: Check topic length
  if (topic.length > MAX_FIELD_LENGTH) {
    return false;
  }
  
  // SECURITY: Validate against allowed topics
  return VALID_TOPICS.includes(topic);
}

/**
 * SECURITY: Check rate limiting for webhooks
 */
function checkRateLimit(shopDomain: string): boolean {
  const now = Date.now();
  const key = shopDomain;
  
  if (!WEBHOOK_RATE_LIMIT.has(key)) {
    WEBHOOK_RATE_LIMIT.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  const limit = WEBHOOK_RATE_LIMIT.get(key)!;
  
  // SECURITY: Reset if window expired
  if (now > limit.resetTime) {
    WEBHOOK_RATE_LIMIT.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  // SECURITY: Check if limit exceeded
  if (limit.count >= MAX_WEBHOOKS_PER_MINUTE) {
    return false;
  }
  
  // SECURITY: Increment counter
  limit.count++;
  return true;
}

/**
 * SECURITY: Validate request body size
 */
function validateRequestBody(body: any): boolean {
  if (!body) {
    return false;
  }
  
  // SECURITY: Check body size
  const bodyString = JSON.stringify(body);
  if (bodyString.length > MAX_BODY_SIZE) {
    return false;
  }
  
  return true;
}

/**
 * SECURITY: Sanitize URL
 */
function sanitizeUrl(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }
  
  // SECURITY: Check URL length
  if (url.length > MAX_URL_LENGTH) {
    return null;
  }
  
  try {
    const parsed = new URL(url);
    
    // SECURITY: Only allow HTTPS
    if (parsed.protocol !== 'https:') {
      return null;
    }
    
    // SECURITY: Validate hostname
    if (!parsed.hostname || !VALID_SHOP_DOMAIN_PATTERN.test(parsed.hostname)) {
      return null;
    }
    
    // SECURITY: Remove dangerous components
    parsed.hash = '';
    parsed.username = '';
    parsed.password = '';
    
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * SECURITY: Enhanced Shopify webhook HMAC verification
 */
export async function verifyWebhook(request: FastifyRequest, reply: FastifyReply) {
  try {
    // SECURITY: Extract and validate headers
    const hmac = request.headers['x-shopify-hmac-sha256'] as string;
    const topic = request.headers['x-shopify-topic'] as string;
    const shop_domain = request.headers['x-shopify-shop-domain'] as string;
    const webhook_id = request.headers['x-shopify-webhook-id'] as string;
    const api_version = request.headers['x-shopify-api-version'] as string;
    
    // SECURITY: Get and validate webhook secret
    const webhook_secret = process.env.SHOPIFY_WEBHOOK_SECRET;
    if (!validateWebhookSecret(webhook_secret)) {
      request.log.error('SHOPIFY_WEBHOOK_SECRET not properly configured');
      reply.code(500).send({ error: 'Webhook configuration error' });
      return;
    }
    
    // SECURITY: Validate required headers
    if (!hmac || !validateHmacFormat(hmac)) {
      request.log.warn('Invalid or missing HMAC header');
      reply.code(400).send({ error: 'Invalid HMAC format' });
      return;
    }
    
    if (!topic || !validateWebhookTopic(topic)) {
      request.log.warn({ topic }, 'Invalid or missing webhook topic');
      reply.code(400).send({ error: 'Invalid webhook topic' });
      return;
    }
    
    if (!shop_domain || !validateShopDomain(shop_domain)) {
      request.log.warn({ shop_domain }, 'Invalid shop domain');
      reply.code(400).send({ error: 'Invalid shop domain' });
      return;
    }
    
    // SECURITY: Check rate limiting
    if (!checkRateLimit(shop_domain)) {
      request.log.warn({ shop_domain }, 'Webhook rate limit exceeded');
      reply.code(429).send({ error: 'Rate limit exceeded' });
      return;
    }
    
    // SECURITY: Validate request body
    if (!validateRequestBody(request.body)) {
      request.log.warn('Invalid request body');
      reply.code(400).send({ error: 'Invalid request body' });
      return;
    }
    
    // SECURITY: Verify HMAC with constant-time comparison
    const body = JSON.stringify(request.body);
    const calculated_hmac = crypto
      .createHmac('sha256', webhook_secret)
      .update(body, 'utf8')
      .digest('base64');
    
    // SECURITY: Use timing-safe comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(Buffer.from(calculated_hmac, 'base64'), Buffer.from(hmac, 'base64'))) {
      request.log.warn({ 
        shop_domain,
        webhook_id,
        topic,
        body_size: body.length 
      }, 'Webhook HMAC verification failed');
      
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
    
    // SECURITY: Add validated shop info to request
    request.headers['x-shop-domain'] = shop_domain;
    request.headers['x-webhook-topic'] = topic;
    
    request.log.info({ 
      topic, 
      shop_domain, 
      webhook_id,
      api_version,
      body_size: body.length 
    }, 'Webhook verified successfully');
    
  } catch (error) {
    request.log.error({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Webhook verification error');
    reply.code(500).send({ error: 'Internal server error' });
  }
}

/**
 * SECURITY: Enhanced product image URL extraction
 */
export function extractImageUrls(product: any): string[] {
  const urls: string[] = [];
  
  try {
    // SECURITY: Validate product object
    if (!product || typeof product !== 'object') {
      return [];
    }
    
    // SECURITY: Extract main product images with validation
    if (product.images && Array.isArray(product.images)) {
      // SECURITY: Limit number of images to prevent DoS
      const maxImages = Math.min(product.images.length, 50);
      
      for (let i = 0; i < maxImages; i++) {
        const img = product.images[i];
        if (img && typeof img === 'object' && img.src && typeof img.src === 'string') {
          const sanitizedUrl = sanitizeUrl(img.src);
          if (sanitizedUrl) {
            urls.push(sanitizedUrl);
          }
        }
      }
    }
    
    // SECURITY: Extract variant images with validation
    if (product.variants && Array.isArray(product.variants)) {
      // SECURITY: Limit number of variants
      const maxVariants = Math.min(product.variants.length, 100);
      
      for (let i = 0; i < maxVariants; i++) {
        const variant = product.variants[i];
        if (variant && typeof variant === 'object' && 
            variant.image && typeof variant.image === 'object' && 
            variant.image.src && typeof variant.image.src === 'string') {
          const sanitizedUrl = sanitizeUrl(variant.image.src);
          if (sanitizedUrl) {
            urls.push(sanitizedUrl);
          }
        }
      }
    }
    
    // SECURITY: Remove duplicates and filter for valid image extensions
    const uniqueUrls = [...new Set(urls)];
    return uniqueUrls.filter(url => {
      const lowerUrl = url.toLowerCase();
      return VALID_IMAGE_EXTENSIONS.some(ext => lowerUrl.includes(ext));
    });
    
  } catch (error) {
    // SECURITY: Return empty array on error
    return [];
  }
}

/**
 * SECURITY: Get shop domain with validation
 */
export function getShopDomain(request: FastifyRequest): string {
  const domain = request.headers['x-shopify-shop-domain'] as string;
  return validateShopDomain(domain) ? domain : '';
}

/**
 * SECURITY: Get webhook topic with validation
 */
export function getWebhookTopic(request: FastifyRequest): string {
  const topic = request.headers['x-shopify-topic'] as string;
  return validateWebhookTopic(topic) ? topic : '';
}

/**
 * SECURITY: Check if webhook is a product update/create
 */
export function isProductWebhook(request: FastifyRequest): boolean {
  const topic = getWebhookTopic(request);
  return topic === 'products/create' || topic === 'products/update';
}

/**
 * SECURITY: Check if webhook is app uninstall
 */
export function isAppUninstallWebhook(request: FastifyRequest): boolean {
  return getWebhookTopic(request) === 'app/uninstalled';
}

/**
 * SECURITY: Generate secure webhook response headers
 */
export function getWebhookResponseHeaders(request: FastifyRequest): Record<string, string> {
  return {
    'Content-Type': 'text/plain',
    'X-Shopify-Webhook-Topic': getWebhookTopic(request),
    'X-Shopify-Shop-Domain': getShopDomain(request),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block'
  };
}

/**
 * SECURITY: Log webhook payload with sensitive data filtering
 */
export function logWebhookPayload(request: FastifyRequest, product: any): void {
  try {
    const shop_domain = getShopDomain(request);
    const topic = getWebhookTopic(request);
    const image_count = product.images?.length || 0;
    const variant_count = product.variants?.length || 0;
    
    // SECURITY: Sanitize product title
    const title = product.title && typeof product.title === 'string' 
      ? product.title.substring(0, 100) 
      : 'Unknown';
    
    request.log.info({
      shop_domain,
      topic,
      product_id: product.id || 'unknown',
      product_title: title,
      image_count,
      variant_count,
      has_images: image_count > 0
    }, 'Webhook payload processed');
  } catch (error) {
    request.log.error({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to log webhook payload');
  }
}

/**
 * SECURITY: Enhanced product payload validation
 */
export function validateProductPayload(product: any): boolean {
  try {
    // SECURITY: Basic object validation
    if (!product || typeof product !== 'object') {
      return false;
    }
    
    // SECURITY: Required fields validation
    if (!product.id || typeof product.id !== 'string') {
      return false;
    }
    
    if (!product.title || typeof product.title !== 'string') {
      return false;
    }
    
    // SECURITY: Field length validation
    if (product.id.length > MAX_FIELD_LENGTH) {
      return false;
    }
    
    if (product.title.length > 500) {
      return false;
    }
    
    // SECURITY: Images array validation
    if (product.images !== undefined) {
      if (!Array.isArray(product.images)) {
        return false;
      }
      
      // SECURITY: Limit array size
      if (product.images.length > 50) {
        return false;
      }
    }
    
    // SECURITY: Variants array validation
    if (product.variants !== undefined) {
      if (!Array.isArray(product.variants)) {
        return false;
      }
      
      // SECURITY: Limit array size
      if (product.variants.length > 100) {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * SECURITY: Clean up rate limiting entries
 */
export function cleanupRateLimit(): void {
  const now = Date.now();
  
  for (const [key, limit] of WEBHOOK_RATE_LIMIT.entries()) {
    if (now > limit.resetTime) {
      WEBHOOK_RATE_LIMIT.delete(key);
    }
  }
}

// SECURITY: Periodic cleanup
setInterval(cleanupRateLimit, 300000); // Every 5 minutes
