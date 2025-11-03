/**
 * Verification Policy Engine
 * Manages and applies verification policies for C2PA manifests
 */

export interface VerificationPolicy {
  /** Policy ID */
  id: string;
  /** Policy name */
  name: string;
  /** Policy description */
  description: string;
  /** Policy version */
  version: string;
  /** Whether policy is active */
  active: boolean;
  /** Policy rules */
  rules: PolicyRule[];
  /** Policy creation timestamp */
  created_at: string;
  /** Policy last updated timestamp */
  updated_at: string;
}

export interface PolicyRule {
  /** Rule ID */
  id: string;
  /** Rule type */
  type: 'signature' | 'assertion' | 'ingredient' | 'timestamp' | 'manifest';
  /** Rule condition (expression) */
  condition: string;
  /** Rule action */
  action: 'allow' | 'deny' | 'warn';
  /** Rule severity */
  severity: 'info' | 'warning' | 'error' | 'critical';
  /** Rule description */
  description: string;
  /** Rule metadata */
  metadata?: Record<string, unknown>;
}

export interface PolicyEvaluationResult {
  /** Overall evaluation result */
  allowed: boolean;
  /** Applied rules */
  applied_rules: AppliedRule[];
  /** Warnings generated */
  warnings: string[];
  /** Errors generated */
  errors: string[];
  /** Evaluation timestamp */
  evaluated_at: string;
}

export interface AppliedRule {
  /** Rule that was applied */
  rule: PolicyRule;
  /** Whether the rule matched */
  matched: boolean;
  /** Rule result */
  result: 'allowed' | 'denied' | 'warning';
  /** Context information */
  context?: Record<string, unknown>;
}

/**
 * Verification policy engine for C2PA manifests
 */
export class VerificationPolicyEngine {
  private policies: Map<string, VerificationPolicy> = new Map();
  private activePolicies: Set<string> = new Set();

  constructor() {
    this.loadDefaultPolicies();
  }

  /**
   * Add a verification policy
   */
  addPolicy(policy: VerificationPolicy): void {
    // Validate policy
    this.validatePolicy(policy);
    
    // Add to policies
    this.policies.set(policy.id, policy);
    
    // Add to active policies if marked as active
    if (policy.active) {
      this.activePolicies.add(policy.id);
    }
  }

  /**
   * Remove a verification policy
   */
  removePolicy(policyId: string): boolean {
    const removed = this.policies.delete(policyId);
    if (removed) {
      this.activePolicies.delete(policyId);
    }
    return removed;
  }

  /**
   * Get a verification policy
   */
  getPolicy(policyId: string): VerificationPolicy | undefined {
    return this.policies.get(policyId);
  }

  /**
   * List all verification policies
   */
  listPolicies(): VerificationPolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * List active verification policies
   */
  listActivePolicies(): VerificationPolicy[] {
    return Array.from(this.activePolicies)
      .map(id => this.policies.get(id))
      .filter(policy => policy !== undefined) as VerificationPolicy[];
  }

  /**
   * Activate a policy
   */
  activatePolicy(policyId: string): boolean {
    const policy = this.policies.get(policyId);
    if (!policy) {
      return false;
    }

    policy.active = true;
    this.activePolicies.add(policyId);
    return true;
  }

  /**
   * Deactivate a policy
   */
  deactivatePolicy(policyId: string): boolean {
    const policy = this.policies.get(policyId);
    if (!policy) {
      return false;
    }

    policy.active = false;
    this.activePolicies.delete(policyId);
    return true;
  }

