import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';
import { Request, Express } from 'express';

/**
 * Initialize Sentry error tracking
 */
export const initializeSentry = (app: Express): void => {
  if (!process.env.SENTRY_DSN) {
    console.warn('Sentry DSN not configured, error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.SERVICE_VERSION || '1.0.0',
    
    // Performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Profiling
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    integrations: [
      // HTTP tracing
      new Sentry.Integrations.Http({ tracing: true }),
      
      // Express integration
      new Sentry.Integrations.Express({ app }),
      
      // Profiling
      new ProfilingIntegration(),
    ],
    
    // Filter sensitive data
    beforeSend(event: Sentry.Event, _hint: Sentry.EventHint) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers['x-api-key'];
        delete event.request.headers.cookie;
      }
      
      // Remove sensitive query params
      if (event.request?.query_string) {
        const params = new URLSearchParams(event.request.query_string);
        params.delete('token');
        params.delete('api_key');
        event.request.query_string = params.toString();
      }
      
      return event;
    },
    
    // Ignore certain errors
    ignoreErrors: [
      'ECONNRESET',
      'ENOTFOUND',
      'ETIMEDOUT',
      'NetworkError',
      'Non-Error promise rejection'
    ]
  });

  console.log('Sentry initialized successfully');
};

/**
 * Capture exception with request context
 */
export const captureException = (
  req: Request,
  error: Error,
  context?: Record<string, unknown>
): void => {
  Sentry.withScope((scope: Sentry.Scope) => {
    // Add request context
    scope.setTag('requestId', (req as Request & { id?: string }).id || 'unknown');
    scope.setTag('userId', (req as Request & { user?: { id: string } }).user?.id || 'anonymous');
    scope.setTag('path', req.path);
    scope.setTag('method', req.method);
    scope.setTag('statusCode', (req as Request & { statusCode?: number }).statusCode?.toString());
    
    // Add user context
    const user = (req as Request & { user?: { id: string; email: string } }).user;
    if (user) {
      scope.setUser({
        id: user.id,
        email: user.email
      });
    }
    
    // Add additional context
    if (context) {
      scope.setContext('additional', context);
    }
    
    // Add request data
    scope.setContext('request', {
      method: req.method,
      url: req.url,
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type']
      },
      query: req.query,
      ip: req.ip
    });
    
    Sentry.captureException(error);
  });
};

/**
 * Capture message with request context
 */
export const captureMessage = (
  req: Request,
  message: string,
  level: Sentry.SeverityLevel = 'info'
): void => {
  Sentry.withScope((scope: Sentry.Scope) => {
    scope.setTag('requestId', (req as Request & { id?: string }).id || 'unknown');
    scope.setTag('userId', (req as Request & { user?: { id: string } }).user?.id || 'anonymous');
    scope.setTag('path', req.path);
    scope.setTag('method', req.method);
    
    Sentry.captureMessage(message, level);
  });
};

/**
 * Add breadcrumb for debugging
 */
export const addBreadcrumb = (
  category: string,
  message: string,
  data?: Record<string, unknown>,
  level: Sentry.SeverityLevel = 'info'
): void => {
  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level
  });
};

/**
 * Set user context
 */
export const setUser = (user: { id: string; email?: string; username?: string }): void => {
  Sentry.setUser(user);
};

/**
 * Clear user context
 */
export const clearUser = (): void => {
  Sentry.setUser(null);
};

/**
 * Get Sentry request handler middleware
 */
export const requestHandler = (): ReturnType<typeof Sentry.Handlers.requestHandler> => {
  return Sentry.Handlers.requestHandler();
};

/**
 * Get Sentry tracing handler middleware
 */
export const tracingHandler = (): ReturnType<typeof Sentry.Handlers.tracingHandler> => {
  return Sentry.Handlers.tracingHandler();
};

/**
 * Get Sentry error handler middleware
 */
export const errorHandler = (): ReturnType<typeof Sentry.Handlers.errorHandler> => {
  return Sentry.Handlers.errorHandler();
};

export { Sentry };
