/**
 * Phase 13 Analytics - Logger Utility
 * Structured logging with Winston for production monitoring
 */

import { Logger as WinstonLogger, createLogger as winstonCreateLogger, format, transports } from 'winston';
import * as fs from 'fs';
import * as path from 'path';

export interface LoggerConfig {
  level: string;
  service: string;
  environment?: string;
  version?: string;
}

export function createLogger(service: string, config?: Partial<LoggerConfig>): WinstonLogger {
  const loggerConfig: LoggerConfig = {
    level: 'info',
    service,
    environment: process.env.NODE_ENV || 'development',
    version: process.env.VERSION || '1.0.0',
    ...config
  };

  // Custom format for structured logging with injection protection
  const customFormat = format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json(),
    format.printf(({ timestamp, level, message, service: svc, environment, version, ...meta }) => {
      // CRITICAL: Sanitize log data to prevent injection
      const sanitizeString = (str: any): string => {
        if (typeof str !== 'string') return str;
        return str
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
          .replace(/[\r\n]/g, '') // Remove line breaks
          .substring(0, 10000); // Limit length
      };
      
      const sanitizedMessage = sanitizeString(message);
      const sanitizedMeta = Object.keys(meta).reduce((acc, key) => {
        acc[key] = sanitizeString(meta[key]);
        return acc;
      }, {} as any);
      
      return JSON.stringify({
        timestamp,
        level,
        service: sanitizeString(svc || service),
        environment: sanitizeString(environment),
        version: sanitizeString(version),
        message: sanitizedMessage,
        ...sanitizedMeta
      });
    })
  );

  // Console format for development with injection protection
  const consoleFormat = format.combine(
    format.colorize(),
    format.timestamp({ format: 'HH:mm:ss' }),
    format.printf(({ timestamp, level, message, service: svc, ...meta }) => {
      // CRITICAL: Sanitize console output to prevent injection
      const sanitizeString = (str: any): string => {
        if (typeof str !== 'string') return str;
        return str
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
          .replace(/[\r\n]/g, '') // Remove line breaks
          .substring(0, 1000); // Limit length for console
      };
      
      const sanitizedMessage = sanitizeString(message);
      const sanitizedService = sanitizeString(svc || service);
      const sanitizedMeta = Object.keys(meta).reduce((acc, key) => {
        acc[key] = sanitizeString(meta[key]);
        return acc;
      }, {} as any);
      
      const metaStr = Object.keys(sanitizedMeta).length > 0 ? ` ${JSON.stringify(sanitizedMeta).substring(0, 500)}` : '';
      return `${timestamp} [${sanitizedService}] ${level}: ${sanitizedMessage}${metaStr}`;
    })
  );

  const loggerTransports: any[] = [
    // Console transport
    new transports.Console({
      level: loggerConfig.level,
      format: loggerConfig.environment === 'production' ? customFormat : consoleFormat
    })
  ];

  // File transports for production
  if (loggerConfig.environment === 'production') {
    // Ensure logs directory exists
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    loggerTransports.push(
      // Error log file
      new transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: customFormat,
        maxsize: 10485760, // 10MB
        maxFiles: 5
      }),
      
      // Combined log file
      new transports.File({
        filename: 'logs/combined.log',
        format: customFormat,
        maxsize: 10485760, // 10MB
        maxFiles: 5
      })
    );
  }

  return winstonCreateLogger({
    level: loggerConfig.level,
    defaultMeta: {
      service: loggerConfig.service,
      environment: loggerConfig.environment,
      version: loggerConfig.version
    },
    transports: loggerTransports,
    // Handle uncaught exceptions and rejections
    exceptionHandlers: [
      new transports.Console({ format: consoleFormat }),
      ...(loggerConfig.environment === 'production' ? [
        new transports.File({ filename: 'logs/exceptions.log', format: customFormat })
      ] : [])
    ],
    rejectionHandlers: [
      new transports.Console({ format: consoleFormat }),
      ...(loggerConfig.environment === 'production' ? [
        new transports.File({ filename: 'logs/rejections.log', format: customFormat })
      ] : [])
    ]
  });
}

// Pre-configured loggers for different services
export const loggers = {
  analytics: createLogger('AnalyticsService'),
  alerts: createLogger('AlertService'),
  dashboard: createLogger('DashboardRoutes'),
  clickhouse: createLogger('ClickHouseClient'),
  ingest: createLogger('IngestService'),
  reports: createLogger('ReportService')
};

// Default logger export
export const logger = createLogger('C2PAAnalytics');
