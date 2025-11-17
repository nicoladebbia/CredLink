import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { healthRouter } from './routes/health';
import { signRouter } from './routes/sign';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import { metricsCollector } from './middleware/metrics';
import { logger } from './utils/logger';

const app: express.Application = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

// General middleware
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging and metrics
app.use(requestLogger);
app.use(metricsCollector.middleware());

// Health check endpoint
app.use('/health', healthRouter);

// API routes
app.use('/api/v1/sign', signRouter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'CredLink Signing Service',
    version: '1.0.0',
    status: 'operational',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      sign: '/api/v1/sign',
      docs: '/api/v1/sign/docs'
    }
  });
});

// API documentation
app.get('/api/v1/sign/docs', (req, res) => {
  res.json({
    title: 'CredLink Signing Service API',
    version: '1.0.0',
    description: 'Dedicated service for C2PA manifest signing and certificate management',
    endpoints: {
      'POST /api/v1/sign': {
        description: 'Sign an image with C2PA manifest',
        contentType: 'multipart/form-data',
        parameters: {
          image: 'File (required) - Image to sign',
          custom_assertions: 'JSON (optional) - Custom C2PA assertions',
          claim_generator: 'String (optional) - Claim generator identifier',
          title: 'String (optional) - Manifest title',
          format: 'String (optional) - Output format (default: same as input)'
        },
        response: {
          '200': 'Signed image buffer',
          '400': 'Validation error',
          '429': 'Rate limit exceeded',
          '500': 'Internal server error'
        }
      },
      'GET /api/v1/sign/status': {
        description: 'Get signing service status',
        response: {
          '200': 'Service status information'
        }
      },
      'POST /api/v1/sign/batch': {
        description: 'Batch sign multiple images',
        contentType: 'multipart/form-data',
        parameters: {
          images: 'Files (required) - Images to sign (max 10)',
          batch_options: 'JSON (optional) - Batch processing options'
        },
        response: {
          '200': 'Batch signing results',
          '400': 'Validation error',
          '429': 'Rate limit exceeded'
        }
      }
    }
  });
});

// Error handling (must be last)
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`CredLink Signing Service started on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
  });
}

export default app;
