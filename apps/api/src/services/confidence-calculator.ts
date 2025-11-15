import { AdvancedExtractionResult } from './advanced-extractor';
import { SignatureVerificationResult } from './signature-verifier';
import { ChainValidationResult } from './certificate-validator';
import { logger } from '../utils/logger';

/**
 * Confidence score result
 */
export interface ConfidenceScore {
  overall: number; // 0-100
  breakdown: {
    extraction: number;
    signature: number;
    certificate: number;
    remoteProof: number;
  };
  level: 'very_high' | 'high' | 'medium' | 'low' | 'very_low';
  recommendations: string[];
  trustIndicators: TrustIndicator[];
}

/**
 * Trust indicator
 */
export interface TrustIndicator {
  type: 'positive' | 'negative' | 'neutral';
  weight: number;
  description: string;
  impact: number; // Points added/subtracted
}

/**
 * Confidence Calculator
 * 
 * Calculates overall confidence score from multiple validation sources
 * Provides trust indicators and recommendations
 */
export class ConfidenceCalculator {
  /**
   * Calculate overall confidence score
   */
  calculateConfidence(
    extractionResult: AdvancedExtractionResult,
    signatureResult: SignatureVerificationResult,
    certificateResult: ChainValidationResult,
    hasRemoteProof: boolean
  ): ConfidenceScore {
    const trustIndicators: TrustIndicator[] = [];

    // 1. Extraction confidence (0-30 points)
    const extractionScore = this.calculateExtractionScore(extractionResult, trustIndicators);

    // 2. Signature confidence (0-35 points)
    const signatureScore = this.calculateSignatureScore(signatureResult, trustIndicators);

    // 3. Certificate confidence (0-25 points)
    const certificateScore = this.calculateCertificateScore(certificateResult, trustIndicators);

    // 4. Remote proof confidence (0-10 points)
    const remoteProofScore = hasRemoteProof ? 10 : 0;
    if (hasRemoteProof) {
      trustIndicators.push({
        type: 'positive',
        weight: 0.5,
        description: 'Remote proof accessible',
        impact: 10
      });
    }

    // Calculate overall score
    const overall = Math.min(100, extractionScore + signatureScore + certificateScore + remoteProofScore);

    // Determine confidence level
    const level = this.determineConfidenceLevel(overall);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      overall,
      extractionResult,
      signatureResult,
      certificateResult,
      hasRemoteProof
    );

    const result: ConfidenceScore = {
      overall,
      breakdown: {
        extraction: extractionScore,
        signature: signatureScore,
        certificate: certificateScore,
        remoteProof: remoteProofScore
      },
      level,
      recommendations,
      trustIndicators
    };

    logger.info('Confidence calculated', {
      overall,
      level,
      breakdown: result.breakdown
    });

