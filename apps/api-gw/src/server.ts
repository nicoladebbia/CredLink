import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { authMiddleware } from './middleware/auth';
import { validationMiddleware } from './middleware/validation';
import { errorHandler } from './middleware/error-handler';
import { metricsMiddleware } from './middleware/metrics';
import { requestIdMiddleware } from './middleware/request-id';
import { signingRoutes } from './routes/signing';
import { verificationRoutes } from './routes/verification';
import { healthRoutes } from './routes/health';
import { logger } from './utils/logger';
import * as SentryUtils from './utils/sentry';

/**
 * API Gateway
 * 
 * Production-ready API with authentication, rate limiting, and monitoring
 */
export class APIGateway {
  private app: express.Application;
  private server?: ReturnType<typeof this.app.listen>;

  constructor() {
    this.app = express();
    
    // Initialize Sentry first
    SentryUtils.initializeSentry(this.app);
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(): void {
    // Sentry request handler (must be first)
    this.app.use(SentryUtils.requestHandler());
    this.app.use(SentryUtils.tracingHandler());
    
    // Request ID middleware
    this.app.use(requestIdMiddleware);
    
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
    }));

    // Compression
    this.app.use(compression({
      threshold: 1024, // Only compress responses > 1KB
      level: 6
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.info(`${req.method} ${req.path}`, { ip: req.ip });
      next();
    });

    // Metrics collection
    this.app.use(metricsMiddleware);
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    // Health check (no auth required)
    this.app.use('/health', healthRoutes);

    // API routes with authentication
    this.app.use('/api/v1/sign', authMiddleware, validationMiddleware, signingRoutes);
    this.app.use('/api/v1/verify', authMiddleware, validationMiddleware, verificationRoutes);

    // API documentation
    this.app.get('/api/docs', (req: express.Request, res: express.Response) => {
      res.json({
        title: 'CredLink API',
        version: '1.0.0',
        endpoints: {
          sign: {
            path: '/api/v1/sign',
            method: 'POST',
            description: 'Sign an image with C2PA manifest',
            authentication: 'required'
          },
          verify: {
            path: '/api/v1/verify',
            method: 'POST',
            description: 'Verify an image signature',
            authentication: 'required'
          },
          health: {
            path: '/health',
            method: 'GET',
            description: 'Health check endpoint',
            authentication: 'none'
          }
        }
      });
    });

    // 404 handler
    this.app.use('*', (req: express.Request, res: express.Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    // Sentry error handler (must be before other error handlers)
    this.app.use(SentryUtils.errorHandler());
    
    // Custom error handler
    this.app.use(errorHandler);
  }

  /**
   * Start server
   */
  async start(port: number = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(port, () => {
          logger.info(`API Gateway started on port ${port}`);
          resolve();
        });

        this.server.on('error', (err: Error) => {
          reject(err);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('API Gateway stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get Express app instance
   */
  getApp(): express.Application {
    return this.app;
  }
}
