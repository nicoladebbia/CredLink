/**
 * Phase 20: Policy Engine & Assertions Builder - Policy Validator
 * Strict validation against C2PA 2.2 rules with actionable error codes
 */

import * as crypto from 'crypto';
import { Policy, ValidationError, POLICY_ERROR_CODES } from '../types/policy.js';
import { POLICY_SCHEMA, CONDITIONAL_RULES } from '../types/schema.js';

export class PolicyValidator {
  /**
   * Validate policy against JSON schema and C2PA 2.2 rules
   */
  validate(policy: any): { isValid: boolean; errors: ValidationError[] } {
    const errors: ValidationError[] = [];

    // 1. Basic structure validation
    errors.push(...this.validateBasicStructure(policy));

    // 2. Required fields validation
    errors.push(...this.validateRequiredFields(policy));

    // 3. Field type and format validation
    errors.push(...this.validateFieldTypes(policy));

    // 4. Conditional validation rules
    errors.push(...this.validateConditionalRules(policy));

    // 5. C2PA 2.2 specific validations
    errors.push(...this.validateC2PARules(policy));

    // 6. Business logic validations
    errors.push(...this.validateBusinessRules(policy));

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate basic policy structure
   */
  private validateBasicStructure(policy: any): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!policy || typeof policy !== 'object') {
      errors.push({
        code: POLICY_ERROR_CODES.INVALID_YAML,
        message: 'Policy must be a valid object',
        fix_hint: 'Ensure YAML parses to a valid object'
      });
      return errors;
    }

