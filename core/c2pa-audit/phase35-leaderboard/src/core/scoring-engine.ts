/**
 * Phase 35 Leaderboard - Scoring Engine
 * Calculates vendor scores based on test results and rubric
 */

import { 
  TestExecution, 
  VendorScores, 
  Grade,
  DimensionScore,
  ImprovementMetrics
} from '@/types';
import { 
  SCORING_CONFIG, 
  calculateGrade, 
  calculateDimensionScore, 
  calculateOverallScore,
  generateScoreExplanation,
  getImprovementRecommendations
} from '@/config/scoring';

export interface ScoringEngineConfig {
  weights: Record<string, number>;
  thresholds: Record<string, number>;
  enableBonusPoints: boolean;
  enablePenaltyPoints: boolean;
}

export class ScoringEngine {
  private config: ScoringEngineConfig;

  constructor(config: ScoringEngineConfig) {
    this.config = config;
  }

  /**
   * Calculate comprehensive vendor scores from test executions
   */
  calculateVendorScores(
    _vendorId: string,
    executions: TestExecution[],
    vendorDocumentation: Record<string, string>
  ): VendorScores {
    // Separate executions by configuration type
    const defaultExecutions = executions.filter(e => e.config === 'default');
    const bestPracticeExecutions = executions.filter(e => e.config === 'best-practice');

    // Calculate scores for each configuration
    const defaultScores = this.calculateConfigurationScores(defaultExecutions, vendorDocumentation);
    const bestPracticeScores = this.calculateConfigurationScores(bestPracticeExecutions, vendorDocumentation);

    // Calculate dimension scores
    const dimensions = this.calculateDimensionScores(defaultExecutions, bestPracticeExecutions);

    // Determine grades
    const grades = this.calculateGrades(defaultScores.overall, bestPracticeScores.overall);

    // Calculate improvement metrics
    const improvement = this.calculateImprovementMetrics(
      defaultScores.overall,
      bestPracticeScores.overall,
      dimensions
    );

    return {
      default: defaultScores.overall,
      bestPractice: bestPracticeScores.overall,
      dimensions,
      grade: grades,
      improvement
    };
  }

  /**
   * Calculate scores for a specific configuration
   */
  private calculateConfigurationScores(
    executions: TestExecution[],
    vendorDocumentation: Record<string, string>
  ): { overall: number; dimensions: Record<string, number> } {
    const dimensionScores: Record<string, number> = {};

    // Calculate score for each dimension
    for (const dimension of SCORING_CONFIG.dimensions) {
      const testResults = this.prepareTestResultsForDimension(executions, dimension.id);
      const expectedBehavior = this.getExpectedBehaviorForDimension(dimension.id);
      
      dimensionScores[dimension.id] = calculateDimensionScore(
        dimension.id,
        testResults,
        expectedBehavior
      );
    }

    // Calculate overall score
    const overallScore = calculateOverallScore(dimensionScores);

    return { overall: overallScore, dimensions: dimensionScores };
  }

  /**
   * Calculate dimension scores with comparison between configurations
   */
  private calculateDimensionScores(
    defaultExecutions: TestExecution[],
    bestPracticeExecutions: TestExecution[]
  ): DimensionScore[] {
    const dimensions: DimensionScore[] = [];

    for (const scoringDimension of SCORING_CONFIG.dimensions) {
      const defaultResults = this.prepareTestResultsForDimension(defaultExecutions, scoringDimension.id);
      const bestPracticeResults = this.prepareTestResultsForDimension(bestPracticeExecutions, scoringDimension.id);
      const expectedBehavior = this.getExpectedBehaviorForDimension(scoringDimension.id);

      const defaultScore = calculateDimensionScore(
        scoringDimension.id,
        defaultResults,
        expectedBehavior
      );

      const bestPracticeScore = calculateDimensionScore(
        scoringDimension.id,
        bestPracticeResults,
        expectedBehavior
      );

      dimensions.push({
        dimensionId: scoringDimension.id,
        defaultScore,
        bestPracticeScore,
        change: bestPracticeScore - defaultScore
      });
    }

    return dimensions;
  }

