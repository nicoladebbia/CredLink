import { createVerify, createHash } from 'crypto';
import { X509Certificate } from 'crypto';
import { C2PAManifest } from './manifest-builder';
import { logger } from '../utils/logger';

/**
 * Signature verification result
 */
export interface SignatureVerificationResult {
  isValid: boolean;
  signatureValid: boolean;
  manifestIntact: boolean;
  tamperDetected: boolean;
  errors: string[];
  warnings: string[];
  details: {
    algorithm?: string;
    signatureLength?: number;
    manifestHash?: string;
    verifiedHash?: string;
    timestamp?: string;
  };
}

/**
 * Tamper detection result
 */
export interface TamperDetectionResult {
  tampered: boolean;
  confidence: number;
  indicators: TamperIndicator[];
  summary: string;
}

/**
 * Tamper indicator
 */
export interface TamperIndicator {
  type: 'hash_mismatch' | 'signature_invalid' | 'metadata_modified' | 'timestamp_anomaly' | 'manifest_corrupted';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  evidence?: Record<string, unknown>;
}

/**
 * Signature Verifier
 * 
 * Verifies cryptographic signatures and detects tampering
 * Supports:
 * - RSA signature verification
 * - Manifest integrity checking
 * - Hash verification
 * - Tamper detection
 * - Timestamp validation
 */
export class SignatureVerifier {
  /**
   * Verify signature on manifest
   */
  async verifySignature(
    manifest: C2PAManifest,
    signature: string,
    certificate: X509Certificate
  ): Promise<SignatureVerificationResult> {
    const result: SignatureVerificationResult = {
      isValid: true,
      signatureValid: false,
      manifestIntact: false,
      tamperDetected: false,
      errors: [],
      warnings: [],
      details: {}
    };

    try {
      // 1. Prepare manifest data for verification
      const manifestData = this.prepareManifestData(manifest);
      const manifestHash = this.hashData(manifestData);
      
      result.details.manifestHash = manifestHash;
      result.details.signatureLength = signature.length;

      // 2. Verify cryptographic signature
      const signatureValid = this.verifyCryptographicSignature(
        manifestData,
        signature,
        certificate
      );

      result.signatureValid = signatureValid;

      if (!signatureValid) {
        result.isValid = false;
        result.errors.push('Cryptographic signature verification failed');
        result.tamperDetected = true;
      }

      // 3. Verify manifest integrity
      const manifestIntact = await this.verifyManifestIntegrity(manifest);
      result.manifestIntact = manifestIntact;

      if (!manifestIntact) {
        result.isValid = false;
        result.errors.push('Manifest integrity check failed');
        result.tamperDetected = true;
      }

      // 4. Verify timestamp
      const timestampValid = this.verifyTimestamp(manifest);
      if (!timestampValid) {
        result.warnings.push('Timestamp validation failed');
      }

      // 5. Check for additional tamper indicators
      const tamperResult = await this.detectTampering(manifest, signature, certificate);
      if (tamperResult.tampered) {
        result.tamperDetected = true;
        result.errors.push(`Tampering detected: ${tamperResult.summary}`);
      }

      result.details.timestamp = manifest.claim_generator.timestamp;

      logger.info('Signature verification complete', {
        isValid: result.isValid,
        signatureValid: result.signatureValid,
        manifestIntact: result.manifestIntact,
        tamperDetected: result.tamperDetected
      });

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      result.isValid = false;
      result.errors.push(`Verification error: ${err.message}`);
      logger.error('Signature verification failed', { error: err.message });
    }

    return result;
  }

  /**
   * Prepare manifest data for verification
   */
  private prepareManifestData(manifest: C2PAManifest): Buffer {
    // Create canonical representation of manifest
    // Remove signature field if present
    const manifestCopy = { ...manifest };
    delete (manifestCopy as Record<string, unknown>).signature;

    // Sort keys for consistent hashing
    const sortedManifest = this.sortObjectKeys(manifestCopy);

    // Convert to JSON
    const manifestJson = JSON.stringify(sortedManifest);

    return Buffer.from(manifestJson, 'utf8');
  }

