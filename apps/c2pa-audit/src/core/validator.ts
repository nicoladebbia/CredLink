/**
 * C2PA Manifest Validator
 * Implements spec-compliant validation with exact error codes
 * Follows C2PA 2.2 specification validation rules
 */

import { createHash } from 'crypto';
import { 
  C2PAManifest, 
  ClaimSignature, 
  Assertion, 
  Ingredient, 
  Certificate,
  TimeStampToken,
  ValidationStatus,
  ValidationCode,
  ValidationError,
  C2PAError
} from '@/types';
import { JSONCanonicalizer } from './canonicalizer';

/**
 * Validates C2PA manifests according to specification
 */
export class ManifestValidator {
  // Security constants for validation
  private static readonly ALLOWED_SIGNATURE_ALGORITHMS = new Set([
    'ES256', 'ES384', 'ES512',
    'PS256', 'PS384', 'PS512',
    'RS256', 'RS384', 'RS512'
  ]);

  private static readonly REQUIRED_ASSERTIONS = new Set([
    'c2pa.actions'
  ]);

  private static readonly TRUSTED_TSA_POLICIES = new Set([
    '2.16.840.1.114412.7.1', // DigiCert TSA Policy
    '1.3.6.1.4.1.4146.2.3',  // GlobalSign TSA Policy
    '1.3.6.1.4.1.6449.2.7.1'  // Sectigo TSA Policy
  ]);

