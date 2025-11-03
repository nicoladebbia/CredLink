/**
 * Phase 35 Leaderboard - Scoring Configuration
 * Transparent scoring rubric and evaluation criteria
 */

import { ScoringConfig } from '@/types';

export const SCORING_CONFIG: ScoringConfig = {
  maxPoints: 100,
  dimensions: [
    {
      id: 'embedded-manifest-survival',
      name: 'Embedded Manifest Survival',
      maxPoints: 35,
      weight: 0.35,
      description: 'JUMBF manifest survives all 12 transformations',
      testType: 'scaled'
    },
    {
      id: 'remote-manifest-honored',
      name: 'Remote Manifest Honored',
      maxPoints: 25,
      weight: 0.25,
      description: 'Link: rel="c2pa-manifest" header preserved and accessible',
      testType: 'binary'
    },
    {
      id: 'verifier-discovery-reliability',
      name: 'Verifier Discovery Reliability',
      maxPoints: 15,
      weight: 0.15,
      description: '95th percentile latency and no mixed content issues',
      testType: 'threshold'
    },
    {
      id: 'docs-alignment',
      name: 'Documentation Alignment',
      maxPoints: 15,
      weight: 0.15,
      description: 'Observed behavior matches vendor documentation',
      testType: 'binary'
    },
    {
      id: 'reproducibility',
      name: 'Reproducibility',
      maxPoints: 10,
      weight: 0.10,
      description: 'All outputs can be re-verified with public tools',
      testType: 'binary'
    }
  ],
  grading: {
    greenThreshold: 90,
    yellowThreshold: 75,
    redThreshold: 0
  },
  tieBreakers: [
    {
      id: 'config-complexity',
      name: 'Configuration Complexity',
      description: 'Smaller configuration change to achieve green score wins',
      priority: 1
    },
    {
      id: 'documentation-clarity',
      name: 'Documentation Clarity',
      description: 'Clearer documentation and implementation guidance wins',
      priority: 2
    },
    {
      id: 'performance-impact',
      name: 'Performance Impact',
      description: 'Lower performance overhead for C2PA preservation wins',
      priority: 3
    },
    {
      id: 'ecosystem-adoption',
      name: 'Ecosystem Adoption',
      description: 'Broader ecosystem support and integration wins',
      priority: 4
    }
  ]
};

export const DIMENSION_WEIGHTS = {
  'embedded-manifest-survival': 0.35,
  'remote-manifest-honored': 0.25,
  'verifier-discovery-reliability': 0.15,
  'docs-alignment': 0.15,
  'reproducibility': 0.10
};

export const TEST_THRESHOLDS = {
  latency: {
    green: 500, // ms
    yellow: 1000, // ms
    red: 2000 // ms
  },
  reliability: {
    green: 0.95, // 95% success rate
    yellow: 0.85, // 85% success rate
    red: 0.70 // 70% success rate
  },
  reproducibility: {
    green: 1.0, // 100% reproducible
    yellow: 0.90, // 90% reproducible
    red: 0.75 // 75% reproducible
  }
};

export const TRANSFORM_WEIGHTS = {
  // Basic transformations (higher weight - critical)
  'resize': 0.15,
  'crop': 0.15,
  'format-webp': 0.12,
  'format-avif': 0.12,
  
  // Quality transformations (medium weight)
  'quality-85': 0.08,
  'quality-65': 0.08,
  
  // Display optimizations (lower weight)
  'dpr-2': 0.05,
  'sharpen': 0.05,
  
  // Metadata handling (variable weight based on expected behavior)
  'metadata-strip': 0.10,
  'metadata-keep': 0.10,
  
  // Complex transformations (bonus weight)
  'combined-transform': 0.15
};

export const calculateGrade = (score: number): 'green' | 'yellow' | 'red' => {
  if (score >= SCORING_CONFIG.grading.greenThreshold) {
    return 'green';
  } else if (score >= SCORING_CONFIG.grading.yellowThreshold) {
    return 'yellow';
  } else {
    return 'red';
  }
};

