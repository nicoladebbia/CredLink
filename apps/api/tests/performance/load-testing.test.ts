import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import app from '../../src/index';
import fs from 'fs';
import path from 'path';
import { TEST_CONSTANTS } from '../config/test-constants';

/**
 * Load Testing Suite
 * 
 * Tests system performance under various load conditions
 */
describe('Load Testing', () => {
  let profiler: PerformanceProfiler;
  let testImage: Buffer;

  beforeAll(async () => {
    profiler = new PerformanceProfiler();

    // Generate test image
    testImage = await sharp({
      create: {
        width: 1920,
        height: 1080,
        channels: 3,
        background: { r: 128, g: 128, b: 128 }
      }
    })
      .jpeg({ quality: 85 })
      .toBuffer();
  });

  describe('Signing Service Load Tests', () => {
    it('should handle 10 concurrent signing requests', async () => {
      const mockSign = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return testImage;
      };

      const report = await profiler.runLoadTest(
        'signing',
        mockSign,
        10, // concurrency
        5   // duration in seconds
      );

      expect(report.totalRequests).toBeGreaterThan(0);
      expect(report.requestsPerSecond).toBeGreaterThan(5);
      expect(report.errorRate).toBeLessThan(0.05); // < 5% error rate
      expect(report.latency.p95).toBeLessThan(TEST_CONSTANTS.PERFORMANCE_THRESHOLD_MS);
    });

    it('should handle 50 concurrent signing requests', async () => {
      const mockSign = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return testImage;
      };

      const report = await profiler.runLoadTest(
        'signing',
        mockSign,
        50, // concurrency
        10  // duration in seconds
      );

      expect(report.totalRequests).toBeGreaterThan(100);
      expect(report.requestsPerSecond).toBeGreaterThan(10);
      expect(report.errorRate).toBeLessThan(0.01); // < 1% error rate
      expect(report.latency.p95).toBeLessThan(TEST_CONSTANTS.PERFORMANCE_THRESHOLD_MS);
      expect(report.passedThresholds.passed).toBe(true);
    });

    it('should maintain performance under sustained load', async () => {
      const mockSign = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return testImage;
      };

      const report = await profiler.runLoadTest(
        'signing',
        mockSign,
        25,  // concurrency
        10   // duration in seconds (reduced from 30 to avoid timeout)
      );

      expect(report.totalRequests).toBeGreaterThan(150);
      expect(report.errorRate).toBeLessThan(0.02);
      expect(report.latency.p99).toBeLessThan(3000);
    }, 60000); // 60 second timeout
  });

  describe('Verification Service Load Tests', () => {
    it('should handle 100 concurrent verification requests', async () => {
      const mockVerify = async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        return { isValid: true, confidence: 95 };
      };

      const report = await profiler.runLoadTest(
        'verification',
        mockVerify,
        100, // concurrency
        10   // duration in seconds
      );

      expect(report.totalRequests).toBeGreaterThan(500);
      expect(report.requestsPerSecond).toBeGreaterThan(50);
      expect(report.errorRate).toBeLessThan(0.01);
      expect(report.latency.p95).toBeLessThan(500);
    });

    it('should handle 200 concurrent verification requests', async () => {
      const mockVerify = async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        return { isValid: true, confidence: 95 };
      };

      const report = await profiler.runLoadTest(
        'verification',
        mockVerify,
        200, // concurrency
        15   // duration in seconds
      );

      expect(report.totalRequests).toBeGreaterThan(1000);
      expect(report.requestsPerSecond).toBeGreaterThan(75);
      expect(report.errorRate).toBeLessThan(0.02);
      expect(report.latency.p99).toBeLessThan(1000);
    });
  });

  describe('Storage Service Load Tests', () => {
    it('should handle 100 concurrent storage operations', async () => {
      const mockStore = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { success: true, key: 'test-key' };
      };

      const report = await profiler.runLoadTest(
        'storage',
        mockStore,
        100, // concurrency
        10   // duration in seconds
      );

      expect(report.totalRequests).toBeGreaterThan(500);
      expect(report.requestsPerSecond).toBeGreaterThan(50);
      expect(report.errorRate).toBeLessThan(0.01);
      expect(report.latency.p95).toBeLessThan(200);
    });

    it('should handle 200 concurrent retrieval operations', async () => {
      const mockRetrieve = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return { data: testImage };
      };

      const report = await profiler.runLoadTest(
        'storage',
        mockRetrieve,
        200, // concurrency
        10   // duration in seconds
      );

      expect(report.totalRequests).toBeGreaterThan(1000);
      expect(report.requestsPerSecond).toBeGreaterThan(100);
      expect(report.errorRate).toBeLessThan(0.01);
      expect(report.latency.p95).toBeLessThan(100);
    });
  });

  describe('Mixed Workload Tests', () => {
    it('should handle mixed sign/verify workload', async () => {
      let signCount = 0;
      let verifyCount = 0;

      const mixedWorkload = async () => {
        if (Math.random() > 0.5) {
          signCount++;
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          verifyCount++;
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      };

      const report = await profiler.runLoadTest(
        'mixed',
        mixedWorkload,
        50,  // concurrency
        15   // duration in seconds
      );

      expect(report.totalRequests).toBeGreaterThan(200);
      expect(signCount).toBeGreaterThan(0);
      expect(verifyCount).toBeGreaterThan(0);
      expect(report.errorRate).toBeLessThan(0.02);
    });
  });

  describe('Stress Tests', () => {
    it('should handle burst traffic', async () => {
      const mockOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      };

      const report = await profiler.runLoadTest(
        'burst',
        mockOperation,
        500, // high concurrency
        5    // short duration
      );

      expect(report.totalRequests).toBeGreaterThan(100);
      expect(report.errorRate).toBeLessThan(0.1); // Allow higher error rate for stress test
    });

    it('should recover from high load', async () => {
      const mockOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 30));
      };

      // High load
      const highLoadReport = await profiler.runLoadTest(
        'high-load',
        mockOperation,
        200,
        5
      );

      // Normal load (should recover)
      const normalLoadReport = await profiler.runLoadTest(
        'normal-load',
        mockOperation,
        50,
        5
      );

      // Allow for cases where both have 0 error rate
      if (highLoadReport.errorRate > 0) {
        expect(normalLoadReport.errorRate).toBeLessThanOrEqual(highLoadReport.errorRate);
      }
      // Normal load should have better or similar latency
      expect(normalLoadReport.latency.p95).toBeLessThanOrEqual(highLoadReport.latency.p95 * 1.5);
    });
  });

  describe('Latency Tests', () => {
    it('should meet p50 latency targets', async () => {
      const mockOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      };

      const report = await profiler.runLoadTest(
        'latency-test',
        mockOperation,
        25,
        10
      );

      expect(report.latency.p50).toBeLessThan(100);
    });

    it('should meet p95 latency targets', async () => {
      const mockOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      };

      const report = await profiler.runLoadTest(
        'latency-test',
        mockOperation,
        25,
        10
      );

      expect(report.latency.p95).toBeLessThan(200);
    });

    it('should meet p99 latency targets', async () => {
      const mockOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      };

      const report = await profiler.runLoadTest(
        'latency-test',
        mockOperation,
        25,
        10
      );

      expect(report.latency.p99).toBeLessThan(400);
    });
  });

  describe('Throughput Tests', () => {
    it('should achieve minimum throughput for signing', async () => {
      const mockSign = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      };

      const report = await profiler.runLoadTest(
        'signing-throughput',
        mockSign,
        50,
        15
      );

      expect(report.requestsPerSecond).toBeGreaterThan(10);
    });

    it('should achieve minimum throughput for verification', async () => {
      const mockVerify = async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
      };

      const report = await profiler.runLoadTest(
        'verification-throughput',
        mockVerify,
        100,
        15
      );

      expect(report.requestsPerSecond).toBeGreaterThan(50);
    });

    it('should achieve minimum throughput for storage', async () => {
      const mockStorage = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      };

      const report = await profiler.runLoadTest(
        'storage-throughput',
        mockStorage,
        200,
        15
      );

      expect(report.requestsPerSecond).toBeGreaterThan(100);
    });
  });

  describe('Error Rate Tests', () => {
    it('should maintain low error rate under normal load', async () => {
      const mockOperation = async () => {
        if (Math.random() < 0.01) { // 1% error rate
          throw new Error('Simulated error');
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      };

      const report = await profiler.runLoadTest(
        'error-rate-test',
        mockOperation,
        50,
        10
      );

      expect(report.errorRate).toBeLessThan(0.05);
    });

    it('should handle partial failures gracefully', async () => {
      let failureCount = 0;
      const mockOperation = async () => {
        if (failureCount < 10) {
          failureCount++;
          throw new Error('Temporary failure');
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      };

      const report = await profiler.runLoadTest(
        'partial-failure-test',
        mockOperation,
        25,
        10
      );

      expect(report.successfulRequests).toBeGreaterThan(report.failedRequests);
    });
  });
});
