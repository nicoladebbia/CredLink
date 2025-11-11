import sharp from 'sharp';
import { logger } from '../../utils/logger';
import {
  RealWorldScenario,
  RealWorldTestResult,
  RealWorldSurvivalReport,
  SurvivalVerificationResult,
  SurvivalTestConfig,
  CategoryStats,
  SeverityStats,
  FailureAnalysis
} from './survival-types';

/**
 * Real-World Survival Tester
 * 
 * Tests C2PA signature survival through real-world platform transformations
 * Simulates: Instagram, Twitter, Facebook, WhatsApp, LinkedIn, TikTok, etc.
 */
export class RealWorldSurvivalTester {
  private testScenarios: RealWorldScenario[];
  private config: Required<SurvivalTestConfig>;

  constructor(config: SurvivalTestConfig = {}) {
    this.config = {
      sampleSize: config.sampleSize ?? 10,
      minConfidence: config.minConfidence ?? 30,
      platforms: config.platforms ?? [],
      categories: config.categories ?? [],
      severities: config.severities ?? [],
      generateReport: config.generateReport ?? true,
      verbose: config.verbose ?? false
    };

    this.testScenarios = this.initializeScenarios();
    
    logger.info('Real-World Survival Tester initialized', {
      scenarios: this.testScenarios.length,
      sampleSize: this.config.sampleSize
    });
  }

  /**
   * Initialize all real-world transformation scenarios
   */
  private initializeScenarios(): RealWorldScenario[] {
    return [
      {
        name: 'Instagram Upload',
        platform: 'Instagram',
        description: 'Simulate Instagram photo processing',
        category: 'social',
        severity: 'medium',
        expectedSurvival: 0.90,
        transform: async (img: Buffer) => {
          return await sharp(img)
            .resize(1080, 1080, { fit: 'cover' })
            .jpeg({ quality: 85, progressive: true })
            .toBuffer();
        }
      },
      {
        name: 'Twitter Compression',
        platform: 'Twitter',
        description: 'Simulate Twitter image optimization',
        category: 'social',
        severity: 'medium',
        expectedSurvival: 0.88,
        transform: async (img: Buffer) => {
          return await sharp(img)
            .resize(1200, 675, { fit: 'cover' })
            .webp({ quality: 80 })
            .toBuffer();
        }
      },
      {
        name: 'Facebook Processing',
        platform: 'Facebook',
        description: 'Simulate Facebook image handling',
        category: 'social',
        severity: 'low',
        expectedSurvival: 0.92,
        transform: async (img: Buffer) => {
          return await sharp(img)
            .resize(2048, 2048, { fit: 'inside' })
            .jpeg({ quality: 90, mozjpeg: true })
            .toBuffer();
        }
      },
      {
        name: 'WhatsApp Compression',
        platform: 'WhatsApp',
        description: 'Simulate WhatsApp image compression',
        category: 'messaging',
        severity: 'high',
        expectedSurvival: 0.85,
        transform: async (img: Buffer) => {
          return await sharp(img)
            .resize(1600, 1600, { fit: 'inside' })
            .jpeg({ quality: 75 })
            .toBuffer();
        }
      },
      {
        name: 'LinkedIn Processing',
        platform: 'LinkedIn',
        description: 'Simulate LinkedIn image optimization',
        category: 'social',
        severity: 'medium',
        expectedSurvival: 0.88,
        transform: async (img: Buffer) => {
          return await sharp(img)
            .resize(1200, 627, { fit: 'cover' })
            .jpeg({ quality: 85 })
            .toBuffer();
        }
      },
      {
        name: 'TikTok Processing',
        platform: 'TikTok',
        description: 'Simulate TikTok video thumbnail processing',
        category: 'social',
        severity: 'medium',
        expectedSurvival: 0.85,
        transform: async (img: Buffer) => {
          return await sharp(img)
            .resize(1080, 1920, { fit: 'cover' })
            .jpeg({ quality: 80 })
            .toBuffer();
        }
      },
      {
        name: 'Pinterest Optimization',
        platform: 'Pinterest',
        description: 'Simulate Pinterest image processing',
        category: 'social',
        severity: 'low',
        expectedSurvival: 0.90,
        transform: async (img: Buffer) => {
          return await sharp(img)
            .resize(736, null, { fit: 'inside' })
            .jpeg({ quality: 85 })
            .toBuffer();
        }
      },
      {
        name: 'Google Photos Backup',
        platform: 'Google Photos',
        description: 'Simulate Google Photos storage compression',
        category: 'cloud',
        severity: 'low',
        expectedSurvival: 0.95,
        transform: async (img: Buffer) => {
          return await sharp(img)
            .jpeg({ quality: 85, progressive: true })
            .toBuffer();
        }
      },
      {
        name: 'iCloud Photo Storage',
        platform: 'iCloud',
        description: 'Simulate iCloud photo optimization',
        category: 'cloud',
        severity: 'extreme',
        expectedSurvival: 0.70,
        transform: async (img: Buffer) => {
          // HEIF conversion is more aggressive
          // Note: sharp may not support HEIF output, fallback to JPEG
          return await sharp(img)
            .jpeg({ quality: 75 })
            .toBuffer();
        }
      },
      {
        name: 'Dropbox Sync',
        platform: 'Dropbox',
        description: 'Simulate Dropbox image sync',
        category: 'cloud',
        severity: 'low',
        expectedSurvival: 0.95,
        transform: async (img: Buffer) => {
          return await sharp(img)
            .jpeg({ quality: 90 })
            .toBuffer();
        }
      },
      {
        name: 'Slack Image Upload',
        platform: 'Slack',
        description: 'Simulate Slack image processing',
        category: 'messaging',
        severity: 'medium',
        expectedSurvival: 0.90,
        transform: async (img: Buffer) => {
          return await sharp(img)
            .resize(2000, 2000, { fit: 'inside' })
            .jpeg({ quality: 85 })
            .toBuffer();
        }
      },
      {
        name: 'Discord Image Share',
        platform: 'Discord',
        description: 'Simulate Discord image compression',
        category: 'messaging',
        severity: 'medium',
        expectedSurvival: 0.88,
        transform: async (img: Buffer) => {
          return await sharp(img)
            .resize(1920, 1080, { fit: 'inside' })
            .webp({ quality: 80 })
            .toBuffer();
        }
      },
      {
        name: 'Email Attachment',
        platform: 'Email',
        description: 'Simulate email attachment compression',
        category: 'email',
        severity: 'high',
        expectedSurvival: 0.85,
        transform: async (img: Buffer) => {
          return await sharp(img)
            .resize(1024, 1024, { fit: 'inside' })
            .jpeg({ quality: 75 })
            .toBuffer();
        }
      },
      {
        name: 'MMS Message',
        platform: 'MMS',
        description: 'Simulate MMS image compression',
        category: 'messaging',
        severity: 'extreme',
        expectedSurvival: 0.80,
        transform: async (img: Buffer) => {
          return await sharp(img)
            .resize(640, 480, { fit: 'inside' })
            .jpeg({ quality: 70 })
            .toBuffer();
        }
      }
    ];
  }

