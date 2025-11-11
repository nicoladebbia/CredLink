import winston from 'winston';
import { Request } from 'express';

/**
 * Logger configuration with CloudWatch support
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'credlink-api',
    version: process.env.SERVICE_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    maxsize: 10485760, // 10MB
    maxFiles: 5
  }));

  logger.add(new winston.transports.File({
    filename: 'logs/combined.log',
    maxsize: 10485760, // 10MB
    maxFiles: 5
  }));
}

// Add CloudWatch transport in production (optional)
if (process.env.NODE_ENV === 'production' && process.env.CLOUDWATCH_ENABLED === 'true') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const CloudWatchTransport = require('winston-cloudwatch');
    logger.add(new CloudWatchTransport({
      logGroupName: process.env.CLOUDWATCH_LOG_GROUP || '/aws/ecs/credlink-api',
      logStreamName: () => {
        const date = new Date().toISOString().split('T')[0];
        return `${date}-${process.env.ECS_TASK_ID || process.env.HOSTNAME || 'local'}`;
      },
      awsRegion: process.env.AWS_REGION || 'us-east-1',
      jsonMessage: true
    }));
    logger.info('CloudWatch logging enabled');
  } catch (error) {
    logger.warn('CloudWatch transport not available', { error });
  }
}

/**
 * Log HTTP request
 */
export const logRequest = (req: Request, message: string, meta?: Record<string, unknown>): void => {
  logger.info(message, {
    requestId: (req as Request & { id?: string }).id,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    userId: (req as Request & { user?: { id: string } }).user?.id,
    ...meta
  });
};

/**
 * Log error with request context
 */
export const logError = (req: Request, error: Error, meta?: Record<string, unknown>): void => {
  logger.error(error.message, {
    requestId: (req as Request & { id?: string }).id,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userId: (req as Request & { user?: { id: string } }).user?.id,
    stack: error.stack,
    errorName: error.name,
    ...meta
  });
};

export { logger };
