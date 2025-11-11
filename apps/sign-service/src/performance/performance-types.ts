/**
 * Performance Testing & Profiling Types
 */

/**
 * Operation metrics
 */
export interface OperationMetrics {
  operation: string;
  duration: number; // milliseconds
  memoryUsed?: number; // bytes
  memoryDelta?: number; // bytes
  cpuUsage?: number; // percentage
  timestamp: string;
  error?: string;
}

/**
 * Performance thresholds
 */
export interface PerformanceThresholds {
  signing: LatencyThresholds;
  verification: LatencyThresholds;
  storage: LatencyThresholds;
  memory: MemoryThresholds;
}

/**
 * Latency thresholds
 */
export interface LatencyThresholds {
  p50: number; // milliseconds
  p95: number; // milliseconds
  p99: number; // milliseconds
}

/**
 * Memory thresholds
 */
export interface MemoryThresholds {
  maxHeap: number; // bytes
  maxIncrease: number; // bytes
}

/**
 * Operation result
 */
export interface OperationResult {
  success: boolean;
  duration: number;
  timestamp: string;
  error?: string;
}

/**
 * Load test report
 */
export interface LoadTestReport {
  operation: string;
  concurrency: number;
  duration: number; // milliseconds
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  requestsPerSecond: number;
  errorRate: number;
  latency: LatencyStats;
  passedThresholds: ThresholdEvaluation;
  timestamp: string;
}

/**
 * Latency statistics
 */
export interface LatencyStats {
  p50: number;
  p95: number;
  p99: number;
  average: number;
  min?: number;
  max?: number;
}

/**
 * Threshold evaluation
 */
export interface ThresholdEvaluation {
  passed: boolean;
  details: string[];
  failures?: string[];
}

/**
 * Bottleneck analysis
 */
export interface BottleneckAnalysis {
  operation: string;
  bottlenecks: Bottleneck[];
  recommendations: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  estimatedImprovement: number; // percentage
}

/**
 * Bottleneck
 */
export interface Bottleneck {
  type: 'cpu' | 'memory' | 'io' | 'network' | 'algorithm';
  description: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  location?: string;
  metrics: {
    current: number;
    expected: number;
    overhead: number;
  };
}

/**
 * Performance profile
 */
export interface PerformanceProfile {
  operation: string;
  samples: number;
  duration: number; // total duration in ms
  metrics: {
    latency: LatencyStats;
    memory: MemoryStats;
    cpu: CPUStats;
  };
  bottlenecks: Bottleneck[];
  timestamp: string;
}

/**
 * Memory statistics
 */
export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  peak: number;
  average: number;
}

/**
 * CPU statistics
 */
export interface CPUStats {
  user: number;
  system: number;
  total: number;
  average: number;
  peak: number;
}

/**
 * Optimization suggestion
 */
export interface OptimizationSuggestion {
  category: 'algorithm' | 'caching' | 'parallelization' | 'memory' | 'io';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  estimatedGain: number; // percentage
  effort: 'low' | 'medium' | 'high';
  implementation: string;
}

/**
 * Performance comparison
 */
export interface PerformanceComparison {
  baseline: PerformanceProfile;
  optimized: PerformanceProfile;
  improvement: {
    latency: number; // percentage
    memory: number; // percentage
    throughput: number; // percentage
  };
  regressions: string[];
}

/**
 * Benchmark result
 */
export interface BenchmarkResult {
  name: string;
  operations: number;
  duration: number; // milliseconds
  opsPerSecond: number;
  averageTime: number; // milliseconds per operation
  memoryUsed: number; // bytes
  passed: boolean;
}

/**
 * Benchmark suite
 */
export interface BenchmarkSuite {
  name: string;
  results: BenchmarkResult[];
  summary: {
    totalOperations: number;
    totalDuration: number;
    averageOpsPerSecond: number;
    passedBenchmarks: number;
    failedBenchmarks: number;
  };
  timestamp: string;
}
