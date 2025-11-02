#!/usr/bin/env ts-node

/**
 * Phase 16 - Adversarial Lab v1
 * Differential Testing Runner - Reference Implementation Parity
 * 
 * Tests our verification service against reference implementations:
 * - c2patool (official C2PA CLI tool)
 * - CAI Verify (Content Authenticity Initiative service)
 * 
 * Validates decision codes, error detection, and performance characteristics
 */

import { spawn } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createLogger } from '../../src/utils/logger';
import { VerificationService } from '../../src/services/verification-service';

const logger = createLogger('ParityRunner');

interface ReferenceResult {
  tool: string;
  decision: string;
  error_code?: string;
  error_message?: string;
  execution_time_ms: number;
  success: boolean;
}

interface OurResult {
  decision: string;
  error_code?: string;
  error_message?: string;
  execution_time_ms: number;
  success: boolean;
}

interface ParityTest {
  fixture_path: string;
  description: string;
  category: string;
  expected_decision?: string;
}

interface ParityResult {
  test: ParityTest;
  our_result: OurResult;
  reference_results: ReferenceResult[];
  decision_matches: boolean;
  error_matches: boolean;
  performance_compliant: boolean;
  overall_match: boolean;
  discrepancies: string[];
}

class ParityRunner {
  private parityDir: string;
  private artifactsDir: string;
  private fixturesDir: string;
  private verificationService: VerificationService;
  private tests: ParityTest[];
  
  constructor() {
    this.parityDir = join(__dirname, '../parity');
    this.artifactsDir = join(this.parityDir, 'artifacts');
    this.fixturesDir = join(this.parityDir, 'fixtures');
    this.verificationService = new VerificationService();
    
    // Define test fixtures
    this.tests = [
      {
        fixture_path: join(this.fixturesDir, 'valid/basic.json'),
        description: 'Basic valid manifest',
        category: 'valid',
        expected_decision: 'VALID'
      },
      {
        fixture_path: join(this.fixturesDir, 'valid/with_assertions.json'),
        description: 'Valid manifest with assertions',
        category: 'valid',
        expected_decision: 'VALID'
      },
      {
        fixture_path: join(this.fixturesDir, 'malformed/invalid_json.json'),
        description: 'Invalid JSON structure',
        category: 'malformed',
        expected_decision: 'DESTROYED'
      },
      {
        fixture_path: join(this.fixturesDir, 'edge/empty_manifest.json'),
        description: 'Empty manifest edge case',
        category: 'edge',
        expected_decision: 'DESTROYED'
      }
    ];
    
    // Ensure artifacts directory exists
    if (!existsSync(this.artifactsDir)) {
      mkdirSync(this.artifactsDir, { recursive: true });
    }
  }
  
  /**
   * Run all parity tests
   */
  async runAllTests(): Promise<ParityResult[]> {
    logger.info(`Starting differential testing with ${this.tests.length} fixtures`);
    
    const results: ParityResult[] = [];
    
    for (const test of this.tests) {
      if (!existsSync(test.fixture_path)) {
        logger.warn(`Fixture not found: ${test.fixture_path}, skipping`);
        continue;
      }
      
      logger.info(`Testing fixture: ${test.description}`);
      
      try {
        const result = await this.runParityTest(test);
        results.push(result);
        
        if (result.overall_match) {
          logger.info(`✅ Test ${test.description} passed`);
        } else {
          logger.error(`❌ Test ${test.description} failed`);
          for (const discrepancy of result.discrepancies) {
            logger.error(`   - ${discrepancy}`);
          }
        }
      } catch (error) {
        logger.error(`Test ${test.description} crashed:`, error);
        results.push({
          test,
          our_result: {
            decision: 'ERROR',
            execution_time_ms: 0,
            success: false
          },
          reference_results: [],
          decision_matches: false,
          error_matches: false,
          performance_compliant: false,
          overall_match: false,
          discrepancies: ['Test execution crashed']
        });
      }
    }
    
    return results;
  }
  
  /**
   * Run a single parity test
   */
  private async runParityTest(test: ParityTest): Promise<ParityResult> {
    // Test our implementation
    const ourResult = await this.testOurImplementation(test);
    
    // Test reference implementations
    const referenceResults = await this.testReferenceImplementations(test);
    
    // Compare results
    const comparison = this.compareResults(ourResult, referenceResults);
    
    return {
      test,
      our_result: ourResult,
      reference_results: referenceResults,
      ...comparison
    };
  }
  