export const calculateDimensionScore = (
  dimensionId: string,
  testResults: any[],
  expectedBehavior: string
): number => {
  const dimension = SCORING_CONFIG.dimensions.find(d => d.id === dimensionId);
  if (!dimension) return 0;

  switch (dimension.testType) {
    case 'binary':
      return calculateBinaryScore(testResults, expectedBehavior, dimension.maxPoints);
    
    case 'scaled':
      return calculateScaledScore(testResults, expectedBehavior, dimension.maxPoints);
    
    case 'threshold':
      return calculateThresholdScore(testResults, dimension.maxPoints);
    
    default:
      return 0;
  }
};

const calculateBinaryScore = (
  testResults: any[],
  expectedBehavior: string,
  maxPoints: number
): number => {
  const passedTests = testResults.filter(result => 
    result.behavior === expectedBehavior
  ).length;
  
  const passRate = passedTests / testResults.length;
  return Math.round(passRate * maxPoints);
};

const calculateScaledScore = (
  testResults: any[],
  expectedBehavior: string,
  maxPoints: number
): number => {
  let totalScore = 0;
  let totalWeight = 0;
  
  for (const result of testResults) {
    const weight = TRANSFORM_WEIGHTS[result.transformId as keyof typeof TRANSFORM_WEIGHTS] || 0.1;
    const score = result.behavior === expectedBehavior ? 1 : 0;
    
    totalScore += score * weight;
    totalWeight += weight;
  }
  
  if (totalWeight === 0) return 0;
  
  const normalizedScore = totalScore / totalWeight;
  return Math.round(normalizedScore * maxPoints);
};

const calculateThresholdScore = (
  testResults: any[],
  maxPoints: number
): number => {
  // For threshold-based scoring (latency, reliability)
  const avgLatency = testResults.reduce((sum, result) => sum + result.latency, 0) / testResults.length;
  const reliability = testResults.filter(result => result.success).length / testResults.length;
  
  let latencyScore = 0;
  if (avgLatency <= TEST_THRESHOLDS.latency.green) {
    latencyScore = maxPoints * 0.6;
  } else if (avgLatency <= TEST_THRESHOLDS.latency.yellow) {
    latencyScore = maxPoints * 0.4;
  } else {
    latencyScore = maxPoints * 0.2;
  }
  
  let reliabilityScore = 0;
  if (reliability >= TEST_THRESHOLDS.reliability.green) {
    reliabilityScore = maxPoints * 0.4;
  } else if (reliability >= TEST_THRESHOLDS.reliability.yellow) {
    reliabilityScore = maxPoints * 0.3;
  } else {
    reliabilityScore = maxPoints * 0.1;
  }
  
  return Math.round(latencyScore + reliabilityScore);
};

export const calculateOverallScore = (
  dimensionScores: Record<string, number>
): number => {
  let totalScore = 0;
  let totalWeight = 0;
  
  for (const [dimensionId, score] of Object.entries(dimensionScores)) {
    const weight = DIMENSION_WEIGHTS[dimensionId as keyof typeof DIMENSION_WEIGHTS] || 0;
    totalScore += score * weight;
    totalWeight += weight;
  }
  
  return totalWeight > 0 ? Math.round(totalScore) : 0;
};

