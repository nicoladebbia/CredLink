import { logger } from '../utils/logger';
import {
  BottleneckAnalysis,
  Bottleneck,
  OptimizationSuggestion,
  PerformanceProfile
} from './performance-types';

/**
 * Bottleneck Analyzer
 * 
 * Identifies performance bottlenecks and provides optimization suggestions
 */
export class BottleneckAnalyzer {
  /**
   * Analyze performance profile for bottlenecks
   */
  analyze(profile: PerformanceProfile): BottleneckAnalysis {
    logger.info('Analyzing bottlenecks', { operation: profile.operation });

    const bottlenecks = this.identifyBottlenecks(profile);
    const recommendations = this.generateRecommendations(bottlenecks, profile);
    const severity = this.calculateSeverity(bottlenecks);
    const estimatedImprovement = this.estimateImprovement(bottlenecks);

    return {
      operation: profile.operation,
      bottlenecks,
      recommendations,
      severity,
      estimatedImprovement
    };
  }

  /**
   * Identify bottlenecks from profile
   */
  private identifyBottlenecks(profile: PerformanceProfile): Bottleneck[] {
    const bottlenecks: Bottleneck[] = [];

    // Check latency bottlenecks
    if (profile.metrics.latency.p95 > 1000) {
      bottlenecks.push({
        type: 'algorithm',
        description: 'High P95 latency indicates algorithmic inefficiency',
        impact: profile.metrics.latency.p95 > 2000 ? 'critical' : 'high',
        location: profile.operation,
        metrics: {
          current: profile.metrics.latency.p95,
          expected: 500,
          overhead: ((profile.metrics.latency.p95 - 500) / 500) * 100
        }
      });
    }

    // Check memory bottlenecks
    const memoryMB = profile.metrics.memory.heapUsed / 1024 / 1024;
    if (memoryMB > 256) {
      bottlenecks.push({
        type: 'memory',
        description: 'High memory usage may indicate memory leaks or inefficient data structures',
        impact: memoryMB > 512 ? 'critical' : 'high',
        location: profile.operation,
        metrics: {
          current: profile.metrics.memory.heapUsed,
          expected: 256 * 1024 * 1024,
          overhead: ((memoryMB - 256) / 256) * 100
        }
      });
    }

    // Check CPU bottlenecks
    if (profile.metrics.cpu.average > 500) {
      bottlenecks.push({
        type: 'cpu',
        description: 'High CPU usage indicates compute-intensive operations',
        impact: profile.metrics.cpu.average > 1000 ? 'critical' : 'medium',
        location: profile.operation,
        metrics: {
          current: profile.metrics.cpu.average,
          expected: 200,
          overhead: ((profile.metrics.cpu.average - 200) / 200) * 100
        }
      });
    }

    // Check variance (indicates inconsistent performance)
    const variance = this.calculateVariance(profile);
    if (variance > 0.5) {
      bottlenecks.push({
        type: 'io',
        description: 'High variance suggests I/O or network bottlenecks',
        impact: variance > 1.0 ? 'high' : 'medium',
        location: profile.operation,
        metrics: {
          current: variance,
          expected: 0.2,
          overhead: ((variance - 0.2) / 0.2) * 100
        }
      });
    }

    return bottlenecks;
  }

