import express, { Application } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/error-handler';
import { logger, httpLogStream } from './utils/logger';

// Load environment variables
dotenv.config();

const app: Application = express();

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

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

// Health check endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

app.get('/ready', (req, res) => {
  res.json({
    ready: true,
    version: '1.0.0',
    service: 'sign-service',
  });
});

// Routes
import signRouter from './routes/sign';
app.use('/sign', signRouter);

// Placeholder for verify (will be implemented in Steps 201-260)
app.post('/verify', (req, res) => {
  res.status(501).json({
    error: 'Verify endpoint not yet implemented',
    message: 'This endpoint will be implemented in Steps 201-260',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  logger.info(`Sign service running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

export default app;