    return result;
  }

  /**
   * Calculate extraction score
   */
  private calculateExtractionScore(
    result: AdvancedExtractionResult,
    indicators: TrustIndicator[]
  ): number {
    if (!result.success) {
      indicators.push({
        type: 'negative',
        weight: 1.0,
        description: 'Metadata extraction failed',
        impact: -30
      });
      return 0;
    }

    let score = 0;

    // Base score from extraction confidence
    score += (result.confidence / 100) * 20; // Max 20 points

    // Bonus for high-quality sources
    switch (result.source) {
      case 'jumbf-c2pa':
        score += 10;
        indicators.push({
          type: 'positive',
          weight: 1.0,
          description: 'JUMBF C2PA container found (ISO standard)',
          impact: 10
        });
        break;
      case 'png-chunk':
        score += 8;
        indicators.push({
          type: 'positive',
          weight: 0.9,
          description: 'PNG custom chunk found',
          impact: 8
        });
        break;
      case 'exif-primary':
        score += 6;
        indicators.push({
          type: 'positive',
          weight: 0.8,
          description: 'EXIF metadata found',
          impact: 6
        });
        break;
      case 'xmp-packet':
        score += 5;
        indicators.push({
          type: 'positive',
          weight: 0.7,
          description: 'XMP packet found',
          impact: 5
        });
        break;
      case 'partial-recovery':
        score += 2;
        indicators.push({
          type: 'neutral',
          weight: 0.3,
          description: 'Partial recovery only',
          impact: 2
        });
        break;
      default:
        indicators.push({
          type: 'negative',
          weight: 0.5,
          description: 'Unknown extraction source',
          impact: 0
        });
    }

    // Check data integrity
    if (result.metadata.dataIntegrity === 'full') {
      indicators.push({
        type: 'positive',
        weight: 0.5,
        description: 'Full data integrity',
        impact: 0
      });
    } else if (result.metadata.dataIntegrity === 'partial') {
      score -= 5;
      indicators.push({
        type: 'negative',
        weight: 0.5,
        description: 'Partial data integrity',
        impact: -5
      });
    } else if (result.metadata.dataIntegrity === 'corrupted') {
      score -= 10;
      indicators.push({
        type: 'negative',
        weight: 1.0,
        description: 'Data corruption detected',
        impact: -10
      });
    }

    return Math.max(0, Math.min(30, score));
  }

  /**
   * Calculate signature score
   */
  private calculateSignatureScore(
    result: SignatureVerificationResult,
    indicators: TrustIndicator[]
  ): number {
    let score = 0;

    // Signature validity (20 points)
    if (result.signatureValid) {
      score += 20;
      indicators.push({
        type: 'positive',
        weight: 1.0,
        description: 'Cryptographic signature valid',
        impact: 20
      });
    } else {
      indicators.push({
        type: 'negative',
        weight: 1.0,
        description: 'Cryptographic signature invalid',
        impact: -20
      });
    }

    // Manifest integrity (10 points)
    if (result.manifestIntact) {
      score += 10;
      indicators.push({
        type: 'positive',
        weight: 0.8,
        description: 'Manifest structure intact',
        impact: 10
      });
    } else {
      score -= 10;
      indicators.push({
        type: 'negative',
        weight: 1.0,
        description: 'Manifest structure corrupted',
        impact: -10
      });
    }

    // Tamper detection (5 points)
    if (!result.tamperDetected) {
      score += 5;
      indicators.push({
        type: 'positive',
        weight: 0.6,
        description: 'No tampering detected',
        impact: 5
      });
    } else {
      score -= 15;
      indicators.push({
        type: 'negative',
        weight: 1.0,
        description: 'Tampering detected',
        impact: -15
      });
    }

    return Math.max(0, Math.min(35, score));
  }

  /**
   * Calculate certificate score
   */
  private calculateCertificateScore(
    result: ChainValidationResult,
    indicators: TrustIndicator[]
  ): number {
    let score = 0;

    // Chain validity (15 points)
    if (result.isValid) {
      score += 15;
      indicators.push({
        type: 'positive',
        weight: 1.0,
        description: 'Certificate chain valid',
        impact: 15
      });
    } else {
      indicators.push({
        type: 'negative',
        weight: 1.0,
        description: 'Certificate chain invalid',
        impact: -15
      });
    }

    // Root trust (10 points)
    if (result.rootTrusted) {
      score += 10;
      indicators.push({
        type: 'positive',
        weight: 0.9,
        description: 'Root certificate trusted',
        impact: 10
      });
    } else {
      score -= 5;
      indicators.push({
        type: 'negative',
        weight: 0.7,
        description: 'Root certificate not in trust store',
        impact: -5
      });
    }

    // Chain length bonus (longer chains are more trustworthy)
    if (result.chainLength >= 3) {
      indicators.push({
        type: 'positive',
        weight: 0.3,
        description: `Complete certificate chain (${result.chainLength} certificates)`,
        impact: 0
      });
    }

    return Math.max(0, Math.min(25, score));
  }

  /**
   * Determine confidence level
   */
  private determineConfidenceLevel(score: number): 'very_high' | 'high' | 'medium' | 'low' | 'very_low' {
    if (score >= 90) return 'very_high';
    if (score >= 75) return 'high';
    if (score >= 50) return 'medium';
    if (score >= 30) return 'low';
    return 'very_low';
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    overall: number,
    extractionResult: AdvancedExtractionResult,
    signatureResult: SignatureVerificationResult,
    certificateResult: ChainValidationResult,
    hasRemoteProof: boolean
  ): string[] {
    const recommendations: string[] = [];

    // Overall confidence recommendations
    if (overall >= 90) {
      recommendations.push('Image authenticity verified with very high confidence');
    } else if (overall >= 75) {
      recommendations.push('Image authenticity verified with high confidence');
    } else if (overall >= 50) {
      recommendations.push('Image authenticity verified with medium confidence - some concerns exist');
    } else if (overall >= 30) {
      recommendations.push('Low confidence in image authenticity - verification issues detected');
    } else {
      recommendations.push('Very low confidence - image authenticity cannot be verified');
    }

    // Extraction-specific recommendations
    if (!extractionResult.success) {
      recommendations.push('Unable to extract C2PA metadata - image may not be signed');
    } else if (extractionResult.metadata.dataIntegrity === 'partial') {
      recommendations.push('Metadata partially corrupted - consider re-signing the image');
    } else if (extractionResult.metadata.dataIntegrity === 'corrupted') {
      recommendations.push('Metadata severely corrupted - image may have been tampered with');
    }

    // Signature-specific recommendations
    if (!signatureResult.signatureValid) {
      recommendations.push('Cryptographic signature invalid - image may have been tampered with or signature corrupted');
    }

    if (signatureResult.tamperDetected) {
      recommendations.push('Tampering indicators detected - exercise caution');
    }

    if (!signatureResult.manifestIntact) {
      recommendations.push('Manifest structure compromised - metadata may be unreliable');
    }

    // Certificate-specific recommendations
    if (!certificateResult.isValid) {
      recommendations.push('Certificate chain validation failed - signing authority cannot be verified');
    }

    if (!certificateResult.rootTrusted) {
      recommendations.push('Root certificate not trusted - verify certificate authority is legitimate');
    }

    // Remote proof recommendations
    if (!hasRemoteProof && overall < 75) {
      recommendations.push('Remote proof not available - verification relies solely on embedded metadata');
    }

    // Performance recommendations
    if (extractionResult.metadata.extractionTime > 200) {
      recommendations.push('Extraction took longer than expected - image may be very large or complex');
    }

    return recommendations;
  }

  /**
   * Get trust level description
   */
  getTrustLevelDescription(level: string): string {
    switch (level) {
      case 'very_high':
        return 'Very High Trust - All validation checks passed with strong evidence';
      case 'high':
        return 'High Trust - Strong validation with minor concerns';
      case 'medium':
        return 'Medium Trust - Some validation issues present';
      case 'low':
        return 'Low Trust - Significant validation concerns';
      case 'very_low':
        return 'Very Low Trust - Multiple validation failures';
      default:
        return 'Unknown Trust Level';
    }
  }
}
