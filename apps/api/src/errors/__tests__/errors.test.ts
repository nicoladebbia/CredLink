import {
  ValidationError,
  FileValidationError,
  AuthenticationError,
  NotFoundError,
  StorageError,
  CredLinkError,
  createError,
  ErrorTypes
} from '../index';

describe('Error Classes', () => {
  describe('CredLinkError', () => {
    it('should create error with basic properties', () => {
      const error = new ValidationError('Test error');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(CredLinkError);
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.isOperational).toBe(true);
      expect(error.retryable).toBe(false);
      expect(error.severity).toBe('low');
    });

    it('should include context in log details', () => {
      const context = { field: 'email', value: 'invalid' };
      const error = new ValidationError('Invalid email', context);
      
      const details = error.getLogDetails();
      expect(details.context).toEqual(context);
    });

    it('should generate client-safe response', () => {
      const context = { field: 'email', value: 'invalid' };
      const error = new ValidationError('Invalid email', context);
      
      const response = error.getClientResponse();
      expect(response).toEqual({
        error: 'VALIDATION_ERROR',
        message: 'Invalid email',
        details: {
          field: 'email',
          value: 'invalid'
        }
      });
    });

    it('should include retry information for retryable errors', () => {
      const error = new StorageError('S3 connection failed');
      
      const response = error.getClientResponse();
      expect(response.retryable).toBe(true);
      expect(response.retryAfter).toBe('30s');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with correct properties', () => {
      const error = new ValidationError('Invalid input');
      
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.retryable).toBe(false);
      expect(error.severity).toBe('low');
    });
  });

  describe('FileValidationError', () => {
    it('should create file validation error', () => {
      const error = new FileValidationError('Invalid file format');
      
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('FILE_VALIDATION_ERROR');
      expect(error.severity).toBe('low');
    });
  });

  describe('AuthenticationError', () => {
    it('should create authentication error', () => {
      const error = new AuthenticationError('Invalid credentials');
      
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.retryable).toBe(false);
      expect(error.severity).toBe('medium');
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with identifier', () => {
      const error = new NotFoundError('User', '123');
      
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('RESOURCE_NOT_FOUND');
      expect(error.message).toBe('User not found: 123');
      expect(error.context).toEqual({
        resource: 'User',
        identifier: '123'
      });
    });

    it('should create not found error without identifier', () => {
      const error = new NotFoundError('Resource');
      
      expect(error.message).toBe('Resource not found');
      expect(error.context?.identifier).toBeUndefined();
    });
  });

  describe('StorageError', () => {
    it('should create storage error', () => {
      const error = new StorageError('Disk full');
      
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('STORAGE_ERROR');
      expect(error.retryable).toBe(true);
      expect(error.severity).toBe('high');
    });
  });

  describe('createError utility', () => {
    it('should create error using type string', () => {
      const error = createError('ValidationError', 'Test message');
      
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Test message');
    });

    it('should create error with context', () => {
      const context = { test: 'value' };
      const error = createError('StorageError', 'Test message', context);
      
      expect(error.context).toEqual(context);
    });
  });

  describe('Error inheritance', () => {
    it('should maintain proper inheritance chain', () => {
      const validationError = new ValidationError('test');
      const authError = new AuthenticationError('test');
      
      expect(validationError).toBeInstanceOf(CredLinkError);
      expect(validationError).toBeInstanceOf(Error);
      expect(authError).toBeInstanceOf(CredLinkError);
      expect(authError).toBeInstanceOf(Error);
    });
  });

  describe('Error severity levels', () => {
    it('should have correct severity for different error types', () => {
      expect(new ValidationError('test').severity).toBe('low');
      expect(new AuthenticationError('test').severity).toBe('medium');
      expect(new StorageError('test').severity).toBe('high');
    });
  });
});
