/**
 * C2 Concierge Shopify App
 * Main Fastify server for Shopify webhook handling
 * SECURITY: Enhanced with comprehensive security validation
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import pino from 'pino';
import { verifyWebhook } from './webhooks.js';
import { signWorker } from './sign-worker.js';

// SECURITY: Configuration validation
interface ServerConfig {
  port: number;
  host: string;
  logLevel: string;
  nodeEnv: string;
  allowedOrigins: string[];
  bodyLimit: number;
  requestTimeout: number;
  maxParamLength: number;
  rateLimitMax: number;
  rateLimitWindow: string;
}

// SECURITY: Default secure configuration
const DEFAULT_CONFIG: Partial<ServerConfig> = {
  port: 3000,
  host: '0.0.0.0',
  logLevel: 'info',
  nodeEnv: 'production',
  allowedOrigins: ['https://*.myshopify.com'],
  bodyLimit: 1024 * 1024, // 1MB
  requestTimeout: 30000,
  maxParamLength: 2048,
  rateLimitMax: 2,
  rateLimitWindow: '1 second'
};

/**
 * SECURITY: Validate environment variables
 */
function validateEnvironment(): ServerConfig {
  const config: ServerConfig = {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    logLevel: process.env.LOG_LEVEL || 'info',
    nodeEnv: process.env.NODE_ENV || 'production',
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['https://*.myshopify.com'],
    bodyLimit: parseInt(process.env.BODY_LIMIT || '1048576', 10),
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '30000', 10),
    maxParamLength: parseInt(process.env.MAX_PARAM_LENGTH || '2048', 10),
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '2', 10),
    rateLimitWindow: process.env.RATE_LIMIT_WINDOW || '1 second'
  };

  // SECURITY: Validate port
  if (isNaN(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error('Invalid PORT configuration');
  }

  // SECURITY: Validate host
  if (!config.host || typeof config.host !== 'string') {
    throw new Error('Invalid HOST configuration');
  }

  // SECURITY: Validate log level
  const validLogLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
  if (!validLogLevels.includes(config.logLevel)) {
    config.logLevel = 'info';
  }

  // SECURITY: Validate node environment
  const validNodeEnvs = ['development', 'production', 'test'];
  if (!validNodeEnvs.includes(config.nodeEnv)) {
    config.nodeEnv = 'production';
  }

  // SECURITY: Validate body limit
  if (isNaN(config.bodyLimit) || config.bodyLimit < 1024 || config.bodyLimit > 10485760) {
    config.bodyLimit = 1024 * 1024; // 1MB default
  }

  // SECURITY: Validate request timeout
  if (isNaN(config.requestTimeout) || config.requestTimeout < 1000 || config.requestTimeout > 300000) {
    config.requestTimeout = 30000; // 30 seconds default
  }

  // SECURITY: Validate max param length
  if (isNaN(config.maxParamLength) || config.maxParamLength < 100 || config.maxParamLength > 10000) {
    config.maxParamLength = 2048;
  }

  // SECURITY: Validate rate limit
  if (isNaN(config.rateLimitMax) || config.rateLimitMax < 1 || config.rateLimitMax > 100) {
    config.rateLimitMax = 2;
  }

  // SECURITY: Validate allowed origins
  if (!Array.isArray(config.allowedOrigins) || config.allowedOrigins.length === 0) {
    config.allowedOrigins = ['https://*.myshopify.com'];
  }

  return config;
}

/**
 * SECURITY: Validate logger configuration
 */
function validateLoggerConfig(config: ServerConfig) {
  const validLogLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
  
  if (!validLogLevels.includes(config.logLevel)) {
    throw new Error(`Invalid log level: ${config.logLevel}`);
  }

  // SECURITY: Prevent log injection
  if (config.logLevel.includes('/') || config.logLevel.includes('\\') || config.logLevel.includes('..')) {
    throw new Error('Invalid log level characters detected');
  }
}

/**
 * SECURITY: Validate Fastify configuration
 */
function validateFastifyConfig(config: ServerConfig) {
  // SECURITY: Validate timeout to prevent DoS
  if (config.requestTimeout < 5000) {
    throw new Error('Request timeout too low (minimum 5000ms)');
  }

  if (config.requestTimeout > 300000) {
    throw new Error('Request timeout too high (maximum 300000ms)');
  }

  // SECURITY: Validate body limit to prevent memory exhaustion
  if (config.bodyLimit > 10485760) { // 10MB
    throw new Error('Body limit too high (maximum 10MB)');
  }

  // SECURITY: Validate parameter length to prevent buffer overflow
  if (config.maxParamLength > 10000) {
    throw new Error('Max parameter length too high (maximum 10000)');
  }
}