  /**
   * Prepare test results for dimension scoring
   */
  private prepareTestResultsForDimension(
    executions: TestExecution[],
    dimensionId: string
  ): any[] {
    return executions.map(execution => {
      const { verifyResult, discoveryResult } = execution.result;

      switch (dimensionId) {
        case 'embedded-manifest-survival':
          return {
            transformId: execution.transformId,
            behavior: verifyResult.manifestFound && verifyResult.manifestType === 'embedded' ? 'preserve' : 'strip',
            success: verifyResult.manifestFound && verifyResult.manifestType === 'embedded',
            latency: execution.duration
          };

        case 'remote-manifest-honored':
          return {
            transformId: execution.transformId,
            behavior: discoveryResult.linkHeaderFound && discoveryResult.manifestAccessible ? 'preserve' : 'strip',
            success: discoveryResult.linkHeaderFound && discoveryResult.manifestAccessible,
            latency: discoveryResult.discoveryLatency
          };

        case 'verifier-discovery-reliability':
          return {
            transformId: execution.transformId,
            behavior: discoveryResult.discoveryLatency < 1000 ? 'preserve' : 'strip',
            success: execution.result.success && discoveryResult.discoveryLatency < 1000,
            latency: discoveryResult.discoveryLatency,
            mixedContent: discoveryResult.mixedContent
          };

        case 'docs-alignment':
          const expectedBehavior = this.getExpectedBehaviorForDimension(dimensionId);
          const actualBehavior = this.getActualBehavior(execution);
          return {
            transformId: execution.transformId,
            behavior: actualBehavior === expectedBehavior ? 'preserve' : 'strip',
            success: actualBehavior === expectedBehavior,
            docsAligned: actualBehavior === expectedBehavior
          };

        case 'reproducibility':
          return {
            transformId: execution.transformId,
            behavior: execution.result.success && verifyResult.manifestValid ? 'preserve' : 'strip',
            success: execution.result.success && verifyResult.manifestValid,
            reproducible: execution.result.success && verifyResult.manifestValid
          };

        default:
          return {
            transformId: execution.transformId,
            behavior: 'strip',
            success: false,
            latency: execution.duration
          };
      }
    });
  }

  /**
   * Get expected behavior for a dimension
   */
  private getExpectedBehaviorForDimension(dimensionId: string): string {
    switch (dimensionId) {
      case 'embedded-manifest-survival':
        return 'preserve';
      case 'remote-manifest-honored':
        return 'preserve';
      case 'verifier-discovery-reliability':
        return 'preserve';
      case 'docs-alignment':
        return 'preserve';
      case 'reproducibility':
        return 'preserve';
      default:
        return 'preserve';
    }
  }

  /**
   * Get actual behavior from test execution
   */
  private getActualBehavior(execution: TestExecution): string {
    const { verifyResult, discoveryResult } = execution.result;
    
    if (verifyResult.manifestFound && verifyResult.manifestType === 'embedded') {
      return 'preserve';
    }
    
    if (discoveryResult.linkHeaderFound && discoveryResult.manifestAccessible) {
      return 'preserve';
    }
    
    return 'strip';
  }

  /**
   * Calculate grades for scores
   */
  private calculateGrades(defaultScore: number, bestPracticeScore: number): Grade {
    return {
      default: calculateGrade(defaultScore),
      bestPractice: calculateGrade(bestPracticeScore)
    };
  }

  /**
   * Calculate improvement metrics
   */
  private calculateImprovementMetrics(
    defaultScore: number,
    bestPracticeScore: number,
    dimensions: DimensionScore[]
  ): ImprovementMetrics {
    const scoreImprovement = bestPracticeScore - defaultScore;
    
    // Calculate configuration complexity
    const configChangesNeeded = this.calculateConfigChangesNeeded(dimensions);
    
    // Estimate time to improvement
    const estimatedTimeMinutes = this.estimateTimeToImprovement(configChangesNeeded, scoreImprovement);
    
    // Determine difficulty
    const difficulty = this.assessDifficulty(scoreImprovement, configChangesNeeded);
    
    // Identify prerequisites
    const prerequisites = this.identifyPrerequisites(dimensions);

    return {
      configChangesNeeded,
      estimatedTimeMinutes,
      difficulty,
      prerequisites
    };
  }

  /**
   * Calculate number of configuration changes needed
   */
  private calculateConfigChangesNeeded(dimensions: DimensionScore[]): number {
    return dimensions
      .filter(d => d.change > 0 && d.bestPracticeScore > d.defaultScore)
      .length;
  }

  /**
   * Estimate time to improvement in minutes
   */
  private estimateTimeToImprovement(configChanges: number, scoreImprovement: number): number {
    // Base time per configuration change
    const baseTimePerChange = 5; // 5 minutes per simple change
    
    // Adjust based on improvement magnitude
    const timeMultiplier = Math.max(1, scoreImprovement / 20);
    
    return Math.round(configChanges * baseTimePerChange * timeMultiplier);
  }

  /**
   * Assess difficulty of achieving improvement
   */
  private assessDifficulty(scoreImprovement: number, configChanges: number): 'easy' | 'medium' | 'hard' {
    if (configChanges <= 2 && scoreImprovement >= 20) {
      return 'easy';
    } else if (configChanges <= 5 && scoreImprovement >= 15) {
      return 'medium';
    } else {
      return 'hard';
    }
  }