  /**
   * Evaluate manifest against active policies
   */
  evaluateManifest(manifest: any): PolicyEvaluationResult {
    const appliedRules: AppliedRule[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
    let allowed = true;

    // Get active policies
    const activePolicies = this.listActivePolicies();

    for (const policy of activePolicies) {
      for (const rule of policy.rules) {
        try {
          const result = this.evaluateRule(rule, manifest);
          appliedRules.push(result);

          if (result.matched) {
            switch (result.result) {
              case 'denied':
                allowed = false;
                errors.push(`Policy ${policy.id} - Rule ${rule.id}: ${rule.description}`);
                break;
              case 'warning':
                warnings.push(`Policy ${policy.id} - Rule ${rule.id}: ${rule.description}`);
                break;
              case 'allowed':
                // Rule passed, no action needed
                break;
            }
          }
        } catch (error) {
          errors.push(`Policy ${policy.id} - Rule ${rule.id}: Evaluation failed - ${error}`);
        }
      }
    }

    return {
      allowed,
      applied_rules: appliedRules,
      warnings,
      errors,
      evaluated_at: new Date().toISOString()
    };
  }

  /**
   * Evaluate a single rule against a manifest
   */
  private evaluateRule(rule: PolicyRule, manifest: any): AppliedRule {
    const context = this.buildRuleContext(rule, manifest);
    const matched = this.evaluateCondition(rule.condition, context);

    let result: 'allowed' | 'denied' | 'warning' = 'allowed';
    if (matched) {
      switch (rule.action) {
        case 'deny':
          result = 'denied';
          break;
        case 'warn':
          result = 'warning';
          break;
        case 'allow':
          result = 'allowed';
          break;
      }
    }

    return {
      rule,
      matched,
      result,
      context
    };
  }

  /**
   * Build context for rule evaluation
   */
  private buildRuleContext(rule: PolicyRule, manifest: any): Record<string, unknown> {
    const context: Record<string, unknown> = {
      manifest,
      rule_type: rule.type,
      timestamp: new Date().toISOString()
    };

    // Add specific context based on rule type
    switch (rule.type) {
      case 'signature':
        context['signature'] = manifest.claim_signature;
        context['has_signature'] = !!manifest.claim_signature;
        context['signature_algorithm'] = manifest.claim_signature?.protected?.alg;
        break;

      case 'assertion':
        context['assertions'] = manifest.assertions || [];
        context['assertion_count'] = (manifest.assertions || []).length;
        context['has_actions'] = (manifest.assertions || []).some((a: any) => a.label === 'c2pa.actions');
        break;

      case 'ingredient':
        context['ingredients'] = manifest.ingredients || [];
        context['ingredient_count'] = (manifest.ingredients || []).length;
        break;

      case 'timestamp':
        context['timestamp'] = manifest.timestamp;
        context['has_timestamp'] = !!manifest.timestamp;
        break;

      case 'manifest':
        context['manifest_hash'] = manifest.manifest_hash;
        context['claim_generator'] = manifest.claim_generator;
        context['version'] = manifest.claim_generator_version;
        break;
    }

    return context;
  }

  /**
   * Evaluate rule condition
   */
  private evaluateCondition(condition: string, context: Record<string, unknown>): boolean {
    try {
      // Simple condition evaluator - in production, use a proper expression engine
      // This is a simplified implementation for demonstration

      // Replace common patterns
      let evalCondition = condition
        .replace(/has_signature/g, String(context['has_signature']))
        .replace(/has_timestamp/g, String(context['has_timestamp']))
        .replace(/has_actions/g, String(context['has_actions']))
        .replace(/assertion_count/g, String(context['assertion_count']))
        .replace(/ingredient_count/g, String(context['ingredient_count']));

      // Evaluate simple expressions
      if (evalCondition.includes('==')) {
        const parts = evalCondition.split('==').map(p => p.trim());
        return parts[0] === parts[1];
      }

      if (evalCondition.includes('!=')) {
        const parts = evalCondition.split('!=').map(p => p.trim());
        return parts[0] !== parts[1];
      }

      if (evalCondition.includes('>')) {
        const parts = evalCondition.split('>').map(p => p.trim());
        return Number(parts[0]) > Number(parts[1]);
      }

      if (evalCondition.includes('<')) {
        const parts = evalCondition.split('<').map(p => p.trim());
        return Number(parts[0]) < Number(parts[1]);
      }

      if (evalCondition.includes('>=')) {
        const parts = evalCondition.split('>=').map(p => p.trim());
        return Number(parts[0]) >= Number(parts[1]);
      }

      if (evalCondition.includes('<=')) {
        const parts = evalCondition.split('<=').map(p => p.trim());
        return Number(parts[0]) <= Number(parts[1]);
      }

      // Simple boolean evaluation
      return evalCondition === 'true';
    } catch (error) {
      throw new Error(`Condition evaluation failed: ${error}`);
    }
  }

  /**
   * Validate a verification policy
   */
  private validatePolicy(policy: VerificationPolicy): void {
    if (!policy.id || typeof policy.id !== 'string') {
      throw new Error('Policy ID is required and must be a string');
    }

    if (!policy.name || typeof policy.name !== 'string') {
      throw new Error('Policy name is required and must be a string');
    }

    if (!policy.version || typeof policy.version !== 'string') {
      throw new Error('Policy version is required and must be a string');
    }

    if (!Array.isArray(policy.rules)) {
      throw new Error('Policy rules must be an array');
    }

    if (policy.rules.length === 0) {
      throw new Error('Policy must have at least one rule');
    }

    // Validate each rule
    for (const rule of policy.rules) {
      this.validateRule(rule);
    }
  }

  /**
   * Validate a policy rule
   */
  private validateRule(rule: PolicyRule): void {
    if (!rule.id || typeof rule.id !== 'string') {
      throw new Error('Rule ID is required and must be a string');
    }

    if (!rule.condition || typeof rule.condition !== 'string') {
      throw new Error('Rule condition is required and must be a string');
    }

    if (!['allow', 'deny', 'warn'].includes(rule.action)) {
      throw new Error('Rule action must be one of: allow, deny, warn');
    }

    if (!['info', 'warning', 'error', 'critical'].includes(rule.severity)) {
      throw new Error('Rule severity must be one of: info, warning, error, critical');
    }

    if (!['signature', 'assertion', 'ingredient', 'timestamp', 'manifest'].includes(rule.type)) {
      throw new Error('Rule type must be one of: signature, assertion, ingredient, timestamp, manifest');
    }
  }

  /**
   * Load default verification policies
   */
  private loadDefaultPolicies(): void {
    // Basic signature verification policy
    const signaturePolicy: VerificationPolicy = {
      id: 'basic-signature-verification',
      name: 'Basic Signature Verification',
      description: 'Ensures manifests have valid cryptographic signatures',
      version: '1.0.0',
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      rules: [
        {
          id: 'require-signature',
          type: 'signature',
          condition: 'has_signature == true',
          action: 'deny',
          severity: 'error',
          description: 'Manifest must have a signature'
        },
        {
          id: 'require-valid-algorithm',
          type: 'signature',
          condition: 'signature_algorithm == "ES256" || signature_algorithm == "RS256"',
          action: 'warn',
          severity: 'warning',
          description: 'Signature should use a supported algorithm'
        }
      ]
    };

    // Basic assertion verification policy
    const assertionPolicy: VerificationPolicy = {
      id: 'basic-assertion-verification',
      name: 'Basic Assertion Verification',
      description: 'Ensures manifests have required assertions',
      version: '1.0.0',
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      rules: [
        {
          id: 'require-actions',
          type: 'assertion',
          condition: 'has_actions == true',
          action: 'deny',
          severity: 'error',
          description: 'Manifest must have c2pa.actions assertion'
        },
        {
          id: 'limit-assertions',
          type: 'assertion',
          condition: 'assertion_count <= 100',
          action: 'warn',
          severity: 'warning',
          description: 'Manifest should not have too many assertions'
        }
      ]
    };

    // Basic timestamp verification policy
    const timestampPolicy: VerificationPolicy = {
      id: 'basic-timestamp-verification',
      name: 'Basic Timestamp Verification',
      description: 'Ensures manifests have valid timestamps',
      version: '1.0.0',
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      rules: [
        {
          id: 'require-timestamp',
          type: 'timestamp',
          condition: 'has_timestamp == true',
          action: 'deny',
          severity: 'error',
          description: 'Manifest must have a timestamp'
        }
      ]
    };

    this.addPolicy(signaturePolicy);
    this.addPolicy(assertionPolicy);
    this.addPolicy(timestampPolicy);
  }

  /**
   * Get policy statistics
   */
  getStatistics(): {
    totalPolicies: number;
    activePolicies: number;
    totalRules: number;
    policyTypes: Record<string, number>;
  } {
    const policies = Array.from(this.policies.values());
    const policyTypes: Record<string, number> = {};
    let totalRules = 0;

    for (const policy of policies) {
      totalRules += policy.rules.length;
      
      for (const rule of policy.rules) {
        policyTypes[rule.type] = (policyTypes[rule.type] || 0) + 1;
      }
    }

    return {
      totalPolicies: policies.length,
      activePolicies: this.activePolicies.size,
      totalRules,
      policyTypes
    };
  }

  /**
   * Export policies to JSON
   */
  exportToJSON(): string {
    const policies = Array.from(this.policies.values());
    return JSON.stringify(policies, null, 2);
  }

  /**
   * Import policies from JSON
   */
  importFromJSON(json: string): void {
    try {
      const policies = JSON.parse(json) as VerificationPolicy[];
      
      for (const policy of policies) {
        this.addPolicy(policy);
      }
    } catch (error) {
      throw new Error(`Failed to import policies: ${error}`);
    }
  }
}