    return errors;
  }

  /**
   * Validate required fields
   */
  private validateRequiredFields(policy: Policy): ValidationError[] {
    const errors: ValidationError[] = [];
    const requiredFields = ['policy_id', 'version', 'applies_to', 'disclosure', 'editing', 'license', 'display', 'controls', 'lock'];

    for (const field of requiredFields) {
      if (!(field in policy)) {
        errors.push({
          code: `policy.required.${field}`,
          message: `Missing required field: ${field}`,
          path: field,
          fix_hint: `Add the ${field} field to your policy`
        });
      }
    }

    return errors;
  }

  /**
   * Validate field types and formats
   */
  private validateFieldTypes(policy: Policy): ValidationError[] {
    const errors: ValidationError[] = [];

    // policy_id validation
    if (policy.policy_id && typeof policy.policy_id !== 'string') {
      errors.push({
        code: 'policy.id.invalid_type',
        message: 'policy_id must be a string',
        path: 'policy_id',
        fix_hint: 'Use a string value for policy_id'
      });
    } else if (policy.policy_id && !/^[a-z0-9-]+$/.test(policy.policy_id)) {
      errors.push({
        code: 'policy.id.invalid_format',
        message: 'policy_id must contain only lowercase letters, numbers, and hyphens',
        path: 'policy_id',
        fix_hint: 'Use format like "newsroom-default" or "eu-ads-v1"'
      });
    }

    // version validation
    if (policy.version && typeof policy.version !== 'number') {
      errors.push({
        code: 'policy.version.invalid_type',
        message: 'version must be a number',
        path: 'version',
        fix_hint: 'Use a numeric value for version'
      });
    } else if (policy.version && (policy.version < 1 || policy.version > 999999)) {
      errors.push({
        code: 'policy.version.out_of_range',
        message: 'version must be between 1 and 999999',
        path: 'version',
        fix_hint: 'Use a reasonable version number'
      });
    }

    // disclosure validation
    if (policy.disclosure) {
      if (policy.disclosure.digital_source_type) {
        const validDSTs = ['auto', 'trainedAlgorithmicMedia', 'computationalCapture', 'humanCapture'];
        if (!validDSTs.includes(policy.disclosure.digital_source_type)) {
          errors.push({
            code: 'policy.disclosure.digital_source_type.invalid_value',
            message: `Invalid digital_source_type: ${policy.disclosure.digital_source_type}`,
            path: 'disclosure.digital_source_type',
            fix_hint: `Use one of: ${validDSTs.join(', ')}`
          });
        }
      }
      
      if (policy.disclosure.creation_mode) {
        const validModes = ['created', 'opened'];
        if (!validModes.includes(policy.disclosure.creation_mode)) {
          errors.push({
            code: 'policy.disclosure.creation_mode.invalid_value',
            message: `Invalid creation mode: ${policy.disclosure.creation_mode}`,
            path: 'disclosure.creation_mode',
            fix_hint: `Use one of: ${validModes.join(', ')}`
          });
        }
      }
      
      if (policy.disclosure.ai && policy.disclosure.ai.prompt_disclosure) {
        const validPromptDisclosures = ['none', 'minimal', 'full'];
        if (!validPromptDisclosures.includes(policy.disclosure.ai.prompt_disclosure)) {
          errors.push({
            code: 'policy.disclosure.ai.prompt_disclosure.invalid_value',
            message: `Invalid prompt disclosure: ${policy.disclosure.ai.prompt_disclosure}`,
            path: 'disclosure.ai.prompt_disclosure',
            fix_hint: `Use one of: ${validPromptDisclosures.join(', ')}`
          });
        }
      }
    }

    // applies_to validation
    if (policy.applies_to) {
      if (!Array.isArray(policy.applies_to.kinds)) {
        errors.push({
          code: 'policy.applies_to.kinds.invalid_type',
          message: 'applies_to.kinds must be an array',
          path: 'applies_to.kinds',
          fix_hint: 'Use an array of asset kinds'
        });
      } else {
        const validKinds = ['image', 'video', 'audio'];
        for (const kind of policy.applies_to.kinds) {
          if (!validKinds.includes(kind)) {
            errors.push({
              code: 'policy.applies_to.kinds.invalid_value',
              message: `Invalid asset kind: ${kind}`,
              path: 'applies_to.kinds',
              fix_hint: `Use one of: ${validKinds.join(', ')}`
            });
          }
        }
      }

      if (!Array.isArray(policy.applies_to.audience_regions)) {
        errors.push({
          code: 'policy.applies_to.audience_regions.invalid_type',
          message: 'applies_to.audience_regions must be an array',
          path: 'applies_to.audience_regions',
          fix_hint: 'Use an array of audience regions'
        });
      } else {
        const validRegions = ['global', 'eu', 'us', 'apac'];
        for (const region of policy.applies_to.audience_regions) {
          if (!validRegions.includes(region)) {
            errors.push({
              code: 'policy.applies_to.audience_regions.invalid_value',
              message: `Invalid audience region: ${region}`,
              path: 'applies_to.audience_regions',
              fix_hint: `Use one of: ${validRegions.join(', ')}`
            });
          }
        }
      }
    }

    return errors;
  }

  /**
   * Validate conditional rules
   */
  private validateConditionalRules(policy: Policy): ValidationError[] {
    const errors: ValidationError[] = [];

    // License provider rules
    if (policy.license && policy.license.provider !== 'custom') {
      if (!policy.license.license_id) {
        errors.push({
          code: POLICY_ERROR_CODES.LICENSE_FIELDS,
          message: 'license_id is required when provider is not "custom"',
          path: 'license.license_id',
          fix_hint: 'Add the license ID from your provider'
        });
      }

      if (!policy.license.terms_url) {
        errors.push({
          code: POLICY_ERROR_CODES.LICENSE_FIELDS,
          message: 'terms_url is required when provider is not "custom"',
          path: 'license.terms_url',
          fix_hint: 'Add the license terms URL from your provider'
        });
      }
    }

    // AI disclosure rules
    if (policy.disclosure && policy.disclosure.ai) {
      if (policy.disclosure.ai.used && !policy.disclosure.ai.generator) {
        errors.push({
          code: 'policy.ai.generator_recommended',
          message: 'generator is recommended when AI is used',
          path: 'disclosure.ai.generator',
          fix_hint: 'Specify the AI model (e.g., "Midjourney:8.1")'
        });
      }
    }

    return errors;
  }

  /**
   * Validate C2PA 2.2 specific requirements
   */
  private validateC2PARules(policy: Policy): ValidationError[] {
    const errors: ValidationError[] = [];

    // Digital source type validation
    if (policy.disclosure && policy.disclosure.creation_mode === 'created') {
      if (policy.disclosure.digital_source_type === 'auto') {
        if (!policy.disclosure.ai || policy.disclosure.ai.used === undefined) {
          errors.push({
            code: POLICY_ERROR_CODES.DST_INVALID,
            message: 'ai.used must be specified when digital_source_type is "auto" for created content',
            path: 'disclosure.ai.used',
            fix_hint: 'Set ai.used to true or false, or specify explicit digital_source_type'
          });
        }
      }
    }

    // Rights window validation
    if (policy.license && policy.license.rights_window) {
      const from = new Date(policy.license.rights_window.from);
      const to = new Date(policy.license.rights_window.to);
      
      if (isNaN(from.getTime())) {
        errors.push({
          code: 'policy.license.invalid_from_date',
          message: 'rights_window.from must be a valid ISO 8601 timestamp',
          path: 'license.rights_window.from',
          fix_hint: 'Use format: "2025-10-01T00:00:00Z"'
        });
      }
      
      if (isNaN(to.getTime())) {
        errors.push({
          code: 'policy.license.invalid_to_date',
          message: 'rights_window.to must be a valid ISO 8601 timestamp',
          path: 'license.rights_window.to',
          fix_hint: 'Use format: "2026-10-01T00:00:00Z"'
        });
      }
      
      // SECURITY: Ensure date ranges are logical and prevent future manipulation
      if (!isNaN(from.getTime()) && !isNaN(to.getTime())) {
        if (from >= to) {
          errors.push({
            code: 'policy.license.invalid_date_range',
            message: 'rights_window.from must be before rights_window.to',
            path: 'license.rights_window',
            fix_hint: 'Ensure from date is earlier than to date'
          });
        }
        
        const now = new Date();
        const maxFutureYears = 10;
        const maxFutureDate = new Date(now.getFullYear() + maxFutureYears, 11, 31);
        
        if (to > maxFutureDate) {
          errors.push({
            code: 'policy.license.excessive_future_date',
            message: `rights_window.to cannot be more than ${maxFutureYears} years in the future`,
            path: 'license.rights_window.to',
            fix_hint: 'Use a reasonable end date for the license window'
          });
        }
      }
    }

    return errors;
  }

  /**
   * Validate business logic rules
   * SECURITY: Comprehensive business rule validation prevents logical vulnerabilities
   */
  private validateBusinessRules(policy: Policy): ValidationError[] {
    const errors: ValidationError[] = [];

    // Retained assertions validation - SECURITY: prevents assertion injection
    if (policy.controls && policy.controls.retain_assertions) {
      const validRetentionTypes = ['thumbnail', 'ingredient', 'actions', 'license'];
      // SECURITY: Limit array size to prevent DoS
      if (policy.controls.retain_assertions.length > 10) {
        errors.push({
          code: POLICY_ERROR_CODES.ARRAY_TOO_LARGE,
          message: 'retain_assertions array cannot contain more than 10 items',
          path: 'controls.retain_assertions',
          fix_hint: 'Reduce the number of retained assertion types'
        });
      }
      
      for (const assertion of policy.controls.retain_assertions) {
        // SECURITY: Validate assertion type format
        if (!/^[a-z_]+$/.test(assertion)) {
          errors.push({
            code: POLICY_ERROR_CODES.INVALID_FORMAT,
            message: `Invalid assertion type format "${assertion}"`,
            path: 'controls.retain_assertions',
            fix_hint: 'Use lowercase letters and underscores only'
          });
        } else if (!validRetentionTypes.includes(assertion)) {
          errors.push({
            code: 'policy.controls.invalid_retention',
            message: `Invalid assertion type "${assertion}" in retain_assertions`,
            path: 'controls.retain_assertions',
            fix_hint: `Use one of: ${validRetentionTypes.join(', ')}`
          });
        }
      }
    }

    // SECURITY: Validate policy complexity to prevent processing attacks
    const editingSteps = policy.editing?.steps?.length || 0;
    if (editingSteps > 50) {
      errors.push({
        code: POLICY_ERROR_CODES.ARRAY_TOO_LARGE,
        message: 'Too many editing steps - maximum 50 allowed',
        path: 'editing.steps',
        fix_hint: 'Reduce the number of editing steps'
      });
    }

    return errors;
  }

  /**
   * Validate policy hash for version locking
   */
  validatePolicyHash(policy: Policy, expectedHash: string): ValidationError[] {
    const errors: ValidationError[] = [];
    
    const actualHash = this.calculatePolicyHash(policy);
    
    if (actualHash !== expectedHash) {
      errors.push({
        code: POLICY_ERROR_CODES.LOCK_HASH_MISMATCH,
        message: 'Policy hash does not match expected version',
        path: 'policy',
        fix_hint: 'Use the correct policy version or update the locked version'
      });
    }
    
    return errors;
  }

  /**
   * Calculate SHA-256 hash of canonical policy
   */
  private calculatePolicyHash(policy: Policy): string {
    const canonical = this.canonicalizePolicy(policy);
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Convert policy to canonical YAML format for hashing
   */
  private canonicalizePolicy(policy: Policy): string {
    // Sort keys consistently and remove insignificant whitespace
    const sorted = this.sortObjectKeys(policy);
    return JSON.stringify(sorted, null, 0);
  }

  /**
   * Sort object keys recursively for consistent hashing
   */
  private sortObjectKeys(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(this.sortObjectKeys.bind(this));
    }
    
    if (obj !== null && typeof obj === 'object') {
      const sorted: any = {};
      const keys = Object.keys(obj).sort();
      
      for (const key of keys) {
        sorted[key] = this.sortObjectKeys(obj[key]);
      }
      
      return sorted;
    }
    
    return obj;
  }
}
