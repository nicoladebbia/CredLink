/**
 * Phase 6 - Optimizer Auto-Fallback: End-to-End Tests
 * Integration tests for the complete system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { C2AutoFallbackDO } from '../durable-object';
import { detectSignals, routeFrom } from '../detectors';
import { ensureManifestLink, injectBadge } from '../html';
import { Env, RouteMode } from '../types';

// Mock environment for testing
const createMockEnv = (): Env => ({
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
  ADMIN_TOKEN: "test-admin-token"
});

describe('End-to-End Auto-Fallback System', () => {
  let env: Env;
  let doState: any;
  let doInstance: C2AutoFallbackDO;

  beforeEach(() => {
    env = createMockEnv();
    doState = {
      id: { toString: () => "test-route" },
      storage: {
        get: vi.fn(),
        put: vi.fn()
      }
    };
    doInstance = new C2AutoFallbackDO(doState, env);
    vi.clearAllMocks();
  });

  describe('Complete Flip Scenario', () => {
    it('should flip to remote-only when strip-risk detected', async () => {
      // Mock initial state
      doState.storage.get.mockResolvedValue(null);
      doState.storage.put.mockResolvedValue(undefined);
      env.C2_BREAKGLASS.get.mockResolvedValue(null);

      const now = Math.floor(Date.now() / 1000);
      
      // Simulate aggressive transformation scenario
      const aggressiveEvents = [];
      for (let i = 0; i < 50; i++) {
        aggressiveEvents.push({
          route: 'cdn.example.com:/images/',
          tsSec: now - (50 - i),
          signals: [
            { id: 'HDR_CF_POLISH', weight: 35 },
            { id: 'MIME_DRIFT', weight: 20 },
            { id: 'SIZE_ANOMALY', weight: 15 }
          ],
          isPreserve: true,
          embedProbe: false // Embed failures
        });
      }

      // Process all events
      for (const event of aggressiveEvents) {
        const response = await doInstance.fetch(new Request('https://do/ingest', {
          method: 'POST',
          body: JSON.stringify(event)
        }));
        expect(response.status).toBe(200);
      }

      // Verify final state
      const lastCall = doState.storage.put.mock.calls[doState.storage.put.mock.calls.length - 1];
      const finalState = lastCall[1];
      
      expect(finalState.mode).toBe('FALLBACK_REMOTE_ONLY');
      expect(finalState.lastDecision).toBeTruthy();
      expect(finalState.lastDecision?.stateTo).toBe('FALLBACK_REMOTE_ONLY');
      expect(finalState.lastDecision?.reason).toContain('Score threshold exceeded');
    });
  });

  describe('Recovery Scenario', () => {
    it('should recover to normal after sustained good behavior', async () => {
      const now = Math.floor(Date.now() / 1000);
      
      // Start in FALLBACK_REMOTE_ONLY mode
      const initialState = {
        route: 'cdn.example.com:/images/',
        mode: 'FALLBACK_REMOTE_ONLY' as RouteMode,
        buckets: [{
          tsSec: now - 700,
          reqs: 50,
          embedSurvive: 25,
          signals: { 'HDR_CF_POLISH': 1750, 'MIME_DRIFT': 1000 }
        }],
        lastDecision: {
          id: 'initial-flip',
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
          sig: 'test-sig'
        },
        openedIncidents: ['initial-flip'],
        scoreThreshold: 100,
        scoreRestore: 30,
        minSamples: 40
      };

      doState.storage.get.mockResolvedValue(initialState);
      doState.storage.put.mockResolvedValue(undefined);
      env.C2_BREAKGLASS.get.mockResolvedValue(null);

      // Simulate recovery period with hysteresis
      const recoveryEvents = [];
      for (let i = 0; i < 100; i++) {
        recoveryEvents.push({
          route: 'cdn.example.com:/images/',
          tsSec: now - 800 + i, // Span hysteresis period
          signals: [], // Clean signals
          isPreserve: true,
          embedProbe: true // Good embed survival
        });
      }

      // Process recovery events
      for (const event of recoveryEvents) {
        const response = await doInstance.fetch(new Request('https://do/ingest', {
          method: 'POST',
          body: JSON.stringify(event)
        }));
        expect(response.status).toBe(200);
      }

      // Verify recovery sequence
      const stateCalls = doState.storage.put.mock.calls.map(call => call[1]);
      
      // Should have transitioned through RECOVERY_GUARD to NORMAL
      const recoveryGuardState = stateCalls.find(state => state.mode === 'RECOVERY_GUARD');
      const normalState = stateCalls.find(state => state.mode === 'NORMAL');
      
      expect(recoveryGuardState).toBeTruthy();
      expect(normalState).toBeTruthy();
      expect(normalState.lastDecision?.stateTo).toBe('NORMAL');
    });
  });

  describe('False Positive Prevention', () => {
    it('should not flip on low-volume spiky traffic', async () => {
      doState.storage.get.mockResolvedValue(null);
      doState.storage.put.mockResolvedValue(undefined);
      env.C2_BREAKGLASS.get.mockResolvedValue(null);

      const now = Math.floor(Date.now() / 1000);
      
      // Simulate low volume with some signals (below threshold)
      const lowVolumeEvents = [];
      for (let i = 0; i < 20; i++) { // Below minSamples of 40
        lowVolumeEvents.push({
          route: 'cdn.example.com:/images/',
          tsSec: now - (20 - i),
          signals: [
            { id: 'HDR_CF_POLISH', weight: 35 },
            { id: 'MIME_DRIFT', weight: 20 }
          ],
          isPreserve: true,
          embedProbe: true
        });
      }

      // Process events
      for (const event of lowVolumeEvents) {
        const response = await doInstance.fetch(new Request('https://do/ingest', {
          method: 'POST',
          body: JSON.stringify(event)
        }));
        expect(response.status).toBe(200);
      }

      // Should remain in NORMAL mode
      const lastCall = doState.storage.put.mock.calls[doState.storage.put.mock.calls.length - 1];
      const finalState = lastCall[1];
      expect(finalState.mode).toBe('NORMAL');
    });
  });

  describe('Break-Glass Integration', () => {
    it('should respect manual override during testing', async () => {
      const initialState = {
        route: 'cdn.example.com:/images/',
        mode: 'NORMAL' as RouteMode,
        buckets: [],
        lastDecision: null,
        openedIncidents: [],
        scoreThreshold: 100,
        scoreRestore: 30,
        minSamples: 40
      };

      doState.storage.get.mockResolvedValue(initialState);
      doState.storage.put.mockResolvedValue(undefined);
      
      // Set break-glass to force FALLBACK_REMOTE_ONLY
      env.C2_BREAKGLASS.get.mockResolvedValue({
        mode: 'FALLBACK_REMOTE_ONLY',
        reason: 'Manual testing override',
        openedBy: 'test-admin',
        ttlMinutes: 30,
        sig: 'test-sig'
      });

      const event = {
        route: 'cdn.example.com:/images/',
        tsSec: Math.floor(Date.now() / 1000),
        signals: [], // Clean signals
        isPreserve: true,
        embedProbe: true
      };

      const response = await doInstance.fetch(new Request('https://do/ingest', {
        method: 'POST',
        body: JSON.stringify(event)
      }));

      expect(response.status).toBe(200);
      
      // Should have updated to break-glass mode despite clean signals
      const lastCall = doState.storage.put.mock.calls[doState.storage.put.mock.calls.length - 1];
      const finalState = lastCall[1];
      expect(finalState.mode).toBe('FALLBACK_REMOTE_ONLY');
      expect(finalState.lastDecision?.reason).toContain('Break-glass override');
    });
  });

  describe('Admin API', () => {
    it('should provide policy information via admin endpoint', async () => {
      const testState = {
        route: 'cdn.example.com:/images/',
        mode: 'FALLBACK_REMOTE_ONLY' as RouteMode,
        buckets: [{
          tsSec: Math.floor(Date.now() / 1000) - 10,
          reqs: 50,
          embedSurvive: 45,
          signals: { 'HDR_CF_POLISH': 1750 }
        }],
        lastDecision: {
          id: 'test-decision',
          route: 'cdn.example.com:/images/',
          startedAt: new Date().toISOString(),
          stateFrom: 'NORMAL',
          stateTo: 'FALLBACK_REMOTE_ONLY',
          reason: 'Test flip',
          firedRules: ['HDR_CF_POLISH'],
          snapshot: {
            sample: 50,
            percentWebP: 50,
            percentAVIF: 0,
            seenProviders: ['cf-polish'],
            contentTypeDrift: 0,
            linkDroppedPct: 0
          },
          exitCondition: 'score<30 for 600s & embed≥0.95',
          sig: 'test-sig'
        },
        openedIncidents: ['test-decision'],
        scoreThreshold: 100,
        scoreRestore: 30,
        minSamples: 40
      };

      doState.storage.get.mockResolvedValue(testState);

      const adminRequest = new Request('https://do/admin?route=cdn.example.com:/images/', {
        headers: {
          'Authorization': 'Bearer test-admin-token'
        }
      });

      const response = await doInstance.fetch(adminRequest);
      expect(response.status).toBe(200);

      const adminData = await response.json();
      expect(adminData.route).toBe('cdn.example.com:/images/');
      expect(adminData.mode).toBe('FALLBACK_REMOTE_ONLY');
      expect(adminData.score).toBeGreaterThan(0);
      expect(adminData.lastDecision).toBeTruthy();
    });

    it('should reject unauthorized admin requests', async () => {
      const unauthorizedRequest = new Request('https://do/admin?route=cdn.example.com:/images/', {
        headers: {
          'Authorization': 'Bearer wrong-token'
        }
      });

      const response = await doInstance.fetch(unauthorizedRequest);
      expect(response.status).toBe(403);
    });
  });

  describe('Performance Characteristics', () => {
    it('should handle high-volume events efficiently', async () => {
      doState.storage.get.mockResolvedValue(null);
      doState.storage.put.mockResolvedValue(undefined);
      env.C2_BREAKGLASS.get.mockResolvedValue(null);

      const now = Math.floor(Date.now() / 1000);
      const startTime = Date.now();
      
      // Simulate high volume (1000 events)
      const highVolumeEvents = [];
      for (let i = 0; i < 1000; i++) {
        highVolumeEvents.push({
          route: 'cdn.example.com:/images/',
          tsSec: now - (1000 - i),
          signals: [{ id: 'HDR_CF_POLISH', weight: 35 }],
          isPreserve: true,
          embedProbe: true
        });
      }

      // Process all events
      for (const event of highVolumeEvents) {
        const response = await doInstance.fetch(new Request('https://do/ingest', {
          method: 'POST',
          body: JSON.stringify(event)
        }));
        expect(response.status).toBe(200);
      }

      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      // Should process 1000 events quickly (adjust threshold based on requirements)
      expect(processingTime).toBeLessThan(5000); // 5 seconds for 1000 events
      
      // Verify ring buffer is properly managed
      const lastCall = doState.storage.put.mock.calls[doState.storage.put.mock.calls.length - 1];
      const finalState = lastCall[1];
      expect(finalState.buckets.length).toBeLessThanOrEqual(120); // 60s window + buffer
    });
  });
});

describe('Signal Detection Integration', () => {
  it('should correctly identify strip-risk patterns', () => {
    const testCases = [
      {
        url: 'https://cdn.example.com/image.jpg?ixlib=rb-4.0',
        headers: { 'cf-polished': 'webp', 'content-type': 'image/webp' },
        expectedSignals: ['HDR_CF_POLISH', 'HDR_IMGIX', 'MIME_DRIFT'],
        expectedScore: 35 + 35 + 20
      },
      {
        url: 'https://res.cloudinary.com/demo/image/fetch/w_100/sample.jpg',
        headers: { 'content-type': 'image/webp' },
        expectedSignals: ['HDR_CLOUDINARY'],
        expectedScore: 35
      },
      {
        url: 'https://cdn.example.com/original.jpg',
        headers: { 'content-type': 'image/jpeg' },
        expectedSignals: [],
        expectedScore: 0
      }
    ];

    testCases.forEach(({ url, headers, expectedSignals, expectedScore }) => {
      const urlObj = new URL(url);
      const headersObj = new Headers(headers);
      const signals = detectSignals(urlObj, headersObj);
      
      const detectedIds = signals.map(s => s.id);
      const totalScore = signals.reduce((sum, s) => sum + s.weight, 0);
      
      expect(detectedIds).toEqual(expect.arrayContaining(expectedSignals));
      expect(totalScore).toBe(expectedScore);
    });
  });
});
