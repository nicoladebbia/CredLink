import { v4 as randomUUID } from 'uuid';
import {
  ClientConfig,
  RequestOptions,
  C2ConciergeError,
  AuthError,
  RateLimitError,
  ConflictError,
  ValidationError,
  ServerError,
  NetworkError,
  RetryConfig,
} from './types.js';

// ============================================================================
// Transport Configuration
// ============================================================================

const DEFAULT_CONFIG = {
  baseUrl: 'https://api.credlink.com/v1',
  timeoutMs: 30000,
  retries: {
    maxAttempts: 5,
    baseMs: 250,
    maxMs: 5000,
    jitter: true,
  },
  userAgent: 'credlink-sdk/js/1.3.0',
} as const;

// ============================================================================
// Circuit Breaker Implementation
// ============================================================================

interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: number;
  nextAttemptTime: number;
}

class CircuitBreaker {
  private state: CircuitBreakerState = {
    state: 'closed',
    failureCount: 0,
    lastFailureTime: 0,
    nextAttemptTime: 0,
  };

  private readonly failureThreshold = 5;
  private readonly recoveryTimeout = 60000; // 1 minute
  private readonly halfOpenMaxCalls = 3;
  private halfOpenCalls = 0;

  constructor(private readonly name: string) {}

  public async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state.state === 'open') {
      if (Date.now() < this.state.nextAttemptTime) {
        throw new NetworkError(`Circuit breaker '${this.name}' is open`, {
          hint: 'Service is temporarily unavailable. Please retry later.',
        });
      }
      this.setState('half-open');
      this.halfOpenCalls = 0;
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

  private onSuccess(): void {
    if (this.state.state === 'half-open') {
      this.halfOpenCalls++;
      if (this.halfOpenCalls >= this.halfOpenMaxCalls) {
        this.setState('closed');
      }
    } else {
      this.setState('closed');
    }
  }

  private onFailure(): void {
    this.state.failureCount++;
    this.state.lastFailureTime = Date.now();

    if (this.state.state === 'half-open') {
      this.setState('open');
    } else if (this.state.failureCount >= this.failureThreshold) {
      this.setState('open');
    }
  }

  private setState(newState: 'closed' | 'open' | 'half-open'): void {
    this.state.state = newState;
    
    if (newState === 'open') {
      this.state.nextAttemptTime = Date.now() + this.recoveryTimeout;
    } else if (newState === 'closed') {
      this.state.failureCount = 0;
      this.halfOpenCalls = 0;
    }
  }

  public getState(): string {
    return this.state.state;
  }
}

// ============================================================================
// Retry Logic with Jittered Exponential Backoff
// ============================================================================

