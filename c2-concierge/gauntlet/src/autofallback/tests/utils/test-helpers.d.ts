/**
 * Phase 6 - Optimizer Auto-Fallback: Test Helpers
 * Utilities for testing the auto-fallback system
 */
import { RouteState, IngestEvent, Signal } from '../../types';
export declare class TestDataGenerator {
    static createIngestEvent(route: string, signals: Signal[], isPreserve?: boolean, embedProbe?: boolean | null, tsSec?: number): IngestEvent;
    static createRouteState(route: string, mode?: RouteState['mode'], scoreThreshold?: number, scoreRestore?: number, minSamples?: number): RouteState;
    static createAggressiveSignals(): Signal[];
    static createCleanSignals(): Signal[];
    static generateEventSequence(route: string, count: number, signalsGenerator: () => Signal[], isPreserve?: boolean, embedProbe?: boolean | null, startTsSec?: number): IngestEvent[];
}
export declare class MockEnvironment {
    static createEnv(overrides?: Partial<any>): any;
    static createDurableObjectState(routeKey?: string): any;
}
export declare class AssertionHelpers {
    static expectStateTransition(states: RouteState[], fromMode: RouteState['mode'], toMode: RouteState['mode']): void;
    static expectNoFlip(states: RouteState[]): void;
    static expectIncidentLogged(state: RouteState, expectedReason: string): void;
    static expectScoreThreshold(state: RouteState, threshold: number): void;
    static calculateScore(state: RouteState): number;
    static expectRingBufferManaged(state: RouteState, windowSecs: number): void;
}
export declare class PerformanceHelpers {
    static measureExecutionTime<T>(fn: () => Promise<T>): Promise<{
        result: T;
        durationMs: number;
    }>;
    static expectPerformanceUnder(durationMs: number, thresholdMs: number, operation?: string): void;
    static generateHighVolumeLoad(route: string, eventCount: number, signalsPerEvent?: number): IngestEvent[];
}
export declare class BreakGlassHelpers {
    static createBreakGlassConfig(mode: 'NORMAL' | 'FALLBACK_REMOTE_ONLY' | 'FREEZE', reason?: string): any;
    static expectBreakGlassRespected(originalMode: RouteState['mode'], breakGlassMode: 'NORMAL' | 'FALLBACK_REMOTE_ONLY' | 'FREEZE', finalState: RouteState): void;
}
export declare class ValidationHelpers {
    static validateIncidentRecord(incident: any): void;
    static validateHeaderSnapshot(snapshot: any): void;
    static validatePolicyResponse(response: any): void;
}
//# sourceMappingURL=test-helpers.d.ts.map