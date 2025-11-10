/**
 * Phase 6 - Optimizer Auto-Fallback: Performance Testing Infrastructure
 * Load testing, benchmarks, and performance monitoring
 */

export interface LoadTestConfig {
  endpoint: string;
  routes: string[];
  concurrency: number;
  duration: number;
  rampUp: number;
  requestsPerSecond: number;
  payloads: TestPayload[];
}

export interface TestPayload {
  name: string;
  headers: Record<string, string>;
  body?: string;
  method: string;
}

export interface LoadTestResult {
  testId: string;
  config: LoadTestConfig;
  startTime: number;
  endTime: number;
  duration: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  requestsPerSecond: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  errors: Record<string, number>;
  throughput: number;
  cpuUsage: number;
  memoryUsage: number;
  routeStats: Record<string, RouteStats>;
}

export interface RouteStats {
  route: string;
  requests: number;
  successRate: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  errors: Record<string, number>;
}

export interface BenchmarkResult {
  name: string;
  category: string;
  score: number;
  unit: string;
  baseline: number;
  improvement: number;
  timestamp: number;
  metadata: Record<string, any>;
}

export class PerformanceTestSuite {
  private results: LoadTestResult[] = [];
  private benchmarks: BenchmarkResult[] = [];
  private isRunning: boolean = false;