  /**
   * Run real-world survival tests
   */
  async runRealWorldTests(
    testImages: Buffer[],
    signFn: (image: Buffer) => Promise<Buffer>,
    verifyFn: (image: Buffer) => Promise<SurvivalVerificationResult>
  ): Promise<RealWorldSurvivalReport> {
    logger.info('Starting real-world survival tests', {
      scenarios: this.testScenarios.length,
      images: testImages.length
    });

    const results: RealWorldTestResult[] = [];
    const filteredScenarios = this.filterScenarios();

    for (const scenario of filteredScenarios) {
      if (this.config.verbose) {
        logger.info(`Testing scenario: ${scenario.name}`);
      }

      const result = await this.testScenario(
        scenario,
        testImages,
        signFn,
        verifyFn
      );

      results.push(result);
    }

    return this.generateReport(results);
  }

  /**
   * Test a single scenario
   */
  private async testScenario(
    scenario: RealWorldScenario,
    testImages: Buffer[],
    signFn: (image: Buffer) => Promise<Buffer>,
    verifyFn: (image: Buffer) => Promise<SurvivalVerificationResult>
  ): Promise<RealWorldTestResult> {
    let survivedCount = 0;
    let totalConfidence = 0;
    const failureReasons: Map<string, number> = new Map();
    const startTime = Date.now();

    const imagesToTest = testImages.slice(0, this.config.sampleSize);

    for (const image of imagesToTest) {
      try {
        // Sign the original image
        const signedImage = await signFn(image);

        // Apply real-world transformation
        const transformedImage = await scenario.transform(signedImage);

        // Verify the transformed image
        const verifyResult = await verifyFn(transformedImage);

        totalConfidence += verifyResult.confidence;

        if (verifyResult.confidence >= this.config.minConfidence) {
          survivedCount++;
        } else {
          const reason = this.determineFailureReason(verifyResult);
          failureReasons.set(reason, (failureReasons.get(reason) || 0) + 1);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'unknown_error';
        failureReasons.set('processing_error', (failureReasons.get('processing_error') || 0) + 1);
        
        if (this.config.verbose) {
          logger.warn('Scenario test error', {
            scenario: scenario.name,
            error: errorMessage
          });
        }
      }
    }

    const survivalRate = survivedCount / imagesToTest.length;
    const averageConfidence = totalConfidence / imagesToTest.length;
    const processingTime = Date.now() - startTime;

    return {
      scenario: scenario.name,
      platform: scenario.platform,
      description: scenario.description,
      category: scenario.category,
      severity: scenario.severity,
      survivalRate,
      expectedSurvival: scenario.expectedSurvival,
      passed: survivalRate >= scenario.expectedSurvival * 0.9, // 90% of expected
      sampleSize: imagesToTest.length,
      failureReasons: Object.fromEntries(failureReasons),
      averageConfidence,
      processingTime
    };
  }

  /**
   * Determine failure reason from verification result
   */
  private determineFailureReason(verifyResult: SurvivalVerificationResult): string {
    if (verifyResult.confidence < this.config.minConfidence) {
      if (!verifyResult.extractionResult.manifest) {
        return 'manifest_not_found';
      } else if (!verifyResult.signatureResult.isValid) {
        return 'signature_invalid';
      } else if (!verifyResult.certificateResult.isValid) {
        return 'certificate_invalid';
      } else {
        return 'low_confidence';
      }
    }
    return 'unknown';
  }

  /**
   * Filter scenarios based on configuration
   */
  private filterScenarios(): RealWorldScenario[] {
    let scenarios = this.testScenarios;

    if (this.config.platforms.length > 0) {
      scenarios = scenarios.filter(s => 
        this.config.platforms.includes(s.platform)
      );
    }

    if (this.config.categories.length > 0) {
      scenarios = scenarios.filter(s => 
        this.config.categories.includes(s.category)
      );
    }

    if (this.config.severities.length > 0) {
      scenarios = scenarios.filter(s => 
        this.config.severities.includes(s.severity)
      );
    }

    return scenarios;
  }

  /**
   * Generate comprehensive report
   */
  private generateReport(results: RealWorldTestResult[]): RealWorldSurvivalReport {
    const passedScenarios = results.filter(r => r.passed).length;
    const failedScenarios = results.length - passedScenarios;
    const averageSurvival = results.reduce((sum, r) => sum + r.survivalRate, 0) / results.length;

    const byCategory = this.calculateCategoryStats(results);
    const bySeverity = this.calculateSeverityStats(results);
    const recommendations = this.generateRecommendations(results);
    const criticalFailures = this.identifyCriticalFailures(results);

    return {
      timestamp: new Date().toISOString(),
      totalScenarios: results.length,
      results,
      averageSurvival,
      passedScenarios,
      failedScenarios,
      recommendations,
      byCategory,
      bySeverity,
      criticalFailures
    };
  }

  /**
   * Calculate statistics by category
   */
  private calculateCategoryStats(results: RealWorldTestResult[]): Record<string, CategoryStats> {
    const categories = new Map<string, RealWorldTestResult[]>();

    results.forEach(result => {
      const existing = categories.get(result.category) || [];
      existing.push(result);
      categories.set(result.category, existing);
    });

    const stats: Record<string, CategoryStats> = {};

    categories.forEach((categoryResults, category) => {
      const passed = categoryResults.filter(r => r.passed).length;
      const avgSurvival = categoryResults.reduce((sum, r) => sum + r.survivalRate, 0) / categoryResults.length;

      stats[category] = {
        totalScenarios: categoryResults.length,
        averageSurvival: avgSurvival,
        passedScenarios: passed,
        failedScenarios: categoryResults.length - passed
      };
    });

    return stats;
  }

  /**
   * Calculate statistics by severity
   */
  private calculateSeverityStats(results: RealWorldTestResult[]): Record<string, SeverityStats> {
    const severities = new Map<string, RealWorldTestResult[]>();

    results.forEach(result => {
      const existing = severities.get(result.severity) || [];
      existing.push(result);
      severities.set(result.severity, existing);
    });

    const stats: Record<string, SeverityStats> = {};

    severities.forEach((severityResults, severity) => {
      const passed = severityResults.filter(r => r.passed).length;
      const avgSurvival = severityResults.reduce((sum, r) => sum + r.survivalRate, 0) / severityResults.length;

      stats[severity] = {
        totalScenarios: severityResults.length,
        averageSurvival: avgSurvival,
        passedScenarios: passed,
        failedScenarios: severityResults.length - passed
      };
    });

    return stats;
  }

  /**
   * Generate recommendations based on results
   */
  private generateRecommendations(results: RealWorldTestResult[]): string[] {
    const recommendations: string[] = [];
    const failedScenarios = results.filter(r => !r.passed);

    if (failedScenarios.length > 0) {
      recommendations.push(`${failedScenarios.length} scenarios failed survival testing`);

      // Analyze common failure patterns
      const commonFailures = new Map<string, number>();
      failedScenarios.forEach(scenario => {
        Object.entries(scenario.failureReasons).forEach(([reason, count]) => {
          commonFailures.set(reason, (commonFailures.get(reason) || 0) + count);
        });
      });

      const topFailure = Array.from(commonFailures.entries())
        .sort(([, a], [, b]) => b - a)[0];

      if (topFailure) {
        recommendations.push(`Most common failure: ${topFailure[0]} (${topFailure[1]} occurrences)`);
        
        // Specific recommendations based on failure type
        if (topFailure[0] === 'manifest_not_found') {
          recommendations.push('Consider increasing manifest embedding strength');
        } else if (topFailure[0] === 'signature_invalid') {
          recommendations.push('Review signature algorithm for better compression resistance');
        } else if (topFailure[0] === 'low_confidence') {
          recommendations.push('Optimize confidence scoring algorithm');
        }
      }
    }

    const avgSurvival = results.reduce((sum, r) => sum + r.survivalRate, 0) / results.length;
    if (avgSurvival < 0.85) {
      recommendations.push('Overall survival rate below target (85%)');
      recommendations.push('Consider implementing redundant metadata storage');
    }

    // Check extreme severity scenarios
    const extremeScenarios = results.filter(r => r.severity === 'extreme');
    const extremeFailures = extremeScenarios.filter(r => !r.passed);
    if (extremeFailures.length > 0) {
      recommendations.push(`${extremeFailures.length} extreme severity scenarios failed`);
      recommendations.push('These platforms require special handling or user warnings');
    }

    return recommendations;
  }

  /**
   * Identify critical failures
   */
  private identifyCriticalFailures(results: RealWorldTestResult[]): string[] {
    const critical: string[] = [];

    // Low severity scenarios should never fail
    const lowSeverityFailures = results.filter(r => 
      r.severity === 'low' && !r.passed
    );

    lowSeverityFailures.forEach(failure => {
      critical.push(`CRITICAL: Low severity scenario failed - ${failure.scenario}`);
    });

    // Popular platforms with low survival
    const popularPlatforms = ['Instagram', 'Facebook', 'Twitter', 'WhatsApp'];
    const popularFailures = results.filter(r =>
      popularPlatforms.includes(r.platform) && r.survivalRate < 0.80
    );

    popularFailures.forEach(failure => {
      critical.push(`CRITICAL: Popular platform low survival - ${failure.platform} (${(failure.survivalRate * 100).toFixed(1)}%)`);
    });

    return critical;
  }

  /**
   * Analyze failures across all tests
   */
  analyzeFailures(results: RealWorldTestResult[]): FailureAnalysis {
    const failedResults = results.filter(r => !r.passed);
    const totalFailures = failedResults.reduce((sum, r) => 
      sum + Object.values(r.failureReasons).reduce((s, c) => s + c, 0), 0
    );

    const byReason: Record<string, number> = {};
    const byPlatform: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    failedResults.forEach(result => {
      Object.entries(result.failureReasons).forEach(([reason, count]) => {
        byReason[reason] = (byReason[reason] || 0) + count;
      });

      byPlatform[result.platform] = (byPlatform[result.platform] || 0) + 1;
      byCategory[result.category] = (byCategory[result.category] || 0) + 1;
    });

    const commonPatterns = this.identifyCommonPatterns(failedResults);
    const recommendations = this.generateRecommendations(results);

    return {
      totalFailures,
      byReason,
      byPlatform,
      byCategory,
      commonPatterns,
      recommendations
    };
  }

  /**
   * Identify common failure patterns
   */
  private identifyCommonPatterns(failedResults: RealWorldTestResult[]): string[] {
    const patterns: string[] = [];

    // Check if all failures in a category
    const categories = new Set(failedResults.map(r => r.category));
    categories.forEach(category => {
      const categoryFailures = failedResults.filter(r => r.category === category);
      if (categoryFailures.length >= 3) {
        patterns.push(`Multiple failures in ${category} category`);
      }
    });

    // Check for compression-related failures
    const compressionFailures = failedResults.filter(r =>
      r.failureReasons['manifest_not_found'] > 0
    );
    if (compressionFailures.length >= 3) {
      patterns.push('Compression appears to destroy manifest data');
    }

    // Check for signature failures
    const signatureFailures = failedResults.filter(r =>
      r.failureReasons['signature_invalid'] > 0
    );
    if (signatureFailures.length >= 3) {
      patterns.push('Signature validation failing across multiple platforms');
    }

    return patterns;
  }

  /**
   * Get all available scenarios
   */
  getScenarios(): RealWorldScenario[] {
    return this.testScenarios;
  }

  /**
   * Get scenarios by category
   */
  getScenariosByCategory(category: string): RealWorldScenario[] {
    return this.testScenarios.filter(s => s.category === category);
  }

  /**
   * Get scenarios by severity
   */
  getScenariosBySeverity(severity: string): RealWorldScenario[] {
    return this.testScenarios.filter(s => s.severity === severity);
  }
}
