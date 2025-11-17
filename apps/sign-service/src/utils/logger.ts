import { createWriteStream, WriteStream } from 'fs';
import { join } from 'path';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  service: string;
  metadata?: any;
}

class Logger {
  private logLevel: LogLevel;
  private service: string;
  private logStream?: WriteStream;

  constructor(service: string = 'sign-service') {
    this.service = service;
    this.logLevel = this.getLogLevelFromEnv();
    
    // Initialize file logging in production
    if (process.env.NODE_ENV === 'production') {
      this.initializeFileLogging();
    }
  }

  private getLogLevelFromEnv(): LogLevel {
    const level = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
    
    switch (level) {
      case 'ERROR': return LogLevel.ERROR;
      case 'WARN': return LogLevel.WARN;
      case 'INFO': return LogLevel.INFO;
      case 'DEBUG': return LogLevel.DEBUG;
      default: return LogLevel.INFO;
    }
  }

  private initializeFileLogging(): void {
    try {
      const logPath = process.env.LOG_FILE_PATH || './logs/sign-service.log';
      this.logStream = createWriteStream(logPath, { flags: 'a' });
    } catch (error) {
      console.error('Failed to initialize file logging:', error);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel;
  }

  private formatLogEntry(entry: LogEntry): string {
    const logObject = {
      timestamp: entry.timestamp,
      level: LogLevel[entry.level],
      service: entry.service,
      message: entry.message,
      ...(entry.metadata && { metadata: entry.metadata })
    };

    return JSON.stringify(logObject);
  }

  private writeLog(entry: LogEntry): void {
    const formattedLog = this.formatLogEntry(entry);
    
    // Console logging
    if (entry.level <= LogLevel.WARN) {
      console.error(formattedLog);
    } else {
      console.log(formattedLog);
    }

    // File logging (production only)
    if (this.logStream && process.env.NODE_ENV === 'production') {
      this.logStream.write(formattedLog + '\n');
    }
  }

  error(message: string, metadata?: any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      this.writeLog({
        level: LogLevel.ERROR,
        message,
        timestamp: new Date().toISOString(),
        service: this.service,
        metadata
      });
    }
  }

  warn(message: string, metadata?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.writeLog({
        level: LogLevel.WARN,
        message,
        timestamp: new Date().toISOString(),
        service: this.service,
        metadata
      });
    }
  }

  info(message: string, metadata?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.writeLog({
        level: LogLevel.INFO,
        message,
        timestamp: new Date().toISOString(),
        service: this.service,
        metadata
      });
    }
  }

  debug(message: string, metadata?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.writeLog({
        level: LogLevel.DEBUG,
        message,
        timestamp: new Date().toISOString(),
        service: this.service,
        metadata
      });
    }
  }

  close(): void {
    if (this.logStream) {
      this.logStream.end();
    }
  }
}

export const logger = new Logger();
