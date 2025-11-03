/**
 * Phase 31 - Acceptance Tests for Ad-Stitched Stream Verification
 * Tests HLS/DASH ad stitching verification with real-world scenarios
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import fastify from 'fastify';
import { registerStreamVerificationRoutes } from '../api/stream-verification';
import { VerificationPolicyEngine } from '../core/verification-policy';
import { RangeIndexGenerator } from '../core/range-index';
import HLSVerificationPlugin from '../player/hls-verification-plugin';

describe('Phase 31 - Stream Manifests v2 Acceptance Tests', () => {
  let server: FastifyInstance;
  let policyEngine: VerificationPolicyEngine;
  const TEST_STREAM_ID = 'test-stream-2025-11-03';

  beforeAll(async () => {
    // Setup test server
    server = fastify();
    policyEngine = new VerificationPolicyEngine();
    await registerStreamVerificationRoutes(server, policyEngine);
    await server.listen({ port: 0 }); // Random port for testing
  });

  afterAll(async () => {
    await server.close();
  });

  describe('H.1 Ad-stitched HLS live demo', () => {
    it('should verify playlist with EXT-X-DATERANGE + SCTE-35', async () => {
      // Create test range index
      const rangeIndex = RangeIndexGenerator.generateFromSSAILogs({
        stream_id: TEST_STREAM_ID,
        program_manifest: 'https://manifests.example.com/program/sha256/abc123/active.c2pa',
        ad_events: [
          {
            id: 'splice-6FFFFFF0',
            start_time: '2025-11-03T15:12:00Z',
            end_time: '2025-11-03T15:13:00Z',
            scte35: '0xFC3025000000000000FFF0140500000000E0006F000000000000A0000000',
            ad_manifest: 'https://manifests.example.com/ads/acme/sha256/def456/active.c2pa'
          }
        ]
      });

      // Publish range index
      const publishResponse = await server.inject({
        method: 'PUT',
        url: `/streams/${TEST_STREAM_ID}/range-index`,
        payload: {
          stream_id: TEST_STREAM_ID,
          program_manifest: 'https://manifests.example.com/program/sha256/abc123/active.c2pa',
          ranges: [
            {
              id: 'splice-6FFFFFF0',
              type: 'ad',
              start: '2025-11-03T15:12:00Z',
              end: '2025-11-03T15:13:00Z',
              scte35: '0xFC3025000000000000FFF0140500000000E0006F000000000000A0000000',
              manifest: 'https://manifests.example.com/ads/acme/sha256/def456/active.c2pa'
            }
          ]
        }
      });

      expect(publishResponse.statusCode).toBe(200);
      const publishedIndex = JSON.parse(publishResponse.payload);
      expect(publishedIndex.ranges).toHaveLength(1);
      expect(publishedIndex.ranges[0].type).toBe('ad');

      // Verify program content
      const programVerifyResponse = await server.inject({
        method: 'POST',
        url: '/verify/stream',
        payload: {
          stream_id: TEST_STREAM_ID,
          at: '2025-11-03T15:11:00Z', // Before ad
          mode: 'full'
        }
      });

      expect(programVerifyResponse.statusCode).toBe(200);
      const programResult = JSON.parse(programVerifyResponse.payload);
      expect(programResult.kind).toBe('program');
      expect(programResult.manifest).toContain('program');

      // Verify ad content
      const adVerifyResponse = await server.inject({
        method: 'POST',
        url: '/verify/stream',
        payload: {
          stream_id: TEST_STREAM_ID,
          at: '2025-11-03T15:12:30Z', // During ad
          mode: 'full'
        }
      });

      expect(adVerifyResponse.statusCode).toBe(200);
      const adResult = JSON.parse(adVerifyResponse.payload);
      expect(adResult.kind).toBe('ad');
      expect(adResult.manifest).toContain('ads');
    });

    it('should flip badge instantly on ad/program boundaries', async () => {
      // Mock HLS.js instance
      const mockHls = {
        on: vi.fn(),
        off: vi.fn(),
        trigger: vi.fn()
      } as any;

      const plugin = new HLSVerificationPlugin(mockHls, {
        rangeIndexUrl: `http://localhost:${(server.server.address() as any).port}/streams/${TEST_STREAM_ID}/range-index`
      });

      // Mock badge callback
      const badgeStates: any[] = [];
      plugin.onBadgeChange((state) => {
        badgeStates.push(state);
      });

      // Wait for range index to load
      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate DATERANGE event
      const daterangeEvent = {
        daterange: {
          id: 'splice-6FFFFFF0',
          startDate: '2025-11-03T15:12:00Z',
          endDate: '2025-11-03T15:13:00Z',
          class: 'com.apple.hls.splice-point'
        }
      };

      // Trigger DATERANGE event
      (mockHls.on as any).mock.calls.find((call: any) => call[0] === 'DATERANGE_LOADED')?.[1](null, daterangeEvent);

      // Check badge state changed
      expect(badgeStates.length).toBeGreaterThan(0);
      expect(badgeStates[badgeStates.length - 1].content).toBe('ad');
    });
  });

  describe('H.2 ABR torture test', () => {
    it('should maintain badge state during bitrate switches', async () => {
      const mockHls = {
        on: vi.fn(),
        off: vi.fn(),
        trigger: vi.fn()
      } as any;

      const plugin = new HLSVerificationPlugin(mockHls, {
        rangeIndexUrl: `http://localhost:${(server.server.address() as any).port}/streams/${TEST_STREAM_ID}/range-index`
      });

      const badgeStates: any[] = [];
      plugin.onBadgeChange((state) => {
        badgeStates.push(state);
      });

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate multiple ABR switches during ad
      const levelSwitchedCallback = (mockHls.on as any).mock.calls.find((call: any) => call[0] === 'LEVEL_SWITCHED')?.[1];

      for (let i = 0; i < 10; i++) {
        levelSwitchedCallback(null, { level: i % 3 });
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Badge should remain in ad state throughout
      const recentStates = badgeStates.slice(-5);
      expect(recentStates.every(state => state.content === 'ad')).toBe(true);
    });

    it('should respect verification sampling rate', async () => {
      const initialPolicy = policyEngine.getPolicy();
      policyEngine.updatePolicy({ samplingRate: 2 });

      const metrics = policyEngine.getPerformanceMetrics();
      const initialVerifications = metrics.totalVerifications;

      // Simulate segment loading
      for (let i = 0; i < 10; i++) {
        await policyEngine.verify({
          manifestUrl: 'https://example.com/manifest.c2pa',
          mode: 'sample',
          streamId: TEST_STREAM_ID
        });
      }

      const finalMetrics = policyEngine.getPerformanceMetrics();
      const newVerifications = finalMetrics.totalVerifications - initialVerifications;

      // Should have approximately half due to caching
      expect(newVerifications).toBeLessThan(5);

      // Restore policy
      policyEngine.updatePolicy(initialPolicy);
    });
  });

  describe('H.3 Seek test', () => {
    it('should verify within 500ms after seek across boundaries', async () => {
      const mockHls = {
        on: vi.fn(),
        off: vi.fn(),
        trigger: vi.fn()
      } as any;

      const plugin = new HLSVerificationPlugin(mockHls, {
        rangeIndexUrl: `http://localhost:${(server.server.address() as any).port}/streams/${TEST_STREAM_ID}/range-index`
      });

      const verificationTimes: number[] = [];

      // Mock verification timing
      const originalVerify = plugin['verifyAtBoundary'];
      plugin['verifyAtBoundary'] = async (manifestUrl: string) => {
        const start = performance.now();
        await originalVerify.call(plugin, manifestUrl);
        verificationTimes.push(performance.now() - start);
      };

      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate seek events
      const seekedCallback = (mockHls.on as any).mock.calls.find((call: any) => call[0] === 'SEEKED')?.[1];

      const seeks = [
        { time: 720 }, // 12 minutes (ad boundary)
        { time: 900 }, // 15 minutes (program)
        { time: 750 }  // 12.5 minutes (ad)
      ];

      for (const seek of seeks) {
        const startTime = performance.now();
        seekedCallback(null, seek);
        await new Promise(resolve => setTimeout(resolve, 100));
        const totalTime = performance.now() - startTime;
        expect(totalTime).toBeLessThan(500); // 500ms requirement
      }

      // Verify individual verification times
      expect(verificationTimes.every(time => time < 300)).toBe(true);
    });
  });

  describe('H.4 Wrong-parent ad test', () => {
    it('should flag broken when ad manifest has different issuer', async () => {
      // Create range index with mismatched issuer
      const response = await server.inject({
        method: 'PUT',
        url: `/streams/${TEST_STREAM_ID}-broken/range-index`,
        payload: {
          stream_id: `${TEST_STREAM_ID}-broken`,
          program_manifest: 'https://manifests.example.com/program/sha256/abc123/active.c2pa',
          ranges: [
            {
              id: 'splice-bad-parent',
              type: 'ad',
              start: '2025-11-03T15:12:00Z',
              end: '2025-11-03T15:13:00Z',
              manifest: 'https://rogue.example.com/ads/sha256/bad123/active.c2pa' // Different issuer
            }
          ]
        }
      });

      expect(response.statusCode).toBe(200);

      // Verify should detect the issue
      const verifyResponse = await server.inject({
        method: 'POST',
        url: '/verify/stream',
        payload: {
          stream_id: `${TEST_STREAM_ID}-broken`,
          daterange_id: 'splice-bad-parent',
          mode: 'full'
        }
      });

      expect(verifyResponse.statusCode).toBe(200);
      const result = JSON.parse(verifyResponse.payload);
      // In a real implementation, this would detect the issuer mismatch
      expect(result.verified).toBe(false);
    });
  });

  describe('H.5 No SCTE tags (legacy stream)', () => {
    it('should show Program only when no SCTE tags present', async () => {
      // Create range index without ad ranges
      const response = await server.inject({
        method: 'PUT',
        url: `/streams/${TEST_STREAM_ID}-legacy/range-index`,
        payload: {
          stream_id: `${TEST_STREAM_ID}-legacy`,
          program_manifest: 'https://manifests.example.com/program/sha256/legacy123/active.c2pa',
          ranges: [] // No ad ranges
        }
      });

      expect(response.statusCode).toBe(200);

      // Any timestamp should return program
      const verifyResponse = await server.inject({
        method: 'POST',
        url: '/verify/stream',
        payload: {
          stream_id: `${TEST_STREAM_ID}-legacy`,
          at: '2025-11-03T15:12:30Z', // Would normally be ad time
          mode: 'full'
        }
      });

      expect(verifyResponse.statusCode).toBe(200);
      const result = JSON.parse(verifyResponse.payload);
      expect(result.kind).toBe('program');
      expect(result.manifest).toContain('legacy123');
    });
  });

  describe('Performance SLOs', () => {
    it('should meet verification time SLOs', async () => {
      const startTime = performance.now();

      const response = await server.inject({
        method: 'POST',
        url: '/verify/stream',
        payload: {
          stream_id: TEST_STREAM_ID,
          mode: 'sample'
        }
      });

      const duration = performance.now() - startTime;

      expect(response.statusCode).toBe(200);
      expect(duration).toBeLessThan(600); // p95 requirement: ≤ 600ms for cached
    });

    it('should respect rate limiting', async () => {
      const policy = policyEngine.getPolicy();
      policyEngine.updatePolicy({ maxVerificationsPerMinute: 2 });

      const promises = Array(5).fill(null).map(() =>
        server.inject({
          method: 'POST',
          url: '/verify/stream',
          payload: {
            stream_id: TEST_STREAM_ID,
            mode: 'sample'
          }
        })
      );

      const results = await Promise.allSettled(promises);
      const failures = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.statusCode >= 400));
      
      expect(failures.length).toBeGreaterThan(0);

      // Restore policy
      policyEngine.updatePolicy(policy);
    });
  });

  describe('Badge coherence', () => {
    it('should maintain 0 mismatched states in 30-minute run simulation', async () => {
      const mockHls = {
        on: vi.fn(),
        off: vi.fn(),
        trigger: vi.fn()
      } as any;

      const plugin = new HLSVerificationPlugin(mockHls, {
        rangeIndexUrl: `http://localhost:${(server.server.address() as any).port}/streams/${TEST_STREAM_ID}/range-index`
      });

      const stateLog: Array<{ time: number; state: any }> = [];
      
      plugin.onBadgeChange((state) => {
        stateLog.push({
          time: Date.now(),
          state: { ...state }
        });
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate 30 minutes of playback (compressed to 3 seconds for testing)
      const daterangeCallback = (mockHls.on as any).mock.calls.find((call: any) => call[0] === 'DATERANGE_LOADED')?.[1];
      
      const events = [
        { daterange: { id: 'splice-6FFFFFF0', startDate: '2025-11-03T15:12:00Z', endDate: '2025-11-03T15:13:00Z' } },
        { daterange: { id: 'program-return', startDate: '2025-11-03T15:13:00Z', endDate: '2025-11-03T15:24:00Z' } },
        { daterange: { id: 'splice-6FFFFFF1', startDate: '2025-11-03T15:24:00Z', endDate: '2025-11-03T15:25:00Z' } }
      ];

      for (const event of events) {
        daterangeCallback(null, event);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Verify state transitions are correct
      let mismatches = 0;
      for (let i = 1; i < stateLog.length; i++) {
        const prev = stateLog[i - 1];
        const curr = stateLog[i];
        
        // Check for impossible transitions (e.g., ad -> ad without program in between)
        if (prev.state.content === 'ad' && curr.state.content === 'ad' && 
            curr.time - prev.time < 50000) { // Less than 1 minute
          mismatches++;
        }
      }

      expect(mismatches).toBe(0);
    });
  });
});
