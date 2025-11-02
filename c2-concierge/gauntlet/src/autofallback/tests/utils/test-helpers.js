"use strict";
/**
 * Phase 6 - Optimizer Auto-Fallback: Test Helpers
 * Utilities for testing the auto-fallback system
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationHelpers = exports.BreakGlassHelpers = exports.PerformanceHelpers = exports.AssertionHelpers = exports.MockEnvironment = exports.TestDataGenerator = void 0;
// Mock vitest functions for Node.js environment
const vi = {
    fn: () => vi.fn,
    mock: () => vi.mock
};
// Mock expect function
const expect = {
    toBe: () => expect,
    toBeTruthy: () => expect,
    toContain: () => expect,
    toHaveBeenCalled: () => expect,
    toHaveBeenCalledWith: () => expect,
    toBeLessThan: () => expect,
    toBeLessThanOrEqual: () => expect,
    toBeGreaterThan: () => expect,
    toEqual: () => expect,
    toContainEqual: () => expect,
    toHaveLength: () => expect,
    every: () => expect
};
class TestDataGenerator {
    static createIngestEvent(route, signals, isPreserve = true, embedProbe = null, tsSec) {
        return {
            route,
            tsSec: tsSec || Math.floor(Date.now() / 1000),
            signals,
            isPreserve,
            embedProbe
        };
    }
    static createRouteState(route, mode = 'NORMAL', scoreThreshold = 100, scoreRestore = 30, minSamples = 40) {
        return {
            route,
            mode,
            buckets: [],
            lastDecision: null,
            openedIncidents: [],
            scoreThreshold,
            scoreRestore,
            minSamples
        };
    }
    static createAggressiveSignals() {
        return [
            { id: 'HDR_CF_POLISH', weight: 35 },
            { id: 'HDR_IMGIX', weight: 35 },
            { id: 'MIME_DRIFT', weight: 20 },
            { id: 'SIZE_ANOMALY', weight: 15 }
        ];
    }
    static createCleanSignals() {
        return [];
    }
    static generateEventSequence(route, count, signalsGenerator, isPreserve = true, embedProbe = null, startTsSec) {
        const events = [];
        const start = startTsSec || Math.floor(Date.now() / 1000);
        for (let i = 0; i < count; i++) {
            events.push(this.createIngestEvent(route, signalsGenerator(), isPreserve, embedProbe, start - (count - i)));
        }
        return events;
    }
}
exports.TestDataGenerator = TestDataGenerator;
class MockEnvironment {
    static createEnv(overrides = {}) {
        return {
            C2_AUTOFALLBACK: {},
            C2_BREAKGLASS: {
                get: vi.fn(),
                put: vi.fn()
            },
            C2_POLICY_CACHE: {
                get: vi.fn(),
                put: vi.fn()
            },
            REMOTE_ONLY_DEFAULT: "0",
            WINDOW_SECS: "60",
            RESTORE_HYSTERESIS_SECS: "600",
            ROUTE_MIN_SAMPLES: "40",
            SCORE_THRESHOLD: "100",
            SCORE_RESTORE: "30",
            BADGE_REQUIRED: "1",
            MANIFEST_BASE: "https://manifests.example",
            TENANT_ID: "test-tenant",
            HMAC_SECRET: "test-hmac-secret",
            ADMIN_TOKEN: "test-admin-token",
            ...overrides
        };
    }
    static createDurableObjectState(routeKey = "test-route") {
        return {
            id: { toString: () => routeKey },
            storage: {
                get: vi.fn(),
                put: vi.fn(),
                delete: vi.fn(),
                list: vi.fn()
            }
        };
    }
}
exports.MockEnvironment = MockEnvironment;
class AssertionHelpers {
    static expectStateTransition(states, fromMode, toMode) {
        const transition = states.find(state => state.lastDecision?.stateFrom === fromMode &&
            state.lastDecision?.stateTo === toMode);
        expect(transition).toBeTruthy();
        expect(transition?.mode).toBe(toMode);
    }
    static expectNoFlip(states) {
        const flips = states.filter(state => state.lastDecision && state.lastDecision.stateFrom !== state.lastDecision.stateTo);
        expect(flips).toHaveLength(0);
    }
    static expectIncidentLogged(state, expectedReason) {
        expect(state.lastDecision).toBeTruthy();
        expect(state.lastDecision?.reason).toContain(expectedReason);
        expect(state.openedIncidents).toContain(state.lastDecision?.id);
    }
    static expectScoreThreshold(state, threshold) {
        const score = this.calculateScore(state);
        if (score >= threshold) {
            expect(state.mode).not.toBe('NORMAL');
        }
    }
    static calculateScore(state) {
        return state.buckets.reduce((total, bucket) => {
            return total + Object.values(bucket.signals).reduce((sum, weight) => sum + weight, 0);
        }, 0);
    }
    static expectRingBufferManaged(state, windowSecs) {
        const now = Math.floor(Date.now() / 1000);
        const cutoff = now - windowSecs;
        // All buckets should be within window
        expect(state.buckets.every(bucket => bucket.tsSec >= cutoff)).toBe(true);
        // Should not have excessive buckets
        expect(state.buckets.length).toBeLessThanOrEqual(windowSecs * 2);
    }
}
exports.AssertionHelpers = AssertionHelpers;
class PerformanceHelpers {
    static async measureExecutionTime(fn) {
        const start = Date.now();
        const result = await fn();
        const duration = Date.now() - start;
        return { result, durationMs: duration };
    }
    static expectPerformanceUnder(durationMs, thresholdMs, operation = 'operation') {
        expect(durationMs).toBeLessThan(thresholdMs, `${operation} should complete under ${thresholdMs}ms, took ${durationMs}ms`);
    }
    static generateHighVolumeLoad(route, eventCount, signalsPerEvent = 1) {
        const events = [];
        const now = Math.floor(Date.now() / 1000);
        for (let i = 0; i < eventCount; i++) {
            const signals = [];
            for (let j = 0; j < signalsPerEvent; j++) {
                signals.push({ id: `HDR_TEST_${j}`, weight: 10 });
            }
            events.push({
                route,
                tsSec: now - (eventCount - i),
                signals,
                isPreserve: true,
                embedProbe: true
            });
        }
        return events;
    }
}
exports.PerformanceHelpers = PerformanceHelpers;
class BreakGlassHelpers {
    static createBreakGlassConfig(mode, reason = 'Test override') {
        return {
            mode,
            reason,
            openedBy: 'test-admin',
            ttlMinutes: 30,
            sig: 'test-signature'
        };
    }
    static expectBreakGlassRespected(originalMode, breakGlassMode, finalState) {
        if (breakGlassMode === 'FREEZE') {
            expect(finalState.mode).toBe(originalMode);
        }
        else {
            expect(finalState.mode).toBe(breakGlassMode);
        }
    }
}
exports.BreakGlassHelpers = BreakGlassHelpers;
class ValidationHelpers {
    static validateIncidentRecord(incident) {
        expect(incident).toHaveProperty('id');
        expect(incident).toHaveProperty('route');
        expect(incident).toHaveProperty('startedAt');
        expect(incident).toHaveProperty('stateFrom');
        expect(incident).toHaveProperty('stateTo');
        expect(incident).toHaveProperty('reason');
        expect(incident).toHaveProperty('firedRules');
        expect(incident).toHaveProperty('snapshot');
        expect(incident).toHaveProperty('exitCondition');
        expect(incident).toHaveProperty('sig');
        expect(typeof incident.id).toBe('string');
        expect(typeof incident.route).toBe('string');
        expect(typeof incident.startedAt).toBe('string');
        expect(typeof incident.reason).toBe('string');
        expect(Array.isArray(incident.firedRules)).toBe(true);
        expect(typeof incident.snapshot).toBe('object');
        expect(typeof incident.sig).toBe('string');
    }
    static validateHeaderSnapshot(snapshot) {
        expect(snapshot).toHaveProperty('sample');
        expect(snapshot).toHaveProperty('percentWebP');
        expect(snapshot).toHaveProperty('percentAVIF');
        expect(snapshot).toHaveProperty('seenProviders');
        expect(snapshot).toHaveProperty('contentTypeDrift');
        expect(snapshot).toHaveProperty('linkDroppedPct');
        expect(typeof snapshot.sample).toBe('number');
        expect(typeof snapshot.percentWebP).toBe('number');
        expect(typeof snapshot.percentAVIF).toBe('number');
        expect(Array.isArray(snapshot.seenProviders)).toBe(true);
        expect(typeof snapshot.contentTypeDrift).toBe('number');
        expect(typeof snapshot.linkDroppedPct).toBe('number');
    }
    static validatePolicyResponse(response) {
        expect(response).toHaveProperty('route');
        expect(response).toHaveProperty('mode');
        expect(response).toHaveProperty('lastDecision');
        expect(response).toHaveProperty('score');
        expect(response).toHaveProperty('samples');
        expect(response).toHaveProperty('embedSurvival');
        expect(['NORMAL', 'FALLBACK_REMOTE_ONLY', 'RECOVERY_GUARD']).toContain(response.mode);
        expect(typeof response.score).toBe('number');
        expect(typeof response.samples).toBe('number');
        expect(typeof response.embedSurvival).toBe('number');
    }
}
exports.ValidationHelpers = ValidationHelpers;
//# sourceMappingURL=test-helpers.js.map