/**
 * Authentication and Authorization Manager
 * Secure tenant validation and API key management
 * Implements zero-trust security principles with comprehensive validation
 */
export class AuthenticationManager {
    tenants = new Map();
    apiKeys = new Map(); // apiKey -> tenantId
    rateLimitUsage = new Map();
    failedAttempts = new Map();
    // Security thresholds
    MAX_FAILED_ATTEMPTS = 5;
    FAILED_ATTEMPT_WINDOW = 15 * 60 * 1000; // 15 minutes
    CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
    constructor() {
        this.initializeTenants();
        this.startCleanupTimer();
    }
    /**
     * Authenticate request using API key with enhanced security
     * Implements rate limiting, attempt tracking, and comprehensive validation
     */
    async authenticateRequest(apiKey) {
        // Input validation with type checking
        if (!apiKey || typeof apiKey !== 'string') {
            return {
                success: false,
                error: 'API key is required and must be a string'
            };
        }
        // Check for suspicious patterns
        if (apiKey.length > 100 || /[<>"'\\]/.test(apiKey)) {
            console.warn('Suspicious API key pattern detected', {
                keyLength: apiKey.length,
                keyPattern: apiKey.replace(/./g, '*')
            });
            return {
                success: false,
                error: 'Invalid API key format'
            };
        }
        // Check failed attempts to prevent brute force
        const clientKey = this.getClientKey(apiKey);
        if (this.isRateLimitedForFailures(clientKey)) {
            return {
                success: false,
                error: 'Too many failed attempts. Please try again later.'
            };
        }
        // Validate API key format strictly
        if (!/^tsa_ak_[a-fA-F0-9]{32}$/.test(apiKey)) {
            this.recordFailedAttempt(clientKey);
            return {
                success: false,
                error: 'Invalid API key format'
            };
        }
        const tenantId = this.apiKeys.get(apiKey);
        if (!tenantId) {
            this.recordFailedAttempt(clientKey);
            return {
                success: false,
                error: 'Invalid API key'
            };
        }
        const tenant = this.tenants.get(tenantId);
        if (!tenant) {
            this.recordFailedAttempt(clientKey);
            return {
                success: false,
                error: 'Tenant not found'
            };
        }
        // Enhanced tenant validation
        if (!this.isTenantActive(tenant)) {
            this.recordFailedAttempt(clientKey);
            return {
                success: false,
                error: 'Tenant account is suspended'
            };
        }
        // Validate tenant configuration integrity
        if (!this.validateTenantIntegrity(tenant)) {
            console.error('Tenant integrity validation failed', { tenantId });
            this.recordFailedAttempt(clientKey);
            return {
                success: false,
                error: 'Tenant configuration error'
            };
        }
        // Clear failed attempts on successful authentication
        this.clearFailedAttempts(clientKey);
        return {
            success: true,
            tenant
        };
    }
    /**
     * Check rate limiting for tenant with enhanced tracking
     */
    async checkRateLimit(tenantId, window = 'minute') {
        // Input validation
        if (!tenantId || typeof tenantId !== 'string') {
            return false;
        }
        const tenant = this.tenants.get(tenantId);
        if (!tenant) {
            return false;
        }
        const now = Date.now();
        let windowMs;
        let limit;
        switch (window) {
            case 'minute':
                windowMs = 60 * 1000;
                limit = tenant.rateLimit.requestsPerMinute;
                break;
            case 'hour':
                windowMs = 60 * 60 * 1000;
                limit = tenant.rateLimit.requestsPerHour;
                break;
            case 'day':
                windowMs = 24 * 60 * 60 * 1000;
                limit = tenant.rateLimit.requestsPerDay;
                break;
            default:
                console.error('Invalid rate limit window', { window, tenantId });
                return false;
        }
        // Validate rate limit configuration
        if (limit <= 0 || windowMs <= 0) {
            console.error('Invalid rate limit configuration', { tenantId, limit, windowMs });
            return false;
        }
        const key = `${tenantId}:${window}`;
        const usage = this.rateLimitUsage.get(key);
        if (!usage || now > usage.resetTime) {
            this.rateLimitUsage.set(key, {
                count: 1,
                resetTime: now + windowMs
            });
            return true;
        }
        if (usage.count >= limit) {
            console.warn('Rate limit exceeded', { tenantId, window, count: usage.count, limit });
            return false;
        }
        usage.count++;
        return true;
    }
    /**
     * Check if tenant has specific permission with enhanced validation
     */
    hasPermission(tenant, permission) {
        // Input validation
        if (!tenant || !permission || typeof permission !== 'string') {
            return false;
        }
        // Validate permission format
        if (!/^[a-zA-Z0-9_:*]+$/.test(permission)) {
            console.warn('Invalid permission format', { permission });
            return false;
        }
        // Check for wildcard permission first
        if (tenant.permissions.includes('*')) {
            return true;
        }
        // Check for exact permission match
        if (tenant.permissions.includes(permission)) {
            return true;
        }
        // Check for wildcard sub-permissions (e.g., 'tsa:*' matches 'tsa:sign')
        const [category] = permission.split(':');
        if (category && tenant.permissions.includes(`${category}:*`)) {
            return true;
        }
        return false;
    }
    /**
     * Get tenant policy with authentication and validation
     */
    async getTenantPolicy(tenantId, apiKey) {
        // Input validation
        if (!tenantId || !apiKey || typeof tenantId !== 'string' || typeof apiKey !== 'string') {
            return null;
        }
        // Validate tenant ID format
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tenantId)) {
            console.warn('Invalid tenant ID format in policy request', { tenantId });
            return null;
        }
        const auth = await this.authenticateRequest(apiKey);
        if (!auth.success || auth.tenant?.tenantId !== tenantId) {
            return null;
        }
        // Validate policy integrity before returning
        if (!this.validatePolicyIntegrity(auth.tenant.policy)) {
            console.error('Policy integrity validation failed', { tenantId });
            return null;
        }
        return auth.tenant.policy;
    }
    /**
     * Initialize secure tenant configurations
     * In production, this would load from secure database with encryption
     */
    initializeTenants() {
        // Example tenant configurations with enhanced security
        const tenants = [
            {
                tenantId: 'acme-corp',
                apiKey: 'tsa_ak_1234567890abcdef1234567890abcdef',
                permissions: ['tsa:sign', 'tsa:verify', 'tsa:read'],
                rateLimit: {
                    requestsPerMinute: 100,
                    requestsPerHour: 5000,
                    requestsPerDay: 50000
                },
                policy: {
                    tenant_id: 'acme-corp',
                    accepted_trust_anchors: [
                        {
                            name: 'DigiCert TSA Root',
                            pem: '-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----',
                            ekuRequired: '1.3.6.1.5.5.7.3.8'
                        }
                    ],
                    accepted_policy_oids: ['2.16.840.1.114412.7.1'],
                    routing_priority: ['digicert', 'globalsign', 'sectigo'],
                    sla: {
                        p95_latency_ms: 900,
                        monthly_error_budget_pct: 1.0
                    }
                }
            }
        ];
        // Validate and load tenants
        tenants.forEach(tenant => {
            if (this.validateTenantIntegrity(tenant)) {
                this.tenants.set(tenant.tenantId, tenant);
                this.apiKeys.set(tenant.apiKey, tenant.tenantId);
            }
            else {
                console.error('Failed to load tenant due to integrity validation', { tenantId: tenant.tenantId });
            }
        });
    }
    /**
     * Check if tenant is active and not suspended with enhanced validation
     */
    isTenantActive(tenant) {
        // Input validation
        if (!tenant || !tenant.tenantId) {
            return false;
        }
        // In production, check against database for suspension status
        // Include checks for:
        // - Account suspension
        // - Billing status
        // - Compliance violations
        // - Security incidents
        return true;
    }
    /**
     * Validate admin token for sensitive operations
     * Uses timing-safe comparison to prevent timing attacks
     */
    validateAdminToken(token) {
        // Input validation
        if (!token || typeof token !== 'string') {
            return false;
        }
        // Check token length to prevent DoS
        if (token.length > 256 || token.length < 16) {
            console.warn('Admin token length out of bounds', { length: token.length });
            return false;
        }
        // Use environment variable for admin token
        const expectedToken = process.env.ADMIN_TOKEN;
        if (!expectedToken) {
            console.error('CRITICAL: ADMIN_TOKEN environment variable not set');
            return false;
        }
        // Timing-safe comparison to prevent timing attacks
        return this.timingSafeStringEquals(token, expectedToken);
    }
    /**
     * Timing-safe string comparison to prevent timing attacks
     * Uses constant-time comparison to prevent side-channel attacks
     */
    timingSafeStringEquals(a, b) {
        // Early return for obvious mismatches
        if (typeof a !== 'string' || typeof b !== 'string') {
            return false;
        }
        if (a.length !== b.length) {
            return false;
        }
        // Constant-time comparison
        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        return result === 0;
    }
    /**
     * Generate secure API key for new tenant with enhanced entropy
     */
    generateApiKey() {
        // Use cryptographically secure random number generator
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        // Convert to hex and ensure lowercase for consistency
        const hex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
        // Validate generated key
        const apiKey = `tsa_ak_${hex}`;
        if (!/^tsa_ak_[a-f0-9]{32}$/.test(apiKey)) {
            throw new Error('Generated API key failed validation');
        }
        return apiKey;
    }
    /**
     * Clean up expired rate limit entries with enhanced tracking
     */
    cleanupRateLimits() {
        const now = Date.now();
        let cleanedCount = 0;
        // Clean rate limit entries
        for (const [key, usage] of this.rateLimitUsage.entries()) {
            if (now > usage.resetTime) {
                this.rateLimitUsage.delete(key);
                cleanedCount++;
            }
        }
        // Clean failed attempt entries
        for (const [key, attempts] of this.failedAttempts.entries()) {
            if (now > attempts.resetTime) {
                this.failedAttempts.delete(key);
                cleanedCount++;
            }
        }
        if (cleanedCount > 0) {
            console.debug('Cleaned up expired rate limit entries', { count: cleanedCount });
        }
    }
    /**
     * Get client key for rate limiting and failed attempt tracking
     */
    getClientKey(apiKey) {
        // Use a hash of the API key to track attempts without storing the actual key
        // In production, this should use a proper cryptographic hash
        return apiKey.substring(0, 8); // Simplified for development
    }
    /**
     * Check if client is rate limited due to failed attempts
     */
    isRateLimitedForFailures(clientKey) {
        const attempts = this.failedAttempts.get(clientKey);
        if (!attempts) {
            return false;
        }
        const now = Date.now();
        if (now > attempts.resetTime) {
            this.failedAttempts.delete(clientKey);
            return false;
        }
        return attempts.count >= this.MAX_FAILED_ATTEMPTS;
    }
    /**
     * Record a failed authentication attempt
     */
    recordFailedAttempt(clientKey) {
        const now = Date.now();
        const attempts = this.failedAttempts.get(clientKey);
        if (!attempts || now > attempts.resetTime) {
            this.failedAttempts.set(clientKey, {
                count: 1,
                resetTime: now + this.FAILED_ATTEMPT_WINDOW
            });
        }
        else {
            attempts.count++;
        }
        console.warn('Failed authentication attempt recorded', {
            clientKey,
            count: attempts?.count || 1,
            maxAttempts: this.MAX_FAILED_ATTEMPTS
        });
    }
    /**
     * Clear failed attempts on successful authentication
     */
    clearFailedAttempts(clientKey) {
        this.failedAttempts.delete(clientKey);
    }
    /**
     * Validate tenant configuration integrity
     */
    validateTenantIntegrity(tenant) {
        if (!tenant || !tenant.tenantId || !tenant.apiKey || !tenant.permissions || !tenant.rateLimit || !tenant.policy) {
            return false;
        }
        // Validate tenant ID format
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tenant.tenantId)) {
            return false;
        }
        // Validate API key format
        if (!/^tsa_ak_[a-f0-9]{32}$/.test(tenant.apiKey)) {
            return false;
        }
        // Validate permissions
        if (!Array.isArray(tenant.permissions) || tenant.permissions.length === 0) {
            return false;
        }
        // Validate rate limits
        if (tenant.rateLimit.requestsPerMinute <= 0 ||
            tenant.rateLimit.requestsPerHour <= 0 ||
            tenant.rateLimit.requestsPerDay <= 0) {
            return false;
        }
        return true;
    }
    /**
     * Validate policy integrity
     */
    validatePolicyIntegrity(policy) {
        if (!policy || !policy.tenant_id || !policy.accepted_trust_anchors || !policy.routing_priority) {
            return false;
        }
        // Validate trust anchors
        if (!Array.isArray(policy.accepted_trust_anchors) || policy.accepted_trust_anchors.length === 0) {
            return false;
        }
        // Validate routing priority
        if (!Array.isArray(policy.routing_priority) || policy.routing_priority.length === 0) {
            return false;
        }
        return true;
    }
    /**
     * Start cleanup timer for expired entries
     */
    startCleanupTimer() {
        setInterval(() => {
            this.cleanupRateLimits();
        }, this.CLEANUP_INTERVAL);
    }
}
//# sourceMappingURL=auth-manager.js.map