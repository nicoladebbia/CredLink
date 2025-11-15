import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';
import { Express } from 'express';
import { logger } from './logger';

/**
 * Sentry Error Tracking Setup
 * 
 * Initializes Sentry for error tracking and performance monitoring
 */

export class SentryService {
  private enabled: boolean;
  private initialized: boolean = false;

  constructor() {
    this.enabled = process.env.ENABLE_SENTRY === 'true' && !!process.env.SENTRY_DSN;
  }

  /**
   * Initialize Sentry
   */
  init(app?: Express): void {
    if (!this.enabled) {
      logger.info('Sentry error tracking disabled');
      return;
    }

    const dsn = process.env.SENTRY_DSN;
    const environment = process.env.NODE_ENV || 'development';
    const release = process.env.SENTRY_RELEASE || `sign-service@${process.env.npm_package_version || 'unknown'}`;

    try {
      Sentry.init({
        dsn,
        environment,
        release,
        
        // Performance monitoring
        tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
        
        // Profiling
        profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),
        integrations: [
          new ProfilingIntegration(),
        ],

        // Error filtering
        beforeSend(event, hint) {
          // Don't send errors in development unless explicitly enabled
          if (environment === 'development' && process.env.SENTRY_SEND_IN_DEV !== 'true') {
            return null;
          }

          // Filter out specific errors
          const error = hint.originalException;
          if (error instanceof Error) {
            // Don't send validation errors
            if (error.message.includes('Validation failed')) {
              return null;
            }
            
            // Don't send rate limit errors
            if (error.message.includes('Too many requests')) {
              return null;
            }
          }

          return event;
        },

        // Breadcrumbs
        maxBreadcrumbs: 50,
        
        // Attach stack traces
        attachStacktrace: true,

        // Server name
        serverName: process.env.HOSTNAME || 'unknown',
      });

      // Set user context if available
      if (process.env.SERVICE_NAME) {
        Sentry.setTag('service', process.env.SERVICE_NAME);
      }

      this.initialized = true;
      logger.info('Sentry error tracking initialized', {
        environment,
        release,
        tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'
      });

    } catch (error) {
      logger.error('Failed to initialize Sentry', { error: (error as Error).message });
    }
  }

  /**
   * Get Sentry request handler (must be first middleware)
   */
  getRequestHandler() {
    if (!this.enabled || !this.initialized) {
      return (req: any, res: any, next: any) => next();
    }
    return Sentry.Handlers.requestHandler();
  }

  /**
   * Get Sentry tracing handler
   */
  getTracingHandler() {
    if (!this.enabled || !this.initialized) {
      return (req: any, res: any, next: any) => next();
    }
    return Sentry.Handlers.tracingHandler();
  }

  /**
   * Get Sentry error handler (must be after routes, before other error handlers)
   */
  getErrorHandler(): any {
    if (!this.enabled || !this.initialized) {
      return (err: any, req: any, res: any, next: any) => next(err);
    }
    return Sentry.Handlers.errorHandler();
  }

  /**
   * Capture exception manually
   */
  captureException(error: Error, context?: Record<string, any>): void {
    if (!this.enabled || !this.initialized) {
      return;
    }

    Sentry.captureException(error, {
      extra: context
    });
  }

  /**
   * Capture message
   */
  captureMessage(message: string, level: Sentry.SeverityLevel = 'info', context?: Record<string, any>): void {
    if (!this.enabled || !this.initialized) {
      return;
    }

    Sentry.captureMessage(message, {
      level,
      extra: context
    });
  }

  /**
   * Set user context
   */
  setUser(user: { id: string; email?: string; username?: string }): void {
    if (!this.enabled || !this.initialized) {
      return;
    }

    Sentry.setUser(user);
  }

  /**
   * Set custom context
   */
  setContext(name: string, context: Record<string, any>): void {
    if (!this.enabled || !this.initialized) {
      return;
    }

    Sentry.setContext(name, context);
  }

  /**
   * Add breadcrumb
   */
  addBreadcrumb(breadcrumb: Sentry.Breadcrumb): void {
    if (!this.enabled || !this.initialized) {
      return;
    }

    Sentry.addBreadcrumb(breadcrumb);
  }

  /**
   * Start transaction for performance monitoring
   */
  startTransaction(name: string, op: string): Sentry.Transaction | null {
    if (!this.enabled || !this.initialized) {
      return null;
    }

    return Sentry.startTransaction({ name, op });
  }

  /**
   * Flush events (useful for graceful shutdown)
   */
  async flush(timeout: number = 2000): Promise<boolean> {
    if (!this.enabled || !this.initialized) {
      return true;
    }

    return Sentry.flush(timeout);
  }

  /**
   * Close Sentry client
   */
  async close(timeout: number = 2000): Promise<boolean> {
    if (!this.enabled || !this.initialized) {
      return true;
    }

    return Sentry.close(timeout);
  }
}

// Export singleton instance
export const sentryService = new SentryService();
