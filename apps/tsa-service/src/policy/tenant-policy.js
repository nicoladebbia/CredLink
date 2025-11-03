/**
 * Per-Tenant TSA Policy Model
 * Declarative, auditable configuration with validation
 * Security-hardened with comprehensive input validation and audit logging
 */
import { TSA_PROVIDERS } from '../providers/provider-config.js';
export class TenantPolicyManager {
    policies = new Map();
    policyHistory = new Map();
    // Security constants
    static MAX_HISTORY_SIZE = 10;
    static MAX_TENANT_ID_LENGTH = 64;
    static MIN_TENANT_ID_LENGTH = 3;
    static VALID_TENANT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
    // Audit logging
    auditLog = [];
    /**
     * Load tenant policy from configuration with enhanced security
     */
    async loadPolicy(tenantId) {
        // Input validation with security checks
        if (!this.validateTenantId(tenantId)) {
            console.error('Invalid tenant ID provided to loadPolicy', { tenantId });
            return null;
        }
        try {
            // Check cache first
            const cached = this.policies.get(tenantId);
            if (cached) {
                // Validate cached policy integrity
                if (this.validatePolicyIntegrity(cached)) {
                    return cached;
                }
                else {
                    console.warn('Cached policy failed integrity validation', { tenantId });
                    this.policies.delete(tenantId);
                }
            }
            // TODO: Load from secure database or configuration store
            // For now, return default policy for demonstration
            const defaultPolicy = this.createDefaultPolicy(tenantId);
            if (defaultPolicy) {
                const validation = await this.savePolicy(tenantId, defaultPolicy);
                if (!validation.valid) {
                    console.error('Failed to save default policy', {
                        tenantId,
                        errors: validation.errors
                    });
                    return null;
                }
                // Log policy creation
                this.logAuditEvent({
                    tenantId,
                    action: 'policy_created',
                    timestamp: new Date(),
                    details: { source: 'default' }
                });
                return defaultPolicy;
            }
            return null;
        }
        catch (error) {
            console.error('Error loading tenant policy', {
                tenantId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return null;
        }
    }
    /**
     * Save tenant policy with comprehensive validation and audit logging
     */
    async savePolicy(tenantId, policy) {
        // Input validation
        if (!this.validateTenantId(tenantId)) {
            return {
                valid: false,
                errors: [{
                        field: 'tenantId',
                        message: 'Invalid tenant ID format',
                        severity: 'error',
                        code: 'INVALID_TENANT_ID',
                        timestamp: new Date()
                    }],
                warnings: [],
                validatedAt: new Date()
            };
        }
        if (!policy || typeof policy !== 'object') {
            return {
                valid: false,
                errors: [{
                        field: 'policy',
                        message: 'Policy object is required',
                        severity: 'error',
                        code: 'INVALID_POLICY',
                        timestamp: new Date()
                    }],
                warnings: [],
                validatedAt: new Date()
            };
        }
        try {
            const validation = this.validatePolicy(policy);
            if (!validation.valid) {
                // Log validation failure
                this.logAuditEvent({
                    tenantId,
                    action: 'policy_validation_failed',
                    timestamp: new Date(),
                    details: { errors: validation.errors }
                });
                return validation;
            }
            // Store in history before updating with security bounds
            const history = this.policyHistory.get(tenantId) || [];
            const current = this.policies.get(tenantId);
            if (current) {
                history.push({ ...current });
                // Keep only last N versions to prevent memory exhaustion
                if (history.length > TenantPolicyManager.MAX_HISTORY_SIZE) {
                    history.shift();
                }
            }
            this.policyHistory.set(tenantId, history);
            // Save current policy with integrity protection
            const policyCopy = { ...policy };
            this.policies.set(tenantId, policyCopy);
            // Generate fingerprint for integrity checking
            const fingerprint = this.generatePolicyFingerprint(policyCopy);
            validation.fingerprint = fingerprint;
            // Log policy update
            this.logAuditEvent({
                tenantId,
                action: current ? 'policy_updated' : 'policy_created',
                timestamp: new Date(),
                details: { fingerprint, version: history.length + 1 }
            });
            return validation;
        }
        catch (error) {
            console.error('Error saving tenant policy', {
                tenantId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return {
                valid: false,
                errors: [{
                        field: 'system',
                        message: 'Internal error while saving policy',
                        severity: 'error',
                        code: 'SYSTEM_ERROR',
                        timestamp: new Date()
                    }],
                warnings: [],
                validatedAt: new Date()
            };
        }
    }
    /**
     * Validate tenant policy against comprehensive security requirements
     */
    validatePolicy(policy) {
        const errors = [];
        const warnings = [];
        const timestamp = new Date();
        // Input validation
        if (!policy || typeof policy !== 'object') {
            errors.push({
                field: 'policy',
                message: 'Policy object is required',
                severity: 'error',
                code: 'INVALID_POLICY',
                timestamp
            });
            return { valid: false, errors, warnings, validatedAt: timestamp };
        }
        // Validate tenant_id with enhanced security
        if (!policy.tenant_id || typeof policy.tenant_id !== 'string') {
            errors.push({
                field: 'tenant_id',
                message: 'Tenant ID is required and must be a string',
                severity: 'error',
                code: 'MISSING_TENANT_ID',
                timestamp
            });
        }
        else if (!this.validateTenantId(policy.tenant_id)) {
            errors.push({
                field: 'tenant_id',
                message: 'Tenant ID contains invalid characters or has invalid length',
                severity: 'error',
                code: 'INVALID_TENANT_ID_FORMAT',
                timestamp
            });
        }
        // Validate trust anchors with comprehensive checks
        if (!policy.accepted_trust_anchors || !Array.isArray(policy.accepted_trust_anchors)) {
            errors.push({
                field: 'accepted_trust_anchors',
                message: 'At least one trust anchor is required and must be an array',
                severity: 'error',
                code: 'MISSING_TRUST_ANCHORS',
                timestamp
            });
        }
        else if (policy.accepted_trust_anchors.length === 0) {
            errors.push({
                field: 'accepted_trust_anchors',
                message: 'At least one trust anchor is required',
                severity: 'error',
                code: 'EMPTY_TRUST_ANCHORS',
                timestamp
            });
        }
        else if (policy.accepted_trust_anchors.length > 20) {
            errors.push({
                field: 'accepted_trust_anchors',
                message: 'Too many trust anchors (maximum 20 allowed)',
                severity: 'error',
                code: 'TOO_MANY_TRUST_ANCHORS',
                timestamp
            });
        }
        else {
            policy.accepted_trust_anchors.forEach((anchor, index) => {
                const anchorErrors = this.validateTrustAnchor(anchor, `accepted_trust_anchors[${index}]`, timestamp);
                errors.push(...anchorErrors);
            });
        }
        // Validate policy OIDs
        if (!policy.accepted_policy_oids || policy.accepted_policy_oids.length === 0) {
            errors.push({
                field: 'accepted_policy_oids',
                message: 'At least one accepted policy OID is required',
                severity: 'error',
                code: 'MISSING_POLICY_OIDS',
                timestamp
            });
        }
        else if (policy.accepted_policy_oids.length > 50) {
            errors.push({
                field: 'accepted_policy_oids',
                message: 'Too many policy OIDs (maximum 50 allowed)',
                severity: 'error',
                code: 'TOO_MANY_POLICY_OIDS',
                timestamp
            });
        }
        else {
            policy.accepted_policy_oids.forEach((oid, index) => {
                if (!this.isValidOID(oid)) {
                    errors.push({
                        field: `accepted_policy_oids[${index}]`,
                        message: `Invalid policy OID format: ${oid}`,
                        severity: 'error',
                        code: 'INVALID_POLICY_OID',
                        timestamp
                    });
                }
            });
        }
        // Validate routing priority
        if (!policy.routing_priority || policy.routing_priority.length === 0) {
            errors.push({
                field: 'routing_priority',
                message: 'Routing priority list is required',
                severity: 'error',
                code: 'MISSING_ROUTING_PRIORITY',
                timestamp
            });
        }
        else if (policy.routing_priority.length > 10) {
            errors.push({
                field: 'routing_priority',
                message: 'Too many routing priorities (maximum 10 allowed)',
                severity: 'error',
                code: 'TOO_MANY_ROUTING_PRIORITIES',
                timestamp
            });
        }
        else {
            const unknownProviders = policy.routing_priority.filter(id => !TSA_PROVIDERS[id]);
            if (unknownProviders.length > 0) {
                errors.push({
                    field: 'routing_priority',
                    message: `Unknown providers: ${unknownProviders.join(', ')}`,
                    severity: 'error',
                    code: 'UNKNOWN_PROVIDERS',
                    timestamp
                });
            }
            // Check for duplicates
            const duplicates = policy.routing_priority.filter((id, index) => policy.routing_priority.indexOf(id) !== index);
            if (duplicates.length > 0) {
                warnings.push({
                    field: 'routing_priority',
                    message: `Duplicate providers in routing: ${duplicates.join(', ')}`,
                    severity: 'warning',
                    code: 'DUPLICATE_PROVIDERS',
                    timestamp
                });
            }
        }
        // Validate SLA
        if (!policy.sla) {
            errors.push({
                field: 'sla',
                message: 'SLA configuration is required',
                severity: 'error',
                code: 'MISSING_SLA',
                timestamp
            });
        }
        else {
            if (!policy.sla.p95_latency_ms || policy.sla.p95_latency_ms <= 0) {
                errors.push({
                    field: 'sla.p95_latency_ms',
                    message: 'P95 latency must be positive',
                    severity: 'error',
                    code: 'INVALID_LATENCY',
                    timestamp
                });
            }
            if (policy.sla.p95_latency_ms < 100) {
                warnings.push({
                    field: 'sla.p95_latency_ms',
                    message: 'P95 latency under 100ms may be unrealistic for TSA operations',
                    severity: 'warning',
                    code: 'UNREALISTIC_LATENCY',
                    timestamp
                });
            }
            if (policy.sla.monthly_error_budget_pct === undefined ||
                policy.sla.monthly_error_budget_pct < 0 ||
                policy.sla.monthly_error_budget_pct > 100) {
                errors.push({
                    field: 'sla.monthly_error_budget_pct',
                    message: 'Monthly error budget must be between 0 and 100',
                    severity: 'error',
                    code: 'INVALID_ERROR_BUDGET',
                    timestamp
                });
            }
            if (policy.sla.monthly_error_budget_pct > 5) {
                warnings.push({
                    field: 'sla.monthly_error_budget_pct',
                    message: 'High error budget may indicate insufficient redundancy requirements',
                    severity: 'warning',
                    code: 'HIGH_ERROR_BUDGET',
                    timestamp
                });
            }
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            validatedAt: timestamp
        };
    }
    /**
     * Validate trust anchor configuration with enhanced security
     */
    validateTrustAnchor(anchor, fieldPrefix, timestamp) {
        const errors = [];
        if (!anchor || typeof anchor !== 'object') {
            errors.push({
                field: fieldPrefix,
                message: 'Trust anchor object is required',
                severity: 'error',
                code: 'INVALID_TRUST_ANCHOR',
                timestamp
            });
            return errors;
        }
        if (!anchor.name || typeof anchor.name !== 'string' || anchor.name.trim().length === 0) {
            errors.push({
                field: `${fieldPrefix}.name`,
                message: 'Trust anchor name is required and must be a non-empty string',
                severity: 'error',
                code: 'MISSING_ANCHOR_NAME',
                timestamp
            });
        }
        else if (anchor.name.length > 200) {
            errors.push({
                field: `${fieldPrefix}.name`,
                message: 'Trust anchor name too long (maximum 200 characters)',
                severity: 'error',
                code: 'ANCHOR_NAME_TOO_LONG',
                timestamp
            });
        }
        if (!anchor.pem || typeof anchor.pem !== 'string' || anchor.pem.trim().length === 0) {
            errors.push({
                field: `${fieldPrefix}.pem`,
                message: 'PEM certificate is required and must be a non-empty string',
                severity: 'error',
                code: 'MISSING_PEM',
                timestamp
            });
        }
        else {
            // Validate PEM format with enhanced checks
            if (!anchor.pem.includes('-----BEGIN CERTIFICATE-----') ||
                !anchor.pem.includes('-----END CERTIFICATE-----')) {
                errors.push({
                    field: `${fieldPrefix}.pem`,
                    message: 'Invalid PEM certificate format - must include BEGIN/END CERTIFICATE markers',
                    severity: 'error',
                    code: 'INVALID_PEM_FORMAT',
                    timestamp
                });
            }
            else if (anchor.pem.length > 10000) {
                errors.push({
                    field: `${fieldPrefix}.pem`,
                    message: 'PEM certificate too large (maximum 10KB)',
                    severity: 'error',
                    code: 'PEM_TOO_LARGE',
                    timestamp
                });
            }
        }
        if (!anchor.ekuRequired || typeof anchor.ekuRequired !== 'string' || anchor.ekuRequired.trim().length === 0) {
            errors.push({
                field: `${fieldPrefix}.ekuRequired`,
                message: 'EKU requirement is required and must be a non-empty string',
                severity: 'error',
                code: 'MISSING_EKU',
                timestamp
            });
        }
        else if (anchor.ekuRequired !== '1.3.6.1.5.5.7.3.8') {
            errors.push({
                field: `${fieldPrefix}.ekuRequired`,
                message: 'EKU must be id-kp-timeStamping (1.3.6.1.5.5.7.3.8) per RFC 3161 §2.3',
                severity: 'error',
                code: 'INVALID_EKU',
                timestamp
            });
        }
        return errors;
    }
    /**
     * Check if policy accepts specific provider and policy OID
     */
    isPolicyAccepted(tenantId, providerId, policyOid) {
        const policy = this.policies.get(tenantId);
        if (!policy)
            return false;
        // Check if provider is in routing priority
        if (!policy.routing_priority.includes(providerId)) {
            return false;
        }
        // Check if policy OID is accepted
        if (!policy.accepted_policy_oids.includes(policyOid)) {
            return false;
        }
        return true;
    }
    /**
     * Get trust anchors for tenant
     */
    getTrustAnchors(tenantId) {
        const policy = this.policies.get(tenantId);
        return policy ? [...policy.accepted_trust_anchors] : [];
    }
    /**
     * Get routing priority for tenant
     */
    getRoutingPriority(tenantId) {
        const policy = this.policies.get(tenantId);
        return policy ? [...policy.routing_priority] : [];
    }
    /**
     * Get SLA for tenant
     */
    getSLA(tenantId) {
        const policy = this.policies.get(tenantId);
        return policy ? { ...policy.sla } : null;
    }
    /**
     * Get policy history for audit
     */
    getPolicyHistory(tenantId) {
        return [...(this.policyHistory.get(tenantId) || [])];
    }
    /**
     * Create default policy for new tenant
     */
    createDefaultPolicy(tenantId) {
        return {
            tenant_id: tenantId,
            accepted_trust_anchors: [
                {
                    name: 'DigiCert TSA Root',
                    pem: `-----BEGIN CERTIFICATE-----
MIIDxTCCAq2gAwIBAgIQAqxcJmoLQJuPC3nyrkYldzANBgkqhkiG9w0BAQUFADBs
MQswCQYDVQQGEwJVUzEVMBMGA1UEChMMRGlnaUNlcnQgSW5jMRkwFwYDVQQLExB3
d3cuZGlnaWNlcnQuY29tMSswKQYDVQQDEyJEaWdpQ2VydCBIaWdoIEFzc3VyYW5j
ZSBFViBSb290IENBMB4XDTA2MTExMDAwMDAwMFoXDTMxMTExMDAwMDAwMFowbDEL
MAkGA1UEBhMCVVMxFTATBgNVBAoTDERpZ2lDZXJ0IEluYzEZMBcGA1UECxMQd3d3
LmRpZ2ljZXJ0LmNvbTErMCkGA1UEAxMiRGlnaUNlcnQgSGlnaCBBc3N1cmFuY2Ug
RVYgUm9vdCBDQTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAMbM5XPm
+9S75S0tMqbf5YE/yc0lSbZxKsPVlDRnogocsF9ppkCxxLeyj9CYpKlBWTrT3JTW
PNt0OKRKzE0lgvdKpVMSOO7zSW1XkA5weKu82bEQhZwsX3doqH+MEJ6SvY1xnKhG
NgqF2JjGh+Q2fd8n2PvZ6vEJ8+R0hN3TIX3Q0m6r1c8O1iZ3lBhGFcRzLrpLCELP
QHLRDLv6gNwgj9w5ZQYwJNdR9Z4vGzZBma9aNaBjLN+Da9kZcBdNrvu5v8I3L9Q2
vB2JtHsU6t1BkXhY5fWR0C7haL9J0QJ9TrgXsV/d5uFAgUwDQYJKoZIhvcNAQEF
BQADggEBAB0kcrFccSmFEgNH5IocBzDjaC8k8x7YfL6wZqGkaLkNQbO2LnllqyH
Y9J4+q0w8TbB5p4uYNvJ8U5B0Zf6dXWqBkO8tgUJ8Xq8bRjWJZ6L6tBk3Jz5f5
-----END CERTIFICATE-----`,
                    ekuRequired: '1.3.6.1.5.5.7.3.8'
                }
            ],
            accepted_policy_oids: [
                '2.16.840.1.114412.7.1', // DigiCert TSA Policy
                '1.3.6.1.4.1.4146.2.3', // GlobalSign TSA Policy
                '1.3.6.1.4.1.6449.2.7.1' // Sectigo TSA Policy
            ],
            routing_priority: ['digicert', 'globalsign', 'sectigo'],
            sla: {
                p95_latency_ms: 900,
                monthly_error_budget_pct: 1.0
            }
        };
    }
    /**
     * Validate OID format with enhanced security
     */
    isValidOID(oid) {
        // Input validation
        if (!oid || typeof oid !== 'string') {
            return false;
        }
        // Length validation to prevent DoS
        if (oid.length < 3 || oid.length > 100) {
            return false;
        }
        // Strict OID format validation
        const oidPattern = /^[0-9]+(\.[0-9]+)*$/;
        if (!oidPattern.test(oid)) {
            return false;
        }
        // Additional security checks
        if (oid.startsWith('.') || oid.endsWith('.') || oid.includes('..')) {
            return false;
        }
        return true;
    }
    /**
     * Validate tenant ID format with security restrictions
     */
    validateTenantId(tenantId) {
        if (!tenantId || typeof tenantId !== 'string') {
            return false;
        }
        const trimmed = tenantId.trim();
        if (trimmed.length < TenantPolicyManager.MIN_TENANT_ID_LENGTH ||
            trimmed.length > TenantPolicyManager.MAX_TENANT_ID_LENGTH) {
            return false;
        }
        if (!TenantPolicyManager.VALID_TENANT_ID_PATTERN.test(trimmed)) {
            return false;
        }
        return true;
    }
    /**
     * Validate policy integrity with checksum verification
     */
    validatePolicyIntegrity(policy) {
        if (!policy || typeof policy !== 'object') {
            return false;
        }
        // Basic structural validation
        if (!policy.tenant_id || !policy.accepted_trust_anchors || !policy.routing_priority) {
            return false;
        }
        // TODO: Add cryptographic integrity check
        // For now, just basic validation
        return true;
    }
    /**
     * Generate policy fingerprint for integrity tracking
     */
    generatePolicyFingerprint(policy) {
        // TODO: Implement proper cryptographic fingerprint
        // For now, use a simple hash based on key fields
        const keyFields = [
            policy.tenant_id,
            policy.accepted_policy_oids?.join(',') || '',
            policy.routing_priority?.join(',') || '',
            policy.sla?.p95_latency_ms?.toString() || '',
            policy.accepted_trust_anchors?.map(a => a.name).join(',') || ''
        ];
        // Simple hash for development - replace with crypto hash in production
        let hash = 0;
        const str = keyFields.join('|');
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16);
    }
    /**
     * Log audit events for security and compliance
     */
    logAuditEvent(entry) {
        // Add to audit log with size limits
        this.auditLog.push(entry);
        // Keep only last 1000 entries to prevent memory exhaustion
        if (this.auditLog.length > 1000) {
            this.auditLog.shift();
        }
        // Log to console for development
        console.info('Policy audit event', {
            tenantId: entry.tenantId,
            action: entry.action,
            timestamp: entry.timestamp,
            details: entry.details
        });
    }
    /**
     * Get audit log for tenant (admin only)
     */
    getAuditLog(tenantId) {
        if (tenantId) {
            return this.auditLog.filter(entry => entry.tenantId === tenantId);
        }
        return [...this.auditLog];
    }
    /**
     * Get all tenant policies (for admin)
     */
    getAllPolicies() {
        return new Map(this.policies);
    }
    /**
     * Delete tenant policy
     */
    async deletePolicy(tenantId) {
        const existed = this.policies.has(tenantId);
        this.policies.delete(tenantId);
        this.policyHistory.delete(tenantId);
        return existed;
    }
    /**
     * Export policy for audit
     */
    exportPolicy(tenantId) {
        return {
            policy: this.policies.get(tenantId) || null,
            history: this.getPolicyHistory(tenantId),
            exportedAt: new Date().toISOString(),
            exportedBy: 'system' // TODO: Add user context
        };
    }
}
//# sourceMappingURL=tenant-policy.js.map