/**
 * Real-World Survival Testing Types
 * 
 * Tests C2PA signature survival through real-world platform transformations
 */

/**
 * Real-world transformation scenario
 */
export interface RealWorldScenario {
  name: string;
  description: string;
  platform: string;
  transform: (image: Buffer) => Promise<Buffer>;
  expectedSurvival: number; // 0-1 (percentage)
  category: 'social' | 'cloud' | 'messaging' | 'email';
  severity: 'low' | 'medium' | 'high' | 'extreme';
}

/**
 * Result of a single transformation test
 */
export interface RealWorldTestResult {
  scenario: string;
  platform: string;
  description: string;
  category: string;
  severity: string;
  survivalRate: number;
  expectedSurvival: number;
  passed: boolean;
  sampleSize: number;
  failureReasons: Record<string, number>;
  averageConfidence: number;
  processingTime: number;
}

/**
 * Complete survival test report
 */
export interface RealWorldSurvivalReport {
  timestamp: string;
  totalScenarios: number;
  results: RealWorldTestResult[];
  averageSurvival: number;
  passedScenarios: number;
  failedScenarios: number;
  recommendations: string[];
  byCategory: Record<string, CategoryStats>;
  bySeverity: Record<string, SeverityStats>;
  criticalFailures: string[];
}

/**
 * Statistics by category
 */
export interface CategoryStats {
  totalScenarios: number;
  averageSurvival: number;
  passedScenarios: number;
  failedScenarios: number;
}

/**
 * Statistics by severity
 */
export interface SeverityStats {
  totalScenarios: number;
  averageSurvival: number;
  passedScenarios: number;
  failedScenarios: number;
}

/**
 * Verification result from survival test
 */
export interface SurvivalVerificationResult {
  confidence: number;
  isValid: boolean;
  extractionResult: {
    manifest: boolean;
    metadata: boolean;
  };
  signatureResult: {
    isValid: boolean;
    algorithm?: string;
  };
  certificateResult: {
    isValid: boolean;
    issuer?: string;
  };
  failureReason?: string;
}

/**
 * Survival test configuration
 */
export interface SurvivalTestConfig {
  sampleSize?: number;
  minConfidence?: number;
  platforms?: string[];
  categories?: string[];
  severities?: string[];
  generateReport?: boolean;
  verbose?: boolean;
}

/**
 * Failure analysis
 */
export interface FailureAnalysis {
  totalFailures: number;
  byReason: Record<string, number>;
  byPlatform: Record<string, number>;
  byCategory: Record<string, number>;
  commonPatterns: string[];
  recommendations: string[];
}