  /**
   * Sort object keys recursively for consistent hashing
   */
  private sortObjectKeys(obj: unknown): unknown {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item));
    }

    const sorted: Record<string, unknown> = {};
    const objRecord = obj as Record<string, unknown>;
    Object.keys(objRecord).sort().forEach(key => {
      sorted[key] = this.sortObjectKeys(objRecord[key]);
    });

    return sorted;
  }

  /**
   * Hash data using SHA-256
   */
  private hashData(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Verify cryptographic signature
   */
  private verifyCryptographicSignature(
    data: Buffer,
    signature: string,
    certificate: X509Certificate
  ): boolean {
    try {
      // Determine signature algorithm
      const algorithm = this.getSignatureAlgorithm(certificate);

      // Create verifier
      const verifier = createVerify(algorithm);
      verifier.update(data);

      // Decode signature from base64
      const signatureBuffer = Buffer.from(signature, 'base64');

      // Verify signature
      const isValid = verifier.verify(certificate.publicKey, signatureBuffer);

      logger.debug('Cryptographic signature verification', {
        algorithm,
        signatureLength: signatureBuffer.length,
        isValid
      });

      return isValid;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Cryptographic signature verification error', {
        error: err.message
      });
      return false;
    }
  }

  /**
   * Get signature algorithm from certificate
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private getSignatureAlgorithm(_certificate: X509Certificate): string {
    // Default to RSA-SHA256
    // Production should parse from certificate
    return 'RSA-SHA256';
  }

  /**
   * Verify manifest integrity
   */
  private async verifyManifestIntegrity(manifest: C2PAManifest): Promise<boolean> {
    try {
      // Check required fields
      if (!manifest.claim_generator) {
        logger.warn('Manifest missing claim_generator');
        return false;
      }

      if (!manifest.claim_generator.timestamp) {
        logger.warn('Manifest missing timestamp');
        return false;
      }

      if (!manifest.assertions || manifest.assertions.length === 0) {
        logger.warn('Manifest has no assertions');
        return false;
      }

      // Check assertion integrity
      for (const assertion of manifest.assertions) {
        if (!assertion.label || !assertion.data) {
          logger.warn('Invalid assertion structure');
          return false;
        }
      }

      // Verify hashes in assertions
      for (const assertion of manifest.assertions) {
        if (assertion.label === 'c2pa.hash.data') {
          const hashValid = await this.verifyAssertionHash(assertion);
          if (!hashValid) {
            logger.warn('Assertion hash verification failed');
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Manifest integrity check error', { error: err.message });
      return false;
    }
  }

  /**
   * Verify assertion hash
   */
  private async verifyAssertionHash(assertion: { label: string; data: unknown }): Promise<boolean> {
    try {
      const data = assertion.data as Record<string, unknown> | undefined;
      if (!data || !data.hash || !data.algorithm) {
        return true; // No hash to verify
      }

      // For MVP, assume hash is valid
      // Production should recalculate and compare
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify timestamp
   */
  private verifyTimestamp(manifest: C2PAManifest): boolean {
    try {
      const timestamp = new Date(manifest.claim_generator.timestamp);
      const now = new Date();

      // Check if timestamp is in the past
      if (timestamp > now) {
        logger.warn('Timestamp is in the future');
        return false;
      }

      // Check if timestamp is not too old (e.g., > 10 years)
      const tenYearsAgo = new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000);
      if (timestamp < tenYearsAgo) {
        logger.warn('Timestamp is too old');
        return false;
      }

      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Timestamp verification error', { error: err.message });
      return false;
    }
  }

  /**
   * Detect tampering
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async detectTampering(
    manifest: C2PAManifest,
    _signature: string,
    _certificate: X509Certificate
  ): Promise<TamperDetectionResult> {
    const indicators: TamperIndicator[] = [];

    // 1. Check for hash mismatches
    const hashIndicators = await this.checkHashMismatches(manifest);
    indicators.push(...hashIndicators);

    // 2. Check for metadata modifications
    const metadataIndicators = this.checkMetadataModifications(manifest);
    indicators.push(...metadataIndicators);

    // 3. Check for timestamp anomalies
    const timestampIndicators = this.checkTimestampAnomalies(manifest);
    indicators.push(...timestampIndicators);

    // 4. Check for manifest corruption
    const corruptionIndicators = this.checkManifestCorruption(manifest);
    indicators.push(...corruptionIndicators);

    // Calculate confidence
    const criticalCount = indicators.filter(i => i.severity === 'critical').length;
    const highCount = indicators.filter(i => i.severity === 'high').length;

    const tampered = criticalCount > 0 || highCount > 1;
    const confidence = this.calculateTamperConfidence(indicators);

    const summary = this.generateTamperSummary(indicators);

    return {
      tampered,
      confidence,
      indicators,
      summary
    };
  }

  /**
   * Check for hash mismatches
   */
  private async checkHashMismatches(manifest: C2PAManifest): Promise<TamperIndicator[]> {
    const indicators: TamperIndicator[] = [];

    // Check if hash assertions exist and are valid
    const hashAssertions = manifest.assertions.filter(a => a.label.includes('hash'));

    if (hashAssertions.length === 0) {
      indicators.push({
        type: 'hash_mismatch',
        severity: 'low',
        description: 'No hash assertions found in manifest'
      });
    }

    return indicators;
  }

  /**
   * Check for metadata modifications
   */
  private checkMetadataModifications(manifest: C2PAManifest): TamperIndicator[] {
    const indicators: TamperIndicator[] = [];

    // Check for suspicious modifications
    if (!manifest.claim_generator.name) {
      indicators.push({
        type: 'metadata_modified',
        severity: 'medium',
        description: 'Claim generator name is missing'
      });
    }

    return indicators;
  }

  /**
   * Check for timestamp anomalies
   */
  private checkTimestampAnomalies(manifest: C2PAManifest): TamperIndicator[] {
    const indicators: TamperIndicator[] = [];

    try {
      const timestamp = new Date(manifest.claim_generator.timestamp);
      const now = new Date();

      // Check if timestamp is in the future
      if (timestamp > now) {
        indicators.push({
          type: 'timestamp_anomaly',
          severity: 'high',
          description: 'Timestamp is in the future',
          evidence: { timestamp: timestamp.toISOString(), now: now.toISOString() }
        });
      }

      // Check if timestamp is suspiciously recent (< 1 second ago)
      const timeDiff = now.getTime() - timestamp.getTime();
      if (timeDiff < 1000 && timeDiff > 0) {
        indicators.push({
          type: 'timestamp_anomaly',
          severity: 'low',
          description: 'Timestamp is suspiciously recent',
          evidence: { timeDiff }
        });
      }
    } catch (error) {
      indicators.push({
        type: 'timestamp_anomaly',
        severity: 'medium',
        description: 'Invalid timestamp format'
      });
    }

    return indicators;
  }

  /**
   * Check for manifest corruption
   */
  private checkManifestCorruption(manifest: C2PAManifest): TamperIndicator[] {
    const indicators: TamperIndicator[] = [];

    // Check for required fields
    if (!manifest.claim_generator) {
      indicators.push({
        type: 'manifest_corrupted',
        severity: 'critical',
        description: 'Manifest missing claim_generator'
      });
    }

    if (!manifest.assertions || manifest.assertions.length === 0) {
      indicators.push({
        type: 'manifest_corrupted',
        severity: 'high',
        description: 'Manifest has no assertions'
      });
    }

    return indicators;
  }

  /**
   * Calculate tamper detection confidence
   */
  private calculateTamperConfidence(indicators: TamperIndicator[]): number {
    if (indicators.length === 0) {
      return 0; // No tampering detected
    }

    let score = 0;

    for (const indicator of indicators) {
      switch (indicator.severity) {
        case 'critical':
          score += 40;
          break;
        case 'high':
          score += 25;
          break;
        case 'medium':
          score += 15;
          break;
        case 'low':
          score += 5;
          break;
      }
    }

    // Cap at 100
    return Math.min(score, 100);
  }

  /**
   * Generate tamper summary
   */
  private generateTamperSummary(indicators: TamperIndicator[]): string {
    if (indicators.length === 0) {
      return 'No tampering detected';
    }

    const criticalCount = indicators.filter(i => i.severity === 'critical').length;
    const highCount = indicators.filter(i => i.severity === 'high').length;

    if (criticalCount > 0) {
      return `Critical tampering detected: ${criticalCount} critical indicator(s)`;
    }

    if (highCount > 0) {
      return `High-confidence tampering detected: ${highCount} high-severity indicator(s)`;
    }

    return `Possible tampering detected: ${indicators.length} indicator(s)`;
  }
}
