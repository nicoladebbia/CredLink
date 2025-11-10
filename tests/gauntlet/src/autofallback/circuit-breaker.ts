/**
 * Phase 6 - Optimizer Auto-Fallback: Circuit Breaker
 * Prevents cascading failures and provides resilience
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
  expectedRecoveryTime: number;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number;
  nextAttemptTime: number;
}

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number = 0;
  private nextAttemptTime: number = 0;
  private failureHistory: number[] = [];

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  // Execute operation with circuit breaker protection
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error('Circuit breaker is OPEN - operation blocked');
      }
      this.state = CircuitState.HALF_OPEN;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  // Handle successful operation
  private onSuccess(): void {
    this.successes++;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED;
      this.failures = 0;
      this.failureHistory = [];
    }
  }

  // Handle failed operation
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    // Track failures in monitoring window
    const now = Date.now();
    this.failureHistory.push(now);
    
    // Clean old failures outside monitoring period
    const cutoff = now - this.config.monitoringPeriod;
    this.failureHistory = this.failureHistory.filter(time => time > cutoff);
    
    // Check if we should open the circuit
    if (this.failureHistory.length >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = now + this.config.resetTimeout;
    }
  }

  // Get current circuit breaker state
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }

  // Reset circuit breaker
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
    this.failureHistory = [];
  }

  // Force open circuit breaker
  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.config.resetTimeout;
  }

  // Check if circuit is available
  isAvailable(): boolean {
    return this.state !== CircuitState.OPEN || Date.now() >= this.nextAttemptTime;
  }

  // Get failure rate in current monitoring period
  getFailureRate(): number {
    const now = Date.now();
    const cutoff = now - this.config.monitoringPeriod;
    const recentFailures = this.failureHistory.filter(time => time > cutoff);
    return recentFailures.length;
  }
}

// Circuit breaker for external service calls
export class ServiceCircuitBreaker {
  private static breakers: Map<string, CircuitBreaker> = new Map();

  static getBreaker(serviceName: string): CircuitBreaker {
    if (!this.breakers.has(serviceName)) {
      const config: CircuitBreakerConfig = {
        failureThreshold: 5,
        resetTimeout: 60000, // 1 minute
        monitoringPeriod: 300000, // 5 minutes
        expectedRecoveryTime: 30000 // 30 seconds
      };
      
      this.breakers.set(serviceName, new CircuitBreaker(config));
    }
    
    return this.breakers.get(serviceName)!;
  }

  // Execute HTTP request with circuit breaker
  static async fetchWithCircuitBreaker(
    serviceName: string,
    url: string,
    options?: RequestInit
  ): Promise<Response> {
    const breaker = this.getBreaker(serviceName);
    
    return breaker.execute(async () => {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response;
    });
  }

  // Get all circuit breaker stats
  static getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    
    for (const [service, breaker] of this.breakers.entries()) {
      stats[service] = breaker.getStats();
    }
    
    return stats;
  }

  // Reset all circuit breakers
  static resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

// Default circuit breaker configurations
export const CIRCUIT_CONFIGS = {
  // CDN services - more lenient
  CDN: {
    failureThreshold: 10,
    resetTimeout: 30000, // 30 seconds
    monitoringPeriod: 120000, // 2 minutes
    expectedRecoveryTime: 15000 // 15 seconds
  },
  
  // Admin API - stricter
  ADMIN_API: {
    failureThreshold: 3,
    resetTimeout: 60000, // 1 minute
    monitoringPeriod: 300000, // 5 minutes
    expectedRecoveryTime: 30000 // 30 seconds
  },
  
  // KV storage - very strict
  KV_STORAGE: {
    failureThreshold: 5,
    resetTimeout: 120000, // 2 minutes
    monitoringPeriod: 300000, // 5 minutes
    expectedRecoveryTime: 60000 // 1 minute
  },
  
  // R2 storage - moderate
  R2_STORAGE: {
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
    monitoringPeriod: 300000, // 5 minutes
    expectedRecoveryTime: 30000 // 30 seconds
  }
} as const;
