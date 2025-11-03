/**
 * Enhanced Health Monitor with Precise Failover Logic
 * 10-second probes, hedged requests, flap dampening
 */
export interface HealthMetrics {
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    successRate: number;
    errorClasses: Record<string, number>;
    lastProbeTime: Date;
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    status: 'green' | 'yellow' | 'red';
}
export interface SLAThresholds {
    maxLatencyMs: number;
    minSuccessRate: number;
    maxConsecutiveFailures: number;
    minConsecutiveSuccesses: number;
}
export declare class HealthMonitor {
    private providers;
    private metrics;
    private latencyHistory;
    private probeTimers;
    private readonly probeIntervalS;
    private readonly historySize;
    private readonly hedgeDelayMs;
    private readonly failbackConsecutiveGreens;
    private readonly redThresholdConsecutiveFailures;
    private readonly yellowThresholdLatencyMs;
    private readonly redThresholdLatencyMs;
    constructor(providers: string[]);
    /**
     * Record a provider request result
     */
    recordRequest(providerId: string, success: boolean, latencyMs: number, errorClass?: string): void;
    /**
     * Get current health status for provider
     */
    getHealth(providerId: string): HealthMetrics | null;
    /**
     * Check if provider is healthy for routing
     */
    isHealthy(providerId: string): boolean;
    /**
     * Get providers sorted by health and performance
     */
    getHealthyProviders(): string[];
    /**
     * Get routing decision with failover logic
     */
    getRoutingDecision(preferredOrder: string[]): {
        primary: string | null;
        secondary: string[];
        reason: string;
    };
    /**
     * Calculate hedged request timing
     */
    shouldHedge(providerId: string, elapsedMs: number): boolean;
    /**
     * Initialize metrics for all providers
     */
    private initializeMetrics;
    /**
     * Start periodic health probes
     */
    private startProbes;
    /**
     * Schedule next probe for provider
     */
    private scheduleProbe;
    /**
     * Perform synthetic health probe
     */
    private performProbe;
    /**
     * Recalculate metrics from history
     */
    private recalculateMetrics;
    /**
     * Determine health status based on metrics
     */
    private determineStatus;
    /**
     * Get SLO compliance status
     */
    getSLOStatus(providerId: string, sla: SLAThresholds): {
        compliant: boolean;
        violations: string[];
    };
    /**
     * Cleanup resources
     */
    shutdown(): void;
}
//# sourceMappingURL=health-monitor.d.ts.map