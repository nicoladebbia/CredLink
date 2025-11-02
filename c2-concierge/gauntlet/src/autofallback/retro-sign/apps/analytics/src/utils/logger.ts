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

  // Custom format for structured logging
  const customFormat = format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json(),
    format.printf(({ timestamp, level, message, service: svc, environment, version, ...meta }) => {
      return JSON.stringify({
        timestamp,
        level,
        service: svc || service,
        environment,
        version,
        message,
        ...meta
      });
    })
  );

  // Console format for development
  const consoleFormat = format.combine(
    format.colorize(),
    format.timestamp({ format: 'HH:mm:ss' }),
    format.printf(({ timestamp, level, message, service: svc, ...meta }) => {
      const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} [${svc || service}] ${level}: ${message}${metaStr}`;
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
