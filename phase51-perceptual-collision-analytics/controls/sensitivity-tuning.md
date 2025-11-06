# Tunable Sensitivity and False-Positive Controls

## Overview
Advanced sensitivity tuning system with ROC curve analysis, adaptive threshold optimization, and false-positive minimization. Enables real-time adjustment of detection sensitivity with immediate feedback on precision/recall trade-offs.

## Dependencies
```json
{
  "dependencies": {
    "ml-matrix": "^6.10.4",
    "simple-statistics": "^7.8.3",
    "plotly.js": "^2.26.0",
    "react-plotly.js": "^2.6.0",
    "recharts": "^2.8.0",
    "date-fns": "^2.30.0",
    "zod": "^3.22.2"
  }
}
```

## Core Implementation

### Sensitivity Control Configuration
```typescript
export interface SensitivityConfig {
  // Threshold Configuration
  thresholds: {
    pdq: {
      min: number;        // Minimum Hamming distance (0-256)
      max: number;        // Maximum Hamming distance
      current: number;    // Current threshold
      optimal?: number;   // Calculated optimal threshold
    };
    embedding: {
      min: number;        // Minimum cosine similarity (0-1)
      max: number;
      current: number;
      optimal?: number;
    };
    ensemble: {
      min: number;        // Minimum ensemble score (0-1)
      max: number;
      current: number;
      optimal?: number;
    };
    combined: {
      min: number;        // Minimum combined score (0-1)
      max: number;
      current: number;
      optimal?: number;
    };
  };
  
  // Algorithm Weights
  weights: {
    pdq: number;          // Weight for PDQ similarity (0-1)
    embedding: number;    // Weight for embedding similarity
    ensemble: number;     // Weight for ensemble similarity
    adaptive: boolean;    // Enable adaptive weighting
  };
  
  // Performance Targets
  targets: {
    precision: number;    // Target precision (0-1)
    recall: number;       // Target recall (0-1)
    f1Score: number;      // Target F1 score (0-1)
    falsePositiveRate: number; // Target FPR (0-1)
    maxDailyAlerts: number;    // Maximum daily alerts
  };
  
  // Optimization Settings
  optimization: {
    enabled: boolean;
    method: 'grid_search' | 'bayesian' | 'genetic' | 'gradient_descent';
    learningRate: number;
    iterations: number;
    crossValidationFolds: number;
    validationSetSize: number;
  };
}

export interface ROCData {
  thresholds: number[];
  truePositiveRate: number[];
  falsePositiveRate: number[];
  precision: number[];
  recall: number[];
  f1Score: number[];
  auc: number;
}

export interface SensitivityMetrics {
  current: {
    precision: number;
    recall: number;
    f1Score: number;
    falsePositiveRate: number;
    trueNegativeRate: number;
    MatthewsCorrelation: number;
  };
  target: SensitivityConfig['targets'];
  gap: {
    precision: number;
    recall: number;
    f1Score: number;
    falsePositiveRate: number;
  };
  trend: Array<{
    timestamp: Date;
    precision: number;
    recall: number;
    f1Score: number;
    falsePositiveRate: number;
  }>;
}

export interface ThresholdOptimizationResult {
  optimalThresholds: SensitivityConfig['thresholds'];
  optimalWeights: SensitivityConfig['weights'];
  expectedMetrics: SensitivityMetrics['current'];
  improvement: {
    precision: number;
    recall: number;
    f1Score: number;
    falsePositiveRate: number;
  };
  confidence: number;
  recommended: boolean;
}
```

