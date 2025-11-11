import { logger } from '../utils/logger';
import {
  OperationMetrics,
  PerformanceThresholds,
  LoadTestReport,
  OperationResult,
  ThresholdEvaluation,
  PerformanceProfile,
  LatencyStats,
  MemoryStats,
  CPUStats,
  Bottleneck
} from '../performance/performance-types';

/**
 * Performance Profiler
 * 
 * Comprehensive performance profiling and load testing framework
 */
export class PerformanceProfiler {
  private metrics: Map<string, OperationMetrics[]> = new Map();
  private thresholds: PerformanceThresholds;
  private profiles: Map<string, PerformanceProfile> = new Map();

  constructor(customThresholds?: Partial<PerformanceThresholds>) {
    this.thresholds = {
      signing: { p50: 1000, p95: 2000, p99: 3000 },
      verification: { p50: 200, p95: 500, p99: 1000 },
      storage: { p50: 100, p95: 200, p99: 400 },
      memory: { maxHeap: 512 * 1024 * 1024, maxIncrease: 100 * 1024 * 1024 },
      ...customThresholds
    };

    logger.info('Performance Profiler initialized', {
      thresholds: this.thresholds
    });
  }

  /**
   * Profile an operation
   */
  async profileOperation<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<{ result: T; metrics: OperationMetrics }> {
    const startMemory = process.memoryUsage();
    const startCPU = process.cpuUsage();
    const startTime = process.hrtime.bigint();

    try {
      const result = await fn();

      const endTime = process.hrtime.bigint();
      const endMemory = process.memoryUsage();
      const endCPU = process.cpuUsage(startCPU);

      const duration = Number(endTime - startTime) / 1000000; // Convert to ms
      const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
      const cpuUsage = (endCPU.user + endCPU.system) / 1000; // Convert to ms

      const metrics: OperationMetrics = {
        operation,
        duration,
        memoryUsed: endMemory.heapUsed,
        memoryDelta,
        cpuUsage,
        timestamp: new Date().toISOString()
      };

      this.recordMetrics(operation, metrics);

      return { result, metrics };
    } catch (error) {
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;

      const errorMetrics: OperationMetrics = {
        operation,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };

      this.recordMetrics(operation, errorMetrics);

      throw error;
    }
  }

