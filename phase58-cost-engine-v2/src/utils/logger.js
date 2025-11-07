/**
 * Centralized logging utility with structured output
 * Supports JSON format for log aggregation
 */

import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logLevel = process.env.LOG_LEVEL || 'info';
const logFormat = process.env.LOG_FORMAT || 'json';
const logFileEnabled = process.env.LOG_FILE_ENABLED === 'true';

// Security: Validate and sanitize log file path
let logFilePath = process.env.LOG_FILE_PATH || path.join(logsDir, 'cost-engine.log');
if (logFileEnabled) {
  // Prevent path traversal attacks
  logFilePath = path.resolve(logsDir, path.basename(logFilePath));
  // Ensure path is within logs directory
  if (!logFilePath.startsWith(path.resolve(logsDir))) {
    throw new Error('Invalid log file path: path traversal detected');
  }
}

/**
 * Create custom format for logs
 */
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  logFormat === 'json'
    ? winston.format.json()
    : winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
      return `${timestamp} [${level.toUpperCase()}]: ${message} ${metaStr}`;
    })
);

/**
 * Create Winston logger instance
 */
export function createLogger(module = 'CostEngine') {
  const transports = [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), customFormat)
    })
  ];

  // Add file transport if enabled
  if (logFileEnabled) {
    transports.push(
      new winston.transports.File({
        filename: logFilePath,
        format: customFormat,
        maxsize: 10485760, // 10MB
        maxFiles: 5
      })
    );
  }

  return winston.createLogger({
    level: logLevel,
    format: customFormat,
    defaultMeta: { module },
    transports
  });
}

/**
 * Sanitize sensitive data from logs
 */
export function sanitize(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sanitized = { ...obj };
  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'authorization'];

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitize(sanitized[key]);
    }
  }

  return sanitized;
}

export default createLogger;
