#!/usr/bin/env node
/**
 * Phase 6 - Optimizer Auto-Fallback: Sandbox Drill Script
 * Simulates strip-happy CDN behavior to trigger auto-fallback
 */
interface DrillConfig {
    endpoint: string;
    route: string;
    requestRate: number;
    duration: number;
    aggressiveTransform: boolean;
    expectedFlipTime: number;
}
interface DrillResult {
    config: DrillConfig;
    startTime: string;
    endTime: string;
    totalRequests: number;
    successfulRequests: number;
    flipDetected: boolean;
    flipTime?: number;
    flipResponse?: any;
    errors: string[];
}
declare class AutoFallbackDrill {
    private config;
    private results;
    constructor(config: DrillConfig);
    runDrill(): Promise<DrillResult>;
    private generateLoad;
    private sendRequest;
    private startPolicyMonitoring;
    private saveResults;
}
export { AutoFallbackDrill, DrillConfig, DrillResult };
//# sourceMappingURL=sandbox-drill.d.ts.map