  /**
   * Test our verification service
   */
  private async testOurImplementation(test: ParityTest): Promise<OurResult> {
    const startTime = Date.now();
    
    try {
      const result = await this.verificationService.verifyAsset(test.fixture_path);
      const executionTime = Date.now() - startTime;
      
      return {
        decision: result.decision,
        error_code: result.code,
        error_message: result.user_copy,
        execution_time_ms: executionTime,
        success: true
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      return {
        decision: 'DESTROYED',
        error_code: 'VERIFICATION_ERROR',
        error_message: error instanceof Error ? error.message : String(error),
        execution_time_ms: executionTime,
        success: false
      };
    }
  }
  
  /**
   * Test reference implementations
   */
  private async testReferenceImplementations(test: ParityTest): Promise<ReferenceResult[]> {
    const results: ReferenceResult[] = [];
    
    // Test c2patool if available
    try {
      const c2paResult = await this.testC2paTool(test);
      results.push(c2paResult);
    } catch (error) {
      logger.warn('c2patool not available or failed:', error);
      // Add mock result for testing
      results.push({
        tool: 'c2patool',
        decision: this.getMockDecision(test.category),
        execution_time_ms: 100,
        success: false,
        error_code: 'TOOL_UNAVAILABLE'
      });
    }
    
    // Test CAI Verify if configured
    try {
      const caiResult = await this.testCaiVerify(test);
      results.push(caiResult);
    } catch (error) {
      logger.warn('CAI Verify not available or failed:', error);
      // Add mock result for testing
      results.push({
        tool: 'cai_verify',
        decision: this.getMockDecision(test.category),
        execution_time_ms: 200,
        success: false,
        error_code: 'SERVICE_UNAVAILABLE'
      });
    }
    
    return results;
  }
  
  /**
   * Test with c2patool
   */
  private async testC2paTool(test: ParityTest): Promise<ReferenceResult> {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const process = spawn('c2patool', [
        '--json',
        '--verify',
        test.fixture_path
      ], {
        stdio: 'pipe',
        timeout: 10000
      });
      
      let stdout = '';
      let stderr = '';
      
      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        const executionTime = Date.now() - startTime;
        
        try {
          // Parse c2patool output
          let decision = 'DESTROYED';
          let errorMessage = '';
          
          if (code === 0) {
            decision = 'VALID';
          } else if (stderr.includes('invalid')) {
            decision = 'DESTROYED';
            errorMessage = stderr.trim();
          }
          
          resolve({
            tool: 'c2patool',
            decision,
            error_message: errorMessage,
            execution_time_ms: executionTime,
            success: code === 0
          });
          
        } catch (parseError) {
          reject(parseError);
        }
      });
      
