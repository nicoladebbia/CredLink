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
declare class ConcurrencyManager {
    private pendingRequests;
    private readonly maxConcurrentRequests;
    private readonly requestTimeout;
    private readonly cleanupInterval;
    constructor(maxConcurrent?: number, timeout?: number);
    /**
     * CRITICAL: Prevent race conditions through request deduplication
     */
    executeWithDeduplication<T>(key: string, request: VerificationRequest, operation: () => Promise<T>): Promise<T>;
    /**
     * CRITICAL: Detect TOCTOU vulnerabilities
     */
    validateWithAtomicCheck<T>(resource: string, check: () => Promise<boolean>, operation: () => Promise<T>): Promise<T>;
    /**
     * CRITICAL: Prevent cache stampede attacks
     */
    executeWithCacheLock<T>(cacheKey: string, operation: () => Promise<T>, ttl?: number): Promise<T>;
    /**
     * CRITICAL: Resource exhaustion protection
     */
    checkResourceLimits(): void;
    private generateRequestId;
    private isRequestExpired;
    private cleanupExpiredRequests;
    /**
     * Get current concurrency statistics
     */
    getStats(): {
        activeRequests: number;
        maxConcurrent: number;
        memoryUsage: NodeJS.MemoryUsage;
    };
    /**
     * Graceful shutdown
     */
    shutdown(): void;
}
declare const concurrencyManager: ConcurrencyManager;
export { concurrencyManager, ConcurrencyManager };
export type { PendingRequest };
//# sourceMappingURL=concurrency.d.ts.map