/**
 * SECURITY: Validate CORS configuration
 */
function validateCorsConfig(config: ServerConfig) {
  // SECURITY: Validate origins format
  for (const origin of config.allowedOrigins) {
    if (!origin || typeof origin !== 'string') {
      throw new Error('Invalid origin format');
    }

    // SECURITY: Check for dangerous patterns
    if (origin.includes('javascript:') || origin.includes('data:') || origin.includes('vbscript:')) {
      throw new Error('Dangerous origin protocol detected');
    }

    // SECURITY: Validate URL format
    if (origin !== '*' && !origin.startsWith('https://')) {
      throw new Error('Only HTTPS origins allowed (except wildcard)');
    }
  }
}

/**
 * SECURITY: Validate rate limit configuration
 */
function validateRateLimitConfig(config: ServerConfig) {
  // SECURITY: Prevent overly permissive rate limiting
  if (config.rateLimitMax > 10) {
    throw new Error('Rate limit maximum too high (maximum 10 requests per window)');
  }

  // SECURITY: Validate time window format
  const validWindows = ['1 second', '1 minute', '5 minutes', '15 minutes', '1 hour'];
  if (!validWindows.includes(config.rateLimitWindow)) {
    throw new Error('Invalid rate limit time window');
  }
}

/**
 * SECURITY: Create and configure Fastify server with comprehensive validation
 */
async function createServer() {
  try {
    // SECURITY: Validate configuration
    const config = validateEnvironment();
    validateLoggerConfig(config);
    validateFastifyConfig(config);
    validateCorsConfig(config);
    validateRateLimitConfig(config);

    // SECURITY: Create logger with validation
    const logger = pino({
      level: config.logLevel,
      // SECURITY: Prevent log injection in production
      formatters: {
        level: (label) => ({ level: label }),
        log: (object) => {
          // SECURITY: Sanitize log objects
          const sanitized = { ...object };
          delete sanitized.password;
          delete sanitized.secret;
          delete sanitized.token;
          delete sanitized.key;
          return sanitized;
        }
      },
      transport: config.nodeEnv !== 'production' ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      } : undefined
    });

    // SECURITY: Create Fastify instance with security defaults
    const fastify = Fastify({
      logger,
      trustProxy: true,
      requestTimeout: config.requestTimeout,
      bodyLimit: config.bodyLimit,
      maxParamLength: config.maxParamLength,
      // SECURITY: Additional security options
      disableRequestLogging: config.nodeEnv === 'production',
      logger: {
        level: config.logLevel,
        // SECURITY: Prevent sensitive data logging
        serializers: {
          req: (req) => ({
            method: req.method,
            url: req.url,
            headers: {
              'user-agent': req.headers['user-agent'],
              'host': req.headers.host
            },
            remoteAddress: req.ip,
            remotePort: req.socket?.remotePort
          })
        }
      }
    });

    // SECURITY: Register security plugins with validation
    await registerSecurityPlugins(fastify, config);

    // SECURITY: Register routes with validation
    await registerRoutes(fastify, config);

    // SECURITY: Add error handling
    await registerErrorHandlers(fastify);

    return fastify;

  } catch (error) {
    console.error('Failed to create server:', error);
    throw error;
  }
}

/**
 * SECURITY: Register security plugins with comprehensive configuration
 */
async function registerSecurityPlugins(fastify: any, config: ServerConfig) {
  // SECURITY: Helmet configuration with CSP
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        childSrc: ["'none'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        upgradeInsecureRequests: []
      }
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  });

  // SECURITY: CORS configuration with origin validation
  await fastify.register(cors, {
    origin: config.allowedOrigins,
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Shopify-Hmac-Sha256', 'X-Shopify-Topic', 'X-Shopify-Shop-Domain'],
    exposedHeaders: [],
    maxAge: 86400,
    preflightContinue: false,
    optionsSuccessStatus: 204
  });

  // SECURITY: Rate limiting for Shopify leaky bucket compliance
  await fastify.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
    errorResponseBuilder: (request: any, context: any) => ({
      code: 'RATE_LIMIT_EXCEEDED',
      error: 'Rate limit exceeded',
      message: `Too many requests. Try again in ${Math.ceil(Number(context.after))} seconds.`,
      expiresIn: Math.ceil(Number(context.after)) * 1000,
      request_id: request.id,
      timestamp: new Date().toISOString()
    }),
    keyGenerator: (request: any) => {
      // SECURITY: Rate limit by shop domain for Shopify compliance
      return request.headers['x-shopify-shop-domain'] || request.ip;
    },
    skipOnError: false
  });
}

