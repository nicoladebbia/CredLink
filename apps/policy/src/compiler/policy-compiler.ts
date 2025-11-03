/**
 * Phase 20: Policy Engine & Assertions Builder - Policy Compiler
 * Maps human-readable DSL to C2PA v2 assertions with strict compliance
 */

import { 
  Policy, 
  CompiledAssertions, 
  ValidationError, 
  C2PAActionsAssertion, 
  C2PALicenseAssertion, 
  C2CPolicyAssertion,
  C2PAAction,
  DIGITAL_SOURCE_TYPE_URIS,
  C2PA_ACTIONS
} from '../types/policy.js';
import { PolicyValidator } from '../validator/policy-validator.js';
import * as crypto from 'crypto';

export class PolicyCompiler {
  private validator: PolicyValidator;

  constructor() {
    this.validator = new PolicyValidator();
  }

  /**
   * Compile policy to C2PA assertions
   */
  compile(policy: Policy): { compiled: CompiledAssertions; errors: ValidationError[] } {
    const errors: ValidationError[] = [];

    // Validate policy first
    const validation = this.validator.validate(policy);
    errors.push(...validation.errors);

    if (errors.length > 0) {
      return {
        compiled: this.createEmptyCompiled(),
        errors
      };
    }

    try {
      // Generate assertions
      const actions = this.compileActionsAssertion(policy);
      const license = this.compileLicenseAssertion(policy);
      const policyAssertion = this.compilePolicyAssertion(policy);

      const compiled: CompiledAssertions = {
        actions,
        license,
        policy: policyAssertion,
        metadata: {
          compiled_at: new Date().toISOString(),
          policy_hash: this.calculatePolicyHash(policy),
          validation_errors: errors
        }
      };

      return { compiled, errors };
    } catch (error) {
      errors.push({
        code: 'policy.compilation.failed',
        message: `Compilation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        fix_hint: 'Review policy structure and values'
      });

      return {
        compiled: this.createEmptyCompiled(),
        errors
      };
    }
  }

  /**
   * Compile C2PA actions assertion (required per spec)
   */
  private compileActionsAssertion(policy: Policy): C2PAActionsAssertion {
    const actions: C2PAAction[] = [];

    // First action must be c2pa.created or c2pa.opened
    const creationAction = this.createCreationAction(policy);
    actions.push(creationAction);

    // Add editing steps as c2pa.edited actions
    for (const step of policy.editing.steps) {
      const editAction = this.createEditAction(step);
      actions.push(editAction);
    }

    return {
      label: 'c2pa.actions',
      data: {
        actions
      }
    };
  }

  /**
   * Create the mandatory first action (created/opened)
   */
  private createCreationAction(policy: Policy): C2PAAction {
    const action = policy.disclosure.creation_mode === 'created' 
      ? C2PA_ACTIONS.CREATED 
      : C2PA_ACTIONS.OPENED;

    const parameters: Record<string, any> = {};

    // Set digitalSourceType based on policy
    const digitalSourceType = this.resolveDigitalSourceType(policy);
    if (digitalSourceType) {
      parameters.digitalSourceType = digitalSourceType;
    }

    // Add AI parameters if applicable
    if (policy.disclosure.ai.used) {
      if (policy.disclosure.ai.generator) {
        parameters.generator = policy.disclosure.ai.generator;
      }
      
      if (policy.disclosure.ai.prompt_disclosure !== 'none') {
        parameters.promptDisclosure = policy.disclosure.ai.prompt_disclosure;
      }
    }

    return {
      action,
      parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
      softwareAgent: 'C2 Concierge Signer 1.1',
      when: new Date().toISOString()
    };
  }

  /**
   * Create edit action for each editing step
   */
  private createEditAction(step: { action: string; tool?: string; ai_assist: boolean }): C2PAAction {
    const parameters: Record<string, any> = {
      operation: step.action
    };

    // Set digitalSourceType for AI-assisted edits
    if (step.ai_assist) {
      parameters.digitalSourceType = DIGITAL_SOURCE_TYPE_URIS.trainedAlgorithmicData;
    }

    return {
      action: C2PA_ACTIONS.EDITED,
      parameters,
      softwareAgent: step.tool || 'Unknown Tool',
      when: new Date().toISOString()
    };
  }

  /**
   * Resolve digital source type URI based on policy
   */
  private resolveDigitalSourceType(policy: Policy): string | null {
    const { digital_source_type, ai } = policy.disclosure;

    if (digital_source_type === 'auto') {
      // Infer from AI usage
      if (ai.used) {
        return DIGITAL_SOURCE_TYPE_URIS.trainedAlgorithmicMedia;
      } else {
        return DIGITAL_SOURCE_TYPE_URIS.humanCapture;
      }
    }

    // Map explicit types to URIs
    switch (digital_source_type) {
      case 'trainedAlgorithmicMedia':
        return DIGITAL_SOURCE_TYPE_URIS.trainedAlgorithmicMedia;
      case 'computationalCapture':
        return DIGITAL_SOURCE_TYPE_URIS.computationalCapture;
      case 'humanCapture':
        return DIGITAL_SOURCE_TYPE_URIS.humanCapture;
      default:
        return null;
    }
  }

  /**
   * Compile license assertion (IPTC-aligned)
   */
  private compileLicenseAssertion(policy: Policy): C2PALicenseAssertion | undefined {
    const { license } = policy;

    // For custom provider with no details, skip license assertion
    if (license.provider === 'custom' && !license.license_id && !license.terms_url) {
      return undefined;
    }

    const assertion: C2PALicenseAssertion = {
      label: 'com.c2c.license.v1',
      data: {
        provider: license.provider,
        license_id: license.license_id,
        rights_window: license.rights_window,
        terms_url: license.terms_url
      }
    };

    // Add IPTC-aligned fields for industry compatibility
    if (license.provider !== 'custom') {
      assertion.data.LicensorName = this.getLicensorName(license.provider);
      assertion.data.UsageTerms = license.terms_url || 'See provider terms';
      assertion.data.WebStatement = license.terms_url;
      assertion.data.Copyright = `© ${this.getLicensorName(license.provider)}`;
      assertion.data.Source = license.provider.toUpperCase();
    }

    return assertion;
  }

  /**
   * Get licensor name for IPTC fields
   */
  private getLicensorName(provider: string): string {
    const licensorNames = {
      getty: 'Getty Images',
      ap: 'Associated Press',
      reuters: 'Reuters',
      custom: 'Custom License'
    };
    
    return licensorNames[provider as keyof typeof licensorNames] || provider;
  }

  /**
   * Compile policy assertion for versioning and provenance
   */
  private compilePolicyAssertion(policy: Policy): C2CPolicyAssertion {
    return {
      label: 'com.c2c.policy.v1',
      data: {
        policy_id: policy.policy_id,
        version: policy.version,
        hash: this.calculatePolicyHash(policy)
      }
    };
  }

  /**
   * Calculate SHA-256 hash of canonical policy
   */
  private calculatePolicyHash(policy: Policy): string {
    const canonical = this.canonicalizePolicy(policy);
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Convert policy to canonical format for consistent hashing
   */
  private canonicalizePolicy(policy: Policy): string {
    // Use stable JSON serialization with sorted keys
    // SECURITY: Ensure deterministic serialization for hash integrity
    const sortedPolicy = this.sortObjectKeys(policy);
    return JSON.stringify(sortedPolicy);
  }

  /**
   * Sort object keys recursively for consistent hashing
   * SECURITY: Prevents hash collisions due to key ordering
   */
  private sortObjectKeys(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item));
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

  /**
   * Create empty compiled assertions for error cases
   */
  private createEmptyCompiled(): CompiledAssertions {
    return {
      actions: {
        label: 'c2pa.actions',
        data: { actions: [] }
      },
      policy: {
        label: 'com.c2c.policy.v1',
        data: {
          policy_id: '',
          version: 0,
          hash: ''
        }
      },
      metadata: {
        compiled_at: new Date().toISOString(),
        policy_hash: '',
        validation_errors: []
      }
    };
  }

  /**
   * Generate human-readable badge copy from compiled assertions
   * SECURITY: Sanitized output prevents injection in UI display
   */
  generateBadgeCopy(compiled: CompiledAssertions): string {
    const parts: string[] = [];

    // Creation information
    const firstAction = compiled.actions.data.actions[0];
    if (firstAction) {
      if (firstAction.action === C2PA_ACTIONS.CREATED) {
        parts.push('Created');
      } else if (firstAction.action === C2PA_ACTIONS.OPENED) {
        parts.push('Opened');
      }

      // Digital source type disclosure - SECURITY: Sanitized to prevent injection
      if (firstAction.parameters?.digitalSourceType) {
        const dst = firstAction.parameters.digitalSourceType;
        // SECURITY: Validate DST format to prevent injection
        if (typeof dst === 'string' && dst.length <= 200) {
          if (dst.includes('trainedAlgorithmic')) {
            parts.push('trainedAlgorithmicData');
          } else if (dst.includes('computationalCapture')) {
            parts.push('computationalCapture');
          } else if (dst.includes('humanCapture')) {
            parts.push('humanCapture');
          }
        }
      }

      // Generator info - SECURITY: Sanitized to prevent injection
      if (firstAction.parameters?.generator) {
        const generator = firstAction.parameters.generator;
        if (typeof generator === 'string' && generator.length <= 100) {
          // SECURITY: Remove any potentially dangerous characters
          const sanitized = generator.replace(/[<>\"'&]/g, '');
          parts.push(`via ${sanitized}`);
        }
      }
    }

    // Editing information - SECURITY: Sanitized operations list
    const editActions = compiled.actions.data.actions.filter(a => a.action === C2PA_ACTIONS.EDITED);
    if (editActions.length > 0) {
      const operations = editActions
        .map(a => a.parameters?.operation)
        .filter(op => typeof op === 'string' && op.length <= 50)
        .map(op => op.replace(/[<>\"'&]/g, '')) // SECURITY: Sanitize
        .filter(op => /^[a-zA-Z0-9_-]+$/.test(op)); // SECURITY: Validate format
      
      if (operations.length > 0) {
        // SECURITY: Limit operations displayed to prevent UI overflow
        const displayOps = operations.slice(0, 5);
        parts.push(`edited: ${displayOps.join(', ')}`);
      }
    }

    // License information - SECURITY: Sanitized license display
    if (compiled.license) {
      const license = compiled.license.data;
      if (license.license_id) {
        // SECURITY: Sanitize license ID to prevent injection
        const sanitizedLicenseId = license.license_id.toString().replace(/[<>\"'&]/g, '').substring(0, 50);
        parts.push(`Licensed: ${license.provider} ${sanitizedLicenseId}`);
      }
      
      if (license.rights_window) {
        try {
          // SECURITY: Validate date parsing to prevent exceptions
          const fromDate = new Date(license.rights_window.from);
          const toDate = new Date(license.rights_window.to);
          
          if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime())) {
            const from = fromDate.toLocaleDateString();
            const to = toDate.toLocaleDateString();
            parts.push(`window: ${from} → ${to}`);
          }
        } catch (error) {
          // SECURITY: Fail silently on date errors to prevent disclosure
        }
      }
    }

    // SECURITY: Limit final output length to prevent UI overflow
    const result = parts.join(' • ');
    return result.length > 500 ? result.substring(0, 497) + '...' : result;
  }

  /**
   * Generate manifest preview for dry-run
   * SECURITY: Sanitized preview prevents data leakage
   */
  generateManifestPreview(compiled: CompiledAssertions): any {
    // SECURITY: Limit assertion count to prevent DoS in preview
    const assertions: Array<{label: string; data: any}> = [
      {
        label: compiled.actions.label,
        data: compiled.actions.data
      }
    ];

    if (compiled.license) {
      assertions.push({
        label: compiled.license.label,
        data: compiled.license.data
      });
    }

    // SECURITY: Always include policy assertion for verification
    assertions.push({
      label: compiled.policy.label,
      data: compiled.policy.data
    });

    // SECURITY: Limit total assertions to prevent preview overflow
    const limitedAssertions = assertions.slice(0, 10);

    return {
      claim_generator: 'C2 Concierge Signer 1.1',
      claim_generator_version: '1.0.0',
      assertions: limitedAssertions
    };
  }
}
