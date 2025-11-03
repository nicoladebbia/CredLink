/**
 * Enhanced Health Monitor with Precise Failover Logic
 * 10-second probes, hedged requests, flap dampening
 */
export class HealthMonitor {
    providers;
    metrics = new Map();
    latencyHistory = new Map();
    probeTimers = new Map();
    // Configuration
    probeIntervalS = 10;
    historySize = 100;
    hedgeDelayMs = 300;
    failbackConsecutiveGreens = 3;
    redThresholdConsecutiveFailures = 3;
    yellowThresholdLatencyMs = 1000;
    redThresholdLatencyMs = 2000;
    constructor(providers) {
        this.providers = providers;
        this.initializeMetrics();
        this.startProbes();
    }
    /**
     * Record a provider request result
     */
    recordRequest(providerId, success, latencyMs, errorClass) {
        const metrics = this.metrics.get(providerId);
        if (!metrics)
            return;
        // Update latency history
        const history = this.latencyHistory.get(providerId) || [];
        history.push(latencyMs);
        if (history.length > this.historySize) {
            history.shift();
        }
        this.latencyHistory.set(providerId, history);
        // Update counters
        if (success) {
            metrics.consecutiveSuccesses++;
            metrics.consecutiveFailures = 0;
        }
        else {
            metrics.consecutiveFailures++;
            metrics.consecutiveSuccesses = 0;
            if (errorClass) {
                metrics.errorClasses[errorClass] = (metrics.errorClasses[errorClass] || 0) + 1;
            }
        }
        // Recalculate metrics
        this.recalculateMetrics(providerId);
    }
    /**
     * Get current health status for provider
     */
    getHealth(providerId) {
        return this.metrics.get(providerId) || null;
    }
    /**
     * Check if provider is healthy for routing
     */
    isHealthy(providerId) {
        const metrics = this.metrics.get(providerId);
        if (!metrics)
            return false;
        return metrics.status === 'green';
    }
    /**
     * Get providers sorted by health and performance
     */
    getHealthyProviders() {
        return Array.from(this.metrics.entries())
            .filter(([_, metrics]) => this.isHealthy(_))
            .sort(([_, a], [__, b]) => {
            // Sort by status, then by latency, then by success rate
            const statusOrder = { green: 0, yellow: 1, red: 2 };
            const statusDiff = statusOrder[a.status] - statusOrder[b.status];
            if (statusDiff !== 0)
                return statusDiff;
            const latencyDiff = a.p95LatencyMs - b.p95LatencyMs;
            if (latencyDiff !== 0)
                return latencyDiff;
            return b.successRate - a.successRate;
        })
            .map(([providerId, _]) => providerId);
    }
    /**
     * Get routing decision with failover logic
     */
    getRoutingDecision(preferredOrder) {
        const healthy = this.getHealthyProviders();
        if (healthy.length === 0) {
            return {
                primary: null,
                secondary: [],
                reason: 'All providers unhealthy'
            };
        }
        // Find first healthy provider in preferred order
        let primary = null;
        const secondary = [];
        for (const providerId of preferredOrder) {
            if (healthy.includes(providerId)) {
                if (!primary) {
                    primary = providerId;
                }
                else {
                    secondary.push(providerId);
                }
            }
        }
        // Add any other healthy providers not in preferred order
        for (const providerId of healthy) {
            if (!preferredOrder.includes(providerId) && !secondary.includes(providerId)) {
                secondary.push(providerId);
            }
        }
        const reason = primary
            ? `Primary ${primary} available`
            : 'No preferred providers healthy, using alternatives';
        return { primary, secondary, reason };
    }
    /**
     * Calculate hedged request timing
     */
    shouldHedge(providerId, elapsedMs) {
        const metrics = this.metrics.get(providerId);
        if (!metrics)
            return true;
        // Hedge if elapsed time exceeds hedge delay or provider is showing degradation
        return elapsedMs > this.hedgeDelayMs ||
            metrics.status === 'yellow' ||
            metrics.p95LatencyMs > this.yellowThresholdLatencyMs;
    }
    /**
     * Initialize metrics for all providers
     */
    initializeMetrics() {
        for (const providerId of this.providers) {
            this.metrics.set(providerId, {
                p50LatencyMs: 0,
                p95LatencyMs: 0,
                p99LatencyMs: 0,
                successRate: 1.0,
                errorClasses: {},
                lastProbeTime: new Date(),
                consecutiveFailures: 0,
                consecutiveSuccesses: 0,
                status: 'yellow' // Start with yellow until first probe
            });
            this.latencyHistory.set(providerId, []);
        }
    }
    /**
     * Start periodic health probes
     */
    startProbes() {
        for (const providerId of this.providers) {
            this.scheduleProbe(providerId);
        }
    }
    /**
     * Schedule next probe for provider
     */
    scheduleProbe(providerId) {
        const timer = setTimeout(async () => {
            await this.performProbe(providerId);
            this.scheduleProbe(providerId); // Schedule next probe
        }, this.probeIntervalS * 1000);
        this.probeTimers.set(providerId, timer);
    }
    /**
     * Perform synthetic health probe
     */
    async performProbe(providerId) {
        const startTime = Date.now();
        let success = false;
        let errorClass;
        try {
            // TODO: Implement actual synthetic TSA request
            // For now, simulate probe with random success/failure
            const simulatedLatency = Math.random() * 1500; // 0-1500ms
            const simulatedSuccess = Math.random() > 0.05; // 95% success rate
            await new Promise(resolve => setTimeout(resolve, simulatedLatency));
            success = simulatedSuccess;
            if (!success) {
                errorClass = Math.random() > 0.5 ? 'timeNotAvailable' : 'systemFailure';
            }
        }
        catch (error) {
            success = false;
            errorClass = 'connectionFailure';
        }
        const latencyMs = Date.now() - startTime;
        this.recordRequest(providerId, success, latencyMs, errorClass);
    }
    /**
     * Recalculate metrics from history
     */
    recalculateMetrics(providerId) {
        const metrics = this.metrics.get(providerId);
        const history = this.latencyHistory.get(providerId);
        if (!metrics || !history || history.length === 0)
            return;
        // Calculate percentiles
        const sorted = [...history].sort((a, b) => a - b);
        metrics.p50LatencyMs = sorted[Math.floor(sorted.length * 0.5)];
        metrics.p95LatencyMs = sorted[Math.floor(sorted.length * 0.95)];
        metrics.p99LatencyMs = sorted[Math.floor(sorted.length * 0.99)];
        // Calculate success rate from recent history
        const recentHistory = history.slice(-20); // Last 20 requests
        const recentSuccess = recentHistory.length - metrics.consecutiveFailures;
        metrics.successRate = recentHistory.length > 0 ? recentSuccess / recentHistory.length : 0;
        // Determine status
        metrics.status = this.determineStatus(metrics);
        metrics.lastProbeTime = new Date();
    }
    /**
     * Determine health status based on metrics
     */
    determineStatus(metrics) {
        // Red status conditions
        if (metrics.consecutiveFailures >= this.redThresholdConsecutiveFailures) {
            return 'red';
        }
        if (metrics.p95LatencyMs > this.redThresholdLatencyMs) {
            return 'red';
        }
        if (metrics.successRate < 0.9) { // Less than 90% success rate
            return 'red';
        }
        // Check for critical error classes
        const criticalErrors = ['timeNotAvailable', 'systemFailure'];
        const hasCriticalErrors = Object.entries(metrics.errorClasses)
            .some(([errorClass, count]) => criticalErrors.includes(errorClass) && count >= 3);
        if (hasCriticalErrors) {
            return 'red';
        }
        // Yellow status conditions
        if (metrics.consecutiveFailures > 0) {
            return 'yellow';
        }
        if (metrics.p95LatencyMs > this.yellowThresholdLatencyMs) {
            return 'yellow';
        }
        if (metrics.successRate < 0.95) { // Less than 95% success rate
            return 'yellow';
        }
        // Green status
        if (metrics.consecutiveSuccesses >= this.failbackConsecutiveGreens) {
            return 'green';
        }
        return metrics.status; // Keep current status if no change needed
    }
    /**
     * Get SLO compliance status
     */
    getSLOStatus(providerId, sla) {
        const metrics = this.metrics.get(providerId);
        if (!metrics) {
            return {
                compliant: false,
                violations: ['No metrics available']
            };
        }
        const violations = [];
        if (metrics.p95LatencyMs > sla.maxLatencyMs) {
            violations.push(`P95 latency ${metrics.p95LatencyMs}ms exceeds threshold ${sla.maxLatencyMs}ms`);
        }
        if (metrics.successRate < sla.minSuccessRate) {
            violations.push(`Success rate ${(metrics.successRate * 100).toFixed(2)}% below threshold ${(sla.minSuccessRate * 100).toFixed(2)}%`);
        }
        if (metrics.consecutiveFailures > sla.maxConsecutiveFailures) {
            violations.push(`Consecutive failures ${metrics.consecutiveFailures} exceed threshold ${sla.maxConsecutiveFailures}`);
        }
        return {
            compliant: violations.length === 0,
            violations
        };
    }
    /**
     * Cleanup resources
     */
    shutdown() {
        for (const timer of this.probeTimers.values()) {
            clearTimeout(timer);
        }
        this.probeTimers.clear();
    }
}
//# sourceMappingURL=health-monitor.js.map