/**
 * Phase 40 Statistical Analysis Plan
 * SECURITY: Confidence intervals and significance tests for A/B experiment results
 * WARNING: Statistical operations on potentially sensitive data
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// SECURITY: Limits to prevent DoS attacks
const MAX_SAMPLE_SIZE = 1000000;
const MAX_TENANT_ID_LENGTH = 64;
const MAX_DATE_STRING_LENGTH = 32;
const MAX_LATENCY_MS = 300000; // 5 minutes max
const MAX_COST_USD = 1000; // $1000 max per verify

// SECURITY: Numeric bounds
const MIN_CONFIDENCE_LEVEL = 0.8;
const MAX_CONFIDENCE_LEVEL = 0.99;
const MIN_SAMPLE_SIZE = 100;
const MAX_SAMPLE_SIZE_PER_ARM = 100000;

/**
 * SECURITY: Validate and sanitize tenant ID
 */
function validateTenantId(tenantId: string): string {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('Invalid tenant ID');
  }
  if (tenantId.length > MAX_TENANT_ID_LENGTH) {
    throw new Error(`Tenant ID exceeds maximum length of ${MAX_TENANT_ID_LENGTH}`);
  }
  return tenantId.replace(/[<>"'\\]/g, '').trim();
}

/**
 * SECURITY: Validate date string
 */
function validateDateString(dateStr: string): string {
  if (!dateStr || typeof dateStr !== 'string') {
    throw new Error('Invalid date string');
  }
  if (dateStr.length > MAX_DATE_STRING_LENGTH) {
    throw new Error('Date string too long');
  }
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format');
    }
    return dateStr;
  } catch (error) {
    throw new Error('Invalid date format');
  }
}

/**
 * SECURITY: Validate experiment sample
 */