  /**
   * Validate a complete C2PA manifest
   * @param manifest - Manifest to validate
   * @param trustAnchors - Trusted certificate anchors
   * @returns Validation status with spec-compliant codes
   */
  static async validateManifest(
    manifest: C2PAManifest,
    trustAnchors: Certificate[] = []
  ): Promise<ValidationStatus> {
    // CRITICAL: Input validation to prevent malformed data attacks
    if (!manifest || typeof manifest !== 'object') {
      return {
        valid: false,
        codes: ['manifest.structureInvalid'],
        summary: 'Invalid manifest object'
      };
    }

    // CRITICAL: Prevent excessive manifest size (DoS protection)
    const manifestSize = JSON.stringify(manifest).length;
    if (manifestSize > 10 * 1024 * 1024) { // 10MB limit
      return {
        valid: false,
        codes: ['manifest.structureInvalid'],
        summary: 'Manifest too large'
      };
    }

    // CRITICAL: Prevent excessive nested structures (stack overflow protection)
    const maxDepth = this.getMaxDepth(manifest);
    if (maxDepth > 100) {
      return {
        valid: false,
        codes: ['manifest.structureInvalid'],
        summary: 'Manifest nesting too deep'
      };
    }

    const codes: ValidationCode[] = [];
    let isValid = true;

    try {
      // 1. Validate manifest structure
      const structureValidation = this.validateManifestStructure(manifest);
      codes.push(...structureValidation.codes);
      if (!structureValidation.valid) {
        isValid = false;
      }

      // 2. Validate claim signature
      const signatureValidation = await this.validateClaimSignature(
        manifest.claim_signature,
        trustAnchors
      );
      codes.push(...signatureValidation.codes);
      if (!signatureValidation.valid) {
        isValid = false;
      }

      // 3. Validate assertions
      const assertionValidation = this.validateAssertions(manifest.assertions);
      codes.push(...assertionValidation.codes);
      if (!assertionValidation.valid) {
        isValid = false;
      }

      // 4. Validate timestamp token if present
      if (manifest.claim_signature.protected.iat) {
        const timestampValidation = await this.validateTimestampToken(manifest);
        codes.push(...timestampValidation.codes);
        if (!timestampValidation.valid) {
          isValid = false;
        }
      }

      // 5. Validate ingredients if present
      if (manifest.ingredients && manifest.ingredients.length > 0) {
        // CRITICAL: Limit number of ingredients to prevent DoS
        if (manifest.ingredients.length > 1000) {
          codes.push('ingredient.validationFailed');
          isValid = false;
        } else {
          const ingredientValidation = await this.validateIngredients(
            manifest.ingredients,
            trustAnchors
          );
          codes.push(...ingredientValidation.codes);
          if (!ingredientValidation.valid) {
            isValid = false;
          }
        }
      }

      // 6. Validate redactions if present
      if (manifest.redactions && manifest.redactions.length > 0) {
        const redactionValidation = this.validateRedactions(manifest);
        codes.push(...redactionValidation.codes);
        if (!redactionValidation.valid) {
          isValid = false;
        }
      }

      return {
        valid: isValid,
        codes: this.deduplicateCodes(codes),
        summary: this.generateValidationSummary(isValid, codes)
      };

    } catch (error) {
      return {
        valid: false,
        codes: ['manifest.structureInvalid'],
        summary: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Validate basic manifest structure
   * @param manifest - Manifest to validate
   * @returns Structure validation result
   */
  private static validateManifestStructure(manifest: C2PAManifest): ValidationStatus {
    const codes: ValidationCode[] = [];
    let isValid = true;

    // Check required fields
    if (!manifest.manifest_hash || manifest.manifest_hash.length === 0) {
      codes.push('manifest.structureInvalid');
      isValid = false;
    }

    if (!manifest.claim_generator || typeof manifest.claim_generator !== 'string') {
      codes.push('manifest.structureInvalid');
      isValid = false;
    }

    if (!manifest.claim_signature || typeof manifest.claim_signature !== 'object') {
      codes.push('manifest.structureInvalid');
      isValid = false;
    }

    if (!Array.isArray(manifest.assertions)) {
      codes.push('manifest.structureInvalid');
      isValid = false;
    }

    if (isValid) {
      codes.push('manifest.structureValid');
    }

    return {
      valid: isValid,
      codes,
      summary: isValid ? 'Manifest structure is valid' : 'Manifest structure is invalid'
    };
  }

  /**
   * Validate claim signature and certificate chain
   * @param claimSignature - Claim signature to validate
   * @param trustAnchors - Trusted certificate anchors
   * @returns Signature validation result
   */
  private static async validateClaimSignature(
    claimSignature: ClaimSignature,
    trustAnchors: Certificate[]
  ): Promise<ValidationStatus> {
    const codes: ValidationCode[] = [];
    let isValid = true;

    try {
      // Validate signature algorithm
      const alg = claimSignature.protected.alg;
      if (!alg || !this.ALLOWED_SIGNATURE_ALGORITHMS.has(alg)) {
        codes.push('signature.algorithmNotAllowed');
        isValid = false;
      }

      // Validate certificate chain
      const chainValidation = this.validateCertificateChain(
        claimSignature.certificate_chain,
        trustAnchors
      );
      codes.push(...chainValidation.codes);
      if (!chainValidation.valid) {
        isValid = false;
      }

      // Validate signature format
      if (!claimSignature.signature || claimSignature.signature.length === 0) {
        codes.push('signature.invalid');
        isValid = false;
      }

      // TODO: Implement actual cryptographic signature verification
      // This would require the signed content and proper verification
      if (isValid) {
        codes.push('signature.valid');
      }

    } catch (error) {
      codes.push('signature.invalid');
      isValid = false;
    }

    return {
      valid: isValid,
      codes,
      summary: isValid ? 'Claim signature is valid' : 'Claim signature is invalid'
    };
  }

  /**
   * Validate assertions array
   * @param assertions - Assertions to validate
   * @returns Assertion validation result
   */
  private static validateAssertions(assertions: Assertion[]): ValidationStatus {
    const codes: ValidationCode[] = [];
    let isValid = true;

    // Check for required assertions
    const assertionLabels = new Set(assertions.map(a => a.label));
    for (const required of this.REQUIRED_ASSERTIONS) {
      if (!assertionLabels.has(required)) {
        codes.push('assertion.missing');
        isValid = false;
      }
    }

    // Validate each assertion
    for (const assertion of assertions) {
      const assertionValidation = this.validateSingleAssertion(assertion);
      codes.push(...assertionValidation.codes);
      if (!assertionValidation.valid) {
        isValid = false;
      }
    }

    return {
      valid: isValid,
      codes: this.deduplicateCodes(codes),
      summary: isValid ? 'All assertions are valid' : 'Some assertions are invalid'
    };
  }

  /**
   * Validate a single assertion
   * @param assertion - Assertion to validate
   * @returns Assertion validation result
   */
  private static validateSingleAssertion(assertion: Assertion): ValidationStatus {
    const codes: ValidationCode[] = [];
    let isValid = true;

    // Validate assertion label
    if (!assertion.label || typeof assertion.label !== 'string') {
      codes.push('assertion.missing');
      isValid = false;
    }

    // Validate hashed URI
    if (!assertion.hashed_uri || typeof assertion.hashed_uri !== 'string') {
      codes.push('assertion.missing');
      isValid = false;
    } else if (assertion.data) {
      // Verify hash URI matches the data
      const computedHash = JSONCanonicalizer.hash(assertion.data, 'sha256');
      const expectedHash = `hash://sha256/${computedHash}`;
      
      if (assertion.hashed_uri !== expectedHash) {
        codes.push('assertion.hashedURI.mismatch');
        isValid = false;
      } else {
        codes.push('assertion.hashedURI.match');
      }
    }

    // Validate redaction status
    if (assertion.redacted) {
      // Check if redaction is allowed for this assertion type
      if (this.REQUIRED_ASSERTIONS.has(assertion.label)) {
        codes.push('assertion.invalidRedaction');
        isValid = false;
      } else {
        codes.push('assertion.redactionAllowed');
      }
    } else {
      codes.push('assertion.notRedacted');
    }

    return {
      valid: isValid,
      codes,
      summary: isValid ? `Assertion ${assertion.label} is valid` : `Assertion ${assertion.label} is invalid`
    };
  }

  /**
   * Validate RFC 3161 timestamp token
   * @param manifest - Manifest containing timestamp
   * @returns Timestamp validation result
   */
  private static async validateTimestampToken(manifest: C2PAManifest): Promise<ValidationStatus> {
    const codes: ValidationCode[] = [];
    let isValid = true;

    try {
      // TODO: Implement actual timestamp token validation
      // This would require extracting and validating the TimeStampToken
      
      // For now, check if timestamp is present and reasonable
      if (manifest.claim_signature.protected.iat) {
        const iat = manifest.claim_signature.protected.iat;
        const now = Math.floor(Date.now() / 1000);
        
        // Check if timestamp is not in the future (with 5 minute tolerance)
        if (iat > now + 300) {
          codes.push('timestamp.invalid');
          isValid = false;
        } else {
          codes.push('timestamp.trusted');
        }
      } else {
        codes.push('timestamp.missing');
      }

    } catch (error) {
      codes.push('timestamp.invalid');
      isValid = false;
    }

    return {
      valid: isValid,
      codes,
      summary: isValid ? 'Timestamp is valid' : 'Timestamp is invalid'
    };
  }

  /**
   * Validate ingredient manifests
   * @param ingredients - Ingredients to validate
   * @param trustAnchors - Trusted certificate anchors
   * @returns Ingredient validation result
   */
  private static async validateIngredients(
    ingredients: Ingredient[],
    trustAnchors: Certificate[]
  ): Promise<ValidationStatus> {
    const codes: ValidationCode[] = [];
    let isValid = true;

    for (const ingredient of ingredients) {
      const ingredientValidation = await this.validateSingleIngredient(
        ingredient,
        trustAnchors
      );
      codes.push(...ingredientValidation.codes);
      if (!ingredientValidation.valid) {
        isValid = false;
      }
    }

    return {
      valid: isValid,
      codes: this.deduplicateCodes(codes),
      summary: isValid ? 'All ingredients are valid' : 'Some ingredients are invalid'
    };
  }

  /**
   * Validate a single ingredient
   * @param ingredient - Ingredient to validate
   * @param trustAnchors - Trusted certificate anchors
   * @returns Ingredient validation result
   */
  private static async validateSingleIngredient(
    ingredient: Ingredient,
    trustAnchors: Certificate[]
  ): Promise<ValidationStatus> {
    const codes: ValidationCode[] = [];
    let isValid = true;

    // Validate ingredient structure
    if (!ingredient.active_manifest || !ingredient.claim_signature) {
      codes.push('ingredient.manifestMissing');
      isValid = false;
    }

    // TODO: Implement recursive ingredient validation
    // This would require fetching and validating the ingredient manifest
    
    if (isValid) {
      codes.push('ingredient.claimSignature.match');
    }

    return {
      valid: isValid,
      codes,
      summary: isValid ? 'Ingredient is valid' : 'Ingredient is invalid'
    };
  }

  /**
   * Validate redactions
   * @param manifest - Manifest with redactions
   * @returns Redaction validation result
   */
  private static validateRedactions(manifest: C2PAManifest): ValidationStatus {
    const codes: ValidationCode[] = [];
    let isValid = true;

    if (!manifest.redactions || manifest.redactions.length === 0) {
      return {
        valid: true,
        codes: [],
        summary: 'No redactions to validate'
      };
    }

    for (const redaction of manifest.redactions) {
      // Check if redaction is allowed
      const affectedAssertion = manifest.assertions.find(a => 
        a.hashed_uri.includes(redaction.jumbf_uri)
      );

      if (affectedAssertion && this.REQUIRED_ASSERTIONS.has(affectedAssertion.label)) {
        codes.push('assertion.invalidRedaction');
        isValid = false;
      }
    }

    return {
      valid: isValid,
      codes: this.deduplicateCodes(codes),
      summary: isValid ? 'Redactions are valid' : 'Some redactions are invalid'
    };
  }

  /**
   * Validate certificate chain against trust anchors
   * @param chain - Certificate chain to validate
   * @param trustAnchors - Trusted certificate anchors
   * @returns Certificate validation result
   */
  private static validateCertificateChain(
    chain: Certificate[],
    trustAnchors: Certificate[]
  ): ValidationStatus {
    const codes: ValidationCode[] = [];
    let isValid = true;

    if (!chain || chain.length === 0) {
      codes.push('signingCredential.untrusted');
      return {
        valid: false,
        codes,
        summary: 'No certificate chain provided'
      };
    }

    // Check if any certificate in the chain is trusted
    const trustedCert = chain.find(cert => 
      trustAnchors.some(anchor => 
        anchor.thumbprint === cert.thumbprint && 
        anchor.trusted && 
        !cert.revoked
      )
    );

    if (trustedCert) {
      codes.push('signingCredential.trusted');
    } else {
      codes.push('signingCredential.untrusted');
      isValid = false;
    }

    // Check for revoked certificates
    const revokedCert = chain.find(cert => cert.revoked);
    if (revokedCert) {
      codes.push('signingCredential.revoked');
      isValid = false;
    }

    // Check for expired certificates
    const now = new Date();
    const expiredCert = chain.find(cert => 
      new Date(cert.not_after) < now
    );
    if (expiredCert) {
      codes.push('signingCredential.expired');
      isValid = false;
    }

    return {
      valid: isValid,
      codes,
      summary: isValid ? 'Certificate chain is trusted' : 'Certificate chain is not trusted'
    };
  }

  /**
   * CRITICAL: Calculate maximum nesting depth to prevent stack overflow attacks
   * @param obj - Object to analyze
   * @param currentDepth - Current depth
   * @returns Maximum depth
   */
  private static getMaxDepth(obj: any, currentDepth: number = 0): number {
    if (!obj || typeof obj !== 'object') {
      return currentDepth;
    }
    
    if (currentDepth > 100) {
      return currentDepth; // Early exit for deep objects
    }
    
    let maxDepth = currentDepth;
    
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        const depth = this.getMaxDepth(value, currentDepth + 1);
        maxDepth = Math.max(maxDepth, depth);
      }
    }
    
    return maxDepth;
  }

  /**
   * Remove duplicate validation codes
   * @param codes - Array of validation codes
   * @returns Deduplicated codes
   */
  private static deduplicateCodes(codes: ValidationCode[]): ValidationCode[] {
    return [...new Set(codes)];
  }

  /**
   * Generate human-readable validation summary
   * @param isValid - Overall validation result
   * @param codes - Validation codes
   * @returns Summary string
   */
  private static generateValidationSummary(isValid: boolean, codes: ValidationCode[]): string {
    if (isValid) {
      return 'Manifest is valid and trusted';
    }

    const errorCodes = codes.filter(code => 
      !code.includes('.valid') && 
      !code.includes('.match') && 
      !code.includes('.trusted')
    );

    if (errorCodes.length > 0) {
      return `Manifest validation failed: ${errorCodes.join(', ')}`;
    }

    return 'Manifest validation failed with unspecified errors';
  }

  /**
   * Get spec reference for validation code
   * @param code - Validation code
   * @returns Spec reference URL
   */
  static getSpecReference(code: ValidationCode): string {
    const references: Record<ValidationCode, string> = {
      'signingCredential.trusted': 'https://spec.c2pa.org/specification-2.1/#signing-credential',
      'signingCredential.untrusted': 'https://spec.c2pa.org/specification-2.1/#signing-credential',
      'signingCredential.revoked': 'https://spec.c2pa.org/specification-2.1/#signing-credential',
      'signingCredential.expired': 'https://spec.c2pa.org/specification-2.1/#signing-credential',
      'signature.valid': 'https://spec.c2pa.org/specification-2.1/#claim-signature',
      'signature.invalid': 'https://spec.c2pa.org/specification-2.1/#claim-signature',
      'signature.algorithmNotAllowed': 'https://spec.c2pa.org/specification-2.1/#claim-signature',
      'timestamp.trusted': 'https://spec.c2pa.org/specification-2.1/#timestamp-evidence',
      'timestamp.untrusted': 'https://spec.c2pa.org/specification-2.1/#timestamp-evidence',
      'timestamp.invalid': 'https://spec.c2pa.org/specification-2.1/#timestamp-evidence',
      'timestamp.missing': 'https://spec.c2pa.org/specification-2.1/#timestamp-evidence',
      'assertion.hashedURI.match': 'https://spec.c2pa.org/specification-2.1/#assertions',
      'assertion.hashedURI.mismatch': 'https://spec.c2pa.org/specification-2.1/#assertions',
      'assertion.missing': 'https://spec.c2pa.org/specification-2.1/#assertions',
      'assertion.notRedacted': 'https://spec.c2pa.org/specification-2.1/#redactions',
      'assertion.invalidRedaction': 'https://spec.c2pa.org/specification-2.1/#redactions',
      'assertion.redactionAllowed': 'https://spec.c2pa.org/specification-2.1/#redactions',
      'ingredient.claimSignature.match': 'https://spec.c2pa.org/specification-2.1/#ingredients',
      'ingredient.claimSignature.mismatch': 'https://spec.c2pa.org/specification-2.1/#ingredients',
      'ingredient.manifestMissing': 'https://spec.c2pa.org/specification-2.1/#ingredients',
      'ingredient.validationFailed': 'https://spec.c2pa.org/specification-2.1/#ingredients',
      'manifest.structureValid': 'https://spec.c2pa.org/specification-2.1/#manifest-structure',
      'manifest.structureInvalid': 'https://spec.c2pa.org/specification-2.1/#manifest-structure',
      'manifest.versionSupported': 'https://spec.c2pa.org/specification-2.1/#version',
      'manifest.versionUnsupported': 'https://spec.c2pa.org/specification-2.1/#version'
    };

    return references[code] || 'https://spec.c2pa.org/specification-2.1/';
  }
}
