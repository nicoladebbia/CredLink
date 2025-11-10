/**
 * CRITICAL: Concurrency and Race Condition Analysis
 * 
 * This module identifies and mitigates race conditions that could lead to:
 * - State corruption during concurrent verification requests
 * - Cache stampede attacks
 * - Resource exhaustion through concurrent operations
 * - TOCTOU (Time-of-Check-Time-of-Use) vulnerabilities
 */

import { VerificationRequest } from './types.js';

interface PendingRequest {
  id: string;
  timestamp: number;
  request: VerificationRequest;
  promise: Promise<any>;
}

class ConcurrencyManager {
  private pendingRequests = new Map<string, PendingRequest>();
  private readonly maxConcurrentRequests: number;
  private readonly requestTimeout: number;
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(maxConcurrent: number = 10, timeout: number = 30000) {
    this.maxConcurrentRequests = maxConcurrent;
    this.requestTimeout = timeout;
    
    // Clean up expired requests every 10 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredRequests();
    }, 10000);
  }

  /**
   * CRITICAL: Prevent race conditions through request deduplication
   */
  async executeWithDeduplication<T>(
    key: string, 
    request: VerificationRequest,
    operation: () => Promise<T>
  ): Promise<T> {
    // Check if identical request is already pending
    const existing = this.pendingRequests.get(key);
    if (existing && !this.isRequestExpired(existing)) {
      console.warn(`🔄 Race condition prevented: Duplicate request ${key}`);
      return existing.promise;
    }

    // Check concurrent request limit
    if (this.pendingRequests.size >= this.maxConcurrentRequests) {
      throw new Error('CONCURRENT_LIMIT_EXCEEDED: Too many simultaneous requests');
    }

    // Create new pending request
    const requestId = this.generateRequestId();
    const pendingRequest: PendingRequest = {
      id: requestId,
      timestamp: Date.now(),
      request,
      promise: operation()
    };

    this.pendingRequests.set(key, pendingRequest);

    try {
      const result = await pendingRequest.promise;
      return result;
    } finally {
      this.pendingRequests.delete(key);
    }
  }

  /**
   * CRITICAL: Detect TOCTOU vulnerabilities
   */
  async validateWithAtomicCheck<T>(
    resource: string,
    check: () => Promise<boolean>,
    operation: () => Promise<T>
  ): Promise<T> {
    // Perform check and operation atomically to prevent TOCTOU
    const isValid = await check();
    if (!isValid) {
      throw new Error(`RESOURCE_INVALID: ${resource} failed validation`);
    }

    // Double-check after operation to detect race conditions
    const result = await operation();
    const stillValid = await check();
    
    if (!stillValid) {
      throw new Error(`TOCTOU_DETECTED: ${resource} changed during operation`);
    }

    return result;
  }

  /**
   * CRITICAL: Prevent cache stampede attacks
   */
  async executeWithCacheLock<T>(
    cacheKey: string,
    operation: () => Promise<T>,
    ttl: number = 5000
  ): Promise<T> {
    const lockKey = `lock:${cacheKey}`;
    const existing = this.pendingRequests.get(lockKey);

    if (existing && !this.isRequestExpired(existing)) {
      console.warn(`🛡️ Cache stampede prevented: ${cacheKey}`);
      return existing.promise;
    }

    const lockRequest: PendingRequest = {
      id: this.generateRequestId(),
      timestamp: Date.now(),
      request: {} as VerificationRequest,
      promise: operation()
    };

    this.pendingRequests.set(lockKey, lockRequest);

    try {
      const result = await Promise.race([
        lockRequest.promise,
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('CACHE_LOCK_TIMEOUT')), ttl)
        )
      ]);
      return result;
    } finally {
      this.pendingRequests.delete(lockKey);
    }
  }

  /**
   * CRITICAL: Resource exhaustion protection
   */
  checkResourceLimits(): void {
    const activeRequests = this.pendingRequests.size;
    const memoryUsage = process.memoryUsage();
    
    if (activeRequests > this.maxConcurrentRequests * 0.8) {
      console.warn(`⚠️ High concurrent request count: ${activeRequests}`);
    }

    if (memoryUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
      console.warn(`⚠️ High memory usage: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`);
      
      // Force cleanup if memory is high
      if (activeRequests > this.maxConcurrentRequests / 2) {
        this.cleanupExpiredRequests();
      }
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private isRequestExpired(request: PendingRequest): boolean {
    return Date.now() - request.timestamp > this.requestTimeout;
  }

  private cleanupExpiredRequests(): void {
    const now = Date.now();
    for (const [key, request] of this.pendingRequests.entries()) {
      if (now - request.timestamp > this.requestTimeout) {
        this.pendingRequests.delete(key);
        console.warn(`🧹 Cleaned up expired request: ${key}`);
      }
    }
  }

  /**
   * Get current concurrency statistics
   */
  getStats(): {
    activeRequests: number;
    maxConcurrent: number;
    memoryUsage: NodeJS.MemoryUsage;
  } {
    return {
      activeRequests: this.pendingRequests.size,
      maxConcurrent: this.maxConcurrentRequests,
      memoryUsage: process.memoryUsage()
    };
  }

  /**
   * Graceful shutdown
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.pendingRequests.clear();
  }
}

// Global concurrency manager instance
const concurrencyManager = new ConcurrencyManager();

export { concurrencyManager, ConcurrencyManager };
export type { PendingRequest };
