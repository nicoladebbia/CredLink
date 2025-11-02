#!/usr/bin/env node
/**
 * Phase 6 - Optimizer Auto-Fallback: Restore Test Script
 * Tests system recovery after removing strip-risk transforms
 */
interface RestoreTestConfig {
    endpoint: string;
    route: string;
    requestRate: number;
    hysteresisPeriod: number;
    monitoringDuration: number;
}
interface RestoreTestResult {
    config: RestoreTestConfig;
    startTime: string;
    endTime: string;
    restoreDetected: boolean;
    restoreTime?: number;
    policyHistory: Array<{
        timestamp: string;
        mode: string;
        score: number;
        embedSurvival: number;
    }>;
    errors: string[];
}
declare class RestoreTest {
    private config;
    private results;
    constructor(config: RestoreTestConfig);
    runTest(): Promise<RestoreTestResult>;
    private generateCleanTraffic;
    private sendCleanRequest;
    private startPolicyMonitoring;
    private saveResults;
}
export { RestoreTest, RestoreTestConfig, RestoreTestResult };
//# sourceMappingURL=restore-test.d.ts.map