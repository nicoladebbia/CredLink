import { 
  LoggerFactory, 
  StructuredLogger, 
  requestLogger, 
  PerformanceLogger,
  AuditLogger,
  LogContext 
} from './structured-logger';
import { Request } from 'express';

describe('Structured Logger', () => {
  let logger: StructuredLogger;

  beforeEach(() => {
    logger = LoggerFactory.getInstance();
  });

  describe('LoggerFactory', () => {
    it('should return singleton instance', () => {
      const logger1 = LoggerFactory.getInstance();
      const logger2 = LoggerFactory.getInstance();
      
      expect(logger1).toBe(logger2);
    });

    it('should create child logger with context', () => {
      const childLogger = LoggerFactory.createChild({
        component: 'test',
        userId: '123'
      });

      expect(childLogger).toBeDefined();
    });
  });

  describe('Request Context', () => {
    it('should create logger with request context', () => {
      const mockRequest = {
        headers: {
          'x-request-id': 'req-123',
          'x-correlation-id': 'corr-456',
          'x-user-id': 'user-789',
          'x-tenant-id': 'tenant-001'
        },
        method: 'POST',
        path: '/test',
        ip: '127.0.0.1',
        get: (header: string) => mockRequest.headers[header.toLowerCase()]
      } as any as Request;

      const requestLogger = LoggerFactory.forRequest(mockRequest);
      
      expect(requestLogger).toBeDefined();
    });

    it('should generate IDs if not provided', () => {
      const mockRequest = {
        headers: {},
        method: 'GET',
        path: '/test',
        ip: '127.0.0.1',
        get: () => undefined
      } as any as Request;

      const requestLogger = LoggerFactory.forRequest(mockRequest);
      
      expect(requestLogger).toBeDefined();
    });
  });

  describe('Context Enrichment', () => {
    it('should enrich log context with base context', () => {
      const baseLogger = logger.child({
        component: 'test-component',
        service: 'test-service'
      });

      expect(baseLogger).toBeDefined();
    });

    it('should chain context additions', () => {
      const chainedLogger = logger
        .withContext({ component: 'test' })
        .withDuration(100)
        .withError(new Error('test error'));

      expect(chainedLogger).toBeDefined();
    });
  });

  describe('Performance Logging', () => {
    it('should track performance checkpoints', (done) => {
      const perfLogger = new PerformanceLogger(logger);
      
      setTimeout(() => {
        perfLogger.checkpoint('step1');
        
        setTimeout(() => {
          perfLogger.checkpoint('step2');
          perfLogger.finish();
          done();
        }, 10);
      }, 10);
    });
  });

  describe('Audit Logging', () => {
    let auditLogger: AuditLogger;

    beforeEach(() => {
      auditLogger = new AuditLogger();
    });

    it('should log security events', () => {
      auditLogger.logSecurityEvent(
        'login_attempt',
        'medium',
        { userId: 'test-user', ip: '127.0.0.1' }
      );
    });

    it('should log authentication attempts', () => {
      auditLogger.logAuthenticationAttempt(
        true,
        'test-user',
        { method: 'password' }
      );
    });

    it('should log data access', () => {
      auditLogger.logDataAccess(
        'read',
        'user-profile',
        'test-user',
        { endpoint: '/profile' }
      );
    });
  });

  describe('Log Levels', () => {
    it('should support all log levels', () => {
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');
    });
  });

  describe('Structured Context', () => {
    it('should handle complex context objects', () => {
      const complexContext: LogContext = {
        requestId: 'req-123',
        userId: 'user-456',
        metrics: {
          duration: 150,
          memoryUsage: 1024 * 1024 * 50
        },
        tags: ['api', 'v1'],
        customField: 'custom-value'
      };

      logger.info('Complex context test', complexContext);
    });
  });
});
