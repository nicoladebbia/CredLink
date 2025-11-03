/**
 * C2PA Manifest Validator
 * Validates C2PA manifests according to specification
 */
import { C2PAManifest, Certificate, ValidationStatus, ValidationCode } from '../types/index.js';
/**
 * C2PA Manifest Validation Engine
 * Validates manifests according to C2PA 2.1 specification
 */
export declare class ManifestValidator {
    private static readonly MAX_MANIFEST_SIZE;
    private static readonly MAX_ASSERTIONS;
    private static readonly MAX_INGREDIENTS;
    private static readonly MAX_NESTING_DEPTH;
    private static readonly ALLOWED_SIGNATURE_ALGORITHMS;
    private static readonly REQUIRED_ASSERTIONS;
    /**
     * Validate a complete C2PA manifest
     * @param manifest - Manifest to validate
     * @param trustAnchors - Trusted certificates for validation
     * @returns Complete validation result
     */
    static validateManifest(manifest: C2PAManifest, trustAnchors: Certificate[]): Promise<ValidationStatus>;
    /**
     * Validate manifest structure
     * @param manifest - Manifest to validate
     * @returns Structure validation result
     */
    private static validateManifestStructure;
    /**
     * Validate claim signature
     * @param claimSignature - Claim signature to validate
     * @param certificates - Certificate chain for validation
     * @returns Signature validation result
     */
    private static validateClaimSignature;
    /**
     * Validate assertions array
     * @param assertions - Assertions to validate
     * @returns Assertion validation result
     */
    private static validateAssertions;
    /**
     * Validate a single assertion
     * @param assertion - Assertion to validate
     * @returns Assertion validation result
     */
    private static validateSingleAssertion;
    /**
     * Validate ingredients array
     * @param ingredients - Ingredients to validate
     * @returns Ingredient validation result
     */
    private static validateIngredients;
    /**
     * Validate RFC 3161 timestamp token
     * @param manifest - Manifest containing timestamp
     * @returns Timestamp validation result
     */
    private static validateTimestampToken;
    /**
     * Get maximum nesting depth of ingredient relationships
     * @param ingredient - Root ingredient
     * @returns Maximum nesting depth
     */
    private static getMaxDepth;
    /**
     * Remove duplicate validation codes
     * @param codes - Array of validation codes
     * @returns Deduplicated codes
     */
    private static deduplicateCodes;
    /**
     * Generate human-readable validation summary
     * @param isValid - Whether validation passed
     * @param codes - Validation codes encountered
     * @returns Summary string
     */
    private static generateValidationSummary;
    /**
     * Get spec reference for validation code
     * @param code - Validation code
     * @returns Spec reference URL
     */
    static getSpecReference(code: ValidationCode): string;
}
//# sourceMappingURL=validator.d.ts.map