### Sensitivity Control Manager
```typescript
import { Matrix } from 'ml-matrix';
import * as ss from 'simple-statistics';

export class SensitivityControlManager {
  private config: SensitivityConfig;
  private collisionDetector: CollisionDetectionEngine;
  private storage: UnifiedStorageManager;
  private metrics: SensitivityMetrics;
  private rocData: ROCData;

  constructor(
    config: SensitivityConfig,
    collisionDetector: CollisionDetectionEngine,
    storage: UnifiedStorageManager
  ) {
    this.config = config;
    this.collisionDetector = collisionDetector;
    this.storage = storage;
    
    this.metrics = this.initializeMetrics();
    this.rocData = this.initializeROCData();
  }

  /**
   * Adjust sensitivity thresholds
   */
  async adjustThresholds(
    adjustments: Partial<SensitivityConfig['thresholds']>
  ): Promise<{
    updatedConfig: SensitivityConfig;
    projectedMetrics: SensitivityMetrics['current'];
  }> {
    try {
      // Validate adjustments
      this.validateThresholdAdjustments(adjustments);
      
      // Apply adjustments
      const updatedConfig = {
        ...this.config,
        thresholds: {
          ...this.config.thresholds,
          ...adjustments
        }
      };
      
      // Project impact on metrics
      const projectedMetrics = await this.projectMetrics(updatedConfig);
      
      // Store updated configuration
      await this.storage.updateSensitivityConfig(updatedConfig);
      
      // Update local config
      this.config = updatedConfig;
      
      return {
        updatedConfig,
        projectedMetrics
      };
      
    } catch (error) {
      throw new Error(`Failed to adjust thresholds: ${error.message}`);
    }
  }

  /**
   * Optimize thresholds automatically
   */
  async optimizeThresholds(
    optimizationMethod: SensitivityConfig['optimization']['method'] = 'grid_search'
  ): Promise<ThresholdOptimizationResult> {
    try {
      // Get validation dataset
      const validationData = await this.getValidationDataset();
      
      // Run optimization based on method
      let result: ThresholdOptimizationResult;
      
      switch (optimizationMethod) {
        case 'grid_search':
          result = await this.gridSearchOptimization(validationData);
          break;
        case 'bayesian':
          result = await this.bayesianOptimization(validationData);
          break;
        case 'genetic':
          result = await this.geneticOptimization(validationData);
          break;
        case 'gradient_descent':
          result = await this.gradientDescentOptimization(validationData);
          break;
        default:
          throw new Error(`Unsupported optimization method: ${optimizationMethod}`);
      }
      
      // Validate optimization results
      if (this.validateOptimizationResult(result)) {
        // Apply optimal thresholds
        await this.applyOptimalThresholds(result);
        
        // Log optimization event
        await this.logOptimizationEvent(result);
      }
      
      return result;
      
    } catch (error) {
      throw new Error(`Threshold optimization failed: ${error.message}`);
    }
  }

  /**
   * Real-time sensitivity tuning with feedback
   */
  async tuneWithFeedback(
    feedbackData: Array<{
      collisionId: string;
      actualLabel: 'true_positive' | 'false_positive' | 'true_negative' | 'false_negative';
      predictedScore: number;
      timestamp: Date;
    }>
  ): Promise<{
    updatedThresholds: SensitivityConfig['thresholds'];
    improvement: number;
    recommendations: string[];
  }> {
    try {
      // Analyze feedback patterns
      const analysis = this.analyzeFeedback(feedbackData);
      
      // Calculate threshold adjustments
      const adjustments = this.calculateThresholdAdjustments(analysis);
      
      // Apply adjustments with gradual learning
      const updatedThresholds = this.applyGradualAdjustments(adjustments);
      
      // Calculate expected improvement
      const improvement = this.calculateExpectedImprovement(analysis, updatedThresholds);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(analysis, improvement);
      
      // Update configuration
      await this.adjustThresholds(updatedThresholds);
      
      return {
        updatedThresholds,
        improvement,
        recommendations
      };
      
    } catch (error) {
      throw new Error(`Feedback tuning failed: ${error.message}`);
    }
  }

  /**
   * Generate ROC curve data
   */
  async generateROCData(
    algorithm: 'pdq' | 'embedding' | 'ensemble' | 'combined'
  ): Promise<ROCData> {
    try {
      // Get test dataset with ground truth
      const testData = await this.getTestDataset();
      
      // Calculate similarity scores for all test cases
      const scores = await this.calculateSimilarityScores(testData, algorithm);
      
      // Generate ROC curve points
      const rocData = this.calculateROCCurve(scores, testData);
      
      // Calculate AUC
      rocData.auc = this.calculateAUC(rocData.falsePositiveRate, rocData.truePositiveRate);
      
      // Cache ROC data
      this.rocData[algorithm] = rocData;
      
      return rocData;
      
    } catch (error) {
      throw new Error(`ROC generation failed: ${error.message}`);
    }
  }

  /**
   * Get current sensitivity metrics
   */
  async getCurrentMetrics(): Promise<SensitivityMetrics> {
    try {
      // Get recent collision data
      const recentCollisions = await this.getRecentCollisions(1000);
      
      // Calculate confusion matrix
      const confusionMatrix = this.calculateConfusionMatrix(recentCollisions);
      
      // Calculate metrics
      const currentMetrics = this.calculateMetricsFromConfusionMatrix(confusionMatrix);
      
      // Calculate gap from targets
      const gap = this.calculateTargetGap(currentMetrics);
      
      // Get historical trend
      const trend = await this.getMetricsTrend(30); // 30 days
      
      this.metrics = {
        current: currentMetrics,
        target: this.config.targets,
        gap,
        trend
      };
      
      return this.metrics;
      
    } catch (error) {
      throw new Error(`Metrics calculation failed: ${error.message}`);
    }
  }

  /**
   * Grid search optimization
   */
  private async gridSearchOptimization(
    validationData: any[]
  ): Promise<ThresholdOptimizationResult> {
    const thresholdRanges = {
      pdq: { min: 0, max: 64, step: 2 },      // Hamming distance
      embedding: { min: 0.7, max: 0.95, step: 0.025 },
      ensemble: { min: 0.6, max: 0.9, step: 0.05 },
      combined: { min: 0.7, max: 0.95, step: 0.025 }
    };
    
    let bestResult: ThresholdOptimizationResult | null = null;
    let bestScore = 0;
    
    // Generate all threshold combinations
    const combinations = this.generateThresholdCombinations(thresholdRanges);
    
    // Evaluate each combination
    for (const thresholds of combinations) {
      const metrics = await this.evaluateThresholds(thresholds, validationData);
      const score = this.calculateOptimizationScore(metrics);
      
      if (score > bestScore) {
        bestScore = score;
        bestResult = {
          optimalThresholds: thresholds,
          optimalWeights: this.config.weights,
          expectedMetrics: metrics,
          improvement: this.calculateImprovement(metrics),
          confidence: this.calculateConfidence(metrics),
          recommended: true
        };
      }
    }
    
    return bestResult!;
  }

  /**
   * Bayesian optimization
   */
  private async bayesianOptimization(
    validationData: any[]
  ): Promise<ThresholdOptimizationResult> {
    // Simplified Bayesian optimization using Gaussian Process
    const iterations = this.config.optimization.iterations;
    let bestThresholds = this.config.thresholds;
    let bestScore = this.calculateOptimizationScore(await this.getCurrentMetrics().then(m => m.current));
    
    for (let i = 0; i < iterations; i++) {
      // Generate candidate thresholds
      const candidates = this.generateBayesianCandidates(bestThresholds, validationData);
      
      // Evaluate candidates
      for (const candidate of candidates) {
        const metrics = await this.evaluateThresholds(candidate, validationData);
        const score = this.calculateOptimizationScore(metrics);
        
        if (score > bestScore) {
          bestScore = score;
          bestThresholds = candidate;
        }
      }
    }
    
    const finalMetrics = await this.evaluateThresholds(bestThresholds, validationData);
    
    return {
      optimalThresholds: bestThresholds,
      optimalWeights: this.config.weights,
      expectedMetrics: finalMetrics,
      improvement: this.calculateImprovement(finalMetrics),
      confidence: this.calculateConfidence(finalMetrics),
      recommended: true
    };
  }

  /**
   * Genetic optimization
   */
  private async geneticOptimization(
    validationData: any[]
  ): Promise<ThresholdOptimizationResult> {
    const populationSize = 50;
    const generations = this.config.optimization.iterations;
    const mutationRate = 0.1;
    const crossoverRate = 0.7;
    
    // Initialize population
    let population = this.initializePopulation(populationSize);
    
    for (let generation = 0; generation < generations; generation++) {
      // Evaluate fitness
      const fitnessScores = await Promise.all(
        population.map(individual => 
          this.evaluateThresholds(individual.thresholds, validationData)
            .then(metrics => this.calculateOptimizationScore(metrics))
        )
      );
      
      // Select parents
      const parents = this.selectParents(population, fitnessScores);
      
      // Create next generation
      population = this.createNextGeneration(parents, crossoverRate, mutationRate);
    }
    
    // Get best individual
    const finalFitness = await Promise.all(
      population.map(individual => 
        this.evaluateThresholds(individual.thresholds, validationData)
          .then(metrics => ({
            individual,
            metrics,
            score: this.calculateOptimizationScore(metrics)
          }))
      )
    );
    
    const best = finalFitness.reduce((prev, curr) => 
      curr.score > prev.score ? curr : prev
    );
    
    return {
      optimalThresholds: best.individual.thresholds,
      optimalWeights: best.individual.weights,
      expectedMetrics: best.metrics,
      improvement: this.calculateImprovement(best.metrics),
      confidence: this.calculateConfidence(best.metrics),
      recommended: true
    };
  }

  /**
   * Gradient descent optimization
   */
  private async gradientDescentOptimization(
    validationData: any[]
  ): Promise<ThresholdOptimizationResult> {
    const learningRate = this.config.optimization.learningRate;
    const iterations = this.config.optimization.iterations;
    
    let thresholds = { ...this.config.thresholds };
    let bestScore = this.calculateOptimizationScore(await this.getCurrentMetrics().then(m => m.current));
    
    for (let i = 0; i < iterations; i++) {
      // Calculate gradients
      const gradients = await this.calculateGradients(thresholds, validationData);
      
      // Update thresholds
      thresholds = this.updateThresholds(thresholds, gradients, learningRate);
      
      // Evaluate new thresholds
      const metrics = await this.evaluateThresholds(thresholds, validationData);
      const score = this.calculateOptimizationScore(metrics);
      
      if (score > bestScore) {
        bestScore = score;
      }
      
      // Check convergence
      if (this.hasConverged(gradients)) {
        break;
      }
    }
    
    const finalMetrics = await this.evaluateThresholds(thresholds, validationData);
    
    return {
      optimalThresholds: thresholds,
      optimalWeights: this.config.weights,
      expectedMetrics: finalMetrics,
      improvement: this.calculateImprovement(finalMetrics),
      confidence: this.calculateConfidence(finalMetrics),
      recommended: true
    };
  }

  /**
   * Evaluate thresholds on validation data
   */
  private async evaluateThresholds(
    thresholds: SensitivityConfig['thresholds'],
    validationData: any[]
  ): Promise<SensitivityMetrics['current']> {
    // Apply thresholds to validation data
    const predictions = validationData.map(item => 
      this.predictCollision(item, thresholds)
    );
    
    // Calculate confusion matrix
    const confusionMatrix = this.calculateConfusionMatrix(
      validationData.map((item, index) => ({
        actual: item.groundTruth,
        predicted: predictions[index]
      }))
    );
    
    return this.calculateMetricsFromConfusionMatrix(confusionMatrix);
  }

  /**
   * Calculate ROC curve points
   */
  private calculateROCCurve(
    scores: Array<{ score: number; label: boolean }>,
    testData: any[]
  ): ROCData {
    // Sort by score descending
    const sortedScores = scores.sort((a, b) => b.score - a.score);
    
    const thresholds: number[] = [];
    const tpr: number[] = [];
    const fpr: number[] = [];
    const precision: number[] = [];
    const recall: number[] = [];
    const f1Score: number[] = [];
    
    const positives = scores.filter(s => s.label).length;
    const negatives = scores.filter(s => !s.label).length;
    
    let tp = 0, fp = 0;
    
    for (let i = 0; i < sortedScores.length; i++) {
      const currentScore = sortedScores[i].score;
      thresholds.push(currentScore);
      
      // Update confusion matrix
      if (sortedScores[i].label) {
        tp++;
      } else {
        fp++;
      }
      
      // Calculate rates
      const tpr_current = tp / positives;
      const fpr_current = fp / negatives;
      const precision_current = tp / (tp + fp);
      const recall_current = tpr_current;
      const f1_current = 2 * (precision_current * recall_current) / (precision_current + recall_current);
      
      tpr.push(tpr_current);
      fpr.push(fpr_current);
      precision.push(precision_current);
      recall.push(recall_current);
      f1Score.push(f1_current);
    }
    
    return {
      thresholds,
      truePositiveRate: tpr,
      falsePositiveRate: fpr,
      precision,
      recall,
      f1Score,
      auc: 0 // Will be calculated separately
    };
  }

  /**
   * Calculate AUC using trapezoidal rule
   */
  private calculateAUC(fpr: number[], tpr: number[]): number {
    let auc = 0;
    for (let i = 1; i < fpr.length; i++) {
      auc += (fpr[i] - fpr[i - 1]) * (tpr[i] + tpr[i - 1]) / 2;
    }
    return auc;
  }

  /**
   * Calculate optimization score
   */
  private calculateOptimizationScore(metrics: SensitivityMetrics['current']): number {
    const targets = this.config.targets;
    
    // Weighted combination of metrics
    const precisionScore = metrics.precision / targets.precision;
    const recallScore = metrics.recall / targets.recall;
    const f1Score = metrics.f1Score / targets.f1Score;
    const fprScore = (1 - metrics.falsePositiveRate) / (1 - targets.falsePositiveRate);
    
    // Penalize exceeding false positive rate heavily
    const fprPenalty = metrics.falsePositiveRate > targets.falsePositiveRate ? 0.5 : 1;
    
    return (precisionScore * 0.3 + recallScore * 0.3 + f1Score * 0.2 + fprScore * 0.2) * fprPenalty;
  }

  /**
   * Calculate confusion matrix
   */
  private calculateConfusionMatrix(
    predictions: Array<{ actual: boolean; predicted: boolean }>
  ): {
    truePositives: number;
    falsePositives: number;
    trueNegatives: number;
    falseNegatives: number;
  } {
    return predictions.reduce((matrix, prediction) => {
      if (prediction.actual && prediction.predicted) {
        matrix.truePositives++;
      } else if (!prediction.actual && prediction.predicted) {
        matrix.falsePositives++;
      } else if (!prediction.actual && !prediction.predicted) {
        matrix.trueNegatives++;
      } else if (prediction.actual && !prediction.predicted) {
        matrix.falseNegatives++;
      }
      return matrix;
    }, {
      truePositives: 0,
      falsePositives: 0,
      trueNegatives: 0,
      falseNegatives: 0
    });
  }

  /**
   * Calculate metrics from confusion matrix
   */
  private calculateMetricsFromConfusionMatrix(
    matrix: { truePositives: number; falsePositives: number; trueNegatives: number; falseNegatives: number }
  ): SensitivityMetrics['current'] {
    const { truePositives, falsePositives, trueNegatives, falseNegatives } = matrix;
    
    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const f1Score = 2 * (precision * recall) / (precision + recall) || 0;
    const falsePositiveRate = falsePositives / (falsePositives + trueNegatives) || 0;
    const trueNegativeRate = trueNegatives / (trueNegatives + falsePositives) || 0;
    
    // Matthews correlation coefficient
    const matthewsCorrelation = 
      (truePositives * trueNegatives - falsePositives * falseNegatives) /
      Math.sqrt((truePositives + falsePositives) * (truePositives + falseNegatives) * 
                (trueNegatives + falsePositives) * (trueNegatives + falseNegatives)) || 0;
    
    return {
      precision,
      recall,
      f1Score,
      falsePositiveRate,
      trueNegativeRate,
      MatthewsCorrelation
    };
  }

  /**
   * Generate threshold combinations for grid search
   */
  private generateThresholdCombinations(
    ranges: Record<string, { min: number; max: number; step: number }>
  ): SensitivityConfig['thresholds'][] {
    const combinations: SensitivityConfig['thresholds'][] = [];
    
    const pdqValues = this.generateRange(ranges.pdq);
    const embeddingValues = this.generateRange(ranges.embedding);
    const ensembleValues = this.generateRange(ranges.ensemble);
    const combinedValues = this.generateRange(ranges.combined);
    
    for (const pdq of pdqValues) {
      for (const embedding of embeddingValues) {
        for (const ensemble of ensembleValues) {
          for (const combined of combinedValues) {
            combinations.push({
              pdq: { ...this.config.thresholds.pdq, current: pdq },
              embedding: { ...this.config.thresholds.embedding, current: embedding },
              ensemble: { ...this.config.thresholds.ensemble, current: ensemble },
              combined: { ...this.config.thresholds.combined, current: combined }
            });
          }
        }
      }
    }
    
    return combinations;
  }

  /**
   * Generate range values
   */
  private generateRange(range: { min: number; max: number; step: number }): number[] {
    const values: number[] = [];
    for (let value = range.min; value <= range.max; value += range.step) {
      values.push(value);
    }
    return values;
  }

  /**
   * Validate threshold adjustments
   */
  private validateThresholdAdjustments(
    adjustments: Partial<SensitivityConfig['thresholds']>
  ): void {
    for (const [algorithm, threshold] of Object.entries(adjustments)) {
      if (!threshold) continue;
      
      const config = this.config.thresholds[algorithm as keyof SensitivityConfig['thresholds']];
      
      if (threshold.current < config.min || threshold.current > config.max) {
        throw new Error(`Threshold for ${algorithm} out of range [${config.min}, ${config.max}]`);
      }
    }
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): SensitivityMetrics {
    return {
      current: {
        precision: 0,
        recall: 0,
        f1Score: 0,
        falsePositiveRate: 0,
        trueNegativeRate: 0,
        MatthewsCorrelation: 0
      },
      target: this.config.targets,
      gap: {
        precision: 0,
        recall: 0,
        f1Score: 0,
        falsePositiveRate: 0
      },
      trend: []
    };
  }

  /**
   * Initialize ROC data
   */
  private initializeROCData(): ROCData {
    return {
      thresholds: [],
      truePositiveRate: [],
      falsePositiveRate: [],
      precision: [],
      recall: [],
      f1Score: [],
      auc: 0
    };
  }
}
```
