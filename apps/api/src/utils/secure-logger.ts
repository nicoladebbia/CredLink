/**
 * S-9: Secure Logging & Monitoring
 * 
 * - Never log secrets (API keys, private keys, passwords)
 * - Log security events (failed auth, rate limits, suspicious activity)
 * - Implement audit trail
 * - Redact PII from logs
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

// Sensitive patterns to redact from logs
const REDACT_PATTERNS = [
  // API keys and tokens
  { pattern: /(api[_-]?key|apikey|token|bearer)[\s:=]+([a-zA-Z0-9_-]{20,})/gi, replacement: '$1=***REDACTED***' },
  // Passwords
  { pattern: /(password|passwd|pwd)[\s:=]+([^\s,}]+)/gi, replacement: '$1=***REDACTED***' },
  // Private keys
  { pattern: /(-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----)[\s\S]+(-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----)/gi, replacement: '$1***REDACTED***$2' },
  // Credit cards
  { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, replacement: '****-****-****-****' },
  // Email addresses (PII - optional redaction based on jurisdiction)
  { pattern: /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, replacement: '***@$2' },
  // IPv4 addresses (PII in some jurisdictions)
  { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: (match: string) => {
    // Keep first two octets, redact last two
    const parts = match.split('.');
    return process.env.REDACT_IP === 'true' ? `${parts[0]}.${parts[1]}.*.*` : match;
  }}
];

/**
 * Redact sensitive information from log messages
 */
function redactSensitiveData(message: any): any {
  if (typeof message === 'string') {
    let redacted = message;
    for (const { pattern, replacement } of REDACT_PATTERNS) {
      redacted = redacted.replace(pattern, replacement as any);
    }
    return redacted;
  }

  if (typeof message === 'object' && message !== null) {
    const redacted: any = Array.isArray(message) ? [] : {};
    
    for (const [key, value] of Object.entries(message)) {
      // Redact sensitive keys entirely
      if (/^(password|secret|key|token|private|credential)/i.test(key)) {
        redacted[key] = '***REDACTED***';
      } else {
        redacted[key] = redactSensitiveData(value);
      }
    }
    
    return redacted;
  }

  return message;
}

/**
 * Custom format to redact sensitive data
 */
const redactFormat = winston.format((info) => {
  info.message = redactSensitiveData(info.message);
  
  // Redact metadata
  if (info.metadata) {
    info.metadata = redactSensitiveData(info.metadata);
  }
  
  return info;
});

/**
 * Security event logger
 */
export class SecureLogger {
  private logger: winston.Logger;
  private auditLogger: winston.Logger;

  constructor() {
    // Main application logger
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        redactFormat(),
        winston.format.json()
      ),
      transports: [
        // Console output
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        
        // Error log file (rotated daily)
        new DailyRotateFile({
          filename: 'logs/error-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          maxSize: '20m',
          maxFiles: '30d',
          zippedArchive: true
        }),
        
        // Combined log file (rotated daily)
        new DailyRotateFile({
          filename: 'logs/combined-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d',
          zippedArchive: true
        })
      ]
    });

    // Separate audit trail logger (immutable, long retention)
    this.auditLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        redactFormat(),
        winston.format.json()
      ),
      transports: [
        new DailyRotateFile({
          filename: 'logs/audit-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxSize: '50m',
          maxFiles: '365d', // Keep for 1 year
          zippedArchive: true
        })
      ]
    });
  }

  /**
   * Log security event (authentication, authorization, etc.)
   */
  logSecurityEvent(event: {
    type: 'auth_success' | 'auth_failure' | 'rate_limit' | 'suspicious_activity' | 'access_denied';
    userId?: string;
    ip: string;
    endpoint?: string;
    details?: any;
  }): void {
    this.logger.warn('Security event', {
      event: event.type,
      userId: event.userId || 'anonymous',
      ip: event.ip,
      endpoint: event.endpoint,
      details: event.details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log audit trail (who did what, when)
   */
  logAudit(action: {
    action: 'sign' | 'verify' | 'rotate_key' | 'admin_action';
    userId: string;
    resourceId?: string;
    details?: any;
    ip: string;
  }): void {
    this.auditLogger.info('Audit trail', {
      action: action.action,
      userId: action.userId,
      resourceId: action.resourceId,
      details: action.details,
      ip: action.ip,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Standard logging methods
   */
  info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  error(message: string, meta?: any): void {
    // Never include stack traces in production logs that might be exposed
    if (process.env.NODE_ENV === 'production' && meta?.stack) {
      meta = { ...meta, stack: undefined };
    }
    this.logger.error(message, meta);
  }

  debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  /**
   * Log suspicious activity for monitoring
   */
  logSuspiciousActivity(activity: {
    type: string;
    ip: string;
    userId?: string;
    details: any;
  }): void {
    this.logger.warn('Suspicious activity detected', {
      type: activity.type,
      ip: activity.ip,
      userId: activity.userId,
      details: activity.details,
      timestamp: new Date().toISOString()
    });

    // TODO: Send alert to monitoring system (Sentry, Datadog, etc.)
  }
}

// Export singleton
export const secureLogger = new SecureLogger();
export const logger = secureLogger; // Alias for compatibility
