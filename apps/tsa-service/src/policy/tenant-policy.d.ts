/**
 * Per-Tenant TSA Policy Model
 * Declarative, auditable configuration with validation
 * Security-hardened with comprehensive input validation and audit logging
 */
import { TenantTSAPolicy, TrustAnchor } from '../types/rfc3161.js';
export interface PolicyAuditEntry {
    tenantId: string;
    action: string;
    timestamp: Date;
    details?: Record<string, unknown>;
}
export interface PolicyValidationError {
    /** Field path where error occurred */
    field: string;
    /** Human-readable error message */
    message: string;
    /** Error severity level */
    severity: 'error' | 'warning';
    /** Optional error code for programmatic handling */
    code?: string;
    /** Timestamp when error was detected */
    timestamp?: Date;
}
export interface PolicyValidationResult {
    /** Overall validation status */
    valid: boolean;
    /** List of validation errors */
    errors: PolicyValidationError[];
    /** List of validation warnings */
    warnings: PolicyValidationError[];
    /** Validation timestamp */
    validatedAt: Date;
    /** Policy fingerprint for integrity checking */
    fingerprint?: string;
}
export declare class TenantPolicyManager {
    private policies;
    private policyHistory;
    private static readonly MAX_HISTORY_SIZE;
    private static readonly MAX_TENANT_ID_LENGTH;
    private static readonly MIN_TENANT_ID_LENGTH;
    private static readonly VALID_TENANT_ID_PATTERN;
    private auditLog;
    /**
     * Load tenant policy from configuration with enhanced security
     */
    loadPolicy(tenantId: string): Promise<TenantTSAPolicy | null>;
    /**
     * Save tenant policy with comprehensive validation and audit logging
     */
    savePolicy(tenantId: string, policy: TenantTSAPolicy): Promise<PolicyValidationResult>;
    /**
     * Validate tenant policy against comprehensive security requirements
     */
    validatePolicy(policy: TenantTSAPolicy): PolicyValidationResult;
    /**
     * Validate trust anchor configuration with enhanced security
     */
    private validateTrustAnchor;
    /**
     * Check if policy accepts specific provider and policy OID
     */
    isPolicyAccepted(tenantId: string, providerId: string, policyOid: string): boolean;
    /**
     * Get trust anchors for tenant
     */
    getTrustAnchors(tenantId: string): TrustAnchor[];
    /**
     * Get routing priority for tenant
     */
    getRoutingPriority(tenantId: string): string[];
    /**
     * Get SLA for tenant
     */
    getSLA(tenantId: string): TenantTSAPolicy['sla'] | null;
    /**
     * Get policy history for audit
     */
    getPolicyHistory(tenantId: string): TenantTSAPolicy[];
    /**
     * Create default policy for new tenant
     */
    private createDefaultPolicy;
    /**
     * Validate OID format with enhanced security
     */
    private isValidOID;
    /**
     * Validate tenant ID format with security restrictions
     */
    private validateTenantId;
    /**
     * Validate policy integrity with checksum verification
     */
    private validatePolicyIntegrity;
    /**
     * Generate policy fingerprint for integrity tracking
     */
    private generatePolicyFingerprint;
    /**
     * Log audit events for security and compliance
     */
    private logAuditEvent;
    /**
     * Get audit log for tenant (admin only)
     */
    getAuditLog(tenantId?: string): PolicyAuditEntry[];
    /**
     * Get all tenant policies (for admin)
     */
    getAllPolicies(): Map<string, TenantTSAPolicy>;
    /**
     * Delete tenant policy
     */
    deletePolicy(tenantId: string): Promise<boolean>;
    /**
     * Export policy for audit
     */
    exportPolicy(tenantId: string): {
        policy: TenantTSAPolicy | null;
        history: TenantTSAPolicy[];
        exportedAt: string;
        exportedBy: string;
    };
}
//# sourceMappingURL=tenant-policy.d.ts.map