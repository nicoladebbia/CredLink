import { logger } from '../utils/logger';
import { BenchmarkResult, BenchmarkSuite } from './performance-types';

/**
 * Benchmark Suite
 * 
 * Comprehensive benchmarking framework for performance testing
 */
export class BenchmarkRunner {
  private results: BenchmarkResult[] = [];

  /**
   * Run a benchmark
   */
  async runBenchmark(
    name: string,
    fn: () => Promise<void> | void,
    options: {
      operations?: number;
      duration?: number; // milliseconds
      warmup?: number;
      threshold?: number; // ops/sec
    } = {}
  ): Promise<BenchmarkResult> {
    const {
      operations = 1000,
      duration,
      warmup = 10,
      threshold
    } = options;

    logger.info('Running benchmark', { name, operations, warmup });

    // Warmup
    for (let i = 0; i < warmup; i++) {
      await fn();
    }

    const startMemory = process.memoryUsage().heapUsed;
    const startTime = Date.now();
    let completed = 0;

    if (duration) {
      // Time-based benchmark
      const endTime = startTime + duration;
      while (Date.now() < endTime) {
        await fn();
        completed++;
      }
    } else {
      // Operation-based benchmark
      for (let i = 0; i < operations; i++) {
        await fn();
        completed++;
      }
    }

    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed;

    const totalDuration = endTime - startTime;
    const opsPerSecond = (completed / totalDuration) * 1000;
    const averageTime = totalDuration / completed;
    const memoryUsed = endMemory - startMemory;

    const passed = threshold ? opsPerSecond >= threshold : true;

    const result: BenchmarkResult = {
      name,
      operations: completed,
      duration: totalDuration,
      opsPerSecond,
      averageTime,
      memoryUsed,
      passed
    };

    this.results.push(result);

    logger.info('Benchmark completed', {
      name,
      opsPerSecond: opsPerSecond.toFixed(2),
      avgTime: averageTime.toFixed(3),
      passed
    });

    return result;
  }

  /**
   * Run multiple benchmarks
   */
  async runSuite(
    suiteName: string,
    benchmarks: Array<{
      name: string;
      fn: () => Promise<void> | void;
      threshold?: number;
    }>
  ): Promise<BenchmarkSuite> {
    logger.info('Running benchmark suite', { suite: suiteName, count: benchmarks.length });

    this.results = [];

    for (const benchmark of benchmarks) {
      await this.runBenchmark(benchmark.name, benchmark.fn, {
        operations: 1000,
        warmup: 10,
        threshold: benchmark.threshold
      });
    }

    const totalOperations = this.results.reduce((sum, r) => sum + r.operations, 0);
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    const averageOpsPerSecond = this.results.reduce((sum, r) => sum + r.opsPerSecond, 0) / this.results.length;
    const passedBenchmarks = this.results.filter(r => r.passed).length;
    const failedBenchmarks = this.results.length - passedBenchmarks;

    const suite: BenchmarkSuite = {
      name: suiteName,
      results: this.results,
      summary: {
        totalOperations,
        totalDuration,
        averageOpsPerSecond,
        passedBenchmarks,
        failedBenchmarks
      },
      timestamp: new Date().toISOString()
    };

    logger.info('Benchmark suite completed', {
      suite: suiteName,
      passed: passedBenchmarks,
      failed: failedBenchmarks
    });

    return suite;
  }

  /**
   * Compare two benchmark results
   */
  compare(baseline: BenchmarkResult, current: BenchmarkResult): {
    speedup: number;
    improvement: number;
    regression: boolean;
  } {
    const speedup = current.opsPerSecond / baseline.opsPerSecond;
    const improvement = ((current.opsPerSecond - baseline.opsPerSecond) / baseline.opsPerSecond) * 100;
    const regression = speedup < 1;

    return { speedup, improvement, regression };
  }

  /**
   * Print benchmark results
   */
  printResults(suite: BenchmarkSuite): void {
    console.log('\n' + '='.repeat(80));
    console.log(`BENCHMARK SUITE: ${suite.name}`);
    console.log('='.repeat(80));
    console.log(`Timestamp: ${new Date(suite.timestamp).toLocaleString()}\n`);

    console.log('RESULTS:');
    suite.results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      console.log(`\n${status} ${result.name}`);
      console.log(`   Operations: ${result.operations.toLocaleString()}`);
      console.log(`   Duration: ${result.duration.toFixed(2)}ms`);
      console.log(`   Ops/sec: ${result.opsPerSecond.toFixed(2)}`);
      console.log(`   Avg time: ${result.averageTime.toFixed(3)}ms`);
      console.log(`   Memory: ${(result.memoryUsed / 1024 / 1024).toFixed(2)}MB`);
    });

    console.log('\n' + '-'.repeat(80));
    console.log('SUMMARY:');
    console.log(`   Total Operations: ${suite.summary.totalOperations.toLocaleString()}`);
    console.log(`   Total Duration: ${suite.summary.totalDuration.toFixed(2)}ms`);
    console.log(`   Average Ops/sec: ${suite.summary.averageOpsPerSecond.toFixed(2)}`);
    console.log(`   Passed: ${suite.summary.passedBenchmarks}/${suite.results.length}`);
    console.log(`   Failed: ${suite.summary.failedBenchmarks}/${suite.results.length}`);
    console.log('='.repeat(80) + '\n');
  }

  /**
   * Get results
   */
  getResults(): BenchmarkResult[] {
    return this.results;
  }

  /**
   * Clear results
   */
  clearResults(): void {
    this.results = [];
  }
}

/**
 * Common benchmark utilities
 */
export class BenchmarkUtils {
  /**
   * Measure function execution time
   */
  static async measure<T>(fn: () => Promise<T> | T): Promise<{ result: T; duration: number }> {
    const start = process.hrtime.bigint();
    const result = await fn();
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to ms
    return { result, duration };
  }

  /**
   * Run function N times and get average duration
   */
  static async measureAverage(
    fn: () => Promise<void> | void,
    iterations: number
  ): Promise<number> {
    const durations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const { duration } = await this.measure(fn);
      durations.push(duration);
    }

    return durations.reduce((sum, d) => sum + d, 0) / durations.length;
  }

  /**
   * Measure memory usage
   */
  static measureMemory<T>(fn: () => T): { result: T; memoryDelta: number } {
    const startMemory = process.memoryUsage().heapUsed;
    const result = fn();
    const endMemory = process.memoryUsage().heapUsed;
    const memoryDelta = endMemory - startMemory;
    return { result, memoryDelta };
  }

  /**
   * Create a performance test
   */
  static createTest(
    name: string,
    fn: () => Promise<void> | void,
    expectedOpsPerSec?: number
  ): { name: string; fn: () => Promise<void> | void; threshold?: number } {
    return {
      name,
      fn,
      threshold: expectedOpsPerSec
    };
  }
}
