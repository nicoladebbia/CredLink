/**
 * C2PA Manifest Diff Engine
 * Implements semantic diff with spec-aware field comparison
 * Generates RFC 6902 JSON Patch and RFC 7386 Merge Patch
 */

import { 
  C2PAManifest, 
  ClaimSignature, 
  Assertion, 
  Ingredient, 
  Certificate,
  TimeStampToken,
  SemanticDiff,
  ManifestInfo,
  SignerDiff,
  TSADiff,
  AssertionChange,
  IngredientChange,
  ValidationCode
} from '@/types';
import { JSONCanonicalizer } from './canonicalizer';
import { createPatch } from 'json-patch';

/**
 * Performs semantic and structural diffs between C2PA manifests
 */
export class ManifestDiffer {
  /**
   * Generate comprehensive semantic diff between two manifests
   * @param base - Base manifest
   * @param target - Target manifest
   * @returns Semantic diff with spec-aware changes
   */
  static generateSemanticDiff(base: C2PAManifest, target: C2PAManifest): SemanticDiff {
    if (!base || !target) {
      throw new Error('Invalid manifest: base and target manifests are required');
    }

    if (!base.claim_signature || !target.claim_signature) {
      throw new Error('Invalid manifest: claim_signature is required');
    }

    if (!Array.isArray(base.assertions) || !Array.isArray(target.assertions)) {
      throw new Error('Invalid manifest: assertions must be an array');
    }

    const baseInfo = this.extractManifestInfo(base);
    const targetInfo = this.extractManifestInfo(target);

    return {
      base: baseInfo,
      target: targetInfo,
      signer_diff: this.diffSigners(base.claim_signature, target.claim_signature),
      tsa_diff: this.diffTimestamps(base, target),
      assertions_added: this.findAddedAssertions(base.assertions, target.assertions),
      assertions_removed: this.findRemovedAssertions(base.assertions, target.assertions),
      assertions_modified: this.findModifiedAssertions(base.assertions, target.assertions),
      ingredient_changes: this.diffIngredients(base.ingredients || [], target.ingredients || []),
      validation_codes: {
        base: base.claim_signature.validation_status?.codes || [],
        target: target.claim_signature.validation_status?.codes || []
      }
    };
  }

