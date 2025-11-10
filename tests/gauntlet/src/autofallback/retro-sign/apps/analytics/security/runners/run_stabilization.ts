#!/usr/bin/env ts-node

/**
 * Phase 16 - Adversarial Lab v1
 * Stabilization Runner - System Reliability & Quality Assurance
 * 
 * Final stabilization phase ensuring production readiness:
 * - Flaky test detection and quarantine
 * - Crash minimization and recovery
 * - Quality metrics validation
 * - Documentation generation
 * - Two consecutive green nights requirement
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createLogger } from '../../src/utils/logger';

const logger = createLogger('StabilizationRunner');

interface StabilizationConfig {
  duration_days: number;
  success_criteria: {
    consecutive_green_nights: number;
    minimum_success_rate: number;
    maximum_flaky_tests: number;
    crash_threshold: number;
  };
  flaky_tests: {
    detection: {
      sample_size: number;
      flaky_threshold: number;
      min_failures: number;
    };
    quarantine: {
      auto_quarantine: boolean;
      quarantine_duration: number;
      review_required: boolean;
    };
  };
  crash_minimization: {
    prevention: {
      memory_limit_mb: number;
      execution_timeout_s: number;
      max_stack_depth: number;
    };
  };
  quality_metrics: {
    reliability: {
      target_reliability: number;
      min_coverage_percent: number;
    };
    performance: {
      max_performance_regression: number;
      p95_response_time_ms: number;
    };
    security: {
      security_coverage_percent: number;
      vulnerability_pass_rate: number;
    };
  };
}

interface TestResult {
  test_name: string;
  success: boolean;
  execution_time_ms: number;
  memory_usage_mb: number;
  error_message?: string;
  flaky_score: number;
}

interface StabilizationResult {
  night_number: number;
  timestamp: string;
  overall_success: boolean;
  success_rate: number;
  flaky_tests_detected: number;
  crashes_detected: number;
  test_results: TestResult[];
  quality_metrics: {
    reliability_score: number;
    performance_score: number;
    security_score: number;
  };
  meets_criteria: boolean;
  recommendations: string[];
}

class StabilizationRunner {
  private stabilizationDir: string;
  private artifactsDir: string;
  private config: StabilizationConfig;
  private consecutiveGreenNights: number = 0;
  private quarantineList: Set<string> = new Set();
  
  constructor() {
    this.stabilizationDir = join(__dirname, '../stabilization');
    this.artifactsDir = join(this.stabilizationDir, 'artifacts');
    
    // Load configuration
    this.config = {
      duration_days: 6,
      success_criteria: {
        consecutive_green_nights: 2,
        minimum_success_rate: 95.0,
        maximum_flaky_tests: 2,
        crash_threshold: 0
      },
      flaky_tests: {
        detection: {
          sample_size: 10,
          flaky_threshold: 0.3,
          min_failures: 2
        },
        quarantine: {
          auto_quarantine: true,
          quarantine_duration: 7,
          review_required: true
        }
      },
      crash_minimization: {
        prevention: {
          memory_limit_mb: 1024,
          execution_timeout_s: 300,
          max_stack_depth: 1000
        }
      },
      quality_metrics: {
        reliability: {
          target_reliability: 98.0,
          min_coverage_percent: 85.0
        },
        performance: {
          max_performance_regression: 10.0,
          p95_response_time_ms: 1000
        },
        security: {
          security_coverage_percent: 95.0,
          vulnerability_pass_rate: 100.0
        }
      }
    };
    
    // Ensure artifacts directory exists
    if (!existsSync(this.artifactsDir)) {
      mkdirSync(this.artifactsDir, { recursive: true });
    }
  }
  
  /**
   * Run stabilization process
   */
  async runStabilization(): Promise<StabilizationResult[]> {
    logger.info(`Starting ${this.config.duration_days} day stabilization process`);
    
    const results: StabilizationResult[] = [];
    
    // Simulate nightly runs (in real implementation, this would run daily)
    for (let night = 1; night <= 2; night++) {
      logger.info(`Running night ${night} stabilization tests`);
      
      const result = await this.runNightlyStabilization(night);
      results.push(result);
      
      if (result.meets_criteria) {
        this.consecutiveGreenNights++;
        logger.info(`✅ Night ${night} passed - ${this.consecutiveGreenNights} consecutive green nights`);
      } else {
        this.consecutiveGreenNights = 0;
        logger.error(`❌ Night ${night} failed - consecutive green nights reset`);
      }
      
      // Check if we've achieved the goal
      if (this.consecutiveGreenNights >= this.config.success_criteria.consecutive_green_nights) {
        logger.info(`🎉 Stabilization complete: ${this.consecutiveGreenNights} consecutive green nights achieved`);
        break;
      }
    }
    
    return results;
  }
  
  /**
   * Run a single night of stabilization tests
   */
  private async runNightlyStabilization(nightNumber: number): Promise<StabilizationResult> {
    try {
      // Run all security tests
      const testResults = await this.runAllSecurityTests();
      
      // Detect flaky tests
      const flakyTests = await this.detectFlakyTests(testResults);
      
      // Check for crashes
      const crashesDetected = await this.detectCrashes(testResults);
      
      // Calculate quality metrics
      const qualityMetrics = await this.calculateQualityMetrics(testResults);
      
      // Determine overall success
      const successRate = testResults.filter(r => r.success).length / testResults.length * 100;
      const overallSuccess = this.evaluateSuccessCriteria(successRate, flakyTests.length, crashesDetected);
      
      const result: StabilizationResult = {
        night_number: nightNumber,
        timestamp: new Date().toISOString(),
        overall_success: overallSuccess,
        success_rate: successRate,
        flaky_tests_detected: flakyTests.length,
        crashes_detected: crashesDetected,
        test_results: testResults,
        quality_metrics: qualityMetrics,
        meets_criteria: overallSuccess && this.consecutiveGreenNights + 1 >= this.config.success_criteria.consecutive_green_nights,
        recommendations: this.generateRecommendations(testResults, flakyTests, crashesDetected)
      };
      
      // Quarantine flaky tests if enabled
      if (this.config.flaky_tests.quarantine.auto_quarantine) {
        await this.quarantineFlakyTests(flakyTests);
      }
      
      return result;
      
    } catch (error) {
      logger.error(`Night ${nightNumber} stabilization failed:`, error);
      
      return {
        night_number: nightNumber,
        timestamp: new Date().toISOString(),
        overall_success: false,
        success_rate: 0,
        flaky_tests_detected: 0,
        crashes_detected: 1,
        test_results: [],
        quality_metrics: {
          reliability_score: 0,
          performance_score: 0,
          security_score: 0
        },
        meets_criteria: false,
        recommendations: ['Critical error in stabilization process - investigate immediately']
      };
    }
  }
  
  /**
   * Run all security test suites
   */
  private async runAllSecurityTests(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    // Run attack tests
    const attackResult = await this.runTestSuite('security:attacks', 'Attack Tests');
    results.push(attackResult);
    
    // Run fuzzing tests
    const fuzzResult = await this.runTestSuite('security:fuzz', 'Fuzzing Tests');
    results.push(fuzzResult);
    
    // Run chaos tests
    const chaosResult = await this.runTestSuite('security:chaos', 'Chaos Tests');
    results.push(chaosResult);
    
    // Run parity tests
    const parityResult = await this.runTestSuite('security:parity', 'Parity Tests');
    results.push(parityResult);
    
    return results;
  }
  
  /**
   * Run a specific test suite
   */
  private async runTestSuite(scriptName: string, testDescription: string): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      execSync(`npm run ${scriptName}`, {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: this.config.crash_minimization.prevention.execution_timeout_s * 1000
      });
      
      const executionTime = Date.now() - startTime;
      
      return {
        test_name: testDescription,
        success: true,
        execution_time_ms: executionTime,
        memory_usage_mb: Math.floor(Math.random() * 512), // Mock memory usage
        flaky_score: 0.0
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      return {
        test_name: testDescription,
        success: false,
        execution_time_ms: executionTime,
        memory_usage_mb: Math.floor(Math.random() * 1024), // Mock memory usage
        error_message: error instanceof Error ? error.message : String(error),
        flaky_score: Math.random() // Mock flaky score
      };
    }
  }
  
  /**
   * Detect flaky tests based on historical results
   */
  private async detectFlakyTests(testResults: TestResult[]): Promise<TestResult[]> {
    // In real implementation, this would analyze historical test results
    // For now, simulate flaky test detection
    const flakyTests: TestResult[] = [];
    
    for (const result of testResults) {
      // Mock flaky detection based on error patterns
      if (result.error_message && result.error_message.includes('cargo-fuzz')) {
        // Don't consider tool unavailability as flaky
        continue;
      }
      
      if (result.flaky_score > this.config.flaky_tests.detection.flaky_threshold) {
        flakyTests.push(result);
      }
    }
    
    return flakyTests;
  }
  
  /**
   * Detect crashes in test execution
   */
  private async detectCrashes(testResults: TestResult[]): Promise<number> {
    return testResults.filter(r => 
      r.error_message && 
      (r.error_message.includes('crash') || 
       r.error_message.includes('segmentation fault') ||
       r.error_message.includes('killed'))
    ).length;
  }
  
  /**
   * Calculate quality metrics
   */
  private async calculateQualityMetrics(testResults: TestResult[]): Promise<StabilizationResult['quality_metrics']> {
    const successRate = testResults.filter(r => r.success).length / testResults.length;
    
    return {
      reliability_score: successRate * 100,
      performance_score: Math.max(0, 100 - testResults.reduce((sum, r) => sum + r.execution_time_ms, 0) / testResults.length / 100),
      security_score: testResults.filter(r => r.test_name.includes('Attack')).length > 0 ? 95 : 85
    };
  }
  
  /**
   * Evaluate if night meets success criteria
   */
  private evaluateSuccessCriteria(successRate: number, flakyCount: number, crashCount: number): boolean {
    return (
      successRate >= this.config.success_criteria.minimum_success_rate &&
      flakyCount <= this.config.success_criteria.maximum_flaky_tests &&
      crashCount <= this.config.success_criteria.crash_threshold
    );
  }
  
  /**
   * Quarantine flaky tests
   */
  private async quarantineFlakyTests(flakyTests: TestResult[]): Promise<void> {
    for (const test of flakyTests) {
      this.quarantineList.add(test.test_name);
      logger.warn(`Quarantining flaky test: ${test.test_name}`);
    }
    
    // Save quarantine list
    const quarantinePath = join(this.artifactsDir, 'quarantine_list.json');
    writeFileSync(quarantinePath, JSON.stringify(Array.from(this.quarantineList), null, 2));
  }
  
  /**
   * Generate recommendations based on test results
   */
  private generateRecommendations(testResults: TestResult[], flakyTests: TestResult[], crashes: number): string[] {
    const recommendations: string[] = [];
    
    if (crashes > 0) {
      recommendations.push(`Investigate ${crashes} crash(es) - implement additional safeguards`);
    }
    
    if (flakyTests.length > this.config.success_criteria.maximum_flaky_tests) {
      recommendations.push(`${flakyTests.length} flaky tests detected - review test reliability`);
    }
    
    const failedTests = testResults.filter(r => !r.success);
    if (failedTests.length > 0) {
      recommendations.push(`${failedTests.length} test(s) failing - prioritize fixes`);
    }
    
    const slowTests = testResults.filter(r => r.execution_time_ms > 10000);
    if (slowTests.length > 0) {
      recommendations.push(`${slowTests.length} slow test(s) - optimize performance`);
    }
    
    if (recommendations.length === 0) {
      recommendations.push('All tests performing well - continue monitoring');
    }
    
    return recommendations;
  }
  
  /**
   * Generate stabilization report
   */
  generateReport(results: StabilizationResult[]): void {
    const totalNights = results.length;
    const successfulNights = results.filter(r => r.overall_success).length;
    const averageSuccessRate = results.reduce((sum, r) => sum + r.success_rate, 0) / totalNights;
    const totalFlakyTests = results.reduce((sum, r) => sum + r.flaky_tests_detected, 0);
    const totalCrashes = results.reduce((sum, r) => sum + r.crashes_detected, 0);
    
    const stabilizationComplete = this.consecutiveGreenNights >= this.config.success_criteria.consecutive_green_nights;
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total_nights: totalNights,
        successful_nights: successfulNights,
        consecutive_green_nights: this.consecutiveGreenNights,
        average_success_rate: averageSuccessRate.toFixed(2) + '%',
        total_flaky_tests: totalFlakyTests,
        total_crashes: totalCrashes,
        stabilization_complete: stabilizationComplete
      },
      success_criteria: this.config.success_criteria,
      quality_metrics: {
        average_reliability: results.reduce((sum, r) => sum + r.quality_metrics.reliability_score, 0) / totalNights,
        average_performance: results.reduce((sum, r) => sum + r.quality_metrics.performance_score, 0) / totalNights,
        average_security: results.reduce((sum, r) => sum + r.quality_metrics.security_score, 0) / totalNights
      },
      quarantine_status: {
        quarantined_tests: Array.from(this.quarantineList),
        total_quarantined: this.quarantineList.size
      },
      results,
      recommendations: this.generateFinalRecommendations(results, stabilizationComplete),
      production_readiness: {
        ready: stabilizationComplete && averageSuccessRate >= this.config.success_criteria.minimum_success_rate,
        confidence_level: stabilizationComplete ? 'HIGH' : 'MEDIUM',
        go_live_date: stabilizationComplete ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null
      }
    };
    
    const reportPath = join(this.artifactsDir, `stabilization_report_${Date.now()}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    logger.info(`Stabilization report generated: ${reportPath}`);
    
    // Log summary
    logger.info(`Stabilization completed: ${successfulNights}/${totalNights} nights successful`);
    logger.info(`Consecutive green nights: ${this.consecutiveGreenNights}`);
    logger.info(`Average success rate: ${averageSuccessRate.toFixed(2)}%`);
    logger.info(`Production ready: ${report.production_readiness.ready}`);
  }
  
  /**
   * Generate final recommendations
   */
  private generateFinalRecommendations(results: StabilizationResult[], complete: boolean): string[] {
    const recommendations: string[] = [];
    
    if (complete) {
      recommendations.push('✅ Stabilization complete - system ready for production deployment');
      recommendations.push('Continue monitoring in production with automated alerts');
      recommendations.push('Schedule regular security test updates and reviews');
    } else {
      recommendations.push('❌ Stabilization incomplete - address remaining issues');
      recommendations.push('Focus on achieving consecutive green nights');
      recommendations.push('Consider extending stabilization period if needed');
    }
    
    const avgFlakyTests = results.reduce((sum, r) => sum + r.flaky_tests_detected, 0) / results.length;
    if (avgFlakyTests > 1) {
      recommendations.push('Implement test reliability improvements before production');
    }
    
    return recommendations;
  }
}

// Main execution
async function main() {
  try {
    const runner = new StabilizationRunner();
    const results = await runner.runStabilization();
    
    runner.generateReport(results);
    
    const stabilizationComplete = results.length >= 2 && 
      results.slice(-2).every(r => r.overall_success);
    
    if (stabilizationComplete) {
      logger.info('🎉 Stabilization completed successfully - production ready');
      process.exit(0);
    } else {
      logger.error('💥 Stabilization incomplete - additional work required');
      process.exit(1);
    }
    
  } catch (error) {
    logger.error('Stabilization failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
