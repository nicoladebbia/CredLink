/**
 * Cloudflare Durable Object Queue for TSA Requests
 * Strong consistency, FIFO ordering, bounded parallelism
 */
export interface QueuedTSARequest {
    id: string;
    tenant_id: string;
    imprint: Uint8Array;
    hashAlg: string;
    reqPolicy?: string;
    nonce?: bigint;
    timestamp: number;
    retryCount: number;
    maxRetries: number;
}
export interface QueueStats {
    size: number;
    processingCount: number;
    completedCount: number;
    failedCount: number;
}
export declare class TSAQueue {
    private queue;
    private processing;
    private completed;
    private failed;
    private readonly maxConcurrent;
    private readonly maxQueueSize;
    /**
     * Add request to queue
     */
    enqueue(request: QueuedTSARequest): Promise<{
        accepted: boolean;
        reason?: string;
    }>;
    /**
     * Get next request from queue (FIFO)
     */
    dequeue(): Promise<QueuedTSARequest | null>;
    /**
     * Mark request as completed successfully
     */
    complete(requestId: string): Promise<void>;
    /**
     * Mark request as failed and optionally requeue
     */
    fail(requestId: string, requeue?: boolean): Promise<void>;
    /**
     * Get queue statistics
     */
    getStats(): QueueStats;
    /**
     * Clear completed and failed requests (cleanup)
     */
    cleanup(): Promise<void>;
    /**
     * Drain queue to specified limit
     */
    drain(limit?: number): Promise<QueuedTSARequest[]>;
    /**
     * Get estimated time to drain all requests
     */
    getDrainETA(rps?: number): number;
    /**
     * Find request by ID in any state
     */
    private findRequestById;
    /**
     * Get queue health metrics
     */
    getHealthMetrics(): {
        queueDepth: number;
        processingRate: number;
        errorRate: number;
        avgWaitTime: number;
    };
}
//# sourceMappingURL=tsa-queue.d.ts.map