  /**
   * Generate RFC 6902 JSON Patch operations
   * @param base - Base manifest (canonicalized)
   * @param target - Target manifest (canonicalized)
   * @returns JSON Patch operations array
   */
  static generateJSONPatch(base: C2PAManifest, target: C2PAManifest): JSONPatchOperation[] {
    if (!base || !target) {
      throw new Error('Invalid manifest: base and target manifests are required');
    }

    try {
      // Canonicalize both manifests for consistent comparison
      const canonicalBase = JSON.parse(JSONCanonicalizer.canonicalize(base));
      const canonicalTarget = JSON.parse(JSONCanonicalizer.canonicalize(target));

      // Generate patch operations
      const operations = createPatch(canonicalBase, canonicalTarget);
      
      // Convert to RFC 6902 format
      return operations.map(op => ({
        op: op.op as 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test',
        path: op.path,
        value: op.value,
        from: op.from
      }));
    } catch (error) {
      throw new Error(`Failed to generate JSON Patch: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate RFC 7386 JSON Merge Patch
   * @param base - Base manifest
   * @param target - Target manifest
   * @returns JSON Merge Patch object
   */
  static generateMergePatch(base: C2PAManifest, target: C2PAManifest): JSONMergePatch {
    if (!base || !target) {
      throw new Error('Invalid manifest: base and target manifests are required');
    }

    try {
      const patch = this.generateMergePatchObject(base, target);
      return patch !== undefined ? patch : {};
    } catch (error) {
      throw new Error(`Failed to generate Merge Patch: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract manifest information for diff comparison
   * @param manifest - Manifest to extract info from
   * @returns Manifest info object
   */
  private static extractManifestInfo(manifest: C2PAManifest): ManifestInfo {
    const signerCert = manifest.claim_signature.certificate_chain[0];
    const signerKeyId = signerCert?.thumbprint || 
                       manifest.claim_signature.protected.kid || 
                       'unknown';

    return {
      manifest_hash: manifest.manifest_hash,
      signer_key_id: signerKeyId,
      claim_generator: manifest.claim_generator,
      timestamp: manifest.timestamp
    };
  }

  /**
   * Compare claim signatures between manifests
   * @param baseSignature - Base claim signature
   * @param targetSignature - Target claim signature
   * @returns Signer diff object
   */
  private static diffSigners(baseSignature: ClaimSignature, targetSignature: ClaimSignature): SignerDiff {
    const baseCert = baseSignature.certificate_chain[0];
    const targetCert = targetSignature.certificate_chain[0];
    
    const baseTrusted = baseSignature.validation_status.codes.includes('signingCredential.trusted');
    const targetTrusted = targetSignature.validation_status.codes.includes('signingCredential.trusted');
    
    const trustStatus = `${baseTrusted ? 'trusted' : 'untrusted'}→${targetTrusted ? 'trusted' : 'untrusted'}`;
    const algorithmChange = `${baseSignature.protected.alg}→${targetSignature.protected.alg}`;
    
    const diff: SignerDiff = {
      chain_trust: trustStatus,
      algorithm: algorithmChange
    };

    // Add subject change if certificates differ
    if (baseCert?.subject !== targetCert?.subject) {
      diff.subject = `${baseCert?.subject || 'unknown'}→${targetCert?.subject || 'unknown'}`;
    }

    // Add certificate chain change if chain length differs
    if (baseSignature.certificate_chain.length !== targetSignature.certificate_chain.length) {
      diff.certificate_chain = `${baseSignature.certificate_chain.length}→${targetSignature.certificate_chain.length} certs`;
    }

    return diff;
  }

  /**
   * Compare timestamp evidence between manifests
   * @param base - Base manifest
   * @param target - Target manifest
   * @returns TSA diff object
   */
  private static diffTimestamps(base: C2PAManifest, target: C2PAManifest): TSADiff {
    const baseTime = new Date(base.timestamp).getTime();
    const targetTime = new Date(target.timestamp).getTime();
    const timeDiffMs = targetTime - baseTime;

    // Extract TSA information from validation codes
    const baseTSATrusted = base.claim_signature.validation_status.codes.includes('timestamp.trusted');
    const targetTSATrusted = target.claim_signature.validation_status.codes.includes('timestamp.trusted');
    
    const baseTSA = baseTSATrusted ? 'Trusted' : 'Untrusted';
    const targetTSA = targetTSATrusted ? 'Trusted' : 'Untrusted';

    const diff: TSADiff = {
      provider: `${baseTSA}→${targetTSA}`,
      genTime_diff_ms: timeDiffMs
    };

    return diff;
  }

  /**
   * Find assertions that were added in target
   * @param baseAssertions - Base assertions
   * @param targetAssertions - Target assertions
   * @returns Array of added assertions
   */
  private static findAddedAssertions(
    baseAssertions: Assertion[], 
    targetAssertions: Assertion[]
  ): AssertionChange[] {
    const baseHashes = new Set(baseAssertions.map(a => a.hashed_uri));
    const added: AssertionChange[] = [];

    for (const assertion of targetAssertions) {
      if (!baseHashes.has(assertion.hashed_uri)) {
        added.push({
          label: assertion.label,
          path: this.findAssertionPath(assertion, targetAssertions),
          redacted: assertion.redacted,
          allowed: !this.isRedactionDisallowed(assertion.label),
          hashed_uri: assertion.hashed_uri
        });
      }
    }

    return added;
  }

  /**
   * Find assertions that were removed in target
   * @param baseAssertions - Base assertions
   * @param targetAssertions - Target assertions
   * @returns Array of removed assertions
   */
  private static findRemovedAssertions(
    baseAssertions: Assertion[], 
    targetAssertions: Assertion[]
  ): AssertionChange[] {
    const targetHashes = new Set(targetAssertions.map(a => a.hashed_uri));
    const removed: AssertionChange[] = [];

    for (const assertion of baseAssertions) {
      if (!targetHashes.has(assertion.hashed_uri)) {
        removed.push({
          label: assertion.label,
          path: this.findAssertionPath(assertion, baseAssertions),
          redacted: assertion.redacted,
          allowed: !this.isRedactionDisallowed(assertion.label),
          hashed_uri: assertion.hashed_uri
        });
      }
    }

    return removed;
  }

  /**
   * Find assertions that were modified between base and target
   * @param baseAssertions - Base assertions
   * @param targetAssertions - Target assertions
   * @returns Array of modified assertions
   */
  private static findModifiedAssertions(
    baseAssertions: Assertion[], 
    targetAssertions: Assertion[]
  ): AssertionChange[] {
    const modified: AssertionChange[] = [];

    for (const baseAssertion of baseAssertions) {
      const targetAssertion = targetAssertions.find(a => a.hashed_uri === baseAssertion.hashed_uri);
      
      if (targetAssertion && !this.assertionsEqual(baseAssertion, targetAssertion)) {
        modified.push({
          label: baseAssertion.label,
          path: this.findAssertionPath(baseAssertion, baseAssertions),
          redacted: targetAssertion.redacted,
          allowed: !this.isRedactionDisallowed(baseAssertion.label),
          hashed_uri: baseAssertion.hashed_uri
        });
      }
    }

    return modified;
  }

  /**
   * Compare ingredient lists between manifests
   * @param baseIngredients - Base ingredients
   * @param targetIngredients - Target ingredients
   * @returns Array of ingredient changes
   */
  private static diffIngredients(
    baseIngredients: Ingredient[], 
    targetIngredients: Ingredient[]
  ): IngredientChange[] {
    const changes: IngredientChange[] = [];

    // Find added ingredients
    const baseHashes = new Set(baseIngredients.map(i => i.active_manifest));
    for (const ingredient of targetIngredients) {
      if (!baseHashes.has(ingredient.active_manifest)) {
        changes.push({
          parent: 'new',
          status: ingredient.validation_status.codes[0] as ValidationCode,
          relationship: ingredient.relationship
        });
      }
    }

    // Find removed ingredients
    const targetHashes = new Set(targetIngredients.map(i => i.active_manifest));
    for (const ingredient of baseIngredients) {
      if (!targetHashes.has(ingredient.active_manifest)) {
        changes.push({
          parent: 'removed',
          status: 'ingredient.manifestMissing',
          relationship: ingredient.relationship
        });
      }
    }

    // Find modified ingredients
    for (const baseIngredient of baseIngredients) {
      const targetIngredient = targetIngredients.find(i => 
        i.active_manifest === baseIngredient.active_manifest
      );
      
      if (targetIngredient && !this.ingredientsEqual(baseIngredient, targetIngredient)) {
        changes.push({
          parent: baseIngredient.active_manifest,
          status: targetIngredient.validation_status.codes[0] as ValidationCode,
          relationship: targetIngredient.relationship
        });
      }
    }

    return changes;
  }

  /**
   * Generate JSON Patch operations recursively
   * @param path - Current JSON path
   * @param base - Base object
   * @param target - Target object
   * @param operations - Operations array to populate
   */
  private static generatePatchOperations(
    path: string,
    base: any,
    target: any,
    operations: JSONPatchOperation[]
  ): void {
    // Handle different types
    if (typeof base !== typeof target) {
      operations.push({
        op: 'replace',
        path,
        value: target
      });
      return;
    }

    // Handle null values
    if (base === null && target === null) {
      return;
    }

    if (base === null) {
      operations.push({
        op: 'add',
        path,
        value: target
      });
      return;
    }

    if (target === null) {
      operations.push({
        op: 'remove',
        path
      });
      return;
    }

    // Handle primitives
    if (typeof base !== 'object') {
      if (base !== target) {
        operations.push({
          op: 'replace',
          path,
          value: target
        });
      }
      return;
    }

    // Handle arrays
    if (Array.isArray(base) && Array.isArray(target)) {
      this.generateArrayPatchOperations(path, base, target, operations);
      return;
    }

    // Handle objects
    if (Array.isArray(base) || Array.isArray(target)) {
      // One is array, one is object
      operations.push({
        op: 'replace',
        path,
        value: target
      });
      return;
    }

    this.generateObjectPatchOperations(path, base, target, operations);
  }

  /**
   * Generate patch operations for arrays
   * @param path - Current path
   * @param base - Base array
   * @param target - Target array
   * @param operations - Operations array
   */
  private static generateArrayPatchOperations(
    path: string,
    base: any[],
    target: any[],
    operations: JSONPatchOperation[]
  ): void {
    // For simplicity, replace the entire array if different
    // A more sophisticated implementation could track individual element changes
    if (!this.arraysEqual(base, target)) {
      operations.push({
        op: 'replace',
        path,
        value: target
      });
    }
  }

  /**
   * Generate patch operations for objects
   * @param path - Current path
   * @param base - Base object
   * @param target - Target object
   * @param operations - Operations array
   */
  private static generateObjectPatchOperations(
    path: string,
    base: Record<string, any>,
    target: Record<string, any>,
    operations: JSONPatchOperation[]
  ): void {
    const allKeys = new Set([...Object.keys(base), ...Object.keys(target)]);

    for (const key of allKeys) {
      const keyPath = path === '/' ? `/${key}` : `${path}/${key}`;
      const hasBase = key in base;
      const hasTarget = key in target;

      if (!hasBase && hasTarget) {
        // Key added
        operations.push({
          op: 'add',
          path: keyPath,
          value: target[key]
        });
      } else if (hasBase && !hasTarget) {
        // Key removed
        operations.push({
          op: 'remove',
          path: keyPath
        });
      } else if (hasBase && hasTarget) {
        // Key exists in both, recurse
        this.generatePatchOperations(keyPath, base[key], target[key], operations);
      }
    }
  }

  /**
   * Generate JSON Merge Patch object recursively
   * @param base - Base object
   * @param target - Target object
   * @returns Merge patch object
   */
  private static generateMergePatchObject(base: any, target: any): any {
    // Handle null values
    if (target === null) {
      return null;
    }

    if (base === null) {
      return target;
    }

    // Handle primitives
    if (typeof base !== 'object' || typeof target !== 'object') {
      return target;
    }

    // Handle arrays
    if (Array.isArray(base) || Array.isArray(target)) {
      return this.arraysEqual(base, target) ? undefined : target;
    }

    // Handle objects
    const result: Record<string, any> = {};
    let hasChanges = false;

    const allKeys = new Set([...Object.keys(base), ...Object.keys(target)]);

    for (const key of allKeys) {
      const hasBase = key in base;
      const hasTarget = key in target;

      if (!hasBase && hasTarget) {
        // Key added
        result[key] = target[key];
        hasChanges = true;
      } else if (hasBase && !hasTarget) {
        // Key removed
        result[key] = null;
        hasChanges = true;
      } else if (hasBase && hasTarget) {
        // Key exists in both
        const patch = this.generateMergePatchObject(base[key], target[key]);
        if (patch !== undefined) {
          result[key] = patch;
          hasChanges = true;
        }
      }
    }

    return hasChanges ? result : undefined;
  }

  /**
   * Find the JSON path for an assertion in the assertions array
   * @param assertion - Assertion to find
   * @param assertions - Assertions array to search in
   * @returns JSON path string
   */
  private static findAssertionPath(assertion: Assertion, assertions: Assertion[]): string {
    const index = assertions.findIndex(a => a.hashed_uri === assertion.hashed_uri);
    return index >= 0 ? `#/assertions/${index}` : '#/assertions/unknown';
  }

  /**
   * Check if redaction is disallowed for an assertion type
   * @param label - Assertion label
   * @returns True if redaction is disallowed
   */
  private static isRedactionDisallowed(label: string): boolean {
    // Actions and hard bindings cannot be redacted per spec
    const disallowedRedactions = new Set([
      'c2pa.actions',
      'c2pa.actions.v2',
      'c2pa.hash.data',
      'c2pa.hash.image',
      'c2pa.hash.video'
    ]);

    return disallowedRedactions.has(label);
  }

  /**
   * Check if two assertions are equal
   * @param a - First assertion
   * @param b - Second assertion
   * @returns True if assertions are equal
   */
  private static assertionsEqual(a: Assertion, b: Assertion): boolean {
    if (a.label !== b.label || a.hashed_uri !== b.hashed_uri || a.redacted !== b.redacted) {
      return false;
    }

    // Compare data if both have it
    if (a.data && b.data) {
      return JSONCanonicalizer.deepEqual(a.data, b.data);
    }

    // If one has data and the other doesn't, they're different
    return !a.data && !b.data;
  }

  /**
   * Check if two ingredients are equal
   * @param a - First ingredient
   * @param b - Second ingredient
   * @returns True if ingredients are equal
   */
  private static ingredientsEqual(a: Ingredient, b: Ingredient): boolean {
    return a.relationship === b.relationship &&
           a.active_manifest === b.active_manifest &&
           a.claim_signature === b.claim_signature;
  }

  /**
   * Check if two arrays are equal
   * @param a - First array
   * @param b - Second array
   * @returns True if arrays are equal
   */
  private static arraysEqual(a: any[], b: any[]): boolean {
    if (a.length !== b.length) {
      return false;
    }

    for (let i = 0; i < a.length; i++) {
      if (typeof a[i] !== typeof b[i]) {
        return false;
      }

      if (typeof a[i] === 'object' && a[i] !== null) {
        if (!JSONCanonicalizer.deepEqual(a[i], b[i])) {
          return false;
        }
      } else if (a[i] !== b[i]) {
        return false;
      }
    }

    return true;
  }
}