  /**
   * Calculate performance variance
   */
  private calculateVariance(profile: PerformanceProfile): number {
    const { latency } = profile.metrics;
    if (latency.average === 0) return 0;
    
    // Use coefficient of variation (std dev / mean)
    const range = (latency.max || 0) - (latency.min || 0);
    return range / latency.average;
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(
    bottlenecks: Bottleneck[],
    profile: PerformanceProfile
  ): string[] {
    const recommendations: string[] = [];

    bottlenecks.forEach(bottleneck => {
      switch (bottleneck.type) {
        case 'algorithm':
          recommendations.push('Consider optimizing algorithm complexity (e.g., use more efficient data structures)');
          recommendations.push('Profile hot paths and optimize critical sections');
          recommendations.push('Consider caching frequently computed results');
          break;

        case 'memory':
          recommendations.push('Implement object pooling to reduce GC pressure');
          recommendations.push('Use streaming for large data processing');
          recommendations.push('Review and optimize data structures for memory efficiency');
          recommendations.push('Check for memory leaks using heap snapshots');
          break;

        case 'cpu':
          recommendations.push('Offload CPU-intensive tasks to worker threads');
          recommendations.push('Implement batching to reduce per-operation overhead');
          recommendations.push('Consider using native modules for performance-critical code');
          break;

        case 'io':
          recommendations.push('Implement connection pooling for database/network operations');
          recommendations.push('Use async I/O and avoid blocking operations');
          recommendations.push('Add caching layer to reduce I/O operations');
          recommendations.push('Consider using CDN for static assets');
          break;

        case 'network':
          recommendations.push('Implement request batching to reduce network roundtrips');
          recommendations.push('Use compression for data transfer');
          recommendations.push('Consider using HTTP/2 or gRPC for better performance');
          recommendations.push('Add retry logic with exponential backoff');
          break;
      }
    });

    // Add general recommendations
    if (profile.metrics.latency.p99 > profile.metrics.latency.p95 * 2) {
      recommendations.push('High P99/P95 ratio suggests tail latency issues - investigate outliers');
    }

    if (bottlenecks.length === 0) {
      recommendations.push('Performance is within acceptable thresholds');
      recommendations.push('Consider load testing to verify scalability');
    }

    return [...new Set(recommendations)]; // Remove duplicates
  }

  /**
   * Calculate overall severity
   */
  private calculateSeverity(bottlenecks: Bottleneck[]): 'low' | 'medium' | 'high' | 'critical' {
    if (bottlenecks.length === 0) return 'low';

    const criticalCount = bottlenecks.filter(b => b.impact === 'critical').length;
    const highCount = bottlenecks.filter(b => b.impact === 'high').length;

    if (criticalCount > 0) return 'critical';
    if (highCount > 1) return 'high';
    if (highCount > 0 || bottlenecks.length > 2) return 'medium';
    return 'low';
  }

  /**
   * Estimate potential improvement
   */
  private estimateImprovement(bottlenecks: Bottleneck[]): number {
    if (bottlenecks.length === 0) return 0;

    // Estimate based on bottleneck impact and overhead
    let totalImprovement = 0;

    bottlenecks.forEach(bottleneck => {
      const impactMultiplier = {
        low: 0.1,
        medium: 0.25,
        high: 0.5,
        critical: 0.75
      }[bottleneck.impact];

      // Cap improvement at 50% per bottleneck
      const improvement = Math.min(bottleneck.metrics.overhead * impactMultiplier, 50);
      totalImprovement += improvement;
    });

    // Cap total improvement at 80%
    return Math.min(totalImprovement, 80);
  }

  /**
   * Generate optimization suggestions
   */
  generateOptimizations(analysis: BottleneckAnalysis): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    analysis.bottlenecks.forEach(bottleneck => {
      switch (bottleneck.type) {
        case 'algorithm':
          suggestions.push({
            category: 'algorithm',
            priority: bottleneck.impact === 'critical' ? 'critical' : 'high',
            description: 'Optimize algorithm complexity',
            estimatedGain: Math.min(bottleneck.metrics.overhead * 0.5, 40),
            effort: 'medium',
            implementation: 'Profile code, identify hot paths, use more efficient algorithms/data structures'
          });
          break;

        case 'memory':
          suggestions.push({
            category: 'memory',
            priority: bottleneck.impact === 'critical' ? 'critical' : 'medium',
            description: 'Reduce memory footprint',
            estimatedGain: Math.min(bottleneck.metrics.overhead * 0.3, 30),
            effort: 'medium',
            implementation: 'Implement object pooling, use streaming, optimize data structures'
          });
          break;

        case 'cpu':
          suggestions.push({
            category: 'parallelization',
            priority: 'high',
            description: 'Parallelize CPU-intensive operations',
            estimatedGain: Math.min(bottleneck.metrics.overhead * 0.6, 50),
            effort: 'high',
            implementation: 'Use worker threads, implement batching, consider native modules'
          });
          break;

        case 'io':
          suggestions.push({
            category: 'caching',
            priority: 'high',
            description: 'Implement caching layer',
            estimatedGain: Math.min(bottleneck.metrics.overhead * 0.7, 60),
            effort: 'low',
            implementation: 'Add Redis/in-memory cache, implement cache invalidation strategy'
          });
          suggestions.push({
            category: 'io',
            priority: 'medium',
            description: 'Optimize I/O operations',
            estimatedGain: Math.min(bottleneck.metrics.overhead * 0.4, 35),
            effort: 'medium',
            implementation: 'Use connection pooling, async I/O, batch operations'
          });
          break;

        case 'network':
          suggestions.push({
            category: 'caching',
            priority: 'high',
            description: 'Add CDN and edge caching',
            estimatedGain: Math.min(bottleneck.metrics.overhead * 0.8, 70),
            effort: 'low',
            implementation: 'Configure CDN, implement edge caching, use compression'
          });
          break;
      }
    });

    // Sort by priority and estimated gain
    return suggestions.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.estimatedGain - a.estimatedGain;
    });
  }

  /**
   * Compare two performance profiles
   */
  compareProfiles(
    baseline: PerformanceProfile,
    optimized: PerformanceProfile
  ): {
    latencyImprovement: number;
    memoryImprovement: number;
    throughputImprovement: number;
    regressions: string[];
  } {
    const latencyImprovement = 
      ((baseline.metrics.latency.average - optimized.metrics.latency.average) / 
       baseline.metrics.latency.average) * 100;

    const memoryImprovement = 
      ((baseline.metrics.memory.average - optimized.metrics.memory.average) / 
       baseline.metrics.memory.average) * 100;

    const baselineThroughput = baseline.samples / baseline.duration;
    const optimizedThroughput = optimized.samples / optimized.duration;
    const throughputImprovement = 
      ((optimizedThroughput - baselineThroughput) / baselineThroughput) * 100;

    const regressions: string[] = [];

    if (latencyImprovement < -5) {
      regressions.push(`Latency regression: ${Math.abs(latencyImprovement).toFixed(2)}% slower`);
    }

    if (memoryImprovement < -10) {
      regressions.push(`Memory regression: ${Math.abs(memoryImprovement).toFixed(2)}% more memory`);
    }

    if (throughputImprovement < -5) {
      regressions.push(`Throughput regression: ${Math.abs(throughputImprovement).toFixed(2)}% lower`);
    }

    return {
      latencyImprovement,
      memoryImprovement,
      throughputImprovement,
      regressions
    };
  }
}
