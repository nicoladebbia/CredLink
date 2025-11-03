/**
 * Authentication and Authorization Manager
 * Secure tenant validation and API key management
 * Implements zero-trust security principles with comprehensive validation
 */
import { TenantTSAPolicy } from '../types/rfc3161.js';
export interface AuthenticatedTenant {
    tenantId: string;
    apiKey: string;
    permissions: string[];
    rateLimit: {
        requestsPerMinute: number;
        requestsPerHour: number;
        requestsPerDay: number;
    };
    policy: TenantTSAPolicy;
}
export interface AuthenticationResult {
    success: boolean;
    tenant?: AuthenticatedTenant;
    error?: string;
}
export declare class AuthenticationManager {
    private tenants;
    private apiKeys;
    private rateLimitUsage;
    private failedAttempts;
    private readonly MAX_FAILED_ATTEMPTS;
    private readonly FAILED_ATTEMPT_WINDOW;
    private readonly CLEANUP_INTERVAL;
    constructor();
    /**
     * Authenticate request using API key with enhanced security
     * Implements rate limiting, attempt tracking, and comprehensive validation
     */
    authenticateRequest(apiKey: string): Promise<AuthenticationResult>;
    /**
     * Check rate limiting for tenant with enhanced tracking
     */
    checkRateLimit(tenantId: string, window?: 'minute' | 'hour' | 'day'): Promise<boolean>;
    /**
     * Check if tenant has specific permission with enhanced validation
     */
    hasPermission(tenant: AuthenticatedTenant, permission: string): boolean;
    /**
     * Get tenant policy with authentication and validation
     */
    getTenantPolicy(tenantId: string, apiKey: string): Promise<TenantTSAPolicy | null>;
    /**
     * Initialize secure tenant configurations
     * In production, this would load from secure database with encryption
     */
    private initializeTenants;
    /**
     * Check if tenant is active and not suspended with enhanced validation
     */
    private isTenantActive;
    /**
     * Validate admin token for sensitive operations
     * Uses timing-safe comparison to prevent timing attacks
     */
    validateAdminToken(token: string): boolean;
    /**
     * Timing-safe string comparison to prevent timing attacks
     * Uses constant-time comparison to prevent side-channel attacks
     */
    private timingSafeStringEquals;
    /**
     * Generate secure API key for new tenant with enhanced entropy
     */
    generateApiKey(): string;
    /**
     * Clean up expired rate limit entries with enhanced tracking
     */
    cleanupRateLimits(): void;
    /**
     * Get client key for rate limiting and failed attempt tracking
     */
    private getClientKey;
    /**
     * Check if client is rate limited due to failed attempts
     */
    private isRateLimitedForFailures;
    /**
     * Record a failed authentication attempt
     */
    private recordFailedAttempt;
    /**
     * Clear failed attempts on successful authentication
     */
    private clearFailedAttempts;
    /**
     * Validate tenant configuration integrity
     */
    private validateTenantIntegrity;
    /**
     * Validate policy integrity
     */
    private validatePolicyIntegrity;
    /**
     * Start cleanup timer for expired entries
     */
    private startCleanupTimer;
}
//# sourceMappingURL=auth-manager.d.ts.map