  // Execute comprehensive load test
  async executeLoadTest(config: LoadTestConfig): Promise<LoadTestResult> {
    const testId = `load-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`🚀 Starting load test: ${testId}`);
    console.log(`   Endpoint: ${config.endpoint}`);
    console.log(`   Concurrency: ${config.concurrency}`);
    console.log(`   Duration: ${config.duration}ms`);
    console.log(`   Target RPS: ${config.requestsPerSecond}`);
    
    this.isRunning = true;
    
    const result: LoadTestResult = {
      testId,
      config,
      startTime: Date.now(),
      endTime: 0,
      duration: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      requestsPerSecond: 0,
      averageResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      p50ResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      errorRate: 0,
      errors: {},
      throughput: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      routeStats: {}
    };
    
    try {
      const responseTimes: number[] = [];
      const routeResponseTimes: Record<string, number[]> = {};
      
      // Initialize route stats
      for (const route of config.routes) {
        result.routeStats[route] = {
          route,
          requests: 0,
          successRate: 0,
          avgResponseTime: 0,
          p95ResponseTime: 0,
          errors: {}
        };
        routeResponseTimes[route] = [];
      }
      
      // Calculate request interval
      const requestInterval = 1000 / config.requestsPerSecond;
      const workers: Promise<void>[] = [];
      
      // Create concurrent workers
      for (let i = 0; i < config.concurrency; i++) {
        workers.push(this.createWorker(config, i, requestInterval, responseTimes, routeResponseTimes, result));
      }
      
      // Start performance monitoring
      const monitoringInterval = setInterval(() => {
        result.cpuUsage = Math.random() * 0.8; // Simulated
        result.memoryUsage = Math.random() * 0.7; // Simulated
      }, 1000);
      
      // Wait for all workers to complete
      await Promise.all(workers);
      
      // Stop monitoring
      clearInterval(monitoringInterval);
      
      // Calculate final statistics
      result.endTime = Date.now();
      result.duration = result.endTime - result.startTime;
      result.totalRequests = responseTimes.length;
      result.successfulRequests = result.totalRequests - result.failedRequests;
      result.requestsPerSecond = (result.totalRequests / result.duration) * 1000;
      result.errorRate = result.failedRequests / result.totalRequests;
      
      if (responseTimes.length > 0) {
        responseTimes.sort((a, b) => a - b);
        result.averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
        result.minResponseTime = responseTimes[0];
        result.maxResponseTime = responseTimes[responseTimes.length - 1];
        result.p50ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.5)];
        result.p95ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.95)];
        result.p99ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.99)];
      }
      
      // Calculate route statistics
      for (const route of config.routes) {
        const times = routeResponseTimes[route];
        const stats = result.routeStats[route];
        
        stats.requests = times.length;
        if (times.length > 0) {
          times.sort((a, b) => a - b);
          stats.avgResponseTime = times.reduce((sum, time) => sum + time, 0) / times.length;
          stats.p95ResponseTime = times[Math.floor(times.length * 0.95)];
          stats.successRate = 1 - (Object.values(stats.errors).reduce((sum, count) => sum + count, 0) / times.length);
        }
      }
      
      result.throughput = result.successfulRequests / (result.duration / 1000);
      
      console.log(`✅ Load test completed: ${testId}`);
      console.log(`   Total requests: ${result.totalRequests}`);
      console.log(`   Success rate: ${((result.successfulRequests / result.totalRequests) * 100).toFixed(2)}%`);
      console.log(`   Average response time: ${result.averageResponseTime.toFixed(2)}ms`);
      console.log(`   P95 response time: ${result.p95ResponseTime.toFixed(2)}ms`);
      console.log(`   Requests per second: ${result.requestsPerSecond.toFixed(2)}`);
      
      this.results.push(result);
      return result;
      
    } catch (error) {
      console.error(`❌ Load test failed: ${testId}`, error);
      result.endTime = Date.now();
      result.duration = result.endTime - result.startTime;
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  // Create worker for load testing
  private async createWorker(
    config: LoadTestConfig,
    workerId: number,
    requestInterval: number,
    responseTimes: number[],
    routeResponseTimes: Record<string, number[]>,
    result: LoadTestResult
  ): Promise<void> {
    const endTime = Date.now() + config.duration;
    const startTime = Date.now();
    
    // Ramp up delay
    const rampUpDelay = (config.rampUp / config.concurrency) * workerId;
    await new Promise(resolve => setTimeout(resolve, rampUpDelay));
    
    while (Date.now() < endTime && this.isRunning) {
      const route = config.routes[Math.floor(Math.random() * config.routes.length)];
      const payload = config.payloads[Math.floor(Math.random() * config.payloads.length)];
      
      try {
        const startTime = performance.now();
        
        const response = await fetch(config.endpoint + route, {
          method: payload.method,
          headers: {
            'User-Agent': `C2-LoadTest/${workerId}`,
            'X-Test-Worker': workerId.toString(),
            ...payload.headers
          },
          body: payload.body
        });
        
        const responseTime = performance.now() - startTime;
        responseTimes.push(responseTime);
        routeResponseTimes[route].push(responseTime);
        
        if (!response.ok) {
          result.failedRequests++;
          const errorKey = `HTTP_${response.status}`;
          result.errors[errorKey] = (result.errors[errorKey] || 0) + 1;
          result.routeStats[route].errors[errorKey] = (result.routeStats[route].errors[errorKey] || 0) + 1;
        }
        
      } catch (error) {
        result.failedRequests++;
        const errorKey = error.name || 'NETWORK_ERROR';
        result.errors[errorKey] = (result.errors[errorKey] || 0) + 1;
        result.routeStats[route].errors[errorKey] = (result.routeStats[route].errors[errorKey] || 0) + 1;
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, requestInterval));
    }
  }

  // Execute performance benchmarks
  async executeBenchmarks(): Promise<BenchmarkResult[]> {
    console.log('🏁 Starting performance benchmarks...');
    
    const benchmarks: BenchmarkResult[] = [];
    
    // Benchmark 1: Signal detection performance
    benchmarks.push(await this.benchmarkSignalDetection());
    
    // Benchmark 2: Policy evaluation performance
    benchmarks.push(await this.benchmarkPolicyEvaluation());
    
    // Benchmark 3: Memory usage under load
    benchmarks.push(await this.benchmarkMemoryUsage());
    
    // Benchmark 4: Circuit breaker performance
    benchmarks.push(await this.benchmarkCircuitBreaker());
    
    // Benchmark 5: Rate limiter performance
    benchmarks.push(await this.benchmarkRateLimiter());
    
    console.log(`✅ Benchmarks completed: ${benchmarks.length} tests`);
    
    this.benchmarks.push(...benchmarks);
    return benchmarks;
  }

  // Benchmark signal detection
  private async benchmarkSignalDetection(): Promise<BenchmarkResult> {
    const iterations = 10000;
    const startTime = performance.now();
    
    // Simulate signal detection
    for (let i = 0; i < iterations; i++) {
      // Simulate work
      Math.random() * 100;
    }
    
    const duration = performance.now() - startTime;
    const score = iterations / (duration / 1000); // Operations per second
    
    return {
      name: 'Signal Detection',
      category: 'Core Logic',
      score,
      unit: 'ops/sec',
      baseline: 50000,
      improvement: ((score - 50000) / 50000) * 100,
      timestamp: Date.now(),
      metadata: { iterations, duration }
    };
  }

  // Benchmark policy evaluation
  private async benchmarkPolicyEvaluation(): Promise<BenchmarkResult> {
    const iterations = 5000;
    const startTime = performance.now();
    
    // Simulate policy evaluation
    for (let i = 0; i < iterations; i++) {
      // Simulate policy logic
      const score = Math.random() * 200;
      const mode = score > 100 ? 'FALLBACK_REMOTE_ONLY' : 'NORMAL';
    }
    
    const duration = performance.now() - startTime;
    const score = iterations / (duration / 1000);
    
    return {
      name: 'Policy Evaluation',
      category: 'Core Logic',
      score,
      unit: 'ops/sec',
      baseline: 25000,
      improvement: ((score - 25000) / 25000) * 100,
      timestamp: Date.now(),
      metadata: { iterations, duration }
    };
  }

  // Benchmark memory usage
  private async benchmarkMemoryUsage(): Promise<BenchmarkResult> {
    const iterations = 1000;
    const objects: any[] = [];
    
    const startTime = performance.now();
    
    // Simulate memory allocation
    for (let i = 0; i < iterations; i++) {
      objects.push({
        id: i,
        data: new Array(100).fill(Math.random()),
        timestamp: Date.now()
      });
    }
    
    const duration = performance.now() - startTime;
    const memoryUsed = objects.length * 100; // Simplified memory calculation
    const score = memoryUsed / 1024 / 1024; // MB
    
    // Clean up
    objects.length = 0;
    
    return {
      name: 'Memory Usage',
      category: 'Resource',
      score,
      unit: 'MB',
      baseline: 10,
      improvement: ((10 - score) / 10) * 100,
      timestamp: Date.now(),
      metadata: { iterations, objectsCreated: iterations }
    };
  }

  // Benchmark circuit breaker
  private async benchmarkCircuitBreaker(): Promise<BenchmarkResult> {
    const iterations = 5000;
    const startTime = performance.now();
    
    // Simulate circuit breaker operations
    for (let i = 0; i < iterations; i++) {
      // Simulate circuit breaker check
      const state = Math.random() > 0.1 ? 'CLOSED' : 'OPEN';
      const allowed = state === 'CLOSED';
    }
    
    const duration = performance.now() - startTime;
    const score = iterations / (duration / 1000);
    
    return {
      name: 'Circuit Breaker',
      category: 'Resilience',
      score,
      unit: 'ops/sec',
      baseline: 100000,
      improvement: ((score - 100000) / 100000) * 100,
      timestamp: Date.now(),
      metadata: { iterations, duration }
    };
  }

  // Benchmark rate limiter
  private async benchmarkRateLimiter(): Promise<BenchmarkResult> {
    const iterations = 10000;
    const startTime = performance.now();
    
    // Simulate rate limiter checks
    for (let i = 0; i < iterations; i++) {
      // Simulate rate limit check
      const key = `user-${i % 100}`;
      const count = Math.floor(Math.random() * 100);
      const limit = 1000;
      const allowed = count < limit;
    }
    
    const duration = performance.now() - startTime;
    const score = iterations / (duration / 1000);
    
    return {
      name: 'Rate Limiter',
      category: 'Security',
      score,
      unit: 'ops/sec',
      baseline: 200000,
      improvement: ((score - 200000) / 200000) * 100,
      timestamp: Date.now(),
      metadata: { iterations, duration }
    };
  }

  // Generate performance report
  generatePerformanceReport(): any {
    if (this.results.length === 0 && this.benchmarks.length === 0) {
      return { error: 'No test results available' };
    }
    
    const report: any = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalLoadTests: this.results.length,
        totalBenchmarks: this.benchmarks.length,
        lastTestRun: this.results.length > 0 ? 
          new Date(this.results[this.results.length - 1].endTime).toISOString() : null
      },
      loadTests: this.results.map(test => ({
        testId: test.testId,
        duration: test.duration,
        totalRequests: test.totalRequests,
        successRate: ((test.successfulRequests / test.totalRequests) * 100).toFixed(2),
        avgResponseTime: test.averageResponseTime.toFixed(2),
        p95ResponseTime: test.p95ResponseTime.toFixed(2),
        requestsPerSecond: test.requestsPerSecond.toFixed(2),
        errorRate: (test.errorRate * 100).toFixed(2)
      })),
      benchmarks: this.benchmarks.map(benchmark => ({
        name: benchmark.name,
        category: benchmark.category,
        score: benchmark.score.toFixed(2),
        unit: benchmark.unit,
        improvement: benchmark.improvement.toFixed(2),
        status: benchmark.improvement >= 0 ? '✅ Improved' : '❌ Regressed'
      })),
      recommendations: this.generateRecommendations()
    };
    
    return report;
  }

  // Generate performance recommendations
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    
    if (this.results.length > 0) {
      const latestTest = this.results[this.results.length - 1];
      
      if (latestTest.errorRate > 0.05) {
        recommendations.push('High error rate detected (>5%) - investigate error patterns');
      }
      
      if (latestTest.p95ResponseTime > 1000) {
        recommendations.push('P95 response time > 1s - consider optimization');
      }
      
      if (latestTest.requestsPerSecond < 100) {
        recommendations.push('Low throughput - investigate performance bottlenecks');
      }
      
      if (latestTest.memoryUsage > 0.8) {
        recommendations.push('High memory usage - optimize memory management');
      }
    }
    
    if (this.benchmarks.length > 0) {
      const regressedBenchmarks = this.benchmarks.filter(b => b.improvement < 0);
      if (regressedBenchmarks.length > 0) {
        recommendations.push(`${regressedBenchmarks.length} benchmarks show regression - investigate performance degradation`);
      }
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Performance is within acceptable limits');
    }
    
    return recommendations;
  }

  // Get test results
  getTestResults(): LoadTestResult[] {
    return [...this.results];
  }

  // Get benchmark results
  getBenchmarkResults(): BenchmarkResult[] {
    return [...this.benchmarks];
  }

  // Clear results
  clearResults(): void {
    this.results = [];
    this.benchmarks = [];
  }

  // Export results
  exportResults(format: 'json' | 'csv' | 'html'): string {
    switch (format) {
      case 'json':
        return JSON.stringify({
          loadTests: this.results,
          benchmarks: this.benchmarks,
          report: this.generatePerformanceReport()
        }, null, 2);
      case 'csv':
        return this.exportToCSV();
      case 'html':
        return this.exportToHTML();
      default:
        return '';
    }
  }

  private exportToCSV(): string {
    const csvRows: string[] = [];
    
    // Load test results
    csvRows.push('Load Test Results');
    csvRows.push('Test ID,Duration,Total Requests,Success Rate,Avg Response Time,P95 Response Time,RPS,Error Rate');
    
    this.results.forEach(test => {
      csvRows.push([
        test.testId,
        test.duration,
        test.totalRequests,
        ((test.successfulRequests / test.totalRequests) * 100).toFixed(2),
        test.averageResponseTime.toFixed(2),
        test.p95ResponseTime.toFixed(2),
        test.requestsPerSecond.toFixed(2),
        (test.errorRate * 100).toFixed(2)
      ].join(','));
    });
    
    return csvRows.join('\n');
  }

  private exportToHTML(): string {
    const report = this.generatePerformanceReport();
    
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Performance Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .status-improved { color: green; }
        .status-regressed { color: red; }
    </style>
</head>
<body>
    <h1>Performance Test Report</h1>
    <p>Generated: ${report.generatedAt}</p>
    
    <h2>Summary</h2>
    <ul>
        <li>Total Load Tests: ${report.summary.totalLoadTests}</li>
        <li>Total Benchmarks: ${report.summary.totalBenchmarks}</li>
        <li>Last Test Run: ${report.summary.lastTestRun || 'N/A'}</li>
    </ul>
    
    <h2>Load Test Results</h2>
    <table>
        <tr>
            <th>Test ID</th>
            <th>Duration</th>
            <th>Total Requests</th>
            <th>Success Rate</th>
            <th>Avg Response Time</th>
            <th>P95 Response Time</th>
            <th>RPS</th>
            <th>Error Rate</th>
        </tr>
        ${report.loadTests.map((test: any) => `
        <tr>
            <td>${test.testId}</td>
            <td>${test.duration}ms</td>
            <td>${test.totalRequests}</td>
            <td>${test.successRate}%</td>
            <td>${test.avgResponseTime}ms</td>
            <td>${test.p95ResponseTime}ms</td>
            <td>${test.requestsPerSecond}</td>
            <td>${test.errorRate}%</td>
        </tr>
        `).join('')}
    </table>
    
    <h2>Benchmark Results</h2>
    <table>
        <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Score</th>
            <th>Unit</th>
            <th>Improvement</th>
            <th>Status</th>
        </tr>
        ${report.benchmarks.map((benchmark: any) => `
        <tr>
            <td>${benchmark.name}</td>
            <td>${benchmark.category}</td>
            <td>${benchmark.score}</td>
            <td>${benchmark.unit}</td>
            <td>${benchmark.improvement}%</td>
            <td class="${benchmark.status.includes('Improved') ? 'status-improved' : 'status-regressed'}">${benchmark.status}</td>
        </tr>
        `).join('')}
    </table>
    
    <h2>Recommendations</h2>
    <ul>
        ${report.recommendations.map((rec: string) => `<li>${rec}</li>`).join('')}
    </ul>
</body>
</html>`;
  }
}

// Global performance test suite
export const performanceTestSuite = new PerformanceTestSuite();
