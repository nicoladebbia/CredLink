/**
 * Verification Policy Engine
 * Manages and applies verification policies for C2PA manifests
 * Enhanced with strict validation and security controls
 */
import { C2PAManifest } from '../types/index.js';
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
export declare class VerificationPolicyEngine {
    private static readonly MAX_POLICIES;
    private static readonly MAX_RULES_PER_POLICY;
    private static readonly MAX_CONDITION_LENGTH;
    private static readonly ALLOWED_OPERATORS;
    private policies;
    private activePolicies;
    constructor();
    /**
     * Add a verification policy
     */
    addPolicy(policy: VerificationPolicy): void;
    /**
     * Remove a verification policy
     */
    removePolicy(policyId: string): boolean;
    /**
     * Get a verification policy
     */
    getPolicy(policyId: string): VerificationPolicy | undefined;
    /**
     * List all verification policies
     */
    listPolicies(): VerificationPolicy[];
    /**
     * List active verification policies
     */
    listActivePolicies(): VerificationPolicy[];
    /**
     * Activate a policy
     */
    activatePolicy(policyId: string): boolean;
    /**
     * Deactivate a policy
     */
    deactivatePolicy(policyId: string): boolean;
    /**
     * Evaluate manifest against active policies
     */
    evaluateManifest(manifest: C2PAManifest): PolicyEvaluationResult;
    /**
     * Evaluate a single rule against a manifest
     */
    private evaluateRule;
    /**
     * Build context for rule evaluation
     */
    private buildRuleContext;
    /**
     * Validate timestamp format
     */
    private isValidTimestamp;
    /**
     * Evaluate rule condition
     */
    private evaluateCondition;
    /**
     * Validate operator usage
     */
    private isValidOperatorUsage;
    /**
     * Replace context variables safely
     */
    private replaceContextVariables;
    /**
     * Evaluate simple expressions safely
     */
    private evaluateSimpleExpression;
    /**
     * Validate a verification policy
     */
    private validatePolicy;
    /**
     * Validate a policy rule
     */
    private validateRule;
    /**
     * Load default verification policies
     */
    private loadDefaultPolicies;
    /**
     * Get policy statistics
     */
    getStatistics(): {
        totalPolicies: number;
        activePolicies: number;
        totalRules: number;
        policyTypes: Record<string, number>;
    };
    /**
     * Export policies to JSON
     */
    exportToJSON(): string;
    /**
     * Import policies from JSON
     */
    importFromJSON(json: string): void;
}
//# sourceMappingURL=verification-policy.d.ts.map