class RetryHandler {
  constructor(private readonly config: RetryConfig) {}

  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    isRetryable: (error: any) => boolean,
    context: string
  ): Promise<T> {
    let lastError: any;
    const maxAttempts = this.config.maxAttempts || DEFAULT_CONFIG.retries.maxAttempts;

    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.calculateDelay(attempt);
          await this.sleep(delay);
        }

        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt === maxAttempts || !isRetryable(error)) {
          break;
        }

        // Add attempt count to error if it's a RateLimitError
        if (error instanceof RateLimitError) {
          (error as any).attemptCount = attempt + 1;
        }
      }
    }

    throw lastError;
  }

  private calculateDelay(attempt: number): number {
    const baseMs = this.config.baseMs || DEFAULT_CONFIG.retries.baseMs;
    const maxMs = this.config.maxMs || DEFAULT_CONFIG.retries.maxMs;
    const jitter = this.config.jitter !== false; // Default to true

    // Exponential backoff: base * 2^(attempt-1)
    const exponentialDelay = baseMs * Math.pow(2, attempt - 1);
    
    if (jitter) {
      // Full jitter: random between 0 and exponentialDelay
      return Math.min(Math.random() * exponentialDelay, maxMs);
    } else {
      return Math.min(exponentialDelay, maxMs);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// HTTP Transport Implementation
// ============================================================================

export class HttpTransport {
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryHandler: RetryHandler;
  private readonly config: Required<ClientConfig>;

  constructor(config: ClientConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      retries: {
        ...DEFAULT_CONFIG.retries,
        ...config.retries,
      },
    } as Required<ClientConfig>;

    this.circuitBreaker = new CircuitBreaker('http-transport');
    this.retryHandler = new RetryHandler(this.config.retries);
  }

  public async request<T>(
    method: string,
    path: string,
    body?: any,
    options: RequestOptions = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const requestId = this.generateRequestId();
    const idempotencyKey = options.idempotencyKey || this.generateIdempotencyKey();

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': this.config.userAgent,
      'X-API-Key': this.config.apiKey,
      'X-Request-ID': requestId,
      ...(options.idempotencyKey && { 'Idempotency-Key': idempotencyKey }),
      ...options.headers,
    };

    const isRetryable = this.createRetryPredicate(method);

    return this.circuitBreaker.execute(async () => {
      return this.retryHandler.executeWithRetry(
        async () => {
          const response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(options.timeout || this.config.timeoutMs),
          });

          if (!response.ok) {
            await this.handleHttpError(response, requestId, path, idempotencyKey);
          }

          return await response.json();
        },
        isRetryable,
        `${method} ${path}`
      );
    });
  }

  public async requestStream<T>(
    method: string,
    path: string,
    body?: any,
    options: RequestOptions = {}
  ): Promise<AsyncIterable<T>> {
    const url = `${this.config.baseUrl}${path}`;
    const requestId = this.generateRequestId();
    const idempotencyKey = options.idempotencyKey || this.generateIdempotencyKey();

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': this.config.userAgent,
      'X-API-Key': this.config.apiKey,
      'X-Request-ID': requestId,
      ...(options.idempotencyKey && { 'Idempotency-Key': idempotencyKey }),
      ...options.headers,
    };

    const isRetryable = this.createRetryPredicate(method);

    return this.circuitBreaker.execute(async () => {
      return this.retryHandler.executeWithRetry(
        async () => {
          const response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(options.timeout || this.config.timeoutMs),
          });

          if (!response.ok) {
            await this.handleHttpError(response, requestId, path, idempotencyKey);
          }

          return this.createAsyncIterator<T>(response);
        },
        isRetryable,
        `${method} ${path} (stream)`
      );
    });
  }

  private async createAsyncIterator<T>(
    response: Response
  ): Promise<AsyncIterable<T>> {
    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    return {
      async *[Symbol.asyncIterator]() {
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              if (line.trim()) {
                try {
                  const item = JSON.parse(line);
                  yield item;
                } catch (error) {
                  // Skip malformed JSON lines
                  continue;
                }
              }
            }
          }
          
          // Process any remaining buffer content
          if (buffer.trim()) {
            try {
              const item = JSON.parse(buffer);
              yield item;
            } catch (error) {
              // Skip malformed JSON
            }
          }
        } finally {
          reader.releaseLock();
        }
      },
    };
  }

  private createRetryPredicate(method: string): (error: any) => boolean {
    return (error: any) => {
      // Don't retry validation errors, auth errors, or conflicts
      if (error instanceof ValidationError || 
          error instanceof AuthError || 
          error instanceof ConflictError) {
        return false;
      }

      // Retry rate limit errors, server errors, and network errors
      if (error instanceof RateLimitError || 
          error instanceof ServerError || 
          error instanceof NetworkError) {
        return true;
      }

      // Retry specific HTTP status codes
      if (error.statusCode) {
        return [408, 429, 500, 502, 503, 504].includes(error.statusCode);
      }

      // Retry network-related errors
      if (error.code === 'ECONNRESET' || 
          error.code === 'ENOTFOUND' || 
          error.code === 'ECONNREFUSED' ||
          error.code === 'ETIMEDOUT') {
        return true;
      }

      return false;
    };
  }

  private async handleHttpError(
    response: Response,
    requestId: string,
    path: string,
    idempotencyKey?: string
  ): Promise<never> {
    let errorData: any;
    
    try {
      errorData = await response.json();
    } catch {
      errorData = {};
    }

    const message = errorData.detail || errorData.message || `HTTP ${response.status}`;
    const retryAfter = response.headers.get('Retry-After');
    const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;

    switch (response.status) {
      case 401:
        throw new AuthError(message, {
          requestId,
          endpoint: path,
          hint: errorData.hint,
        });

      case 403:
        throw new AuthError(message, {
          requestId,
          endpoint: path,
          hint: errorData.hint || 'Insufficient permissions for this operation',
        });

      case 409:
        throw new ConflictError(message, {
          requestId,
          idempotencyKey,
          endpoint: path,
          hint: errorData.hint,
        });

      case 422:
        throw new ValidationError(message, {
          requestId,
          endpoint: path,
          hint: errorData.hint,
        });

      case 429:
        throw new RateLimitError(message, {
          requestId,
          endpoint: path,
          retryAfter: retryAfterSeconds,
          hint: errorData.hint,
        });

      case 500:
      case 502:
      case 503:
      case 504:
        throw new ServerError(message, {
          requestId,
          endpoint: path,
          hint: errorData.hint,
        });

      default:
        throw new NetworkError(`HTTP ${response.status}: ${message}`, {
          requestId,
          endpoint: path,
          hint: errorData.hint,
        });
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateIdempotencyKey(): string {
    return randomUUID();
  }

  public getCircuitBreakerState(): string {
    return this.circuitBreaker.getState();
  }
}

// ============================================================================
// Telemetry (Optional OpenTelemetry Integration)
// ============================================================================

export class TelemetryManager {
  private enabled: boolean = false;
  private otelConfig?: any;

  constructor(config?: ClientConfig['telemetry']) {
    if (config?.enabled) {
      this.enabled = true;
      this.otelConfig = config.otel;
      // Initialize OpenTelemetry if available
      this.initializeOpenTelemetry();
    }
  }

  private initializeOpenTelemetry(): void {
    // This would initialize OpenTelemetry if the package is available
    // For now, we'll just log that telemetry is enabled
    if (this.enabled) {
      console.log('C2C SDK: Telemetry enabled');
    }
  }

  public createSpan(name: string, attributes?: Record<string, any>): any {
    if (!this.enabled) {
      return null;
    }

    // Return a no-op span if OpenTelemetry is not available
    return {
      setAttribute: () => {},
      setEvent: () => {},
      end: () => {},
    };
  }

  public recordMetric(name: string, value: number, attributes?: Record<string, any>): void {
    if (!this.enabled) {
      return;
    }

    // Record metric if OpenTelemetry is available
    console.log(`Metric: ${name} = ${value}`, attributes);
  }

  public isEnabled(): boolean {
    return this.enabled;
  }
}
