import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/error-handler';
import { logger, httpLogStream } from './utils/logger';
import { sentryService } from './utils/sentry';
import { metricsCollector } from './middleware/metrics';
import { apiKeyAuth } from './middleware/auth';
import { ipWhitelists } from './middleware/ip-whitelist';
import { validateEnvironment, printEnvironmentSummary } from './utils/validate-env';
import { scheduler } from './jobs/scheduler';
import signRouter from './routes/sign';
import verifyRouter from './routes/verify';
import docsRouter from './routes/docs';

// Load environment variables
dotenv.config();

// Validate environment configuration on startup
try {
  validateEnvironment();
  printEnvironmentSummary();
} catch (error) {
  console.error('Environment validation failed:', (error as Error).message);
  process.exit(1);
}

const app: Application = express();

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
app.use(morgan('combined', { stream: httpLogStream }));

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

app.get('/health', healthLimiter, (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/ready', healthLimiter, (req, res) => {
  res.json({
    ready: true,
    checks: {
      service: 'ok'
    }
  });
});

// ✅ Prometheus metrics endpoint (IP whitelisted)
app.get('/metrics', ipWhitelists.metrics, async (req, res) => {
  try {
    res.set('Content-Type', metricsCollector.registry.contentType);
    res.end(await metricsCollector.getMetrics());
  } catch (error) {
    logger.error('Failed to get metrics', { error });
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// ✅ API Documentation (public)
app.use('/', docsRouter);

// ✅ Apply API key authentication to protected routes (optional)
if (process.env.ENABLE_API_KEY_AUTH === 'true') {
  app.use('/sign', apiKeyAuth.authenticate);
  app.use('/verify', apiKeyAuth.authenticate);
}

app.use('/sign', signRouter);
app.use('/verify', verifyRouter);

// 404 handler
app.use((req, res) => {
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
const server = app.listen(PORT, () => {
  logger.info(`Sign service running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  
  // Start job scheduler
  if (process.env.ENABLE_JOB_SCHEDULER !== 'false') {
    scheduler.start();
    logger.info('Job scheduler started');
  } else {
    logger.warn('Job scheduler disabled via ENABLE_JOB_SCHEDULER=false');
  }
});

// Track active services for cleanup
const activeServices: Array<{ name: string; close: () => Promise<void> | void }> = [];

// Register scheduler for cleanup
registerService('JobScheduler', scheduler);

/**
 * Register a service for graceful shutdown
 */
export function registerService(name: string, service: { close: () => Promise<void> | void }) {
  activeServices.push({ name, close: service.close.bind(service) });
  logger.debug(`Service registered for cleanup: ${name}`);
}

/**
 * Cleanup all active services
 */
async function cleanupServices(): Promise<void> {
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
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`${signal} signal received: initiating graceful shutdown`);
  
  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed');
    
    try {
      // Clean up all services (ProofStorage, CertificateManager, etc.)
      await cleanupServices();
      
      // Flush Sentry events
      await sentryService.flush(2000);
      logger.info('Sentry events flushed');
      
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', { error });
      process.exit(1);
    }
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after 30s timeout');
    process.exit(1);
  }, 30000);
}

// Graceful shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
