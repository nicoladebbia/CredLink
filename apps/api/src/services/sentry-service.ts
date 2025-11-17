/**
 * Production-Ready Error Handling Service
 * 
 * Provides Sentry integration when configured, otherwise falls back to
 * structured logging for development and testing environments.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { TimeoutConfig } from '../utils/timeout-config';

// Sentry integration - only loaded when configured
let Sentry: any = null;

// Initialize Sentry if DSN is provided
if (process.env.SENTRY_DSN) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'production',
      tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE 
        ? parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE) 
        : 0.1,
      beforeSend(event: any) {
        // Filter out sensitive information
        if (event.request) {
          delete event.request.headers;
          delete event.request.cookies;
        }
        return event;
      }
    });
    logger.info('Sentry integration initialized');
  } catch (error) {
    logger.warn('Failed to initialize Sentry, using structured logging fallback', {
      error: error instanceof Error ? error.message : String(error)
    });
    Sentry = null;
  }
}

export const sentryService = {
  init: () => {
    if (Sentry) {
      logger.info('Sentry service initialized and ready');
    } else {
      logger.info('Error handling service initialized with structured logging');
    }
  },
  
  flush: async (timeout?: number) => {
    if (Sentry) {
      try {
        await Sentry.flush(timeout || TimeoutConfig.SENTRY_FLUSH_TIMEOUT);
        logger.debug('Sentry events flushed successfully');
      } catch (error) {
        logger.warn('Failed to flush Sentry events', { error });
      }
    } else {
      // No-op for logging-only mode
      logger.debug('Error handling service flush completed (logging mode)');
    }
  },
  
  getRequestHandler: () => {
    if (Sentry) {
      return Sentry.Handlers.requestHandler();
    } else {
      return (req: Request, res: Response, next: NextFunction) => {
        // Add request context to structured logs
        logger.debug('Request processed', {
          method: req.method,
          url: req.url,
          userAgent: req.get('User-Agent')
        });
        next();
      };
    }
  },
  
  getTracingHandler: () => {
    if (Sentry) {
      return Sentry.Handlers.tracingHandler();
    } else {
      return (req: Request, res: Response, next: NextFunction) => {
        // Add timing information to structured logs
        const startTime = Date.now();
        
        res.on('finish', () => {
          const duration = Date.now() - startTime;
          logger.debug('Request completed', {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration: `${duration}ms`
          });
        });
        
        next();
      };
    }
  },
  
  getErrorHandler: () => {
    if (Sentry) {
      return Sentry.Handlers.errorHandler();
    } else {
      return (error: Error, req: Request, res: Response, next: NextFunction) => {
        logger.error('Application error occurred', {
          error: error.message,
          stack: error.stack,
          method: req.method,
          url: req.url,
          userAgent: req.get('User-Agent')
        });
        next(error);
      };
    }
  },
  
  captureException: (error: Error, context?: any) => {
    if (Sentry) {
      Sentry.captureException(error, context);
      logger.debug('Exception captured by Sentry', { error: error.message });
    } else {
      logger.error('Exception captured', {
        error: error.message,
        stack: error.stack,
        context
      });
    }
  },
  
  captureMessage: (message: string, level: 'info' | 'warning' | 'error' = 'info') => {
    if (Sentry) {
      Sentry.captureMessage(message, level);
      logger.debug(`Message captured by Sentry: ${message}`);
    } else {
      logger.log(level.toUpperCase() as any, message);
    }
  }
};
