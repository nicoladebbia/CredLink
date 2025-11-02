/**
 * Phase 6 - Optimizer Auto-Fallback: Test Helpers
 * Utilities for testing the auto-fallback system
 */

import { RouteState, IngestEvent, Signal } from '../../types';

// Mock vitest functions for Node.js environment
const vi = {
  fn: () => vi.fn,
  mock: () => vi.mock
} as any;

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
} as any;

export class TestDataGenerator {
  static createIngestEvent(
    route: string,
    signals: Signal[],
    isPreserve: boolean = true,
    embedProbe: boolean | null = null,
    tsSec?: number
  ): IngestEvent {
    return {
      route,
      tsSec: tsSec || Math.floor(Date.now() / 1000),
      signals,
      isPreserve,
      embedProbe
    };
  }

  static createRouteState(
    route: string,
    mode: RouteState['mode'] = 'NORMAL',
    scoreThreshold: number = 100,
    scoreRestore: number = 30,
    minSamples: number = 40
  ): RouteState {
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

  static createAggressiveSignals(): Signal[] {
    return [
      { id: 'HDR_CF_POLISH', weight: 35 },
      { id: 'HDR_IMGIX', weight: 35 },
      { id: 'MIME_DRIFT', weight: 20 },
      { id: 'SIZE_ANOMALY', weight: 15 }
    ];
  }

  static createCleanSignals(): Signal[] {
    return [];
  }

  static generateEventSequence(
    route: string,
    count: number,
    signalsGenerator: () => Signal[],
    isPreserve: boolean = true,
    embedProbe: boolean | null = null,
    startTsSec?: number
  ): IngestEvent[] {
    const events: IngestEvent[] = [];
    const start = startTsSec || Math.floor(Date.now() / 1000);
    
    for (let i = 0; i < count; i++) {
      events.push(this.createIngestEvent(
        route,
        signalsGenerator(),
        isPreserve,
        embedProbe,
        start - (count - i)
      ));
    }
    
    return events;
  }
}

export class MockEnvironment {
  static createEnv(overrides: Partial<any> = {}): any {
    return {
      C2_AUTOFALLBACK: {} as any,
      C2_BREAKGLASS: {
        get: vi.fn(),
        put: vi.fn()
      } as any,
      C2_POLICY_CACHE: {
        get: vi.fn(),
        put: vi.fn()
      } as any,
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

  static createDurableObjectState(routeKey: string = "test-route"): any {
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

export class AssertionHelpers {
  static expectStateTransition(
    states: RouteState[],
    fromMode: RouteState['mode'],
    toMode: RouteState['mode']
  ): void {
    const transition = states.find(state => 
      state.lastDecision?.stateFrom === fromMode &&
      state.lastDecision?.stateTo === toMode
    );
    
    expect(transition).toBeTruthy();
    expect(transition?.mode).toBe(toMode);
  }

  static expectNoFlip(states: RouteState[]): void {
    const flips = states.filter(state => 
      state.lastDecision && state.lastDecision.stateFrom !== state.lastDecision.stateTo
    );
    
    expect(flips).toHaveLength(0);
  }

  static expectIncidentLogged(state: RouteState, expectedReason: string): void {
    expect(state.lastDecision).toBeTruthy();
    expect(state.lastDecision?.reason).toContain(expectedReason);
    expect(state.openedIncidents).toContain(state.lastDecision?.id);
  }

  static expectScoreThreshold(state: RouteState, threshold: number): void {
    const score = this.calculateScore(state);
    if (score >= threshold) {
      expect(state.mode).not.toBe('NORMAL');
    }
  }

  static calculateScore(state: RouteState): number {
    return state.buckets.reduce((total, bucket) => {
      return total + Object.values(bucket.signals).reduce((sum, weight) => sum + weight, 0);
    }, 0);
  }

  static expectRingBufferManaged(state: RouteState, windowSecs: number): void {
    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - windowSecs;
    
    // All buckets should be within window
    expect(state.buckets.every(bucket => bucket.tsSec >= cutoff)).toBe(true);
    
    // Should not have excessive buckets
    expect(state.buckets.length).toBeLessThanOrEqual(windowSecs * 2);
  }
}

export class PerformanceHelpers {
  static async measureExecutionTime<T>(
    fn: () => Promise<T>
  ): Promise<{ result: T; durationMs: number }> {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    
    return { result, durationMs: duration };
  }

  static expectPerformanceUnder(
    durationMs: number,
    thresholdMs: number,
    operation: string = 'operation'
  ): void {
    expect(durationMs).toBeLessThan(
      thresholdMs,
      `${operation} should complete under ${thresholdMs}ms, took ${durationMs}ms`
    );
  }

  static generateHighVolumeLoad(
    route: string,
    eventCount: number,
    signalsPerEvent: number = 1
  ): IngestEvent[] {
    const events: IngestEvent[] = [];
    const now = Math.floor(Date.now() / 1000);
    
    for (let i = 0; i < eventCount; i++) {
      const signals: Signal[] = [];
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

export class BreakGlassHelpers {
  static createBreakGlassConfig(
    mode: 'NORMAL' | 'FALLBACK_REMOTE_ONLY' | 'FREEZE',
    reason: string = 'Test override'
  ): any {
    return {
      mode,
      reason,
      openedBy: 'test-admin',
      ttlMinutes: 30,
      sig: 'test-signature'
    };
  }

  static expectBreakGlassRespected(
    originalMode: RouteState['mode'],
    breakGlassMode: 'NORMAL' | 'FALLBACK_REMOTE_ONLY' | 'FREEZE',
    finalState: RouteState
  ): void {
    if (breakGlassMode === 'FREEZE') {
      expect(finalState.mode).toBe(originalMode);
    } else {
      expect(finalState.mode).toBe(breakGlassMode);
    }
  }
}

export class ValidationHelpers {
  static validateIncidentRecord(incident: any): void {
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

  static validateHeaderSnapshot(snapshot: any): void {
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

  static validatePolicyResponse(response: any): void {
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
