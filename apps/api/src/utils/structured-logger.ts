import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { Request } from 'express';
import { randomUUID } from 'crypto';
import { versionConfig } from './version-config';

/**
 * Structured Logging Context
 */
export interface LogContext {
  requestId?: string;
  correlationId?: string;
  userId?: string;
  tenantId?: string;
  sessionId?: string;
  apiVersion?: string;
  method?: string;
  path?: string;
  ip?: string;
  userAgent?: string;
  duration?: number;
  component?: string;
  service?: string;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  metrics?: Record<string, number>;
  tags?: string[];
  [key: string]: any;
}

/**
 * Enhanced Logger Interface
 */
export interface StructuredLogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(context: LogContext): StructuredLogger;
  withRequest(req: Request): StructuredLogger;
  withContext(context: LogContext): StructuredLogger;
  withDuration(duration: number): StructuredLogger;
  withError(error: Error): StructuredLogger;
}

/**
 * Structured Logger Implementation
 */
class StructuredLoggerImpl implements StructuredLogger {
  private winston: winston.Logger;
  private baseContext: LogContext;

  constructor(winstonLogger: winston.Logger, baseContext: LogContext = {}) {
    this.winston = winstonLogger;
    this.baseContext = baseContext;
  }

  private enrichContext(context?: LogContext): LogContext {
    return {
      ...this.baseContext,
      ...context,
      timestamp: new Date().toISOString(),
      hostname: process.env.HOSTNAME || 'unknown',
      pid: process.pid,
      version: versionConfig.appVersion
    };
  }

  debug(message: string, context?: LogContext): void {
    const enrichedContext = this.enrichContext(context);
    this.winston.debug(message, enrichedContext);
  }

  info(message: string, context?: LogContext): void {
    const enrichedContext = this.enrichContext(context);
    this.winston.info(message, enrichedContext);
  }

  warn(message: string, context?: LogContext): void {
    const enrichedContext = this.enrichContext(context);
    this.winston.warn(message, enrichedContext);
  }

  error(message: string, context?: LogContext): void {
    const enrichedContext = this.enrichContext(context);
    this.winston.error(message, enrichedContext);
  }

  child(context: LogContext): StructuredLogger {
    return new StructuredLoggerImpl(
      this.winston,
      { ...this.baseContext, ...context }
    );
  }

  withRequest(req: Request): StructuredLogger {
    const requestContext: LogContext = {
      requestId: this.getRequestId(req),
      correlationId: this.getCorrelationId(req),
      userId: this.getUserId(req),
      tenantId: this.getTenantId(req),
      apiVersion: req.apiVersion,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    };

    return this.child(requestContext);
  }

  withContext(context: LogContext): StructuredLogger {
    return this.child(context);
  }

  withDuration(duration: number): StructuredLogger {
    return this.child({ duration });
  }

  withError(error: Error): StructuredLogger {
    const errorContext: LogContext = {
      error: {
        code: error.name,
        message: error.message,
        stack: error.stack
      }
    };

    return this.child(errorContext);
  }

  private getRequestId(req: Request): string {
    return req.headers['x-request-id'] as string || randomUUID();
  }

  private getCorrelationId(req: Request): string {
    return req.headers['x-correlation-id'] as string || randomUUID();
  }

  private getUserId(req: Request): string | undefined {
    return req.headers['x-user-id'] as string || undefined;
  }

  private getTenantId(req: Request): string | undefined {
    return req.headers['x-tenant-id'] as string || undefined;
  }
}

/**
 * Logger Factory
 */
export class LoggerFactory {
  private static instance: StructuredLogger;
  private static winstonLogger: winston.Logger;

  static getInstance(): StructuredLogger {
    if (!this.instance) {
      this.instance = new StructuredLoggerImpl(this.getWinstonLogger());
    }
    return this.instance;
  }

  static createChild(context: LogContext): StructuredLogger {
    return this.getInstance().child(context);
  }

  static forRequest(req: Request): StructuredLogger {
    return this.getInstance().withRequest(req);
  }

  static forComponent(component: string): StructuredLogger {
    return this.getInstance().child({ component });
  }

  static forService(service: string): StructuredLogger {
    return this.getInstance().child({ service });
  }

  private static getWinstonLogger(): winston.Logger {
    if (!this.winstonLogger) {
      this.winstonLogger = this.createWinstonLogger();
    }
    return this.winstonLogger;
  }