function validateExperimentSample(sample: any): ExperimentSample {
  if (!sample || typeof sample !== 'object') {
    throw new Error('Invalid sample object');
  }
  
  const validated: ExperimentSample = {
    tenant_id: validateTenantId(sample.tenant_id || ''),
    experiment_arm: ['A_EMBED', 'B_REMOTE'].includes(sample.experiment_arm) 
      ? sample.experiment_arm as 'A_EMBED' | 'B_REMOTE'
      : (() => { throw new Error('Invalid experiment arm'); })(),
    route_bucket: Number.isInteger(sample.route_bucket) && sample.route_bucket >= 0 && sample.route_bucket <= 99
      ? sample.route_bucket
      : (() => { throw new Error('Invalid route bucket'); })(),
    pathname: typeof sample.pathname === 'string' && sample.pathname.length <= 256
      ? sample.pathname.replace(/[<>"'\\]/g, '')
      : (() => { throw new Error('Invalid pathname'); })(),
    timestamp: Number.isInteger(sample.timestamp) && sample.timestamp > 0 && sample.timestamp <= Date.now()
      ? sample.timestamp
      : (() => { throw new Error('Invalid timestamp'); })(),
    survival_outcome: ['survived', 'destroyed', 'broken', 'inaccessible'].includes(sample.survival_outcome)
      ? sample.survival_outcome
      : (() => { throw new Error('Invalid survival outcome'); })(),
    latency_ms: Number.isFinite(sample.latency_ms) && sample.latency_ms >= 0 && sample.latency_ms <= MAX_LATENCY_MS
      ? sample.latency_ms
      : (() => { throw new Error('Invalid latency value'); })(),
    cost_usd: Number.isFinite(sample.cost_usd) && sample.cost_usd >= 0 && sample.cost_usd <= MAX_COST_USD
      ? sample.cost_usd
      : (() => { throw new Error('Invalid cost value'); })(),
    preserve_capable: Boolean(sample.preserve_capable)
  };
  
  return validated;
}

interface ExperimentSample {
  tenant_id: string;
  experiment_arm: 'A_EMBED' | 'B_REMOTE';
  route_bucket: number;
  pathname: string;
  timestamp: number;
  survival_outcome: 'survived' | 'destroyed' | 'broken' | 'inaccessible';
  latency_ms: number;
  cost_usd: number;
  preserve_capable: boolean;
}

interface StatisticalMetrics {
  sample_size: number;
  survival_rate: number;
  survival_rate_ci: { lower: number; upper: number };
  avg_latency_ms: number;
  avg_latency_ci: { lower: number; upper: number };
  p95_latency_ms: number;
  p95_latency_ci: { lower: number; upper: number };
  avg_cost_per_verify: number;
  avg_cost_ci: { lower: number; upper: number };
}

interface ComparisonResult {
  metric: string;
  arm_a_value: number;
  arm_b_value: number;
  absolute_difference: number;
  relative_difference_percent: number;
  p_value: number;
  is_statistically_significant: boolean;
  confidence_level: number;
  test_used: string;
  interpretation: string;
}

interface StatisticalAnalysis {
  tenant_id: string;
  analysis_date: string;
  sample_period: { start: string; end: string };
  arm_a_metrics: StatisticalMetrics;
  arm_b_metrics: StatisticalMetrics;
  comparisons: ComparisonResult[];
  overall_significance: boolean;
  recommendations: string[];
  limitations: string[];
}

/**
 * Phase 40 Statistical Analysis Engine
 */
export class Phase40StatisticalAnalyzer {
  public confidenceLevel: number = 0.95;
  private minimumSampleSize: number = 1000;
  private powerThreshold: number = 0.8;

  /**
   * SECURITY: Perform comprehensive statistical analysis with validation
   */
  async analyzeExperiment(
    tenantId: string,
    startDate: string,
    endDate: string,
    samples: ExperimentSample[]
  ): Promise<StatisticalAnalysis> {
    
    // SECURITY: Validate inputs
    const validatedTenantId = validateTenantId(tenantId);
    const validatedStartDate = validateDateString(startDate);
    const validatedEndDate = validateDateString(endDate);
    
    if (!Array.isArray(samples)) {
      throw new Error('Samples must be an array');
    }
    
    // SECURITY: Prevent DoS through large sample sizes
    if (samples.length > MAX_SAMPLE_SIZE) {
      throw new Error(`Sample size exceeds maximum of ${MAX_SAMPLE_SIZE}`);
    }
    
    // SECURITY: Validate all samples
    const validatedSamples = samples.map(sample => validateExperimentSample(sample));
    
    // Filter samples by tenant and date range
    const filteredSamples = validatedSamples.filter(s => 
      s.tenant_id === validatedTenantId && 
      new Date(s.timestamp).toISOString().split('T')[0] >= validatedStartDate &&
      new Date(s.timestamp).toISOString().split('T')[0] <= validatedEndDate
    );

    // Split by experiment arm
    const armASamples = filteredSamples.filter(s => s.experiment_arm === 'A_EMBED');
    const armBSamples = filteredSamples.filter(s => s.experiment_arm === 'B_REMOTE');

    // Check minimum sample size requirements
    if (armASamples.length < this.minimumSampleSize || armBSamples.length < this.minimumSampleSize) {
      throw new Error(`Insufficient sample size. Minimum ${this.minimumSampleSize} required per arm.`);
    }

    // Calculate metrics for each arm
    const armAMetrics = this.calculateStatisticalMetrics(armASamples);
    const armBMetrics = this.calculateStatisticalMetrics(armBSamples);

    // Perform statistical comparisons
    const comparisons = this.performComparisons(armASamples, armBSamples, armAMetrics, armBMetrics);

    // Determine overall significance
    const overallSignificance = comparisons.some(c => c.is_statistically_significant);

    // Generate recommendations
    const recommendations = this.generateRecommendations(comparisons, armAMetrics, armBMetrics);

    // Identify limitations
    const limitations = this.identifyLimitations(armASamples, armBSamples);

    return {
      tenant_id: tenantId,
      analysis_date: new Date().toISOString(),
      sample_period: { start: startDate, end: endDate },
      arm_a_metrics: armAMetrics,
      arm_b_metrics: armBMetrics,
      comparisons: comparisons,
      overall_significance: overallSignificance,
      recommendations: recommendations,
      limitations: limitations
    };
  }

  /**
   * Calculate statistical metrics for a sample set
   */
  private calculateStatisticalMetrics(samples: ExperimentSample[]): StatisticalMetrics {
    const n = samples.length;
    
    // Survival rate analysis
    const survivedCount = samples.filter(s => s.survival_outcome === 'survived').length;
    const survivalRate = survivedCount / n;
    const survivalRateCI = this.calculateProportionCI(survivedCount, n);

    // Latency analysis
    const latencies = samples.map(s => s.latency_ms).sort((a, b) => a - b);
    const avgLatency = latencies.reduce((sum, val) => sum + val, 0) / n;
    const avgLatencyCI = this.calculateMeanCI(latencies);
    
    const p95Index = Math.floor(n * 0.95);
    const p95Latency = latencies[p95Index] || 0;
    const p95LatencyCI = this.calculatePercentileCI(latencies, 0.95);

    // Cost analysis
    const costs = samples.map(s => s.cost_usd);
    const avgCost = costs.reduce((sum, val) => sum + val, 0) / n;
    const avgCostCI = this.calculateMeanCI(costs);

    return {
      sample_size: n,
      survival_rate: survivalRate,
      survival_rate_ci: survivalRateCI,
      avg_latency_ms: avgLatency,
      avg_latency_ci: avgLatencyCI,
      p95_latency_ms: p95Latency,
      p95_latency_ci: p95LatencyCI,
      avg_cost_per_verify: avgCost,
      avg_cost_ci: avgCostCI
    };
  }

  /**
   * Calculate confidence interval for proportion (Wilson score interval)
   */
  private calculateProportionCI(successes: number, n: number): { lower: number; upper: number } {
    if (n === 0) return { lower: 0, upper: 0 };
    
    const p = successes / n;
    const z = this.getZScore(this.confidenceLevel);
    const denominator = n + z * z;
    const center = p + z * z / (2 * n);
    const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n);
    
    return {
      lower: Math.max(0, (center - margin) / denominator),
      upper: Math.min(1, (center + margin) / denominator)
    };
  }

  /**
   * Calculate confidence interval for mean (t-distribution)
   */
  private calculateMeanCI(values: number[]): { lower: number; upper: number } {
    const n = values.length;
    if (n === 0) return { lower: 0, upper: 0 };
    
    const mean = values.reduce((sum, val) => sum + val, 0) / n;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1);
    const stdError = Math.sqrt(variance / n);
    
    // Use t-distribution for small samples, normal for large
    const tScore = n < 30 ? this.getTScore(this.confidenceLevel, n - 1) : this.getZScore(this.confidenceLevel);
    const margin = tScore * stdError;
    
    return {
      lower: mean - margin,
      upper: mean + margin
    };
  }

  /**
   * Calculate confidence interval for percentile (bootstrap method)
   */
  private calculatePercentileCI(values: number[], percentile: number): { lower: number; upper: number } {
    const n = values.length;
    if (n === 0) return { lower: 0, upper: 0 };
    
    // Simplified percentile CI using order statistics
    const alpha = 1 - this.confidenceLevel;
    const index = Math.floor(n * percentile);
    const lowerIndex = Math.floor(n * (percentile - alpha / 2));
    const upperIndex = Math.ceil(n * (percentile + alpha / 2));
    
    return {
      lower: values[Math.max(0, lowerIndex)] || 0,
      upper: values[Math.min(n - 1, upperIndex)] || 0
    };
  }

  /**
   * Perform statistical comparisons between arms
   */
  private performComparisons(
    armASamples: ExperimentSample[],
    armBSamples: ExperimentSample[],
    armAMetrics: StatisticalMetrics,
    armBMetrics: StatisticalMetrics
  ): ComparisonResult[] {
    const comparisons: ComparisonResult[] = [];

    // Survival rate comparison (two-proportion z-test)
    const survivalComparison = this.compareProportions(
      'Survival Rate',
      armAMetrics.survival_rate,
      armBMetrics.survival_rate,
      armASamples.filter(s => s.survival_outcome === 'survived').length,
      armBSamples.filter(s => s.survival_outcome === 'survived').length,
      armASamples.length,
      armBSamples.length
    );
    comparisons.push(survivalComparison);

    // Average latency comparison (two-sample t-test)
    const latencyComparison = this.compareMeans(
      'Average Latency',
      armAMetrics.avg_latency_ms,
      armBMetrics.avg_latency_ms,
      armASamples.map(s => s.latency_ms),
      armBSamples.map(s => s.latency_ms)
    );
    comparisons.push(latencyComparison);

    // P95 latency comparison (Mann-Whitney U test for percentiles)
    const p95Comparison = this.comparePercentiles(
      'P95 Latency',
      armAMetrics.p95_latency_ms,
      armBMetrics.p95_latency_ms,
      armASamples.map(s => s.latency_ms),
      armBSamples.map(s => s.latency_ms)
    );
    comparisons.push(p95Comparison);

    // Cost comparison (two-sample t-test)
    const costComparison = this.compareMeans(
      'Average Cost per Verify',
      armAMetrics.avg_cost_per_verify,
      armBMetrics.avg_cost_per_verify,
      armASamples.map(s => s.cost_usd),
      armBSamples.map(s => s.cost_usd)
    );
    comparisons.push(costComparison);

    return comparisons;
  }

  /**
   * Compare two proportions using two-proportion z-test
   */
  private compareProportions(
    metricName: string,
    p1: number,
    p2: number,
    successes1: number,
    successes2: number,
    n1: number,
    n2: number
  ): ComparisonResult {
    const pooledProportion = (successes1 + successes2) / (n1 + n2);
    const standardError = Math.sqrt(pooledProportion * (1 - pooledProportion) * (1/n1 + 1/n2));
    const zScore = Math.abs(p1 - p2) / standardError;
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore)));
    
    const absoluteDifference = p1 - p2;
    const relativeDifference = (absoluteDifference / p2) * 100;
    const isSignificant = pValue < (1 - this.confidenceLevel);

    return {
      metric: metricName,
      arm_a_value: p1,
      arm_b_value: p2,
      absolute_difference: absoluteDifference,
      relative_difference_percent: relativeDifference,
      p_value: pValue,
      is_statistically_significant: isSignificant,
      confidence_level: this.confidenceLevel,
      test_used: 'Two-proportion z-test',
      interpretation: this.interpretProportionDifference(absoluteDifference, pValue, isSignificant)
    };
  }

  /**
   * Compare two means using two-sample t-test
   */
  private compareMeans(
    metricName: string,
    mean1: number,
    mean2: number,
    values1: number[],
    values2: number[]
  ): ComparisonResult {
    const n1 = values1.length;
    const n2 = values2.length;
    
    const variance1 = values1.reduce((sum, val) => sum + Math.pow(val - mean1, 2), 0) / (n1 - 1);
    const variance2 = values2.reduce((sum, val) => sum + Math.pow(val - mean2, 2), 0) / (n2 - 1);
    
    const pooledVariance = ((n1 - 1) * variance1 + (n2 - 1) * variance2) / (n1 + n2 - 2);
    const standardError = Math.sqrt(pooledVariance * (1/n1 + 1/n2));
    const tScore = Math.abs(mean1 - mean2) / standardError;
    const degreesOfFreedom = n1 + n2 - 2;
    const pValue = 2 * (1 - this.tCDF(Math.abs(tScore), degreesOfFreedom));
    
    const absoluteDifference = mean1 - mean2;
    const relativeDifference = (absoluteDifference / mean2) * 100;
    const isSignificant = pValue < (1 - this.confidenceLevel);

    return {
      metric: metricName,
      arm_a_value: mean1,
      arm_b_value: mean2,
      absolute_difference: absoluteDifference,
      relative_difference_percent: relativeDifference,
      p_value: pValue,
      is_statistically_significant: isSignificant,
      confidence_level: this.confidenceLevel,
      test_used: 'Two-sample t-test',
      interpretation: this.interpretMeanDifference(absoluteDifference, pValue, isSignificant)
    };
  }

  /**
   * Compare percentiles using Mann-Whitney U test
   */
  private comparePercentiles(
    metricName: string,
    percentile1: number,
    percentile2: number,
    values1: number[],
    values2: number[]
  ): ComparisonResult {
    // Simplified Mann-Whitney U test for percentiles
    const n1 = values1.length;
    const n2 = values2.length;
    
    // Calculate U statistic (simplified)
    const u1 = this.mannWhitneyU(values1, values2);
    const u2 = n1 * n2 - u1;
    const u = Math.min(u1, u2);
    
    // Approximate p-value using normal approximation
    const meanU = n1 * n2 / 2;
    const stdU = Math.sqrt(n1 * n2 * (n1 + n2 + 1) / 12);
    const zScore = (u - meanU) / stdU;
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore)));
    
    const absoluteDifference = percentile1 - percentile2;
    const relativeDifference = (absoluteDifference / percentile2) * 100;
    const isSignificant = pValue < (1 - this.confidenceLevel);

    return {
      metric: metricName,
      arm_a_value: percentile1,
      arm_b_value: percentile2,
      absolute_difference: absoluteDifference,
      relative_difference_percent: relativeDifference,
      p_value: pValue,
      is_statistically_significant: isSignificant,
      confidence_level: this.confidenceLevel,
      test_used: 'Mann-Whitney U test',
      interpretation: this.interpretPercentileDifference(absoluteDifference, pValue, isSignificant)
    };
  }

  /**
   * Mann-Whitney U test calculation
   */
  private mannWhitneyU(values1: number[], values2: number[]): number {
    let u = 0;
    for (const v1 of values1) {
      for (const v2 of values2) {
        if (v1 < v2) u++;
        else if (v1 === v2) u += 0.5;
      }
    }
    return u;
  }

  /**
   * Interpret proportion differences
   */
  private interpretProportionDifference(diff: number, pValue: number, isSignificant: boolean): string {
    if (!isSignificant) {
      return 'No statistically significant difference in survival rates.';
    }
    
    const diffPercent = Math.abs(diff) * 100;
    if (diff > 0) {
      return `Embed arm shows ${diffPercent.toFixed(2)}% higher survival rate (statistically significant).`;
    } else {
      return `Remote arm shows ${diffPercent.toFixed(2)}% higher survival rate (statistically significant).`;
    }
  }

  /**
   * Interpret mean differences
   */
  private interpretMeanDifference(diff: number, pValue: number, isSignificant: boolean): string {
    if (!isSignificant) {
      return 'No statistically significant difference in means.';
    }
    
    const diffPercent = Math.abs(diff) / Math.abs(diff < 0 ? diff + 1 : 1) * 100;
    if (diff > 0) {
      return `Embed arm shows ${diffPercent.toFixed(2)}% higher mean (statistically significant).`;
    } else {
      return `Remote arm shows ${diffPercent.toFixed(2)}% higher mean (statistically significant).`;
    }
  }

  /**
   * Interpret percentile differences
   */
  private interpretPercentileDifference(diff: number, pValue: number, isSignificant: boolean): string {
    if (!isSignificant) {
      return 'No statistically significant difference in percentiles.';
    }
    
    const diffPercent = Math.abs(diff) / Math.abs(diff < 0 ? diff + 1 : 1) * 100;
    if (diff > 0) {
      return `Embed arm shows ${diffPercent.toFixed(2)}% higher percentile (statistically significant).`;
    } else {
      return `Remote arm shows ${diffPercent.toFixed(2)}% higher percentile (statistically significant).`;
    }
  }

  /**
   * Generate recommendations based on statistical analysis
   */
  private generateRecommendations(
    comparisons: ComparisonResult[],
    armAMetrics: StatisticalMetrics,
    armBMetrics: StatisticalMetrics
  ): string[] {
    const recommendations: string[] = [];

    // Survival rate recommendations
    const survivalComparison = comparisons.find(c => c.metric === 'Survival Rate');
    if (survivalComparison) {
      if (survivalComparison.is_statistically_significant) {
        if (survivalComparison.arm_a_value > survivalComparison.arm_b_value) {
          recommendations.push('Embed arm shows significantly higher survival rate - consider for high-value content.');
        } else {
          recommendations.push('Remote arm shows significantly higher survival rate - recommended for general use.');
        }
      } else {
        recommendations.push('No significant survival rate difference - choose based on other factors.');
      }
    }

    // Cost recommendations
    const costComparison = comparisons.find(c => c.metric === 'Average Cost per Verify');
    if (costComparison) {
      if (costComparison.is_statistically_significant) {
        if (costComparison.arm_a_value < costComparison.arm_b_value) {
          recommendations.push('Embed arm is significantly more cost-effective.');
        } else {
          recommendations.push('Remote arm is significantly more cost-effective.');
        }
      }
    }

    // Combined recommendations
    const significantComparisons = comparisons.filter(c => c.is_statistically_significant);
    if (significantComparisons.length === 0) {
      recommendations.push('No statistically significant differences found - results are inconclusive.');
      recommendations.push('Consider extending experiment duration or increasing sample size.');
    }

    // Sample size recommendations
    if (armAMetrics.sample_size < 10000 || armBMetrics.sample_size < 10000) {
      recommendations.push('Consider increasing sample size for more precise estimates.');
    }

    return recommendations;
  }

  /**
   * Identify analysis limitations
   */
  private identifyLimitations(armASamples: ExperimentSample[], armBSamples: ExperimentSample[]): string[] {
    const limitations: string[] = [];

    // Sample size limitations
    if (armASamples.length < 1000 || armBSamples.length < 1000) {
      limitations.push('Small sample size may limit statistical power.');
    }

    // Time period limitations
    const timeSpan = Math.max(...armASamples.map(s => s.timestamp), ...armBSamples.map(s => s.timestamp)) - 
                    Math.min(...armASamples.map(s => s.timestamp), ...armBSamples.map(s => s.timestamp));
    if (timeSpan < 7 * 24 * 60 * 60 * 1000) { // Less than 7 days
      limitations.push('Short time period may not capture long-term effects.');
    }

    // External factors
    limitations.push('Results may be affected by external factors (vendor changes, network conditions).');
    limitations.push('Analysis assumes independent samples and random assignment.');

    return limitations;
  }

  /**
   * Get z-score for confidence level
   */
  public getZScore(confidenceLevel: number): number {
    const alpha = 1 - confidenceLevel;
    // Approximate z-scores for common confidence levels
    if (confidenceLevel === 0.90) return 1.645;
    if (confidenceLevel === 0.95) return 1.96;
    if (confidenceLevel === 0.99) return 2.576;
    return 1.96; // Default to 95%
  }

  /**
   * Get t-score for confidence level and degrees of freedom
   */
  private getTScore(confidenceLevel: number, df: number): number {
    // Simplified t-score approximation
    return this.getZScore(confidenceLevel); // For large df, t approximates normal
  }

  /**
   * Normal CDF approximation
   */
  private normalCDF(z: number): number {
    // Approximation of normal CDF
    return 0.5 * (1 + this.erf(z / Math.sqrt(2)));
  }

  /**
   * T-distribution CDF approximation
   */
  private tCDF(t: number, df: number): number {
    // Simplified t-distribution CDF approximation
    return this.normalCDF(t); // For large df, t approximates normal
  }

  /**
   * Error function approximation
   */
  private erf(x: number): number {
    // Approximation of error function
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }
}

