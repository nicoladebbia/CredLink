/**
 * Phase 6 - Optimizer Auto-Fallback: Production Logging Infrastructure
 * Structured logging with levels, correlation, and export
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  route?: string;
  userId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  performance?: {
    duration: number;
    operation: string;
  };
  security?: {
    event: string;
    source: string;
    details: Record<string, any>;
  };
}

export interface LoggingConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableStructured: boolean;
  enableRemote: boolean;
  remoteEndpoint?: string;
  bufferSize: number;
  flushInterval: number;
}

export class ProductionLogger {
  private config: LoggingConfig;
  private buffer: LogEntry[] = [];
  private correlationIdCounter: number = 0;

  constructor(config: LoggingConfig) {
    this.config = config;
    this.startFlushInterval();
  }

  // Generate correlation ID
  generateCorrelationId(): string {
    return `c2-${Date.now()}-${++this.correlationIdCounter}`;
  }

  // Log entry with structured data
  log(level: LogLevel, message: string, metadata?: Partial<LogEntry>): void {
    if (level < this.config.level) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...metadata
    };

    // Add to buffer
    this.buffer.push(entry);
    if (this.buffer.length > this.config.bufferSize) {
      this.buffer.shift();
    }

    // Console output
    if (this.config.enableConsole) {
      this.outputToConsole(entry);
    }

    // Remote logging
    if (this.config.enableRemote && this.config.remoteEndpoint) {
      this.sendToRemote(entry);
    }
  }

  // Convenience methods
  debug(message: string, metadata?: Partial<LogEntry>): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  info(message: string, metadata?: Partial<LogEntry>): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  warn(message: string, metadata?: Partial<LogEntry>): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  error(message: string, error?: Error, metadata?: Partial<LogEntry>): void {
    this.log(LogLevel.ERROR, message, {
      ...metadata,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }

  critical(message: string, error?: Error, metadata?: Partial<LogEntry>): void {
    this.log(LogLevel.CRITICAL, message, {
      ...metadata,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }

  // Security event logging
  logSecurityEvent(event: string, source: string, details: Record<string, any>): void {
    this.warn(`Security event: ${event}`, {
      security: {
        event,
        source,
        details
      }
    });
  }

  // Performance logging
  logPerformance(operation: string, duration: number, metadata?: Record<string, any>): void {
    this.debug(`Performance: ${operation}`, {
      performance: {
        duration,
        operation
      },
      metadata
    });
  }

  // Request logging
  logRequest(request: Request, response: Response, duration: number): void {
    const url = new URL(request.url);
    
    this.info('Request processed', {
      requestId: response.headers.get('X-Request-ID') || 'unknown',
      route: url.pathname,
      method: request.method,
      status: response.status,
      performance: {
        duration,
        operation: 'http_request'
      },
      metadata: {
        userAgent: request.headers.get('User-Agent'),
        referer: request.headers.get('Referer'),
        cfRay: request.headers.get('CF-RAY')
      }
    });
  }

  // Policy decision logging
  logPolicyDecision(route: string, fromMode: string, toMode: string, reason: string, score: number): void {
    this.warn(`Policy decision: ${route}`, {
      route,
      metadata: {
        fromMode,
        toMode,
        reason,
        score,
        timestamp: Date.now()
      }
    });
  }

  // Circuit breaker events
  logCircuitBreakerEvent(service: string, event: string, details: Record<string, any>): void {
    this.warn(`Circuit breaker: ${service} ${event}`, {
      metadata: {
        service,
        event,
        ...details
      }
    });
  }

  // Rate limit events
  logRateLimitEvent(route: string, source: string, limit: number, used: number): void {
    this.warn(`Rate limit exceeded: ${route}`, {
      route,
      metadata: {
        source,
        limit,
        used,
        remaining: limit - used
      }
    });
  }

  // Output to console with formatting
  private outputToConsole(entry: LogEntry): void {
    const levelName = LogLevel[entry.level];
    const timestamp = entry.timestamp;
    const route = entry.route || 'unknown';
    const correlationId = entry.correlationId || '';
    
    let message = `[${timestamp}] ${levelName} [${route}]`;
    if (correlationId) message += ` [${correlationId}]`;
    message += ` ${entry.message}`;
    
    if (entry.metadata) {
      message += ` ${JSON.stringify(entry.metadata)}`;
    }
    
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(message);
        break;
      case LogLevel.INFO:
        console.info(message);
        break;
      case LogLevel.WARN:
        console.warn(message);
        break;
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        console.error(message);
        break;
    }
  }

  // Send to remote logging service
  private async sendToRemote(entry: LogEntry): Promise<void> {
    try {
      if (!this.config.remoteEndpoint) return;
      
      // In production, this would send to ELK, Splunk, Datadog, etc.
      // For now, we'll just simulate it
      console.log('REMOTE LOG:', JSON.stringify(entry));
      
      // await fetch(this.config.remoteEndpoint, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(entry)
      // });
    } catch (error) {
      console.error('Failed to send log to remote service:', error);
    }
  }

  // Start flush interval
  private startFlushInterval(): void {
    setInterval(() => {
      this.flush();
    }, this.config.flushInterval);
  }

  // Flush logs to remote storage
  private async flush(): Promise<void> {
    if (this.buffer.length === 0 || !this.config.enableRemote) return;
    
    const logsToSend = [...this.buffer];
    this.buffer = [];
    
    try {
      // In production, send bulk logs to remote service
      console.log(`FLUSHING ${logsToSend.length} logs to remote service`);
      
      // await fetch(`${this.config.remoteEndpoint}/bulk`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(logsToSend)
      // });
    } catch (error) {
      console.error('Failed to flush logs:', error);
      // Re-add failed logs to buffer
      this.buffer.unshift(...logsToSend);
    }
  }

  // Query logs
  queryLogs(filter: {
    level?: LogLevel;
    route?: string;
    correlationId?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): LogEntry[] {
    let filtered = [...this.buffer];
    
    if (filter.level !== undefined) {
      filtered = filtered.filter(log => log.level >= filter.level!);
    }
    
    if (filter.route) {
      filtered = filtered.filter(log => log.route === filter.route);
    }
    
    if (filter.correlationId) {
      filtered = filtered.filter(log => log.correlationId === filter.correlationId);
    }
    
    if (filter.startTime) {
      filtered = filtered.filter(log => new Date(log.timestamp).getTime() >= filter.startTime!);
    }
    
    if (filter.endTime) {
      filtered = filtered.filter(log => new Date(log.timestamp).getTime() <= filter.endTime!);
    }
    
    if (filter.limit) {
      filtered = filtered.slice(-filter.limit);
    }
    
    return filtered;
  }

  // Get log statistics
  getStatistics(): {
    total: number;
    byLevel: Record<string, number>;
    byRoute: Record<string, number>;
    oldestTimestamp: string | null;
    newestTimestamp: string | null;
  } {
    const stats = {
      total: this.buffer.length,
      byLevel: {} as Record<string, number>,
      byRoute: {} as Record<string, number>,
      oldestTimestamp: null as string | null,
      newestTimestamp: null as string | null
    };
    
    if (this.buffer.length === 0) return stats;
    
    this.buffer.forEach(log => {
      const levelName = LogLevel[log.level];
      stats.byLevel[levelName] = (stats.byLevel[levelName] || 0) + 1;
      
      if (log.route) {
        stats.byRoute[log.route] = (stats.byRoute[log.route] || 0) + 1;
      }
    });
    
    stats.oldestTimestamp = this.buffer[0].timestamp;
    stats.newestTimestamp = this.buffer[this.buffer.length - 1].timestamp;
    
    return stats;
  }

  // Export logs
  exportLogs(format: 'json' | 'csv' | 'txt'): string {
    switch (format) {
      case 'json':
        return JSON.stringify(this.buffer, null, 2);
      case 'csv':
        return this.exportToCSV();
      case 'txt':
        return this.exportToText();
      default:
        return '';
    }
  }

  private exportToCSV(): string {
    const headers = 'timestamp,level,message,route,correlationId\n';
    const rows = this.buffer.map(log => 
      `"${log.timestamp}","${LogLevel[log.level]}","${log.message}","${log.route || ''}","${log.correlationId || ''}"`
    ).join('\n');
    return headers + rows;
  }

  private exportToText(): string {
    return this.buffer.map(log => 
      `[${log.timestamp}] ${LogLevel[log.level]} [${log.route || 'unknown'}] ${log.message}`
    ).join('\n');
  }
}

// Default logging configuration
export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  level: LogLevel.INFO,
  enableConsole: true,
  enableStructured: true,
  enableRemote: true,
  remoteEndpoint: 'https://logs.credlink.io/ingest',
  bufferSize: 1000,
  flushInterval: 30000 // 30 seconds
};

// Global logger instance
export const logger = new ProductionLogger(DEFAULT_LOGGING_CONFIG);
