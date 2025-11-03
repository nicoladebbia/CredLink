/**
 * TSA Redundancy Service v1.1
 * Health-checked client with Durable Object queue and failover
 */
export interface TSASignRequest {
    imprint: Uint8Array;
    hashAlg: string;
    reqPolicy?: string;
    nonce?: bigint;
    tenant_id: string;
}
export interface TSASignResponse {
    success: boolean;
    tst?: Uint8Array;
    tsa_id?: string;
    policy_oid?: string;
    genTime?: Date;
    accuracy?: any;
    error?: string;
    retry_after?: number;
}
export interface ProviderHealth {
    providerId: string;
    healthy: boolean;
    lastCheck: Date;
    latencyMs: number;
    consecutiveFailures: number;
    lastError?: string;
}
export declare class TSAService {
    private adapters;
    private validator;
    private queue;
    private healthStatus;
    private readonly hedgeDelayMs;
    private readonly healthProbeIntervalS;
    private readonly failbackConsecutiveGreens;
    private healthCheckTimer?;
    constructor();
    /**
     * Main endpoint: /tsa/sign
     * Hot path with immediate routing and hedged requests
     */
    sign(request: TSASignRequest): Promise<TSASignResponse>;
    /**
     * Try providers with hedging and failover
     */
    private tryProvidersWithHedging;
    /**
     * Attempt to get timestamp from specific provider
     */
    private attemptProvider;
    /**
     * Determine routing order based on tenant policy and health
     */
    private determineRouting;
    /**
     * Initialize provider adapters
     */
    private initializeProviders;
    /**
     * Start periodic health checks
     */
    private startHealthChecks;
    /**
     * Perform health checks on all providers
     */
    private performHealthChecks;
    /**
     * Check health of specific provider
     */
    private checkProviderHealth;
    /**
     * Process queued requests
     */
    processQueue(): Promise<void>;
    /**
     * Get service status
     */
    getStatus(): {
        providers: Record<string, ProviderHealth>;
        queue: any;
        uptime: number;
    };
    /**
     * Generate unique request ID
     */
    private generateRequestId;
    /**
     * Get tenant policy (placeholder - would load from config/database)
     */
    private getTenantPolicy;
    /**
     * Cleanup resources
     */
    shutdown(): Promise<void>;
}
//# sourceMappingURL=tsa-service.d.ts.map