  private static createWinstonLogger(): winston.Logger {
    const logLevel = process.env.LOG_LEVEL || 'info';
    const isProduction = process.env.NODE_ENV === 'production';

    // Custom format for structured logging
    const customFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return JSON.stringify({
          timestamp,
          level,
          message,
          ...meta
        });
      })
    );

    // Console transport for development
    const consoleTransport = new winston.transports.Console({
      format: isProduction 
        ? winston.format.json()
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length > 0 ? 
                ` ${JSON.stringify(meta, null, 2)}` : '';
              return `${timestamp} [${level}]: ${message}${metaStr}`;
            })
          )
    });

    // Daily rotate file transport for production
    const fileRotateTransport = new DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: customFormat
    });

    // Error log file with rotation
    const errorFileTransport = new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error',
      format: customFormat
    });

    // Audit log for security events
    const auditTransport = new DailyRotateFile({
      filename: 'logs/audit-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '50m',
      maxFiles: '365d', // Keep audit logs for 1 year
      level: 'warn',
      format: customFormat
    });

    // Performance log for metrics
    const performanceTransport = new DailyRotateFile({
      filename: 'logs/performance-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '7d',
      level: 'info',
      format: customFormat
    });

    const transports: any[] = [consoleTransport];

    if (isProduction) {
      transports.push(
        fileRotateTransport,
        errorFileTransport,
        auditTransport,
        performanceTransport
      );
    }

    return winston.createLogger({
      level: logLevel,
      transports,
      // Handle uncaught exceptions and rejections
      exceptionHandlers: [
        new winston.transports.File({ 
          filename: 'logs/exceptions.log',
          format: customFormat
        })
      ],
      rejectionHandlers: [
        new winston.transports.File({ 
          filename: 'logs/rejections.log',
          format: customFormat
        })
      ],
      // Exit on error for production
      exitOnError: isProduction
    });
  }
}

/**
 * Request Logging Middleware
 */
export const requestLogger = (req: Request, res: any, next: any) => {
  const startTime = Date.now();
  const logger = LoggerFactory.forRequest(req);

  // Add request ID to response headers
  const requestId = (logger as any).baseContext?.requestId || randomUUID();
  res.setHeader('X-Request-ID', requestId);

  // Log request start
  logger.info('Request started', {
    event: 'request_start',
    headers: {
      'user-agent': req.get('User-Agent'),
      'content-type': req.get('Content-Type'),
      'accept': req.get('Accept')
    }
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    const duration = Date.now() - startTime;
    
    logger.info('Request completed', {
      event: 'request_end',
      statusCode: res.statusCode,
      duration,
      contentLength: res.get('Content-Length')
    });

    originalEnd.call(this, chunk, encoding);
  };

  next();
};

/**
 * Performance Logger
 */
export class PerformanceLogger {
  private logger: StructuredLogger;
  private startTime: number;
  private checkpoints: Array<{ name: string; time: number; duration: number }> = [];

  constructor(logger: StructuredLogger) {
    this.logger = logger;
    this.startTime = Date.now();
  }

  checkpoint(name: string): void {
    const now = Date.now();
    const duration = now - this.startTime;
    
    this.checkpoints.push({ name, time: now, duration });
    
    this.logger.debug('Performance checkpoint', {
      event: 'checkpoint',
      checkpoint: name,
      duration,
      totalCheckpoints: this.checkpoints.length
    });
  }

  finish(): void {
    const totalDuration = Date.now() - this.startTime;
    
    this.logger.info('Performance metrics', {
      event: 'performance_complete',
      totalDuration,
      checkpoints: this.checkpoints,
      checkpointCount: this.checkpoints.length
    });
  }
}

/**
 * Audit Logger for Security Events
 */
export class AuditLogger {
  private logger: StructuredLogger;

  constructor() {
    this.logger = LoggerFactory.forComponent('audit');
  }

  logSecurityEvent(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    context: LogContext
  ): void {
    this.logger.warn(`Security event: ${event}`, {
      event: 'security_event',
      securityEvent: event,
      severity,
      ...context
    });
  }

  logAuthenticationAttempt(
    success: boolean,
    userId?: string,
    context?: LogContext
  ): void {
    this.logger.info(`Authentication ${success ? 'success' : 'failure'}`, {
      event: 'auth_attempt',
      success,
      userId,
      ...context
    });
  }

  logDataAccess(
    operation: string,
    resource: string,
    userId?: string,
    context?: LogContext
  ): void {
    this.logger.info(`Data access: ${operation} on ${resource}`, {
      event: 'data_access',
      operation,
      resource,
      userId,
      ...context
    });
  }
}

// Export default logger instance
export const logger = LoggerFactory.getInstance();

// Export specialized loggers
export const auditLogger = new AuditLogger();
