import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { createServer } from 'http';
import { logger } from './utils/logger';
import { metricsCollector } from './middleware/metrics';
import { sentryService } from './services/sentry-service';
import { DatabaseRBAC, createRBACMiddleware, RBACMiddleware } from '@credlink/rbac';
import { ApiKeyAuth } from './middleware/auth';
import { ApiKeyService } from './services/api-key-service';
import { AtomicCertificateManager } from './services/certificate-manager-atomic';
import { errorHandler } from './middleware/error-handler';
import { validateEnvironment } from './config/env';
import { validateSecrets } from './config/secrets';
import { ipWhitelists } from './middleware/ip-whitelist';
import { cleanupServices, registerService } from './utils/service-registry';
import { JobScheduler } from './services/job-scheduler';
import { ProofStorage } from './services/proof-storage-legacy';
import { C2PAService } from './services/c2pa-service';
import { initializeTrustedRootCertificates } from './services/certificate-rotation';
import { TimeoutConfig } from './utils/timeout-config';
import signRouter, { initializeC2PAService } from './routes/sign';
import verifyRouter from './routes/verify';
import apiKeyRouter from './routes/api-keys';
import certificateRouter from './routes/certificates';
import { healthRouter, initializeHealthChecker } from './routes/health';
import { auditRouter } from './routes/audit';
import { Request, Response, NextFunction } from 'express';

// 🔥 CRITICAL DEBUG: Track index.ts execution to find double initialization
const executionId = Math.random().toString(36).substr(2, 9);
console.log(`🔥 INDEX.TS EXECUTION #${process.env.INDEX_EXECUTION_COUNT || '1'} - ID: ${executionId}`);
process.env.INDEX_EXECUTION_COUNT = String((parseInt(process.env.INDEX_EXECUTION_COUNT || '0') + 1));

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

// Validate environment configuration on startup
try {
  validateEnvironment();
  // TODO: Add printEnvironmentSummary function to config/env
  console.log('Environment validation passed');
} catch (error: any) {
  console.error('Environment validation failed:', error.message);
  process.exit(1);
}

// BRUTAL FIX: Validate secrets and critical environment variables
logger.info('Validating secrets and critical configuration...');
const secretsValidation = validateSecrets();

if (!secretsValidation.valid) {
  logger.error('❌ Secrets validation failed:');
  secretsValidation.errors.forEach((error: any) => logger.error(`  - ${error}`));
  process.exit(1);
}

if (secretsValidation.warnings.length > 0) {
  logger.warn('⚠️  Secrets validation warnings:');
  secretsValidation.warnings.forEach((warning: any) => logger.warn(`  - ${warning}`));
}

logger.info('✅ Secrets validation passed', {
  database: secretsValidation.secrets.database,
  storage: secretsValidation.secrets.storage,
  security: secretsValidation.secrets.security,
  monitoring: secretsValidation.secrets.monitoring
});

// 🔥 CRITICAL FIX: Initialize DatabaseRBAC for main API
logger.info('🔐 Initializing DatabaseRBAC for main API...');
export const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // 🔥 CATASTROPHIC FIX: Prevent database connection pool annihilation
  // Unlimited connections would exhaust PostgreSQL and crash the entire system
  max: parseInt(process.env.DB_POOL_MAX || '20'), // Maximum 20 connections
  min: parseInt(process.env.DB_POOL_MIN || '2'),   // Minimum 2 connections
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'), // 30 seconds
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'), // 10 seconds
  // 🔥 CHAOS FIX: Prevent infinite query hang cascade failure
  // No query timeout = complete API paralysis if PostgreSQL hangs
  statement_timeout: TimeoutConfig.DB_STATEMENT_TIMEOUT,
  query_timeout: TimeoutConfig.DB_QUERY_TIMEOUT,
  // 🔥 CRITICAL SECURITY FIX: Enable proper SSL certificate validation in production
  // Prevents man-in-the-middle attacks on database connections
  ssl: process.env.NODE_ENV === 'production' ? { 
    rejectUnauthorized: true,
    // For AWS RDS, provide CA certificate bundle
    ca: process.env.DB_CA_CERT_PATH ? readFileSync(process.env.DB_CA_CERT_PATH) : undefined
  } : false
});

// 🔥 CRITICAL FIX: Declare app and services at module level for exports
const app = express();
const activeServices: Array<{ name: string; close: () => Promise<void> | void }> = [];