export const generateScoreExplanation = (
  dimensionId: string,
  score: number,
  maxPoints: number,
  testResults: any[]
): string => {
  const dimension = SCORING_CONFIG.dimensions.find(d => d.id === dimensionId);
  if (!dimension) return 'Unknown dimension';
  
  const percentage = Math.round((score / maxPoints) * 100);
  
  switch (dimensionId) {
    case 'embedded-manifest-survival':
      const preservedCount = testResults.filter(r => r.embeddedManifest).length;
      return `${preservedCount}/${testResults.length} transformations preserved embedded manifest (${percentage}%)`;
    
    case 'remote-manifest-honored':
      const honoredCount = testResults.filter(r => r.remoteManifest).length;
      return `${honoredCount}/${testResults.length} tests honored remote manifest Link header (${percentage}%)`;
    
    case 'verifier-discovery-reliability':
      const avgLatency = testResults.reduce((sum, r) => sum + r.latency, 0) / testResults.length;
      const reliability = testResults.filter(r => r.success).length / testResults.length;
      return `Average latency: ${Math.round(avgLatency)}ms, Reliability: ${Math.round(reliability * 100)}% (${percentage}%)`;
    
    case 'docs-alignment':
      const alignedCount = testResults.filter(r => r.docsAligned).length;
      return `${alignedCount}/${testResults.length} tests aligned with documentation (${percentage}%)`;
    
    case 'reproducibility':
      const reproducibleCount = testResults.filter(r => r.reproducible).length;
      return `${reproducibleCount}/${testResults.length} outputs reproducible with public verifier (${percentage}%)`;
    
    default:
      return `Score: ${score}/${maxPoints} (${percentage}%)`;
  }
};

export const getImprovementRecommendations = (
  dimensionId: string,
  score: number,
  maxPoints: number
): string[] => {
  const percentage = (score / maxPoints) * 100;
  
  switch (dimensionId) {
    case 'embedded-manifest-survival':
      if (percentage < 50) {
        return [
          'Enable vendor-specific C2PA preservation toggle',
          'Review metadata stripping configurations',
          'Test with different transformation combinations',
          'Contact vendor support for C2PA guidance'
        ];
      } else if (percentage < 80) {
        return [
          'Fine-tune preservation settings for specific transforms',
          'Verify format conversion preserves C2PA data',
          'Test edge cases and complex transformations'
        ];
      } else {
        return [
          'Monitor for regression in future updates',
          'Document optimal configuration for team'
        ];
      }
    
    case 'remote-manifest-honored':
      if (percentage < 50) {
        return [
          'Implement Link header preservation in CDN configuration',
          'Add CORS headers for remote manifest access',
          'Verify remote manifest URLs are accessible'
        ];
      } else if (percentage < 80) {
        return [
          'Optimize remote manifest delivery performance',
          'Test remote manifest discovery across different clients'
        ];
      } else {
        return [
          'Monitor remote manifest accessibility',
          'Implement fallback mechanisms for reliability'
        ];
      }
    
    case 'verifier-discovery-reliability':
      if (percentage < 50) {
        return [
          'Optimize CDN caching for manifest endpoints',
          'Implement proper HTTP caching headers',
          'Reduce latency for manifest discovery'
        ];
      } else if (percentage < 80) {
        return [
          'Fine-tune caching strategies',
          'Monitor performance across geographic regions'
        ];
      } else {
        return [
          'Maintain current performance levels',
          'Implement performance monitoring and alerts'
        ];
      }
    
    case 'docs-alignment':
      if (percentage < 50) {
        return [
          'Update vendor documentation to reflect actual behavior',
          'Contact vendor about documentation inaccuracies',
          'Document actual behavior for internal reference'
        ];
      } else if (percentage < 80) {
        return [
          'Clarify ambiguous documentation sections',
          'Add examples and best practices to docs'
        ];
      } else {
        return [
          'Maintain documentation accuracy',
          'Regular review of documentation vs behavior'
        ];
      }
    
    case 'reproducibility':
      if (percentage < 50) {
        return [
          'Fix inconsistent transformation behavior',
          'Standardize C2PA preservation across all endpoints',
          'Implement deterministic processing pipeline'
        ];
      } else if (percentage < 80) {
        return [
          'Address edge cases causing inconsistencies',
          'Improve error handling and logging'
        ];
      } else {
        return [
          'Maintain current reproducibility standards',
          'Monitor for consistency in future updates'
        ];
      }
    
    default:
      return ['Review configuration and test setup'];
  }
};
