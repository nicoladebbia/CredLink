import { CircuitBreaker, CircuitState, CircuitBreakerOptions } from '../circuit-breaker';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  let mockOperation: jest.Mock;
  let successCount = 0;

  beforeEach(() => {
    successCount = 0;
    mockOperation = jest.fn().mockImplementation(async () => {
      if (successCount < 2) {
        successCount++;
        throw new Error('Simulated failure');
      }
      return 'success';
    });

    const options: CircuitBreakerOptions = {
      failureThreshold: 3,
      resetTimeout: 1000,
      monitoringPeriod: 500,
      expectedRecoveryTime: 500
    };

    circuitBreaker = new CircuitBreaker(options);
  });

  describe('when operations succeed', () => {
    it('should execute operations normally when circuit is closed', async () => {
      mockOperation.mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(mockOperation);
      
      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should reset failure count on success', async () => {
      // First, cause some failures
      mockOperation.mockRejectedValueOnce(new Error('failure'));
      mockOperation.mockRejectedValueOnce(new Error('failure'));
      
      try {
        await circuitBreaker.execute(mockOperation);
      } catch (error) {
        // Expected failure
      }
      
      try {
        await circuitBreaker.execute(mockOperation);
      } catch (error) {
        // Expected failure
      }
      
      // Now succeed
      mockOperation.mockResolvedValue('success');
      await circuitBreaker.execute(mockOperation);
      
      const stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.state).toBe(CircuitState.CLOSED);
    });
  });

  describe('when operations fail', () => {
    it('should open circuit after failure threshold is reached', async () => {
      mockOperation.mockRejectedValue(new Error('failure'));
      
      // Execute until threshold is reached
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockOperation);
        } catch (error) {
          // Expected failure
        }
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should reject immediately when circuit is open', async () => {
      // Force circuit open
      mockOperation.mockRejectedValue(new Error('failure'));
      
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockOperation);
        } catch (error) {
          // Expected failure
        }
      }
      
      // Should reject immediately without calling the operation
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('Circuit breaker is OPEN');
      expect(mockOperation).toHaveBeenCalledTimes(3); // Should not be called when circuit is open
    });

    it('should transition to half-open after reset timeout', async () => {
      // Force circuit open
      mockOperation.mockRejectedValue(new Error('failure'));
      
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockOperation);
        } catch (error) {
          // Expected failure
        }
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Next call should transition to half-open
      mockOperation.mockResolvedValue('success');
      await circuitBreaker.execute(mockOperation);
      
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should close circuit after successful operations in half-open state', async () => {
      // Force circuit open
      mockOperation.mockRejectedValue(new Error('failure'));
      
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockOperation);
        } catch (error) {
          // Expected failure
        }
      }
      
      // Wait for reset timeout and get to half-open
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Execute successful operations to close circuit
      mockOperation.mockResolvedValue('success');
      
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(mockOperation);
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('getStats', () => {
    it('should return current circuit statistics', () => {
      const stats = circuitBreaker.getStats();
      
      expect(stats).toHaveProperty('state');
      expect(stats).toHaveProperty('failures');
      expect(stats).toHaveProperty('successCount');
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failures).toBe(0);
      expect(stats.successCount).toBe(0);
    });
  });
});
