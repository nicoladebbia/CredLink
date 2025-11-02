/**
 * Phase 6 - Optimizer Auto-Fallback: State Machine Tests
 * Unit tests for Durable Object state transitions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { C2AutoFallbackDO } from '../durable-object';
import { RouteState, RouteMode, IngestEvent, Env } from '../types';

// Mock environment
const mockEnv: Env = {
  C2_AUTOFALLBACK: {} as any,
  C2_BREAKGLASS: {} as any,
  C2_POLICY_CACHE: {} as any,
  REMOTE_ONLY_DEFAULT: "0",
  WINDOW_SECS: "60",
  RESTORE_HYSTERESIS_SECS: "600",
  ROUTE_MIN_SAMPLES: "40",
  SCORE_THRESHOLD: "100",
  SCORE_RESTORE: "30",
  BADGE_REQUIRED: "1",
  MANIFEST_BASE: "https://manifests.example",
  TENANT_ID: "demo-tenant",
  HMAC_SECRET: "test-secret",
  ADMIN_TOKEN: "test-token"
};

// Mock DurableObjectState
const mockState = {
  id: { toString: () => "test-route" },
  storage: {
    get: vi.fn(),
    put: vi.fn()
  }
};

describe('State Machine Logic', () => {
  let doInstance: C2AutoFallbackDO;

  beforeEach(() => {
    doInstance = new C2AutoFallbackDO(mockState as any, mockEnv);
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with NORMAL mode when no existing state', async () => {
      const mockRouteState: RouteState = {
        route: 'cdn.example.com:/images/',
        mode: 'NORMAL',
        buckets: [],
        lastDecision: null,
        openedIncidents: [],
        scoreThreshold: 100,
        scoreRestore: 30,
        minSamples: 40
      };

      mockState.storage.get.mockResolvedValue(null);
      mockState.storage.put.mockResolvedValue(undefined);

      const event: IngestEvent = {
        route: 'cdn.example.com:/images/',
        tsSec: Math.floor(Date.now() / 1000),
        signals: [{ id: 'HDR_CF_POLISH', weight: 35 }],
        isPreserve: true,
        embedProbe: true
      };

      const response = await doInstance.fetch(new Request('https://do/ingest', {
        method: 'POST',
        body: JSON.stringify(event)
      }));

      expect(response.status).toBe(200);
      expect(mockState.storage.put).toHaveBeenCalled();
    });
  });

  describe('NORMAL to FALLBACK_REMOTE_ONLY Transition', () => {
    it('should flip when score exceeds threshold with sufficient samples', async () => {
      const mockRouteState: RouteState = {
        route: 'cdn.example.com:/images/',
        mode: 'NORMAL',
        buckets: [],
        lastDecision: null,
        openedIncidents: [],
        scoreThreshold: 100,
        scoreRestore: 30,
        minSamples: 40
      };

      mockState.storage.get.mockResolvedValue(mockRouteState);
      mockState.storage.put.mockResolvedValue(undefined);
      mockEnv.C2_BREAKGLASS.get.mockResolvedValue(null);

      // Simulate high-scoring events
      const events: IngestEvent[] = [];
      const now = Math.floor(Date.now() / 1000);
      
      for (let i = 0; i < 50; i++) {
        events.push({
          route: 'cdn.example.com:/images/',
          tsSec: now - (50 - i),
          signals: [
            { id: 'HDR_CF_POLISH', weight: 35 },
            { id: 'HDR_IMGIX', weight: 35 },
            { id: 'MIME_DRIFT', weight: 20 }
          ],
          isPreserve: true,
          embedProbe: true
        });
      }

      // Process events
      for (const event of events) {
        await doInstance.fetch(new Request('https://do/ingest', {
          method: 'POST',
          body: JSON.stringify(event)
        }));
      }

      // Check that state was updated
      expect(mockState.storage.put).toHaveBeenCalled();
      
      // The last call should have updated the mode
      const lastCall = mockState.storage.put.mock.calls[mockState.storage.put.mock.calls.length - 1];
      const updatedState = lastCall[1] as RouteState;
      expect(updatedState.mode).toBe('FALLBACK_REMOTE_ONLY');
    });

    it('should not flip when samples are insufficient', async () => {
      const mockRouteState: RouteState = {
        route: 'cdn.example.com:/images/',
        mode: 'NORMAL',
        buckets: [],
        lastDecision: null,
        openedIncidents: [],
        scoreThreshold: 100,
        scoreRestore: 30,
        minSamples: 40
      };

      mockState.storage.get.mockResolvedValue(mockRouteState);
      mockState.storage.put.mockResolvedValue(undefined);
      mockEnv.C2_BREAKGLASS.get.mockResolvedValue(null);

      // Simulate low-volume high-scoring events (insufficient samples)
      const events: IngestEvent[] = [];
      const now = Math.floor(Date.now() / 1000);
      
      for (let i = 0; i < 10; i++) {
        events.push({
          route: 'cdn.example.com:/images/',
          tsSec: now - (10 - i),
          signals: [
            { id: 'HDR_CF_POLISH', weight: 35 },
            { id: 'HDR_IMGIX', weight: 35 },
            { id: 'MIME_DRIFT', weight: 20 }
          ],
          isPreserve: true,
          embedProbe: true
        });
      }

      // Process events
      for (const event of events) {
        await doInstance.fetch(new Request('https://do/ingest', {
          method: 'POST',
          body: JSON.stringify(event)
        }));
      }

      // Should remain in NORMAL mode
      const lastCall = mockState.storage.put.mock.calls[mockState.storage.put.mock.calls.length - 1];
      const updatedState = lastCall[1] as RouteState;
      expect(updatedState.mode).toBe('NORMAL');
    });
  });

  describe('FALLBACK_REMOTE_ONLY to RECOVERY_GUARD Transition', () => {
    it('should transition to recovery when score drops below restore threshold', async () => {
      const now = Math.floor(Date.now() / 1000);
      const mockRouteState: RouteState = {
        route: 'cdn.example.com:/images/',
        mode: 'FALLBACK_REMOTE_ONLY',
        buckets: [
          // Old buckets with high score (caused the flip)
          {
            tsSec: now - 700,
            reqs: 50,
            embedSurvive: 45,
            signals: { 'HDR_CF_POLISH': 1750, 'MIME_DRIFT': 1000 }
          }
        ],
        lastDecision: {
          id: 'test-incident',
          route: 'cdn.example.com:/images/',
          startedAt: new Date(now - 700 * 1000).toISOString(),
          stateFrom: 'NORMAL',
          stateTo: 'FALLBACK_REMOTE_ONLY',
          reason: 'Score threshold exceeded',
          firedRules: ['HDR_CF_POLISH', 'MIME_DRIFT'],
          snapshot: {
            sample: 50,
            percentWebP: 50,
            percentAVIF: 0,
            seenProviders: ['cf-polish'],
            contentTypeDrift: 20,
            linkDroppedPct: 0
          },
          exitCondition: 'score<30 for 600s & embed≥0.95',
          sig: 'test-signature'
        },
        openedIncidents: ['test-incident'],
        scoreThreshold: 100,
        scoreRestore: 30,
        minSamples: 40
      };

      mockState.storage.get.mockResolvedValue(mockRouteState);
      mockState.storage.put.mockResolvedValue(undefined);
      mockEnv.C2_BREAKGLASS.get.mockResolvedValue(null);

      // Simulate recovery events (low score, good embed survival)
      const events: IngestEvent[] = [];
      
      for (let i = 0; i < 50; i++) {
        events.push({
          route: 'cdn.example.com:/images/',
          tsSec: now - (50 - i),
          signals: [], // No signals = low score
          isPreserve: true,
          embedProbe: true // Good embed survival
        });
      }

      // Process events
      for (const event of events) {
        await doInstance.fetch(new Request('https://do/ingest', {
          method: 'POST',
          body: JSON.stringify(event)
        }));
      }

      // Should transition to RECOVERY_GUARD
      const lastCall = mockState.storage.put.mock.calls[mockState.storage.put.mock.calls.length - 1];
      const updatedState = lastCall[1] as RouteState;
      expect(updatedState.mode).toBe('RECOVERY_GUARD');
    });
  });

  describe('RECOVERY_GUARD to NORMAL Transition', () => {
    it('should return to normal after sustained recovery', async () => {
      const now = Math.floor(Date.now() / 1000);
      const mockRouteState: RouteState = {
        route: 'cdn.example.com:/images/',
        mode: 'RECOVERY_GUARD',
        buckets: [],
        lastDecision: {
          id: 'recovery-incident',
          route: 'cdn.example.com:/images/',
          startedAt: new Date(now - 700 * 1000).toISOString(),
          stateFrom: 'FALLBACK_REMOTE_ONLY',
          stateTo: 'RECOVERY_GUARD',
          reason: 'Score below restore & embed stable',
          firedRules: [],
          snapshot: {
            sample: 50,
            percentWebP: 0,
            percentAVIF: 0,
            seenProviders: [],
            contentTypeDrift: 0,
            linkDroppedPct: 0
          },
          exitCondition: 'score<30 for 600s & embed≥0.95',
          sig: 'test-signature'
        },
        openedIncidents: ['test-incident', 'recovery-incident'],
        scoreThreshold: 100,
        scoreRestore: 30,
        minSamples: 40
      };

      mockState.storage.get.mockResolvedValue(mockRouteState);
      mockState.storage.put.mockResolvedValue(undefined);
      mockEnv.C2_BREAKGLASS.get.mockResolvedValue(null);

      // Simulate continued recovery (hysteresis period passed)
      const events: IngestEvent[] = [];
      
      for (let i = 0; i < 50; i++) {
        events.push({
          route: 'cdn.example.com:/images/',
          tsSec: now - (50 - i),
          signals: [], // No signals = low score
          isPreserve: true,
          embedProbe: true // Good embed survival
        });
      }

      // Process events
      for (const event of events) {
        await doInstance.fetch(new Request('https://do/ingest', {
          method: 'POST',
          body: JSON.stringify(event)
        }));
      }

      // Should return to NORMAL
      const lastCall = mockState.storage.put.mock.calls[mockState.storage.put.mock.calls.length - 1];
      const updatedState = lastCall[1] as RouteState;
      expect(updatedState.mode).toBe('NORMAL');
    });
  });

  describe('Break-Glass Override', () => {
    it('should respect break-glass FREEZE mode', async () => {
      const mockRouteState: RouteState = {
        route: 'cdn.example.com:/images/',
        mode: 'NORMAL',
        buckets: [],
        lastDecision: null,
        openedIncidents: [],
        scoreThreshold: 100,
        scoreRestore: 30,
        minSamples: 40
      };

      mockState.storage.get.mockResolvedValue(mockRouteState);
      mockState.storage.put.mockResolvedValue(undefined);
      
      // Mock break-glass active
      mockEnv.C2_BREAKGLASS.get.mockResolvedValue({
        mode: 'FREEZE',
        reason: 'Testing freeze mode',
        openedBy: 'admin',
        ttlMinutes: 30,
        sig: 'test-signature'
      });

      const event: IngestEvent = {
        route: 'cdn.example.com:/images/',
        tsSec: Math.floor(Date.now() / 1000),
        signals: [
          { id: 'HDR_CF_POLISH', weight: 35 },
          { id: 'HDR_IMGIX', weight: 35 },
          { id: 'MIME_DRIFT', weight: 20 }
        ],
        isPreserve: true,
        embedProbe: false
      };

      const response = await doInstance.fetch(new Request('https://do/ingest', {
        method: 'POST',
        body: JSON.stringify(event)
      }));

      expect(response.status).toBe(200);
      // Should not persist state changes when frozen
      expect(mockState.storage.put).not.toHaveBeenCalled();
    });
  });

  describe('Ring Buffer Management', () => {
    it('should clean old buckets outside window', async () => {
      const now = Math.floor(Date.now() / 1000);
      const mockRouteState: RouteState = {
        route: 'cdn.example.com:/images/',
        mode: 'NORMAL',
        buckets: [
          // Old bucket outside 60-second window
          {
            tsSec: now - 120,
            reqs: 10,
            embedSurvive: 8,
            signals: { 'HDR_CF_POLISH': 350 }
          },
          // Recent bucket inside window
          {
            tsSec: now - 30,
            reqs: 20,
            embedSurvive: 18,
            signals: { 'HDR_IMGIX': 700 }
          }
        ],
        lastDecision: null,
        openedIncidents: [],
        scoreThreshold: 100,
        scoreRestore: 30,
        minSamples: 40
      };

      mockState.storage.get.mockResolvedValue(mockRouteState);
      mockState.storage.put.mockResolvedValue(undefined);
      mockEnv.C2_BREAKGLASS.get.mockResolvedValue(null);

      const event: IngestEvent = {
        route: 'cdn.example.com:/images/',
        tsSec: now,
        signals: [{ id: 'HDR_CF_POLISH', weight: 35 }],
        isPreserve: true,
        embedProbe: true
      };

      await doInstance.fetch(new Request('https://do/ingest', {
        method: 'POST',
        body: JSON.stringify(event)
      }));

      const lastCall = mockState.storage.put.mock.calls[mockState.storage.put.mock.calls.length - 1];
      const updatedState = lastCall[1] as RouteState;
      
      // Should have cleaned the old bucket
      expect(updatedState.buckets).toHaveLength(2); // Recent + new
      expect(updatedState.buckets.every(b => b.tsSec >= now - 60)).toBe(true);
    });
  });
});
