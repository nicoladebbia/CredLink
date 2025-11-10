/**
 * Policy Service - Unified policy management
 * Combines enterprise RBAC policies with C2PA assertion policies
 */

// Export existing enterprise policy management
import { 
  Policy, 
  PolicyCondition, 
  PolicyEvaluationResult, 
  EnterprisePolicyEngine as PolicyEngine, 
  EnterprisePolicyAPI as PolicyAPI,
  enterprisePolicyEngine as policyEngine,
  enterprisePolicyAPI as policyAPI 
} from './enterprise-policy.js';

export { 
  Policy, 
  PolicyCondition, 
  PolicyEvaluationResult, 
  EnterprisePolicyEngine, 
  EnterprisePolicyAPI,
  enterprisePolicyEngine,
  enterprisePolicyAPI 
} from './enterprise-policy.js';

// Export new C2PA policy engine
export { 
  C2PAPolicyEngine
} from './policy-engine.js';

// Export types and utilities
export { 
  Policy as C2PAPolicy,
  DryRunResult,
  PolicyDiff,
  PolicyRecord,
  CompiledAssertions,
  ValidationError,
  PolicyTemplate,
  DIGITAL_SOURCE_TYPE_URIS,
  C2PA_ACTIONS,
  POLICY_ERROR_CODES
} from './types/policy.js';

export { 
  PolicyValidator 
} from './validator/policy-validator.js';

export { 
  PolicyCompiler 
} from './compiler/policy-compiler.js';

export { 
  templateRegistry,
  TemplateRegistry 
} from './templates/template-registry.js';

// Export templates
export {
  NEWSROOM_DEFAULT_POLICY,
  NEWSROOM_DEFAULT_YAML,
  NEWSROOM_DEFAULT_METADATA
} from './templates/newsroom-default.js';

export {
  EU_ADS_DEFAULT_POLICY,
  EU_ADS_DEFAULT_YAML,
  EU_ADS_DEFAULT_METADATA
} from './templates/eu-ads-default.js';

export {
  MARKETPLACE_LISTING_DEFAULT_POLICY,
  MARKETPLACE_LISTING_DEFAULT_YAML,
  MARKETPLACE_LISTING_DEFAULT_METADATA
} from './templates/marketplace-listing-default.js';

/**
 * Unified Policy Service - combines enterprise and C2PA policies
 * SECURITY: Centralized policy management with comprehensive validation
 */
export class UnifiedPolicyService {
  constructor(
    private enterprisePolicyEngine: any,
    private c2paPolicyEngine: any
  ) {
    // SECURITY: Validate engine instances
    if (!enterprisePolicyEngine || !c2paPolicyEngine) {
      throw new Error('Invalid policy engines provided');
    }
  }

  /**
   * Evaluate enterprise policy for organizational controls
   * SECURITY: Validated evaluation with audit trail
   */
  async evaluateEnterprisePolicy(
    subject: any,
    action: any,
    resource: any,
    context: any
  ): Promise<PolicyEvaluationResult> {
    // SECURITY: Input validation
    if (!subject || !action || !resource || !context) {
      return {
        allow: false,
        reason: 'Invalid evaluation parameters',
        requires_approval: false,
        conditions_evaluated: ['invalid_input']
      };
    }

    return this.enterprisePolicyEngine.evaluatePolicy(subject, action, resource, context);
  }

  /**
   * Compile C2PA policy for assertion generation
   * SECURITY: Safe compilation with error handling
   */
  async compileC2PAPolicy(yamlContent: string, dryRun: boolean = true) {
    // SECURITY: Input validation
    if (!yamlContent || typeof yamlContent !== 'string') {
      throw new Error('Invalid YAML content provided');
    }
    
    // SECURITY: Size limit to prevent DoS
    if (yamlContent.length > 1024 * 1024) {
      throw new Error('YAML content too large');
    }

    return this.c2paPolicyEngine.compilePolicy(yamlContent, dryRun);
  }

  /**
   * Get both enterprise and C2PA policies for an organization
   * SECURITY: Validated policy retrieval
   */
  async getAllPolicies(orgId: string) {
    // SECURITY: Input validation
    if (!orgId || typeof orgId !== 'string') {
      throw new Error('Invalid organization ID');
    }
    
    // SECURITY: Format validation
    if (!/^[a-zA-Z0-9_-]+$/.test(orgId)) {
      throw new Error('Invalid organization ID format');
    }

    const enterprisePolicies = await this.enterprisePolicyEngine.getOrgPolicies(orgId);
    const c2paPolicies = this.c2paPolicyEngine.listPolicies();
    
    return {
      enterprise: enterprisePolicies,
      c2pa: c2paPolicies
    };
  }
}

// Create unified service instance
import { EnterprisePolicyEngine } from './enterprise-policy.js';
import { C2PAPolicyEngine as C2PAEngine } from './policy-engine.js';

export const unifiedPolicyService = new UnifiedPolicyService(
  new EnterprisePolicyEngine(),
  new C2PAEngine()
);