  /**
   * Run load test
   */
  async runLoadTest(
    operation: string,
    fn: () => Promise<void>,
    concurrency: number,
    durationSeconds: number
  ): Promise<LoadTestReport> {
    logger.info('Starting load test', {
      operation,
      concurrency,
      duration: durationSeconds
    });

    const results: OperationResult[] = [];
    const startTime = Date.now();
    let completedRequests = 0;
    let failedRequests = 0;
    let isRunning = true;

    const runRequest = async (): Promise<void> => {
      if (!isRunning) return;

      const requestStart = Date.now();
      try {
        await fn();
        completedRequests++;
        results.push({
          success: true,
          duration: Date.now() - requestStart,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        failedRequests++;
        results.push({
          success: false,
          duration: Date.now() - requestStart,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
    };

    // Run concurrent requests for specified duration
    const promises: Promise<void>[] = [];
    const interval = setInterval(() => {
      if (!isRunning) return;
      
      for (let i = 0; i < concurrency; i++) {
        promises.push(runRequest());
      }
    }, 1000); // Add new batch every second

    // Wait for test duration
    await new Promise(resolve => setTimeout(resolve, durationSeconds * 1000));
    isRunning = false;
    clearInterval(interval);

    // Wait for all pending requests to complete
    await Promise.all(promises);

    const totalTime = Date.now() - startTime;
    const successfulResults = results.filter(r => r.success);
    const durations = successfulResults.map(r => r.duration);

    const latency = this.calculateLatencyStats(durations);
    const passedThresholds = this.evaluateThresholds(operation, durations);

    const report: LoadTestReport = {
      operation,
      concurrency,
      duration: totalTime,
      totalRequests: completedRequests + failedRequests,
      successfulRequests: completedRequests,
      failedRequests,
      requestsPerSecond: (completedRequests / totalTime) * 1000,
      errorRate: failedRequests / (completedRequests + failedRequests),
      latency,
      passedThresholds,
      timestamp: new Date().toISOString()
    };

    logger.info('Load test completed', {
      operation,
      totalRequests: report.totalRequests,
      successRate: (1 - report.errorRate) * 100,
      rps: report.requestsPerSecond.toFixed(2)
    });

    return report;
  }

  /**
   * Create performance profile
   */
  async createProfile(
    operation: string,
    fn: () => Promise<void>,
    samples: number = 100
  ): Promise<PerformanceProfile> {
    logger.info('Creating performance profile', { operation, samples });

    const durations: number[] = [];
    const memorySnapshots: number[] = [];
    const cpuSnapshots: number[] = [];
    const startTime = Date.now();

    for (let i = 0; i < samples; i++) {
      const startCPU = process.cpuUsage();
      const start = process.hrtime.bigint();

      await fn();

      const end = process.hrtime.bigint();
      const endMem = process.memoryUsage();
      const endCPU = process.cpuUsage(startCPU);

      durations.push(Number(end - start) / 1000000);
      memorySnapshots.push(endMem.heapUsed);
      cpuSnapshots.push((endCPU.user + endCPU.system) / 1000);
    }

    const totalDuration = Date.now() - startTime;

    const latency = this.calculateLatencyStats(durations);
    const memory = this.calculateMemoryStats(memorySnapshots);
    const cpu = this.calculateCPUStats(cpuSnapshots);
    const bottlenecks = this.identifyBottlenecks(operation, { latency, memory, cpu });

    const profile: PerformanceProfile = {
      operation,
      samples,
      duration: totalDuration,
      metrics: { latency, memory, cpu },
      bottlenecks,
      timestamp: new Date().toISOString()
    };

    this.profiles.set(operation, profile);

    logger.info('Performance profile created', {
      operation,
      samples,
      avgLatency: latency.average.toFixed(2),
      bottlenecks: bottlenecks.length
    });

    return profile;
  }

  /**
   * Calculate latency statistics
   */
  private calculateLatencyStats(durations: number[]): LatencyStats {
    if (durations.length === 0) {
      return { p50: 0, p95: 0, p99: 0, average: 0, min: 0, max: 0 };
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const sum = durations.reduce((acc, d) => acc + d, 0);

    return {
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
      average: sum / durations.length,
      min: sorted[0],
      max: sorted[sorted.length - 1]
    };
  }

  /**
   * Calculate memory statistics
   */
  private calculateMemoryStats(snapshots: number[]): MemoryStats {
    if (snapshots.length === 0) {
      return {
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0,
        arrayBuffers: 0,
        peak: 0,
        average: 0
      };
    }

    const current = process.memoryUsage();
    const sum = snapshots.reduce((acc, s) => acc + s, 0);

    return {
      heapUsed: current.heapUsed,
      heapTotal: current.heapTotal,
      external: current.external,
      rss: current.rss,
      arrayBuffers: current.arrayBuffers,
      peak: Math.max(...snapshots),
      average: sum / snapshots.length
    };
  }

  /**
   * Calculate CPU statistics
   */
  private calculateCPUStats(snapshots: number[]): CPUStats {
    if (snapshots.length === 0) {
      return { user: 0, system: 0, total: 0, average: 0, peak: 0 };
    }

    const sum = snapshots.reduce((acc, s) => acc + s, 0);

    return {
      user: 0, // Would need more detailed tracking
      system: 0,
      total: sum,
      average: sum / snapshots.length,
      peak: Math.max(...snapshots)
    };
  }

  /**
   * Identify bottlenecks
   */
  private identifyBottlenecks(
    operation: string,
    metrics: { latency: LatencyStats; memory: MemoryStats; cpu: CPUStats }
  ): Bottleneck[] {
    const bottlenecks: Bottleneck[] = [];
    const thresholds = this.thresholds[operation as keyof PerformanceThresholds];

    // Check latency bottlenecks
    if (thresholds && 'p95' in thresholds) {
      if (metrics.latency.p95 > thresholds.p95) {
        bottlenecks.push({
          type: 'algorithm',
          description: `P95 latency (${metrics.latency.p95.toFixed(2)}ms) exceeds threshold (${thresholds.p95}ms)`,
          impact: metrics.latency.p95 > thresholds.p95 * 2 ? 'critical' : 'high',
          metrics: {
            current: metrics.latency.p95,
            expected: thresholds.p95,
            overhead: ((metrics.latency.p95 - thresholds.p95) / thresholds.p95) * 100
          }
        });
      }
    }

    // Check memory bottlenecks
    if (this.thresholds.memory) {
      if (metrics.memory.heapUsed > this.thresholds.memory.maxHeap) {
        bottlenecks.push({
          type: 'memory',
          description: `Heap usage (${(metrics.memory.heapUsed / 1024 / 1024).toFixed(2)}MB) exceeds threshold`,
          impact: 'high',
          metrics: {
            current: metrics.memory.heapUsed,
            expected: this.thresholds.memory.maxHeap,
            overhead: ((metrics.memory.heapUsed - this.thresholds.memory.maxHeap) / this.thresholds.memory.maxHeap) * 100
          }
        });
      }
    }

    return bottlenecks;
  }

  /**
   * Evaluate thresholds
   */
  private evaluateThresholds(operation: string, durations: number[]): ThresholdEvaluation {
    const thresholds = this.thresholds[operation as keyof PerformanceThresholds];
    
    if (!thresholds || !('p50' in thresholds)) {
      return { passed: true, details: ['No thresholds defined'] };
    }

    const p50 = this.percentile(durations, 0.5);
    const p95 = this.percentile(durations, 0.95);
    const p99 = this.percentile(durations, 0.99);

    const details: string[] = [];
    const failures: string[] = [];
    let passed = true;

    if (p50 <= thresholds.p50) {
      details.push(`✅ P50: ${p50.toFixed(2)}ms <= ${thresholds.p50}ms`);
    } else {
      failures.push(`❌ P50: ${p50.toFixed(2)}ms > ${thresholds.p50}ms`);
      passed = false;
    }

    if (p95 <= thresholds.p95) {
      details.push(`✅ P95: ${p95.toFixed(2)}ms <= ${thresholds.p95}ms`);
    } else {
      failures.push(`❌ P95: ${p95.toFixed(2)}ms > ${thresholds.p95}ms`);
      passed = false;
    }

    if (p99 <= thresholds.p99) {
      details.push(`✅ P99: ${p99.toFixed(2)}ms <= ${thresholds.p99}ms`);
    } else {
      failures.push(`❌ P99: ${p99.toFixed(2)}ms > ${thresholds.p99}ms`);
      passed = false;
    }

    return { passed, details, failures };
  }

  /**
   * Calculate percentile
   */
  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  /**
   * Record metrics
   */
  private recordMetrics(operation: string, metrics: OperationMetrics): void {
    const existing = this.metrics.get(operation) || [];
    existing.push(metrics);
    this.metrics.set(operation, existing);
  }

  /**
   * Get all metrics for an operation
   */
  getMetrics(operation: string): OperationMetrics[] {
    return this.metrics.get(operation) || [];
  }

  /**
   * Get profile for an operation
   */
  getProfile(operation: string): PerformanceProfile | undefined {
    return this.profiles.get(operation);
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics.clear();
    this.profiles.clear();
    logger.info('Performance metrics cleared');
  }

  /**
   * Get summary statistics
   */
  getSummary(): Record<string, { count: number; avgDuration: number; errors: number }> {
    const summary: Record<string, { count: number; avgDuration: number; errors: number }> = {};

    this.metrics.forEach((metrics, operation) => {
      const durations = metrics.filter(m => !m.error).map(m => m.duration);
      const errors = metrics.filter(m => m.error).length;

      summary[operation] = {
        count: metrics.length,
        avgDuration: durations.length > 0 
          ? durations.reduce((sum, d) => sum + d, 0) / durations.length 
          : 0,
        errors
      };
    });

    return summary;
  }
}