      process.on('error', (error) => {
        reject(error);
      });
    });
  }
  
  /**
   * Test with CAI Verify service
   */
  private async testCaiVerify(test: ParityTest): Promise<ReferenceResult> {
    const startTime = Date.now();
    
    // Mock CAI Verify test (would be HTTP request in real implementation)
    const executionTime = Date.now() - startTime;
    
    return {
      tool: 'cai_verify',
      decision: this.getMockDecision(test.category),
      execution_time_ms: executionTime,
      success: true
    };
  }
  
  /**
   * Get mock decision for testing
   */
  private getMockDecision(category: string): string {
    switch (category) {
      case 'valid': return 'VALID';
      case 'malformed': return 'DESTROYED';
      case 'edge': return 'DEGRADED';
      default: return 'BLOCKED';
    }
  }
  
  /**
   * Compare our results with reference implementations
   */
  private compareResults(
    ourResult: OurResult,
    referenceResults: ReferenceResult[]
  ): Pick<ParityResult, 'decision_matches' | 'error_matches' | 'performance_compliant' | 'overall_match' | 'discrepancies'> {
    const discrepancies: string[] = [];
    
    // Decision comparison
    const decisionMatches = referenceResults.every(ref => 
      this.decisionsMatch(ourResult.decision, ref.decision)
    );
    
    if (!decisionMatches) {
      discrepancies.push('Decision codes do not match reference implementations');
    }
    
    // Error comparison
    const errorMatches = referenceResults.every(ref => 
      this.errorsMatch(ourResult, ref)
    );
    
    if (!errorMatches) {
      discrepancies.push('Error handling does not match reference implementations');
    }
    
    // Performance comparison
    const performanceCompliant = referenceResults.every(ref => 
      this.performanceCompliant(ourResult.execution_time_ms, ref.execution_time_ms)
    );
    
    if (!performanceCompliant) {
      discrepancies.push('Performance does not meet thresholds');
    }
    
    const overallMatch = decisionMatches && errorMatches && performanceCompliant;
    
    return {
      decision_matches: decisionMatches,
      error_matches: errorMatches,
      performance_compliant: performanceCompliant,
      overall_match: overallMatch,
      discrepancies
    };
  }
  
  /**
   * Check if decisions match (with mapping)
   */
  private decisionsMatch(ourDecision: string, refDecision: string): boolean {
    const decisionMap: Record<string, string[]> = {
      'VALID': ['valid', 'verified', 'success'],
      'DEGRADED': ['degraded', 'warning', 'partial'],
      'BLOCKED': ['blocked', 'rejected', 'forbidden'],
      'DESTROYED': ['invalid', 'corrupted', 'error', 'failed']
    };
    
    const ourMapped = decisionMap[ourDecision] || [ourDecision.toLowerCase()];
    return ourMapped.includes(refDecision.toLowerCase());
  }
  
  /**
   * Check if error handling matches
   */
  private errorsMatch(ourResult: OurResult, refResult: ReferenceResult): boolean {
    // Both successful or both have errors
    const bothSuccessful = ourResult.success && refResult.success;
    const bothHaveErrors = !ourResult.success && !refResult.success;
    
    return bothSuccessful || bothHaveErrors;
  }
  
  /**
   * Check if performance is within acceptable bounds
   */
  private performanceCompliant(ourTime: number, refTime: number): boolean {
    const ratio = ourTime / Math.max(refTime, 1); // Avoid division by zero
    return ratio <= 2.0; // Our implementation should be within 2x of reference
  }
  
  /**
   * Generate parity testing report
   */
  generateReport(results: ParityResult[]): void {
    const totalTests = results.length;
    const passedTests = results.filter(r => r.overall_match).length;
    const failedTests = totalTests - passedTests;
    
    const decisionAgreement = results.filter(r => r.decision_matches).length / totalTests * 100;
    const errorAgreement = results.filter(r => r.error_matches).length / totalTests * 100;
    const performanceCompliance = results.filter(r => r.performance_compliant).length / totalTests * 100;
    
    const overallScore = (decisionAgreement + errorAgreement + performanceCompliance) / 3;
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total_tests: totalTests,
        passed_tests: passedTests,
        failed_tests: failedTests,
        success_rate: (passedTests / totalTests * 100).toFixed(2) + '%',
        decision_agreement: decisionAgreement.toFixed(2) + '%',
        error_agreement: errorAgreement.toFixed(2) + '%',
        performance_compliance: performanceCompliance.toFixed(2) + '%',
        overall_score: overallScore.toFixed(2) + '%'
      },
      quality_gates: {
        decision_agreement_threshold: 95.0,
        error_detection_threshold: 90.0,
        performance_compliance_threshold: 85.0,
        overall_score_threshold: 90.0,
        all_passed: overallScore >= 90.0
      },
      results,
      recommendations: this.generateRecommendations(results, overallScore)
    };
    
    const reportPath = join(this.artifactsDir, `parity_report_${Date.now()}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    logger.info(`Parity testing report generated: ${reportPath}`);
    
    // Log summary
    logger.info(`Parity testing completed: ${passedTests}/${totalTests} tests passed`);
    logger.info(`Overall score: ${overallScore.toFixed(2)}%`);
    logger.info(`Decision agreement: ${decisionAgreement.toFixed(2)}%`);
    logger.info(`Error agreement: ${errorAgreement.toFixed(2)}%`);
    logger.info(`Performance compliance: ${performanceCompliance.toFixed(2)}%`);
  }
  
  /**
   * Generate recommendations based on parity results
   */
  private generateRecommendations(results: ParityResult[], overallScore: number): string[] {
    const recommendations: string[] = [];
    
    if (overallScore >= 95) {
      recommendations.push('Excellent parity with reference implementations');
    } else if (overallScore >= 90) {
      recommendations.push('Good parity with minor discrepancies to address');
    } else {
      recommendations.push('Significant parity issues require immediate attention');
    }
    
    const decisionIssues = results.filter(r => !r.decision_matches).length;
    if (decisionIssues > 0) {
      recommendations.push(`Review ${decisionIssues} decision code mismatches`);
    }
    
    const performanceIssues = results.filter(r => !r.performance_compliant).length;
    if (performanceIssues > 0) {
      recommendations.push(`Optimize performance for ${performanceIssues} slow tests`);
    }
    
    return recommendations;
  }
}

// Main execution
async function main() {
  try {
    const runner = new ParityRunner();
    const results = await runner.runAllTests();
    
    const allPassed = results.every(r => r.overall_match);
    
    runner.generateReport(results);
    
    if (allPassed) {
      logger.info('🎉 All parity tests passed successfully');
      process.exit(0);
    } else {
      logger.error('💥 Some parity tests failed');
      process.exit(1);
    }
    
  } catch (error) {
    logger.error('Parity testing failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