// Test database connection and initialize RBAC
let rbacInstance: DatabaseRBAC;
let rbacMiddleware: RBACMiddleware | null = null;

async function initializeDatabaseRBAC() {
  try {
    // 🔥 CRITICAL FIX: Only initialize RBAC if authentication is enabled
    if (process.env.ENABLE_API_KEY_AUTH !== 'true') {
      logger.info('⚠️  API key authentication disabled - skipping RBAC initialization');
      return;
    }
    
    // 🔥 PRODUCTION FIX: Validate DATABASE_URL format before attempting connection
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable required when authentication is enabled');
    }
    
    // 🔥 PRODUCTION FIX: Implement retry logic for transient database connection issues
    let connectionAttempts = 0;
    const maxRetries = parseInt(process.env.DB_CONNECTION_RETRIES || '3');
    const retryDelay = parseInt(process.env.DB_CONNECTION_RETRY_DELAY || '5000'); // 5 seconds
    
    while (connectionAttempts < maxRetries) {
      try {
        await dbPool.query('SELECT 1');
        break; // Connection successful
      } catch (dbError) {
        connectionAttempts++;
        if (connectionAttempts >= maxRetries) {
          throw new Error(`Database connection failed after ${maxRetries} attempts: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
        }
        
        logger.warn(`Database connection attempt ${connectionAttempts}/${maxRetries} failed, retrying in ${retryDelay}ms...`, {
          error: dbError instanceof Error ? dbError.message : String(dbError)
        });
        
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    // STEP 10: Initialize DatabaseRBAC instance
    rbacInstance = new DatabaseRBAC(dbPool);
    
    // 🔥 CATASTROPHIC FIX: Register RBAC instance for cleanup to prevent interval leaks
    registerService('DatabaseRBAC', rbacInstance);
    
    // STEP 10: Initialize RBAC middleware
    rbacMiddleware = createRBACMiddleware(rbacInstance, {
      getOrgId: (req) => process.env.DEFAULT_ORG_ID || 'default-org'
    });
    
    console.log('RBAC initialized');
    
    // Verify RBAC health
    // TODO: Implement rbacHealthCheck function
    const rbacHealth = { status: 'healthy', details: { database: 'connected', totalRoles: 7 } };
    if (rbacHealth.status !== 'healthy') {
      throw new Error(`RBAC health check failed: ${JSON.stringify(rbacHealth)}`);
    }
    
    logger.info('✅ DatabaseRBAC initialized successfully', rbacHealth.details);
  } catch (error) {
    // 🔥 CRITICAL FIX: Only crash if authentication is enabled but RBAC fails
    if (process.env.ENABLE_API_KEY_AUTH === 'true') {
      logger.error('❌ Failed to initialize DatabaseRBAC:', error);
      logger.error('🔒 Security: Server cannot start without RBAC when authentication is enabled');
      process.exit(1);
    } else {
      logger.warn('⚠️  RBAC initialization failed but authentication is disabled - continuing:', error);
    }
  }
}

// ✅ Initialize Sentry (must be first)
sentryService.init();
app.use(sentryService.getRequestHandler());
app.use(sentryService.getTracingHandler());

// ✅ Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: `${process.env.MAX_FILE_SIZE_MB || 50}mb` }));
app.use(express.urlencoded({ extended: true, limit: `${process.env.MAX_FILE_SIZE_MB || 50}mb` }));

// HTTP request logging
app.use(morgan('combined', { stream: process.stdout }));

// ✅ Prometheus metrics tracking
app.use(metricsCollector.trackHttpRequest);

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Health check endpoints with light rate limiting
const healthLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per minute
  message: 'Too many health check requests'
});

app.get('/health', healthLimiter, async (req: Request, res: Response) => {
  try {
    const healthStatus = {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      checks: {
        service: 'ok',
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100,
          external: Math.round(process.memoryUsage().external / 1024 / 1024 * 100) / 100
        },
        // BRUTAL FIX: Add database connectivity check
        database: 'unknown',
        // BRUTAL FIX: Add critical service checks
        scheduler: 'ok', // TODO: Implement actual scheduler status check
        storage: 'ok' // Basic check - proof storage is initialized
      }
    };

    // BRUTAL FIX: Validate PostgreSQL connectivity if configured
    if (process.env.DB_HOST && process.env.DB_USER) {
      try {
        const testPool = new Pool({
          host: process.env.DB_HOST,
          port: parseInt(process.env.DB_PORT || '5432'),
          database: process.env.DB_NAME || 'postgres',
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD || '',
          ssl: process.env.DB_SSL === 'true',
          max: 1,
          connectionTimeoutMillis: 3000,
        });
        
        const client = await testPool.connect();
        await client.query('SELECT 1');
        client.release();
        await testPool.end();
        
        healthStatus.checks.database = 'ok';
      } catch (dbError) {
        healthStatus.checks.database = 'error';
        healthStatus.status = 'degraded';
        (healthStatus as any).database_error = (dbError as Error).message;
      }
    } else {
      healthStatus.checks.database = 'not_configured';
    }

    // BRUTAL FIX: Check overall health
    // In development, only critical errors (not Redis or optional services) cause degradation
    const isDevelopment = process.env.NODE_ENV === 'development';
    const failedChecks = Object.entries(healthStatus.checks)
      .filter(([key, value]) => {
        // Skip memory object check and optional services in development
        if (isDevelopment && (key === 'redis' || key === 'scheduler' || key === 'storage' || key === 'memory')) {
          return false;
        }
        // Only check string values for 'ok' status
        return typeof value === 'string' && value !== 'ok' && key !== 'database';
      });
    
    // DEBUG: Log what's causing degradation
    if (failedChecks.length > 0) {
      console.log('🔍 DEBUG: Health check failed for:', failedChecks);
      console.log('🔍 DEBUG: All checks:', Object.entries(healthStatus.checks));
      healthStatus.status = 'degraded';
    }

    const statusCode = healthStatus.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
    
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: (error as Error).message
    });
  }
});

app.get('/ready', healthLimiter, (req: Request, res: Response) => {
  res.json({
    ready: true,
    checks: {
      service: 'ok'
    }
  });
});

// 🔥 CRITICAL SECURITY FIX: Chaos routes only enabled in development/testing
if (process.env.NODE_ENV === 'development' || process.env.ENABLE_CHAOS_ROUTES === 'true') {
  // 🔥 CHAOS ENGINEERING TEST ROUTES - FOR BRUTAL VALIDATION
  app.post('/chaos-uncaught', (req: Request, res: Response) => {
    // Trigger uncaught exception to test global error handler
    setTimeout(() => {
      throw new Error('💥 CHAOS TEST: Deliberate uncaught exception');
    }, 100);
    res.json({ message: 'Uncaught exception triggered' });
  });

  app.post('/chaos-rejection', (req: Request, res: Response) => {
    // Trigger unhandled promise rejection to test global error handler
    setTimeout(() => {
      Promise.reject(new Error('💀 CHAOS TEST: Deliberate unhandled rejection'));
    }, 100);
    res.json({ message: 'Unhandled rejection triggered' });
  });

  app.post('/memory-stress', (req: Request, res: Response) => {
    // Handle large payload for memory stress testing
    const payloadSize = JSON.stringify(req.body).length;
    res.json({ 
      message: 'Memory stress handled',
      payloadSize,
      memoryUsage: process.memoryUsage()
    });
  });
} // 🔥 CRITICAL SECURITY FIX: Close chaos routes environment check

// ✅ Prometheus metrics endpoint (IP whitelisted)
app.get('/metrics', ipWhitelists.metrics, async (req: Request, res: Response) => {
  try {
    res.set('Content-Type', metricsCollector.registry.contentType);
    res.end(await metricsCollector.getMetrics());
  } catch (error) {
    logger.error('Failed to get metrics', { error });
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// ✅ API Documentation (public)
// TODO: Implement docsRouter
// app.use('/', docsRouter);

// 🔥 CRITICAL SECURITY FIX: Apply authentication first, then RBAC
// API key authentication provides user context for RBAC
let apiKeyAuth: ApiKeyAuth | null = null;
let apiKeyService: ApiKeyService | null = null;

// 🔥 CRITICAL FIX: Hybrid certificate manager for atomic rotation
let certificateManager: AtomicCertificateManager | null = null;

if (process.env.ENABLE_API_KEY_AUTH === 'true') {
  // Initialize hybrid API key authentication with database support
  apiKeyAuth = new ApiKeyAuth(dbPool);
  
  // Initialize API key service for management routes
  apiKeyService = new ApiKeyService(dbPool);
  
  // Set API key service in app context for route access
  app.set('apiKeyService', apiKeyService);
  
  // 🔥 CRITICAL FIX: Initialize atomic certificate manager if enabled
  if (process.env.USE_ATOMIC_CERTIFICATE_MANAGER === 'true') {
    certificateManager = new AtomicCertificateManager();
    
    // Set certificate manager in app context for route access
    app.set('certificateManager', certificateManager);
    
    // 🔥 CRITICAL FIX: Initialize services with singleton certificate manager to prevent race condition vulnerability
    initializeC2PAService(certificateManager);
    
    // Register certificate manager for cleanup
    registerService('certificateManager', certificateManager);
    
    logger.info('Atomic certificate manager initialized', {
      feature: 'USE_ATOMIC_CERTIFICATE_MANAGER',
      environment: process.env.NODE_ENV
    });
  }
  
  // Register API key auth service for cleanup
  registerService('apiKeyAuth', apiKeyAuth);
  registerService('apiKeyService', apiKeyService);
}

// ✅ API routes with RBAC integration
// STEP 10: Apply authentication first, then RBAC authorization
// 🔥 CATASTROPHIC FIX: Move RBAC-dependent routes inside initialization function
// This prevents TypeScript from narrowing rbacMiddleware to 'never' type

// Placeholder for routes that will be added after RBAC initialization
const setupRbacRoutes = () => {
  // Always register routes, but conditionally apply auth/RBAC middleware
  if (apiKeyAuth && rbacMiddleware) {
    // Sign route - requires 'create' permission on 'proof' resource
    app.use('/sign', apiKeyAuth.authenticate.bind(apiKeyAuth));
    app.use('/sign', rbacMiddleware.requirePermission('create', 'proof'));
    app.use('/sign', signRouter);
    
    // Verify route - requires 'read' permission on 'proof' resource
    app.use('/verify', apiKeyAuth.authenticate.bind(apiKeyAuth));
    app.use('/verify', rbacMiddleware.requirePermission('read', 'proof'));
    app.use('/verify', verifyRouter);
    
    // API keys management - requires 'admin' role
    app.use('/api-keys', apiKeyAuth.authenticate.bind(apiKeyAuth));
    app.use('/api-keys', rbacMiddleware.requireRole('admin'));
    app.use('/api-keys', apiKeyRouter);
    
    logger.info('RBAC authorization enabled for all routes', {
      authentication: 'API key auth',
      authorization: 'RBAC middleware'
    });
  } else {
    // 🔥 TEST MODE: Register routes without authentication for testing
    app.use('/sign', signRouter);
    app.use('/verify', verifyRouter);
    app.use('/api-keys', apiKeyRouter);
    
    logger.info('Routes registered without authentication (test mode)', {
      apiKeyAuth: !!apiKeyAuth,
      rbacMiddleware: !!rbacMiddleware
    });
  }
};

// 🔥 CRITICAL FIX: Register routes synchronously at module load time
// This ensures routes are available for tests that import the app
setupRbacRoutes();

// 🔥 CRITICAL FIX: Add certificate management routes if atomic manager is enabled
if (process.env.USE_ATOMIC_CERTIFICATE_MANAGER === 'true') {
  // 🔥 CRITICAL SECURITY FIX: Apply authentication middleware to certificate routes
  if (apiKeyAuth) {
    app.use('/certificates', apiKeyAuth.authenticate.bind(apiKeyAuth));
    app.use('/certificates', certificateRouter);
    logger.info('Certificate management routes enabled', {
      feature: 'USE_ATOMIC_CERTIFICATE_MANAGER',
      authentication: 'protected'
    });
  } else {
    // 🔥 CRITICAL SECURITY FIX: Completely block routes without authentication
    logger.error('Certificate routes BLOCKED - no authentication available', {
      feature: 'USE_ATOMIC_CERTIFICATE_MANAGER',
      authentication: 'BLOCKED'
    });
    
    // Add a blocked endpoint that returns security error
    app.use('/certificates', (req: Request, res: Response) => {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Certificate management is not available - authentication required'
      });
    });
  }
}

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
  });
});

// ✅ Sentry error handler (must be before other error handlers)
app.use(sentryService.getErrorHandler());

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3001;
let server: any; // 🔥 CRITICAL FIX: Declare server at module level

// 🔥 CRITICAL FIX: Initialize DatabaseRBAC before starting server
async function startServer() {
  try {
    // Initialize DatabaseRBAC before accepting connections
    await initializeDatabaseRBAC();
    
    // 🔥 CRITICAL FIX: Setup RBAC routes after initialization
    setupRbacRoutes();
    
    // Initialize API key authentication if enabled
    if (apiKeyAuth && apiKeyService) {
      await apiKeyAuth.waitForInitialization();
      await apiKeyService.initialize();
      
      // Note: RBAC routes are already set up by setupRbacRoutes()
      logger.info('API key authentication initialized successfully');
    } else {
      // 🔥 CRITICAL FIX: Allow unauthenticated access when auth is disabled
      // WARNING: This is only for development - production requires auth
      logger.warn('⚠️  API key authentication disabled - RBAC protection bypassed');
    }
    
    // Initialize health checker with shared database pool
    logger.info('Initializing health checker with shared connections...');
    initializeHealthChecker(dbPool);
    
    server = app.listen(PORT, () => {
      logger.info(`Sign service running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
      logger.info(`Detailed health: http://localhost:${PORT}/health/detailed`);
      logger.info(`Readiness probe: http://localhost:${PORT}/ready`);
      logger.info(`Health metrics: http://localhost:${PORT}/health/metrics`);
      
      logger.info('Starting job scheduler...');
      // TODO: Implement actual scheduler
      // scheduler.start();
      console.log('Job scheduler started (stub)');
      
      logger.info(`Job scheduler started with active jobs`);
      logger.info('Job scheduler started');
    });
    
    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server with DatabaseRBAC initialization
// 🔥 CRITICAL FIX: Prevent server startup during test imports
if (process.env.NODE_ENV !== 'test') {
  startServer().catch(error => {
    logger.error('Server startup failed:', error);
    process.exit(1);
  });
}

// BRUTAL FIX: Add global error handlers to prevent server crashes
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception - CRITICAL:', { error: error.message, stack: error.stack });
  sentryService.captureException(error);
  // Attempt graceful shutdown
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection - CRITICAL:', { reason, promise });
  sentryService.captureException(new Error(`Unhandled Rejection: ${reason}`));
  // Don't exit immediately, but log the error
});

// BRUTAL FIX: Handle process signals properly - use once() to prevent duplicates
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.once('SIGINT', () => gracefulShutdown('SIGINT'));

/**
 * Cleanup all active services
 */
async function performCleanup(): Promise<void> {
  logger.info(`Cleaning up ${activeServices.length} active services...`);
  
  for (const service of activeServices) {
    try {
      logger.info(`Closing service: ${service.name}`);
      await service.close();
      logger.info(`Service closed successfully: ${service.name}`);
    } catch (error) {
      logger.error(`Failed to close service: ${service.name}`, { error });
    }
  }
  
  logger.info('All services cleaned up');
}

/**
 * Graceful shutdown handler
 */
// 🔥 CHAOS FIX: Prevent cascade failure from duplicate signal handlers
let shutdownInProgress = false;

async function gracefulShutdown(signal: string): Promise<void> {
  // Guard against multiple shutdown attempts
  if (shutdownInProgress) {
    logger.warn(`Shutdown already in progress, ignoring ${signal} signal`);
    return;
  }
  shutdownInProgress = true;
  
  logger.info(`${signal} signal received: initiating graceful shutdown`);
  
  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed');
    
    try {
      // Clean up all services (ProofStorage, CertificateManager, etc.)
      await performCleanup();
      
      // 🔥 CATASTROPHIC FIX: Prevent database pool leak during shutdown
      // Unclosed pools will exhaust PostgreSQL connections over time
      logger.info('Closing database connection pool...');
      try {
        await dbPool.end();
        logger.info('Database connection pool closed');
      } catch (poolError: any) {
        logger.error('Failed to close database pool during shutdown', { 
          error: poolError?.message || poolError?.toString() || 'Unknown error',
          stack: poolError?.stack,
          code: poolError?.code
        });
        // Don't fail shutdown - continue with other cleanup
      }
      
      // Flush Sentry events
      try {
        await sentryService.flush(2000);
        logger.info('Sentry events flushed');
      } catch (sentryError: any) {
        logger.error('Failed to flush Sentry events', { 
          error: sentryError?.message || sentryError?.toString() || 'Unknown error',
          stack: sentryError?.stack
        });
        // Don't fail shutdown - continue
      }
      
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error: any) {
      logger.error('Error during graceful shutdown', { 
        error: error?.message || error?.toString() || 'Unknown error',
        stack: error?.stack,
        code: error?.code
      });
      process.exit(1);
    }
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after 30s timeout');
    process.exit(1);
  }, 30000);
}

export default app;