/**
 * Global statistical analyzer instance
 */
export const statisticalAnalyzer = new Phase40StatisticalAnalyzer();

/**
 * Register Phase 40 statistical analysis endpoints
 */
export async function registerStatisticalRoutes(fastify: FastifyInstance): Promise<void> {
  
  // Statistical analysis endpoint
  fastify.post('/phase40/statistics/analyze', {
    schema: {
      body: {
        type: 'object',
        properties: {
          tenant_id: { type: 'string' },
          start_date: { type: 'string', format: 'date' },
          end_date: { type: 'string', format: 'date' },
          confidence_level: { type: 'number', minimum: 0.8, maximum: 0.99, default: 0.95 },
          samples: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tenant_id: { type: 'string' },
                experiment_arm: { type: 'string', enum: ['A_EMBED', 'B_REMOTE'] },
                route_bucket: { type: 'number' },
                pathname: { type: 'string' },
                timestamp: { type: 'number' },
                survival_outcome: { type: 'string', enum: ['survived', 'destroyed', 'broken', 'inaccessible'] },
                latency_ms: { type: 'number' },
                cost_usd: { type: 'number' },
                preserve_capable: { type: 'boolean' }
              }
            }
          }
        },
        required: ['tenant_id', 'start_date', 'end_date', 'samples']
      }
    }
  }, async (request, reply) => {
    const { tenant_id, start_date, end_date, confidence_level, samples } = request.body as any;
    
    try {
      // Update confidence level if provided
      if (confidence_level) {
        statisticalAnalyzer.confidenceLevel = confidence_level;
      }

      const analysis = await statisticalAnalyzer.analyzeExperiment(
        tenant_id,
        start_date,
        end_date,
        samples
      );

      return {
        success: true,
        data: analysis,
        request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'STATISTICAL_ANALYSIS_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Sample size calculator endpoint
  fastify.get('/phase40/statistics/sample-size', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          baseline_rate: { type: 'number', minimum: 0, maximum: 1, default: 0.95 },
          minimum_detectable_effect: { type: 'number', minimum: 0.01, maximum: 0.5, default: 0.05 },
          power: { type: 'number', minimum: 0.7, maximum: 0.95, default: 0.8 },
          confidence_level: { type: 'number', minimum: 0.8, maximum: 0.99, default: 0.95 }
        }
      }
    }
  }, async (request, reply) => {
    const { baseline_rate, minimum_detectable_effect, power, confidence_level } = request.query as any;
    
    // Calculate required sample size for proportion test
    const p1 = baseline_rate;
    const p2 = baseline_rate + minimum_detectable_effect;
    const alpha = 1 - confidence_level;
    
    // Simplified sample size calculation for two-proportion test
    const zAlpha = statisticalAnalyzer.getZScore(confidence_level);
    const zBeta = statisticalAnalyzer.getZScore(power);
    
    const pooledP = (p1 + p2) / 2;
    const variance = 2 * pooledP * (1 - pooledP);
    const effectSize = Math.abs(p2 - p1);
    
    const sampleSizePerArm = Math.ceil(
      (zAlpha * Math.sqrt(variance) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2 / effectSize ** 2
    );

    return {
      success: true,
      data: {
        sample_size_per_arm: sampleSizePerArm,
        total_sample_size: sampleSizePerArm * 2,
        parameters: {
          baseline_rate: p1,
          minimum_detectable_effect: effectSize,
          power: power,
          confidence_level: confidence_level
        },
        estimated_duration_days: Math.ceil(sampleSizePerArm / 1000), // Assuming 1000 samples/day
        recommendations: [
          `Minimum ${sampleSizePerArm} samples required per arm for statistical power`,
          `Estimated ${Math.ceil(sampleSizePerArm / 1000)} days needed at 1000 samples/day`,
          'Consider extending duration if sample rate is lower'
        ]
      },
      request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };
  });
}