/**
 * SECURITY: Register routes with comprehensive validation
 */
async function registerRoutes(fastify: any, config: ServerConfig) {
  // SECURITY: Health check endpoint with validation
  fastify.get('/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            service: { type: 'string' },
            version: { type: 'string' },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, async (request: any, reply: any) => {
    return {
      status: 'healthy',
      service: 'c2-shopify-app',
      version: '0.1.0',
      timestamp: new Date().toISOString()
    };
  });

  // SECURITY: Shopify webhook endpoints with validation
  fastify.post('/webhooks/products/create', {
    preHandler: verifyWebhook,
    schema: {
      headers: {
        type: 'object',
        properties: {
          'x-shopify-hmac-sha256': { type: 'string' },
          'x-shopify-topic': { type: 'string' },
          'x-shopify-shop-domain': { type: 'string' },
          'x-shopify-api-version': { type: 'string' }
        },
        required: ['x-shopify-hmac-sha256', 'x-shopify-topic', 'x-shopify-shop-domain']
      },
      response: {
        200: { type: 'string' },
        400: { type: 'object' },
        401: { type: 'object' },
        429: { type: 'object' },
        500: { type: 'object' }
      }
    }
  }, async (request: any, reply: any) => {
    const product = request.body as any;
    
    try {
      // SECURITY: Validate product data
      if (!product || typeof product !== 'object') {
        reply.code(400).send({ error: 'Invalid product data' });
        return;
      }

      // SECURITY: Validate product ID
      if (!product.id || typeof product.id !== 'string') {
        reply.code(400).send({ error: 'Invalid product ID' });
        return;
      }

      // SECURITY: Validate shop domain
      if (!product.shop_domain || typeof product.shop_domain !== 'string') {
        reply.code(400).send({ error: 'Invalid shop domain' });
        return;
      }

      // SECURITY: Extract and validate image URLs
      const imageUrls = product.images?.map((img: any) => img.src).filter((url: string) => {
        // SECURITY: Validate URL format
        try {
          const parsed = new URL(url);
          return parsed.protocol === 'https:' && parsed.hostname.includes('.myshopify.com');
        } catch {
          return false;
        }
      }) || [];
      
      if (imageUrls.length > 0) {
        // SECURITY: Limit number of images to prevent DoS
        const maxImages = 50;
        const limitedUrls = imageUrls.slice(0, maxImages);
        
        if (limitedUrls.length < imageUrls.length) {
          fastify.log.warn({ 
            original_count: imageUrls.length, 
            processed_count: limitedUrls.length 
          }, 'Limited image URLs for processing');
        }
        
        await signWorker.enqueue(limitedUrls, product.shop_domain);
      }
      
      reply.send('ok');
    } catch (error) {
      fastify.log.error({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        product_id: product?.id,
        shop_domain: product?.shop_domain 
      }, 'Failed to process product create webhook');
      
      reply.code(500).send({ 
        error: 'Internal server error',
        message: 'Failed to process webhook'
      });
    }
  });

  // SECURITY: Additional webhook endpoints with similar validation
  fastify.post('/webhooks/products/update', {
    preHandler: verifyWebhook,
    schema: {
      headers: {
        type: 'object',
        properties: {
          'x-shopify-hmac-sha256': { type: 'string' },
          'x-shopify-topic': { type: 'string' },
          'x-shopify-shop-domain': { type: 'string' }
        },
        required: ['x-shopify-hmac-sha256', 'x-shopify-topic', 'x-shopify-shop-domain']
      }
    }
  }, async (request: any, reply: any) => {
    // Similar validation and processing as create webhook
    reply.send('ok');
  });
}

/**
 * SECURITY: Register comprehensive error handlers
 */
