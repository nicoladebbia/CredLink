import { Client, ValidationError, AuthError } from '../src/index.js';

describe('C2 Concierge SDK', () => {
  const apiKey = process.env.C2_API_KEY || 'test-api-key';

  describe('Client', () => {
    it('should create a client with API key', () => {
      const client = new Client({ apiKey });
      expect(client).toBeInstanceOf(Client);
    });

    it('should throw error without API key', () => {
      expect(() => new Client({ apiKey: '' })).toThrow('API key is required');
    });

    it('should accept custom configuration', () => {
      const config = {
        apiKey,
        baseUrl: 'https://test.api.com',
        timeoutMs: 5000,
        retries: {
          maxAttempts: 3,
          baseMs: 100,
          maxMs: 1000,
          jitter: false,
        },
      };
      const client = new Client(config);
      expect(client).toBeInstanceOf(Client);
    });
  });

  describe('Error Types', () => {
    it('should create ValidationError with proper properties', () => {
      const error = new ValidationError('Test validation error', {
        requestId: 'test-123',
        hint: 'Test hint',
      });
      
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(422);
      expect(error.requestId).toBe('test-123');
      expect(error.hint).toBe('Test hint');
      expect(error.getSummary()).toContain('422');
      expect(error.getNextSteps()).toContain('Check required fields');
    });

    it('should create AuthError with proper properties', () => {
      const error = new AuthError('Test auth error', {
        requestId: 'test-456',
        endpoint: '/verify/asset',
      });
      
      expect(error).toBeInstanceOf(AuthError);
      expect(error.code).toBe('AUTH_ERROR');
      expect(error.statusCode).toBe(401);
      expect(error.getSummary()).toContain('401');
      expect(error.getNextSteps()).toContain('Verify your API key');
    });
  });
});
