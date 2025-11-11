import { describe, it, expect, beforeAll } from '@jest/globals';
import { PerformanceProfiler } from '../../performance/performance-profiler';
import { BottleneckAnalyzer } from '../../performance/bottleneck-analyzer';
import { BenchmarkRunner, BenchmarkUtils } from '../../performance/benchmark-suite';

describe('Performance Testing Suite', () => {
  let profiler: PerformanceProfiler;
  let analyzer: BottleneckAnalyzer;
  let benchmark: BenchmarkRunner;

  beforeAll(() => {
    profiler = new PerformanceProfiler();
    analyzer = new BottleneckAnalyzer();
    benchmark = new BenchmarkRunner();
  });

  describe('PerformanceProfiler', () => {
    it('should profile an operation', async () => {
      const testFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      };

      const { result, metrics } = await profiler.profileOperation('test', testFn);

      expect(metrics).toBeDefined();
      expect(metrics.operation).toBe('test');
      expect(metrics.duration).toBeGreaterThan(0);
      expect(metrics.timestamp).toBeDefined();
    });

    it('should handle errors in profiled operations', async () => {
      const testFn = async () => {
        throw new Error('Test error');
      };

      await expect(profiler.profileOperation('error-test', testFn)).rejects.toThrow('Test error');

      const metrics = profiler.getMetrics('error-test');
      expect(metrics.length).toBe(1);
      expect(metrics[0].error).toBeDefined();
    });

    it('should run load test', async () => {
      const testFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 1));
      };

      const report = await profiler.runLoadTest('load-test', testFn, 5, 2);

      expect(report).toBeDefined();
      expect(report.operation).toBe('load-test');
      expect(report.concurrency).toBe(5);
      expect(report.totalRequests).toBeGreaterThan(0);
      expect(report.latency).toBeDefined();
      expect(report.latency.p50).toBeGreaterThan(0);
    });

    it('should create performance profile', async () => {
      const testFn = async () => {
        const arr = new Array(1000).fill(0);
        arr.forEach((_, i) => arr[i] = i * 2);
      };

      const profile = await profiler.createProfile('profile-test', testFn, 50);

      expect(profile).toBeDefined();
      expect(profile.operation).toBe('profile-test');
      expect(profile.samples).toBe(50);
      expect(profile.metrics.latency).toBeDefined();
      expect(profile.metrics.memory).toBeDefined();
      expect(profile.metrics.cpu).toBeDefined();
    });

    it('should track metrics over time', async () => {
      const testFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
      };

      await profiler.profileOperation('tracked', testFn);
      await profiler.profileOperation('tracked', testFn);
      await profiler.profileOperation('tracked', testFn);

      const metrics = profiler.getMetrics('tracked');
      expect(metrics.length).toBe(3);
    });

    it('should generate summary statistics', async () => {
      profiler.clearMetrics();

      const testFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 1));
      };

      await profiler.profileOperation('op1', testFn);
      await profiler.profileOperation('op1', testFn);
      await profiler.profileOperation('op2', testFn);

      const summary = profiler.getSummary();

      expect(summary.op1).toBeDefined();
      expect(summary.op1.count).toBe(2);
      expect(summary.op2).toBeDefined();
      expect(summary.op2.count).toBe(1);
    });
  });

  describe('BottleneckAnalyzer', () => {
    it('should analyze performance profile', async () => {
      const testFn = async () => {
        // Simulate slow operation
        const arr = new Array(10000).fill(0);
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.sqrt(i);
        }
      };

      const profile = await profiler.createProfile('slow-op', testFn, 20);
      const analysis = analyzer.analyze(profile);

      expect(analysis).toBeDefined();
      expect(analysis.operation).toBe('slow-op');
      expect(analysis.bottlenecks).toBeDefined();
      expect(analysis.recommendations).toBeDefined();
      expect(analysis.severity).toBeDefined();
    });

    it('should identify bottlenecks', async () => {
      const slowFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      };

      const profile = await profiler.createProfile('bottleneck-test', slowFn, 10);
      const analysis = analyzer.analyze(profile);

      expect(analysis.bottlenecks.length).toBeGreaterThan(0);
    });

    it('should generate optimization suggestions', async () => {
      const testFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      };

      const profile = await profiler.createProfile('optimize-test', testFn, 10);
      const analysis = analyzer.analyze(profile);
      const suggestions = analyzer.generateOptimizations(analysis);

      expect(suggestions).toBeDefined();
      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('should compare performance profiles', async () => {
      const slowFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
      };

      const fastFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
      };

      const baseline = await profiler.createProfile('baseline', slowFn, 20);
      const optimized = await profiler.createProfile('optimized', fastFn, 20);

      const comparison = analyzer.compareProfiles(baseline, optimized);

      expect(comparison.latencyImprovement).toBeGreaterThan(0);
      expect(comparison.throughputImprovement).toBeGreaterThan(0);
    });
  });

  describe('BenchmarkRunner', () => {
    it('should run a benchmark', async () => {
      const testFn = () => {
        const arr = new Array(100).fill(0);
        arr.forEach((_, i) => arr[i] = i * 2);
      };

      const result = await benchmark.runBenchmark('array-ops', testFn, {
        operations: 1000,
        warmup: 10
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('array-ops');
      expect(result.operations).toBe(1000);
      expect(result.opsPerSecond).toBeGreaterThan(0);
      expect(result.averageTime).toBeGreaterThan(0);
    });

    it('should run benchmark suite', async () => {
      const tests = [
        BenchmarkUtils.createTest('test1', () => {
          const x = Math.random();
          return x * 2;
        }),
        BenchmarkUtils.createTest('test2', () => {
          const arr = [1, 2, 3];
          return arr.reduce((sum, n) => sum + n, 0);
        })
      ];

      const suite = await benchmark.runSuite('test-suite', tests);

      expect(suite).toBeDefined();
      expect(suite.name).toBe('test-suite');
      expect(suite.results.length).toBe(2);
      expect(suite.summary.totalOperations).toBeGreaterThan(0);
    });

    it('should detect threshold failures', async () => {
      const slowFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      };

      const result = await benchmark.runBenchmark('slow-test', slowFn, {
        operations: 10,
        threshold: 1000 // Impossible threshold
      });

      expect(result.passed).toBe(false);
    });

    it('should compare benchmark results', async () => {
      const baseline = await benchmark.runBenchmark('baseline', () => {
        const arr = new Array(100).fill(0);
        arr.forEach((_, i) => arr[i] = i);
      }, { operations: 100 });

      const optimized = await benchmark.runBenchmark('optimized', () => {
        const arr = new Array(100).fill(0);
        for (let i = 0; i < arr.length; i++) {
          arr[i] = i;
        }
      }, { operations: 100 });

      const comparison = benchmark.compare(baseline, optimized);

      expect(comparison.speedup).toBeDefined();
      expect(comparison.improvement).toBeDefined();
      expect(comparison.regression).toBeDefined();
    });
  });

  describe('BenchmarkUtils', () => {
    it('should measure execution time', async () => {
      const { result, duration } = await BenchmarkUtils.measure(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 42;
      });

      expect(result).toBe(42);
      expect(duration).toBeGreaterThan(0);
    });

    it('should measure average duration', async () => {
      const avgDuration = await BenchmarkUtils.measureAverage(async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
      }, 10);

      expect(avgDuration).toBeGreaterThan(0);
    });

    it('should measure memory usage', () => {
      const { result, memoryDelta } = BenchmarkUtils.measureMemory(() => {
        const arr = new Array(10000).fill(0);
        return arr.length;
      });

      expect(result).toBe(10000);
      expect(typeof memoryDelta).toBe('number');
    });
  });

  describe('Performance Thresholds', () => {
    it('should respect custom thresholds', async () => {
      const customProfiler = new PerformanceProfiler({
        signing: { p50: 500, p95: 1000, p99: 1500 }
      });

      const testFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
      };

      const report = await customProfiler.runLoadTest('threshold-test', testFn, 5, 1);

      expect(report.passedThresholds).toBeDefined();
      expect(report.passedThresholds.passed).toBeDefined();
    });
  });

  describe('Integration Tests', () => {
    it('should profile, analyze, and benchmark together', async () => {
      const testFn = async () => {
        const arr = new Array(1000).fill(0);
        arr.forEach((_, i) => arr[i] = Math.sqrt(i));
      };

      // Profile
      const profile = await profiler.createProfile('integration', testFn, 50);
      expect(profile).toBeDefined();

      // Analyze
      const analysis = analyzer.analyze(profile);
      expect(analysis).toBeDefined();

      // Benchmark
      const benchResult = await benchmark.runBenchmark('integration', testFn, {
        operations: 100
      });
      expect(benchResult).toBeDefined();

      // Verify consistency
      expect(profile.operation).toBe('integration');
      expect(analysis.operation).toBe('integration');
      expect(benchResult.name).toBe('integration');
    });
  });
});
