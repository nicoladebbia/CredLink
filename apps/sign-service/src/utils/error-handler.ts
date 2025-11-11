import { logger } from './logger';

/**
 * Error context
 */
export interface ErrorContext {
  operation: string;
  userId?: string;
  imageHash?: string;
  proofId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Error event
 */
export interface ErrorEvent {
  message: string;
  name: string;
  code?: string;
  stack?: string;
  context: ErrorContext;
  timestamp: string;
  count?: number;
}

/**
 * Error report
 */
export interface ErrorReport {
  totalErrors: number;
  errorTypes: Record<string, number>;
  recentErrors: ErrorEvent[];
  timestamp: string;
}

/**
 * Comprehensive Error Handler
 * 
 * Centralized error handling with monitoring and reporting
 */
export class ErrorHandler {
  private errorCounts: Map<string, number> = new Map();
  private lastErrors: ErrorEvent[] = [];
  private readonly maxStoredErrors = 100;

  /**
   * Handle error
   */
  handleError(error: Error, context: ErrorContext): void {
    const errorWithCode = error as Error & { code?: string };
    const errorKey = `${error.name}:${errorWithCode.code || 'UNKNOWN'}`;
    this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);

    const errorEvent: ErrorEvent = {
      message: error.message,
      name: error.name,
      code: errorWithCode.code,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString(),
      count: this.errorCounts.get(errorKey)
    };

    this.lastErrors.unshift(errorEvent);
    if (this.lastErrors.length > this.maxStoredErrors) {
      this.lastErrors.pop();
    }

    // Log error with appropriate level
    if (this.isCriticalError(error)) {
      logger.error('CRITICAL ERROR', errorEvent);
    } else {
      logger.warn('Error occurred', errorEvent);
    }

    // Send to monitoring service if configured
    if (process.env.ERROR_MONITORING_ENDPOINT) {
      this.sendToMonitoring(errorEvent).catch(err => {
        logger.error('Failed to send error to monitoring', { error: err });
      });
    }
  }

  /**
   * Check if error is critical
   */
  private isCriticalError(error: Error): boolean {
    const criticalErrors = [
      'StorageUnavailable',
      'CertificateRevoked',
      'SignatureCorruption',
      'MemoryLimitExceeded'
    ];

    const errorWithCode = error as Error & { code?: string };
    return (
      criticalErrors.includes(error.name) ||
      (errorWithCode.code !== undefined && criticalErrors.includes(errorWithCode.code)) ||
      error.message.includes('out of memory') ||
      error.message.includes('disk full')
    );
  }

  /**
   * Send error to monitoring service
   */
  private async sendToMonitoring(errorEvent: ErrorEvent): Promise<void> {
    const endpoint = process.env.ERROR_MONITORING_ENDPOINT;
    if (!endpoint) return;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.ERROR_MONITORING_TOKEN || ''}`
        },
        body: JSON.stringify(errorEvent)
      });

      if (!response.ok) {
        throw new Error(`Monitoring service returned ${response.status}`);
      }
    } catch (error) {
      // Don't throw - we don't want monitoring failures to crash the app
      logger.debug('Failed to send to monitoring', { error });
    }
  }

  /**
   * Get error report
   */
  getErrorReport(): ErrorReport {
    return {
      totalErrors: Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0),
      errorTypes: Object.fromEntries(this.errorCounts),
      recentErrors: this.lastErrors.slice(0, 10),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get error count for specific type
   */
  getErrorCount(errorName: string): number {
    let total = 0;
    for (const [key, count] of this.errorCounts.entries()) {
      if (key.startsWith(errorName + ':')) {
        total += count;
      }
    }
    return total;
  }

  /**
   * Clear error history
   */
  clearErrors(): void {
    this.errorCounts.clear();
    this.lastErrors = [];
    logger.info('Error history cleared');
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit: number = 10): ErrorEvent[] {
    return this.lastErrors.slice(0, limit);
  }

  /**
   * Check if error rate is high
   */
  isErrorRateHigh(threshold: number = 100, timeWindowMs: number = 60000): boolean {
    const cutoffTime = Date.now() - timeWindowMs;
    const recentErrors = this.lastErrors.filter(e => 
      new Date(e.timestamp).getTime() > cutoffTime
    );
    return recentErrors.length > threshold;
  }
}

/**
 * Global error handler instance
 */
export const globalErrorHandler = new ErrorHandler();

/**
 * Wrap async function with error handling
 */
export function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  context: Omit<ErrorContext, 'metadata'>
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      globalErrorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        { ...context, metadata: { args } }
      );
      throw error;
    }
  }) as T;
}
