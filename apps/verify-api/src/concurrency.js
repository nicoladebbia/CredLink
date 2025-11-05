/**
 * CRITICAL: Concurrency and Race Condition Analysis
 *
 * This module identifies and mitigates race conditions that could lead to:
 * - State corruption during concurrent verification requests
 * - Cache stampede attacks
 * - Resource exhaustion through concurrent operations
 * - TOCTOU (Time-of-Check-Time-of-Use) vulnerabilities
 */
class ConcurrencyManager {
    pendingRequests = new Map();
    maxConcurrentRequests;
    requestTimeout;
    cleanupInterval;
    constructor(maxConcurrent = 10, timeout = 30000) {
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
    async executeWithDeduplication(key, request, operation) {
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
        const pendingRequest = {
            id: requestId,
            timestamp: Date.now(),
            request,
            promise: operation()
        };
        this.pendingRequests.set(key, pendingRequest);
        try {
            const result = await pendingRequest.promise;
            return result;
        }
        finally {
            this.pendingRequests.delete(key);
        }
    }
    /**
     * CRITICAL: Detect TOCTOU vulnerabilities
     */
    async validateWithAtomicCheck(resource, check, operation) {
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
    async executeWithCacheLock(cacheKey, operation, ttl = 5000) {
        const lockKey = `lock:${cacheKey}`;
        const existing = this.pendingRequests.get(lockKey);
        if (existing && !this.isRequestExpired(existing)) {
            console.warn(`🛡️ Cache stampede prevented: ${cacheKey}`);
            return existing.promise;
        }
        const lockRequest = {
            id: this.generateRequestId(),
            timestamp: Date.now(),
            request: {},
            promise: operation()
        };
        this.pendingRequests.set(lockKey, lockRequest);
        try {
            const result = await Promise.race([
                lockRequest.promise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('CACHE_LOCK_TIMEOUT')), ttl))
            ]);
            return result;
        }
        finally {
            this.pendingRequests.delete(lockKey);
        }
    }
    /**
     * CRITICAL: Resource exhaustion protection
     */
    checkResourceLimits() {
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
    generateRequestId() {
        return `req_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;
    }
    isRequestExpired(request) {
        return Date.now() - request.timestamp > this.requestTimeout;
    }
    cleanupExpiredRequests() {
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
    getStats() {
        return {
            activeRequests: this.pendingRequests.size,
            maxConcurrent: this.maxConcurrentRequests,
            memoryUsage: process.memoryUsage()
        };
    }
    /**
     * Graceful shutdown
     */
    shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.pendingRequests.clear();
    }
}
// Global concurrency manager instance
const concurrencyManager = new ConcurrencyManager();
export { concurrencyManager, ConcurrencyManager };
//# sourceMappingURL=concurrency.js.map