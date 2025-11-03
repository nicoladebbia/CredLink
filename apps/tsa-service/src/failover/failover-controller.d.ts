/**
 * Failover Controller with Precise Routing Logic
 * Handles provider selection, hedged requests, and flap dampening
 */
import { HealthMonitor } from '../health/health-monitor.js';
import { TSAProviderAdapter } from '../providers/provider-adapter.js';
import { TimeStampRequest, TimeStampResponse } from '../types/rfc3161.js';
export interface FailoverConfig {
    hedgeDelayMs: number;
    maxConcurrentRequests: number;
    requestTimeoutMs: number;
    enableFlapDampening: boolean;
    failbackConsecutiveGreens: number;
}
export interface RequestResult {
    success: boolean;
    providerId: string;
    response?: TimeStampResponse;
    error?: string;
    latencyMs: number;
    wasHedged: boolean;
}
export declare class FailoverController {
    private healthMonitor;
    private adapters;
    private config;
    private activeRequests;
    constructor(healthMonitor: HealthMonitor, adapters: Map<string, TSAProviderAdapter>, config: FailoverConfig);
    /**
     * Execute request with failover and hedging
     */
    executeRequest(requestId: string, request: TimeStampRequest, preferredProviders: string[]): Promise<RequestResult>;
    /**
     * Execute single request to specific provider
     */
    private executeSingleRequest;
    /**
     * Cancel request and all its hedged variants
     */
    private cancelRequest;
    /**
     * Classify error type for health monitoring
     */
    private classifyError;
    /**
     * Get current failover status
     */
    getFailoverStatus(): {
        activeRequests: number;
        routingDecisions: Record<string, {
            primary: string | null;
            secondary: string[];
            reason: string;
        }>;
        providerHealth: Record<string, {
            status: string;
            p95Latency: number;
            successRate: number;
        }>;
    };
    /**
     * Check if provider should be failed back
     */
    shouldFailback(providerId: string): boolean;
    /**
     * Force failover to specific provider (for testing)
     */
    forceFailover(providerId: string, request: TimeStampRequest): Promise<RequestResult>;
    /**
     * Get failover statistics
     */
    getStatistics(): {
        totalRequests: number;
        hedgedRequests: number;
        failedOverRequests: number;
        averageFailoverTime: number;
        providerUtilization: Record<string, number>;
    };
    /**
     * Cleanup resources
     */
    shutdown(): void;
}
//# sourceMappingURL=failover-controller.d.ts.map