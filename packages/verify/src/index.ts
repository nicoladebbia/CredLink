/**
 * C2PA Verification API Server
 * Main Fastify server for provenance verification
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import pino from 'pino';
import { registerRoutes } from './routes.js';

/**
 * SECURITY: Validate environment variables with comprehensive checks
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
  
  // Validate port with proper range checking
  if (process.env.PORT) {
    const portStr = process.env.PORT.trim();
    const port = parseInt(portStr);
    if (isNaN(port) || port < 1 || port > 65535 || !/^\d+$/.test(portStr)) {
      console.warn(`Invalid PORT: ${process.env.PORT}. Using 3001 instead.`);
      process.env.PORT = '3001';
    }
  }
  
  // Validate host with stricter validation
  const host = (process.env.HOST || '0.0.0.0').trim();
  const validHosts = ['0.0.0.0', '127.0.0.1', 'localhost'];
  // Additional IP validation
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (!validHosts.includes(host) && !ipv4Regex.test(host)) {
    console.warn(`Invalid HOST: ${host}. Using '0.0.0.0' instead.`);
    process.env.HOST = '0.0.0.0';
  }
  
  // Validate rate limit with proper bounds
  if (process.env.RATE_LIMIT_MAX) {
    const maxStr = process.env.RATE_LIMIT_MAX.trim();
    const max = parseInt(maxStr);
    if (isNaN(max) || max < 1 || max > 10000 || !/^\d+$/.test(maxStr)) {
      console.warn(`Invalid RATE_LIMIT_MAX: ${process.env.RATE_LIMIT_MAX}. Using 100 instead.`);
      process.env.RATE_LIMIT_MAX = '100';
    }
  }
  
  // Validate boolean variables with strict checking
  const booleanVars = ['ENABLE_CSP_REPORT_ONLY'];
  for (const varName of booleanVars) {
    const value = process.env[varName]?.trim().toLowerCase();
    if (value && value !== 'true' && value !== 'false') {
      console.warn(`Invalid ${varName}: ${value}. Must be 'true' or 'false'.`);
      process.env[varName] = 'false';
    }
  }
  
  // Validate allowed origins format
  if (process.env.ALLOWED_ORIGINS) {
    const origins = process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
    // Allow localhost and IP addresses, as well as domains with TLDs
    const urlRegex = /^https?:\/\/(localhost|127\.0\.0\.1|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(:\d+)?(\/.*)?$/;
    for (const origin of origins) {
      if (origin !== '*' && !urlRegex.test(origin)) {
        console.warn(`Invalid origin in ALLOWED_ORIGINS: ${origin}`);
      }
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
    // SECURITY: Remove debug information in production with secure defaults
    transport: process.env.NODE_ENV !== 'production' ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
        // SECURITY: Remove potentially sensitive fields
        hideObject: true
      }
    } : undefined,
    // SECURITY: Add redaction for sensitive fields in production
    redact: process.env.NODE_ENV === 'production' ? ['req.headers.authorization', 'req.headers.cookie'] : undefined
  });

  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      // SECURITY: Remove debug information in production with secure defaults
      transport: process.env.NODE_ENV !== 'production' ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
          // SECURITY: Remove potentially sensitive fields
          hideObject: true
        }
      } : undefined,
      // SECURITY: Add redaction for sensitive fields in production
      redact: process.env.NODE_ENV === 'production' ? ['req.headers.authorization', 'req.headers.cookie'] : undefined
    },
    // SECURITY: Disable trust proxy in production unless explicitly needed
    trustProxy: process.env.NODE_ENV === 'production' ? false : true,
    // SECURITY: Add request timeout to prevent DoS
    requestTimeout: 30000, // 30 seconds
    // SECURITY: Add connection timeout
    connectionTimeout: 10000, // 10 seconds
    bodyLimit: 1024 * 1024, // 1MB payload limit
    maxParamLength: 2048 // URL parameter limit
  });

  // Register security plugins with comprehensive hardening
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
      },
      reportOnly: process.env.ENABLE_CSP_REPORT_ONLY === 'true'
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  });

  // Configure CORS with strict origin validation
  await fastify.register(cors, {
    origin: (origin, callback) => {
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || ['http://localhost:3000'];
      
      // SECURITY: Strict origin validation
      if (!origin) {
        // Allow requests without origin header (same-origin)
        return callback(null, true);
      }
      
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      // SECURITY: Log rejected origins for monitoring
      fastify.log.warn({ origin }, 'CORS: Origin not allowed');
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    maxAge: 86400 // 24 hours
  });

  // Configure rate limiting with advanced protection
  await fastify.register(rateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    timeWindow: '1 minute',
    hook: 'preHandler',
    errorResponseBuilder: (request, context) => ({
      code: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded, retry in ${context.ttl} seconds`,
      retryAfter: context.ttl
    }),
    keyGenerator: (request) => {
      // SECURITY: Use IP-based rate limiting with fallback
      const ip = request.ip || 
                 (Array.isArray(request.headers['x-forwarded-for']) 
                   ? request.headers['x-forwarded-for'][0]?.split(',')[0]?.trim()
                   : request.headers['x-forwarded-for']?.split(',')[0]?.trim()) ||
                 request.headers['x-real-ip'] ||
                 'unknown';
      return ip.toString();
    }
  });

  // Register multipart plugin for file uploads with security limits
  await fastify.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB max file size
      files: 1, // Maximum 1 file per request
      fields: 10, // Maximum 10 form fields
      fieldNameSize: 100, // Maximum field name size
      fieldSize: 1000 // Maximum field value size
    },
    attachFieldsToBody: false, // Security: Don't attach fields to body
    sharedSchemaId: 'MultipartFileSchema',
    throwFileSizeLimit: true, // Throw error when file size limit exceeded
    onFile: (part: any) => {
      // SECURITY: Log file upload attempts
      fastify.log.debug({ 
        filename: part.filename, 
        mimetype: part.mimetype,
        fieldname: part.fieldname 
      }, 'File upload started');
    }
  });

  // Register verification routes
  await registerRoutes(fastify);

  // Global error handler with security hardening
  fastify.setErrorHandler((error, request, reply) => {
    // SECURITY: Sanitize error logging to prevent information disclosure
    request.log.error({ 
      error: error.message.length > 500 ? error.message.substring(0, 500) + '...' : error.message,
      url: request.url,
      method: request.method,
      // SECURITY: Remove sensitive headers from logs
      userAgent: request.headers['user-agent']
    }, 'Request error');
    
    // SECURITY: Don't expose internal errors in production
    if (process.env.NODE_ENV === 'production') {
      // Return generic error messages for different error types
      if (error.statusCode === 429) {
        return reply.status(429).send({
          error: 'Rate limit exceeded',
          message: 'Too many requests, please try again later'
        });
      }
      
      if (error.statusCode === 400) {
        return reply.status(400).send({
          error: 'Bad request',
          message: 'Invalid request format'
        });
      }
      
      if ((error.statusCode || 0) >= 500) {
        return reply.status(500).send({
          error: 'Internal server error',
          message: 'An error occurred while processing your request'
        });
      }
      
      return reply.status(error.statusCode || 500).send({
        error: 'Request failed',
        message: 'Unable to process request'
      });
    } else {
      // Development: expose more error information
      return reply.status(error.statusCode || 500).send({
        error: error.name,
        message: error.message,
        stack: error.stack
      });
    }
  });

  // SECURITY: Add security headers middleware
  fastify.addHook('onRequest', (request, reply, done) => {
    // Add security headers
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    
    // Remove server information
    reply.header('Server', 'CredLink');
    
    done();
  });

  // SECURITY: Add request validation middleware
  fastify.addHook('preHandler', (request, reply, done) => {
    // Validate request size
    const contentLength = request.headers['content-length'];
    if (contentLength && parseInt(contentLength) > 1024 * 1024) {
      return reply.status(413).send({ error: 'Payload too large' });
    }
    
    // Validate URL length
    if (request.url && request.url.length > 2048) {
      return reply.status(414).send({ error: 'URL too long' });
    }
    
    done();
  });

  // SECURITY: Global 404 handler with rate limiting
  fastify.setNotFoundHandler((request, reply) => {
    // SECURITY: Log 404 attempts for monitoring
    fastify.log.warn({ 
      url: request.url, 
      method: request.method,
      ip: request.ip,
      userAgent: request.headers['user-agent']
    }, '404 Not Found');
    
    reply.status(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found'
      },
      timestamp: new Date().toISOString()
    });
  });

  // SECURITY: Add graceful shutdown handling
  const gracefulShutdown = (signal: string) => {
    fastify.log.info({ signal }, 'Received shutdown signal, closing server gracefully');
    fastify.close().then(() => {
      fastify.log.info('Server closed successfully');
      process.exit(0);
    }).catch((err) => {
      fastify.log.error({ error: err.message }, 'Error during server shutdown');
      process.exit(1);
    });
  };

  // 🔥 CRITICAL FIX: Only register signal handlers when running standalone
  // Prevents duplicate handlers when imported as library by main API
  if (require.main === module) {
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // SECURITY: Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      fastify.log.error({ error: error.message }, 'Uncaught exception');
      process.exit(1);
    });
  }

  process.on('unhandledRejection', (reason, promise) => {
    fastify.log.error({ reason, promise }, 'Unhandled rejection');
    process.exit(1);
  });

  return fastify;
}

/**
 * SECURITY: Start the server with proper error handling
 */
async function start() {
  try {
    const server = await createServer();
    
    // SECURITY: Validate port before starting
    const port = parseInt(process.env.PORT || '3001');
    const host = process.env.HOST || '0.0.0.0';
    
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port: ${port}`);
    }
    
    await server.listen({ port, host });
    
    server.log.info(`🚀 C2PA Verification API Server started successfully`);
    server.log.info(`📍 Server listening on http://${host}:${port}`);
    server.log.info(`🔒 Security level: ${process.env.NODE_ENV === 'production' ? 'Production' : 'Development'}`);
    server.log.info(`📊 Rate limit: ${process.env.RATE_LIMIT_MAX || '100'} requests/minute`);
    
  } catch (error) {
    // SECURITY: Secure error logging without stack traces in production
    const errorMessage = error instanceof Error ? error.message : 'Unknown startup error';
    console.error('❌ Failed to start server:', errorMessage);
    
    if (process.env.NODE_ENV !== 'production' && error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    
    process.exit(1);
  }
}

// SECURITY: Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { createServer, start };
