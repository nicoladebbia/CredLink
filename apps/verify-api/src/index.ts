/**
 * C2PA Verification API Server
 * Main Fastify server for provenance verification
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import pino from 'pino';
import { registerRoutes } from './routes.js';

/**
 * SECURITY: Validate environment variables
 */
function validateEnvironmentVariables(): void {
  const requiredVars = ['NODE_ENV'];
  const optionalVars = ['LOG_LEVEL', 'PORT', 'HOST', 'ALLOWED_ORIGINS', 'RATE_LIMIT_MAX', 'ENABLE_CSP_REPORT_ONLY'];
  
  // Check required variables
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new Error(`Required environment variable ${varName} is not set`);
    }
  }
  
  // Validate and sanitize optional variables
  const validLogLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
  const logLevel = process.env.LOG_LEVEL || 'info';
  if (!validLogLevels.includes(logLevel)) {
    console.warn(`Invalid LOG_LEVEL: ${logLevel}. Using 'info' instead.`);
    process.env.LOG_LEVEL = 'info';
  }
  
  // Validate port
  if (process.env.PORT) {
    const port = parseInt(process.env.PORT);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.warn(`Invalid PORT: ${process.env.PORT}. Using 3001 instead.`);
      process.env.PORT = '3001';
    }
  }
  
  // Validate host
  const host = process.env.HOST || '0.0.0.0';
  const validHosts = ['0.0.0.0', '127.0.0.1', 'localhost'];
  if (!validHosts.includes(host)) {
    console.warn(`Invalid HOST: ${host}. Using '0.0.0.0' instead.`);
    process.env.HOST = '0.0.0.0';
  }
  
  // Validate rate limit
  if (process.env.RATE_LIMIT_MAX) {
    const max = parseInt(process.env.RATE_LIMIT_MAX);
    if (isNaN(max) || max < 1 || max > 10000) {
      console.warn(`Invalid RATE_LIMIT_MAX: ${process.env.RATE_LIMIT_MAX}. Using 100 instead.`);
      process.env.RATE_LIMIT_MAX = '100';
    }
  }
  
  // Validate boolean variables
  const booleanVars = ['ENABLE_CSP_REPORT_ONLY'];
  for (const varName of booleanVars) {
    const value = process.env[varName];
    if (value && value !== 'true' && value !== 'false') {
      console.warn(`Invalid ${varName}: ${value}. Must be 'true' or 'false'.`);
      process.env[varName] = 'false';
    }
  }
}

/**
 * Create and configure Fastify server
 */
async function createServer() {
  // SECURITY: Validate environment variables first
  validateEnvironmentVariables();
  
  const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    // SECURITY: Remove debug information in production
    transport: process.env.NODE_ENV !== 'production' ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    } : undefined
  });

  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      // SECURITY: Remove debug information in production
      transport: process.env.NODE_ENV !== 'production' ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      } : undefined
    },
    trustProxy: true,
    requestTimeout: 30000,
    bodyLimit: 1024 * 1024, // 1MB payload limit
    maxParamLength: 2048 // URL parameter limit
  });

  // Register security plugins
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
        workerSrc: ["'none'"],
        manifestSrc: ["'self'"],
        upgradeInsecureRequests: []
      },
      reportOnly: process.env.ENABLE_CSP_REPORT_ONLY === 'true'
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  });

  // Configure CORS for badge integration
  await fastify.register(cors, {
    origin: process.env.ALLOWED_ORIGINS ? 
      process.env.ALLOWED_ORIGINS.split(',') : 
      ['https://localhost:3000', 'https://localhost:8080'],
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
  });

  // Rate limiting to prevent abuse
  await fastify.register(rateLimit, {
    max: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX) : 100,
    timeWindow: '1 minute',
    errorResponseBuilder: (request, context) => ({
      code: 'RATE_LIMIT_EXCEEDED',
      error: 'Rate limit exceeded',
      message: `Too many requests. Try again in ${Math.ceil(Number(context.after))} seconds.`,
      expiresIn: Math.ceil(Number(context.after)) * 1000,
      request_id: request.id
    })
  });

  // Register verification routes
  await registerRoutes(fastify);

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

  // Global 404 handler
  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint ${request.method} ${request.url} not found`
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
    
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
    const host = process.env.HOST || '0.0.0.0';

    await server.listen({ port, host });
    
    server.log.info(`🚀 C2PA Verification API v1.0.0 started`);
    server.log.info(`📊 Server listening on http://${host}:${port}`);
    server.log.info(`🔍 Verification endpoint: POST /verify`);
    server.log.info(`❤️  Health check: GET /health`);
    server.log.info(`🔐 Trust roots: GET /trust-roots`);
    server.log.info(`📈 Metrics: GET /metrics`);

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