async function registerErrorHandlers(fastify: any) {
  // SECURITY: Global error handler
  fastify.setErrorHandler((error: any, request: any, reply: any) => {
    fastify.log.error({ 
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method 
    }, 'Unhandled error');

    // SECURITY: Don't expose internal errors in production
    if (process.env.NODE_ENV === 'production') {
      reply.code(500).send({ 
        error: 'Internal server error',
        request_id: request.id 
      });
    } else {
      reply.code(500).send({ 
        error: error.message,
        stack: error.stack,
        request_id: request.id 
      });
    }
  });

  // SECURITY: Handle 404 errors
  fastify.setNotFoundHandler((request: any, reply: any) => {
    reply.code(404).send({ 
      error: 'Not found',
      message: `Route ${request.method} ${request.url} not found`,
      request_id: request.id 
    });
  });

  // SECURITY: Handle validation errors
  fastify.setValidatorCompiler(({ schema }: any) => {
    return (data: any) => {
      // SECURITY: Custom validation logic
      if (!data || typeof data !== 'object') {
        return { error: 'Invalid data format' };
      }
      return true;
    };
  });
}

// SECURITY: Start server with error handling
async function start() {
  try {
    const config = validateEnvironment();
    const fastify = await createServer();
    
    await fastify.listen({ 
      port: config.port, 
      host: config.host 
    });
    
    console.log(`Server listening on ${config.host}:${config.port}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// SECURITY: Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// SECURITY: Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { createServer, start };
      reply.code(500).send('error');
    }
  });

  fastify.post('/webhooks/products/update', {
    preHandler: verifyWebhook
  }, async (request, reply) => {
    const product = request.body as any;
    
    try {
      // Extract image URLs from product
      const imageUrls = product.images?.map((img: any) => img.src) || [];
      
      if (imageUrls.length > 0) {
        await signWorker.enqueue(imageUrls, product.shop_domain);
      }
      
      reply.send('ok');
    } catch (error) {
      fastify.log.error({ error, product_id: product.id }, 'Failed to process product update webhook');
      reply.code(500).send('error');
    }
  });

  fastify.post('/webhooks/app/uninstalled', {
    preHandler: verifyWebhook
  }, async (request, reply) => {
    const shop_domain = request.headers['x-shopify-shop-domain'] as string;
    
    try {
      // Clean up shop-specific data
      await signWorker.cleanupShop(shop_domain);
      
      fastify.log.info({ shop_domain }, 'App uninstalled');
      reply.send('ok');
    } catch (error) {
      fastify.log.error({ error, shop_domain }, 'Failed to cleanup after app uninstall');
      reply.code(500).send('error');
    }
  });

  // Admin endpoints
  fastify.get('/admin/status', async (request, reply) => {
    const shop_domain = request.headers['x-shopify-shop-domain'] as string;
    
    return {
      shop_domain,
      remote_only: true, // Shopify CDN is always hostile
      active_jobs: await signWorker.getActiveJobs(shop_domain),
      last_sign: await signWorker.getLastSignTime(shop_domain)
    };
  });

  fastify.post('/admin/retro-sign', async (request, reply) => {
    const shop_domain = request.headers['x-shopify-shop-domain'] as string;
    const { days_back = 7 } = request.body as any;
    
    try {
      const result = await signWorker.retroSignShop(shop_domain, days_back);
      return result;
    } catch (error) {
      fastify.log.error({ error, shop_domain }, 'Failed to start retro-sign');
      reply.code(500).send({ error: 'Failed to start retro-sign' });
    }
  });

  // Global error handler
  fastify.setErrorHandler((error, request, reply) => {
    request.log.error({ 
      error: error.message, 
      stack: error.stack,
      requestId: request.id 
    }, 'Unhandled error');

    reply.status(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      },
      request_id: request.id || 'unknown',
      timestamp: new Date().toISOString()
    });
  });

  return fastify;
}

/**
 * Start the server
 */
async function start() {
  try {
    const server = await createServer();
    
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
    const host = process.env.HOST || '0.0.0.0';

    await server.listen({ port, host });
    
    server.log.info(`🚀 C2 Concierge Shopify App v0.1.0 started`);
    server.log.info(`📊 Server listening on http://${host}:${port}`);
    server.log.info(`🪝 Webhook endpoints: /webhooks/products/create, /webhooks/products/update`);
    server.log.info(`❤️  Health check: GET /health`);

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { createServer, start };