  /**
   * Identify prerequisites for improvement
   */
  private identifyPrerequisites(dimensions: DimensionScore[]): string[] {
    const prerequisites: string[] = [];
    
    const needsEmbeddedImprovement = dimensions
      .find(d => d.dimensionId === 'embedded-manifest-survival' && d.change > 0);
    if (needsEmbeddedImprovement) {
      prerequisites.push('Enable C2PA preservation toggle');
      prerequisites.push('Review metadata stripping settings');
    }
    
    const needsRemoteImprovement = dimensions
      .find(d => d.dimensionId === 'remote-manifest-honored' && d.change > 0);
    if (needsRemoteImprovement) {
      prerequisites.push('Configure Link header preservation');
      prerequisites.push('Set up remote manifest hosting');
    }
    
    const needsReliabilityImprovement = dimensions
      .find(d => d.dimensionId === 'verifier-discovery-reliability' && d.change > 0);
    if (needsReliabilityImprovement) {
      prerequisites.push('Optimize CDN caching settings');
      prerequisites.push('Implement proper HTTP headers');
    }
    
    return prerequisites;
  }

  /**
   * Generate detailed score explanation
   */
  generateScoreExplanation(
    vendorId: string,
    scores: VendorScores,
    executions: TestExecution[]
  ): { [dimensionId: string]: string } {
    const explanations: { [dimensionId: string]: string } = {};
    
    for (const dimension of scores.dimensions) {
      const dimensionConfig = SCORING_CONFIG.dimensions.find(d => d.id === dimension.dimensionId);
      if (!dimensionConfig) continue;
      
      const testResults = this.prepareTestResultsForDimension(
        executions.filter(e => e.config === 'default'),
        dimension.dimensionId
      );
      
      explanations[dimension.dimensionId] = generateScoreExplanation(
        dimension.dimensionId,
        dimension.defaultScore,
        dimensionConfig.maxPoints,
        testResults
      );
    }
    
    return explanations;
  }

  /**
   * Generate improvement recommendations
   */
  generateImprovementRecommendations(scores: VendorScores): { [dimensionId: string]: string[] } {
    const recommendations: { [dimensionId: string]: string[] } = {};
    
    for (const dimension of scores.dimensions) {
      const dimensionConfig = SCORING_CONFIG.dimensions.find(d => d.id === dimension.dimensionId);
      if (!dimensionConfig) continue;
      
      recommendations[dimension.dimensionId] = getImprovementRecommendations(
        dimension.dimensionId,
        dimension.defaultScore,
        dimensionConfig.maxPoints
      );
    }
    
    return recommendations;
  }

  /**
   * Calculate leaderboard ranking
   */
  calculateRanking(vendorScores: { [vendorId: string]: VendorScores }): {
    vendorId: string;
    rank: number;
    score: number;
    grade: string;
    previousRank?: number;
  }[] {
    const rankings = Object.entries(vendorScores)
      .map(([vendorId, scores]) => ({
        vendorId,
        score: scores.bestPractice,
        grade: scores.grade.bestPractice,
        rank: 0
      }))
      .sort((a, b) => {
        // Primary sort: score (descending)
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        
        // Secondary sort: vendor name (alphabetical)
        return a.vendorId.localeCompare(b.vendorId);
      })
      .map((item, index) => ({
        ...item,
        rank: index + 1
      }));
    
    return rankings;
  }

  /**
   * Calculate score trends over time
   */
  calculateScoreTrends(
    historicalScores: { date: Date; scores: VendorScores }[]
  ): { date: Date; defaultScore: number; bestPracticeScore: number; change: number }[] {
    const trends = historicalScores.map((entry, index) => {
      const previousEntry = index > 0 ? historicalScores[index - 1] : null;
      const change = previousEntry ? 
        entry.scores.bestPractice - previousEntry.scores.bestPractice : 0;
      
      return {
        date: entry.date,
        defaultScore: entry.scores.default,
        bestPracticeScore: entry.scores.bestPractice,
        change
      };
    });
    
    return trends;
  }

  /**
   * Validate score calculations
   */
  validateScores(scores: VendorScores): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check score ranges
    if (scores.default < 0 || scores.default > 100) {
      errors.push(`Default score ${scores.default} out of range [0, 100]`);
    }
    
    if (scores.bestPractice < 0 || scores.bestPractice > 100) {
      errors.push(`Best practice score ${scores.bestPractice} out of range [0, 100]`);
    }
    
    // Check dimension scores
    for (const dimension of scores.dimensions) {
      if (dimension.defaultScore < 0 || dimension.defaultScore > 100) {
        errors.push(`Dimension ${dimension.dimensionId} default score ${dimension.defaultScore} out of range`);
      }
      
      if (dimension.bestPracticeScore < 0 || dimension.bestPracticeScore > 100) {
        errors.push(`Dimension ${dimension.dimensionId} best practice score ${dimension.bestPracticeScore} out of range`);
      }
    }
    
    // Check grade consistency
    const expectedDefaultGrade = calculateGrade(scores.default);
    const expectedBestPracticeGrade = calculateGrade(scores.bestPractice);
    
    if (scores.grade.default !== expectedDefaultGrade) {
      errors.push(`Default grade ${scores.grade.default} doesn't match score ${scores.default}`);
    }
    
    if (scores.grade.bestPractice !== expectedBestPracticeGrade) {
      errors.push(`Best practice grade ${scores.grade.bestPractice} doesn't match score ${scores.bestPractice}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
