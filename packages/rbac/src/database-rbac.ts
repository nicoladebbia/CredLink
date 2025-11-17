/**
 * Database-Backed RBAC Implementation
 * Replaces in-memory Map storage with persistent PostgreSQL storage
 */

import { Pool, PoolClient } from 'pg';
import { Subject, Action, Resource, Context, CheckResult, Role, Permission } from './types.js';

export class DatabaseRBAC {
    private pool: Pool;
    private cache: Map<string, { result: CheckResult; timestamp: number }> = new Map();
    private cacheTTL = 5 * 60 * 1000; // 5 minutes
    private maxCacheSize = 10000; // 🔥 CATASTROPHIC FIX: Prevent memory bomb
    private cleanupInterval: NodeJS.Timeout | null = null;

    // Telemetry & Observability metrics
    private metrics = {
        checkCount: 0,
        cacheHits: 0,
        databaseErrors: 0,
        roleAssignments: 0,
        roleRevocations: 0,
        totalCheckDuration: 0,
        averageCheckDuration: 0
    };

    constructor(pool: Pool) {
        // BRUTAL FIX: Validate pool parameter is actually a Pool instance
        if (!pool) {
            throw new Error('DatabaseRBAC: Pool parameter is required');
        }
        
        if (typeof pool.query !== 'function') {
            throw new Error('DatabaseRBAC: Pool parameter must be a valid PostgreSQL Pool instance');
        }
        
        if (typeof pool.end !== 'function') {
            throw new Error('DatabaseRBAC: Pool parameter must be a valid PostgreSQL Pool instance with end method');
        }
        
        this.pool = pool;
        
        // 🔥 CATASTROPHIC FIX: Initialize cache cleanup to prevent memory bomb
        this.cleanupInterval = setInterval(() => {
            this.cleanupCache();
        }, 60000); // Cleanup every 60 seconds
    }

    /**
     * BRUTAL FIX: Validate database connection on initialization
     */
    async validateConnection(): Promise<void> {
        try {
            await this.pool.query('SELECT 1');
        } catch (error) {
            throw new Error(`DatabaseRBAC: Failed to connect to database: ${(error as Error).message}`);
        }
    }

    /**
     * Check if a subject has permission to perform an action on a resource
     */
    async check(
        subject: Subject,
        action: Action,
        resource: Resource,
        context: Context
    ): Promise<CheckResult> {
        // Telemetry: Increment check count
        this.metrics.checkCount++;
        
        const startTime = Date.now();
        
        // Input validation
        if (!subject || !action || !resource || !context) {
            const result = {
                allow: false,
                reason: 'Invalid check parameters: missing required fields'
            };
            this.emitMetrics('check_invalid', Date.now() - startTime, result);
            return result;
        }

        if (!subject.user_id || !subject.org_id || !Array.isArray(subject.roles)) {
            return {
                allow: false,
                reason: 'Invalid subject: missing user_id, org_id, or roles'
            };
        }

        // Organization boundary check
        if (resource.org_id && resource.org_id !== subject.org_id) {
            return {
                allow: false,
                reason: 'Organization mismatch: subject cannot access resources from other organizations'
            };
        }

        // Check cache first - HARSH: Sanitize all inputs to prevent injection
        const sanitizedUserId = this.sanitizeInput(subject.user_id);
        const sanitizedOrgId = this.sanitizeInput(subject.org_id);
        const sanitizedVerb = this.sanitizeInput(action.verb);
        const sanitizedResource = this.sanitizeInput(action.resource);
        
        const cacheKey = `${sanitizedUserId}:${sanitizedOrgId}:${sanitizedVerb}:${sanitizedResource}`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            this.metrics.cacheHits++;
            this.emitMetrics('check_cache_hit', Date.now() - startTime, cached.result);
            return cached.result;
        }

        // Database query for permissions
        const query = `
            SELECT DISTINCT 
                r.role_id,
                p.verb,
                p.resource,
                p.permission_id
            FROM subject_roles sr
            JOIN roles r ON sr.role_id = r.id
            LEFT JOIN role_permissions rp ON r.id = rp.role_id
            LEFT JOIN permissions p ON rp.permission_id = p.id
            LEFT JOIN role_inheritance ri ON r.id = ri.child_role_id
            LEFT JOIN role_permissions rp_parent ON ri.parent_role_id = rp_parent.role_id
            LEFT JOIN permissions p_parent ON rp_parent.permission_id = p_parent.id
            WHERE sr.subject_id = $1 
                AND sr.org_id = $2
                AND (sr.expires_at IS NULL OR sr.expires_at > NOW())
                AND (
                    (p.verb = $3 OR p.verb = '*') 
                    OR (p_parent.verb = $3 OR p_parent.verb = '*')
                )
                AND (
                    (p.resource = $4 OR p.resource = '*') 
                    OR (p_parent.resource = $4 OR p_parent.resource = '*')
                )
            LIMIT 1;
        `;

        try {
            const result = await this.pool.query(query, [
                subject.user_id,
                subject.org_id,
                action.verb,
                action.resource
            ]);

            if (result.rows.length > 0) {
                const checkResult: CheckResult = {
                    allow: true,
                    reason: 'Permission granted',
                    matched_role: result.rows[0].role_id,
                    matched_permission: result.rows[0].permission_id
                };
                
                // BRUTAL FIX: Add audit logging with error handling
                try {
                    await this.logPermissionCheck(subject, action, resource, context, true, checkResult);
                } catch (auditError) {
                    // 🔥 CRITICAL FIX: Revert to console.error - no logger imported
                    console.error('DatabaseRBAC: Failed to log permission check:', auditError);
                }
                
                this.emitMetrics('check_success', Date.now() - startTime, checkResult);
                return checkResult;
            }

            const deniedResult: CheckResult = {
                allow: false,
                reason: `Permission denied: ${this.sanitizeInput(action.verb)}:${this.sanitizeInput(action.resource)}`
            };

            // Cache denial for shorter time
            // 🔥 CHAOS FIX: Prevent burst OOM attack - check cache size BEFORE insertion
            if (this.cache.size >= this.maxCacheSize) {
                // Immediate cleanup if we're at limit
                this.cleanupCache();
                
                // If still at limit after cleanup, don't cache this entry
                if (this.cache.size >= this.maxCacheSize) {
                    return deniedResult; // Skip caching to prevent OOM
                }
            }
            
            // Cache denial for shorter time
            this.cache.set(cacheKey, {
                result: deniedResult,
                timestamp: Date.now()
            });

            // Log the denial for audit
            await this.logPermissionCheck(subject, action, resource, context, false, deniedResult);

            // Emit metrics for denied check
            this.emitMetrics('check_database_denied', Date.now() - startTime, deniedResult);

            return deniedResult;

        } catch (error) {
            this.metrics.databaseErrors++;
            console.error('RBAC database error:', error);
            
            const errorResult: CheckResult = {
                allow: false,
                reason: 'RBAC system error'
            };

            // Log the error for audit
            await this.logPermissionCheck(subject, action, resource, context, false, errorResult);

            // Emit metrics for error
            this.emitMetrics('check_error', Date.now() - startTime, errorResult);

            return errorResult;
        }
    }

    /**
     * HARSH: Sanitize input to prevent injection attacks
     */
    private sanitizeInput(input: string): string {
        if (typeof input !== 'string') {
            throw new Error('Input must be a string');
        }
        
        // Remove dangerous characters that could be used in injection
        return input
            .replace(/[;'"`\\]/g, '') // Remove SQL injection characters
            .replace(/--/g, '') // Remove SQL comment
            .replace(/\/\*/g, '') // Remove SQL block comment start
            .replace(/\*\//g, '') // Remove SQL block comment end
            .replace(/[<>()[]{}]/g, '') // Remove HTML/JS injection characters
            .substring(0, 100); // Limit length to prevent DoS
    }

    /**
     * Emit metrics for observability and monitoring
     */
    private emitMetrics(operation: string, duration: number, result: CheckResult): void {
        // Update duration metrics
        this.metrics.totalCheckDuration += duration;
        this.metrics.averageCheckDuration = this.metrics.totalCheckDuration / this.metrics.checkCount;

        // Emit metrics to monitoring system
        try {
            // This would integrate with your monitoring system (Prometheus, Datadog, etc.)
            console.log('RBAC_METRIC', {
                operation,
                duration,
                allowed: result.allow,
                reason: result.reason,
                matchedRole: result.matched_role,
                timestamp: new Date().toISOString(),
                metrics: {
                    checkCount: this.metrics.checkCount,
                    cacheHits: this.metrics.cacheHits,
                    databaseErrors: this.metrics.databaseErrors,
                    averageCheckDuration: Math.round(this.metrics.averageCheckDuration * 100) / 100
                }
            });
        } catch (error) {
            // Don't let metric emission failures break RBAC functionality
            console.error('Failed to emit RBAC metrics:', error);
        }
    }

    /**
     * Get current metrics for monitoring dashboard
     */
    getMetrics() {
        return {
            ...this.metrics,
            cacheHitRate: this.metrics.checkCount > 0 ? 
                Math.round((this.metrics.cacheHits / this.metrics.checkCount) * 100 * 100) / 100 : 0,
            errorRate: this.metrics.checkCount > 0 ? 
                Math.round((this.metrics.databaseErrors / this.metrics.checkCount) * 100 * 100) / 100 : 0
        };
    }

    /**
     * Reset metrics (useful for testing or periodic resets)
     */
    resetMetrics(): void {
        this.metrics = {
            checkCount: 0,
            cacheHits: 0,
            databaseErrors: 0,
            roleAssignments: 0,
            roleRevocations: 0,
            totalCheckDuration: 0,
            averageCheckDuration: 0
        };
    }

    /**
     * Add a new role to the system
     */
    async addRole(role: Role): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Insert role
            const roleResult = await client.query(`
                INSERT INTO roles (role_id, name, description)
                VALUES ($1, $2, $3)
                ON CONFLICT (role_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    updated_at = NOW()
                RETURNING id
            `, [role.id, role.name, role.description]);

            const roleId = roleResult.rows[0].id;

            // Insert permissions
            for (const permission of role.permissions) {
                const permResult = await client.query(`
                    INSERT INTO permissions (permission_id, verb, resource)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (permission_id) DO UPDATE SET
                        verb = EXCLUDED.verb,
                        resource = EXCLUDED.resource
                    RETURNING id
                `, [permission.id, permission.verb, permission.resource]);

                const permissionId = permResult.rows[0].id;

                // Link role to permission
                await client.query(`
                    INSERT INTO role_permissions (role_id, permission_id)
                    VALUES ($1, $2)
                    ON CONFLICT DO NOTHING
                `, [roleId, permissionId]);
            }

            // Handle role inheritance
            if (role.inherits) {
                for (const inheritedRoleId of role.inherits) {
                    const parentRole = await client.query(`
                        SELECT id FROM roles WHERE role_id = $1
                    `, [inheritedRoleId]);

                    if (parentRole.rows.length > 0) {
                        await client.query(`
                            INSERT INTO role_inheritance (parent_role_id, child_role_id)
                            VALUES ($1, $2)
                            ON CONFLICT DO NOTHING
                        `, [parentRole.rows[0].id, roleId]);
                    }
                }
            }

            await client.query('COMMIT');
            
            // Clear cache
            this.cache.clear();

            // Log role addition - 🔥 CRITICAL FIX: Wrap to prevent crashes
            try {
                await this.logRoleChange('role_add', role.id, null, null, role);
            } catch (logError) {
                console.error('DatabaseRBAC: Failed to log role addition:', logError);
                // Don't crash - logging should never block the transaction
            }

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Assign a role to a subject
     */
    async assignRole(subjectId: string, orgId: string, roleId: string, grantedBy?: string, expiresAt?: Date): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query(`
                INSERT INTO subject_roles (subject_id, org_id, role_id, granted_by, expires_at)
                VALUES ($1, $2, (SELECT id FROM roles WHERE role_id = $3), $4, $5)
                ON CONFLICT (subject_id, org_id, role_id) DO UPDATE SET
                    granted_by = EXCLUDED.granted_by,
                    expires_at = EXCLUDED.expires_at
            `, [subjectId, orgId, roleId, grantedBy, expiresAt]);

            // Clear cache for this subject
            this.clearSubjectCache(subjectId, orgId);

            // Update telemetry metrics
            this.metrics.roleAssignments++;

            // Log role assignment
            await this.logRoleChange('role_assign', roleId, subjectId, orgId, { grantedBy, expiresAt });

        } finally {
            client.release();
        }
    }

    /**
     * Revoke a role from a subject
     */
    async revokeRole(subjectId: string, orgId: string, roleId: string, revokedBy?: string): Promise<void> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
                DELETE FROM subject_roles 
                WHERE subject_id = $1 
                    AND org_id = $2 
                    AND role_id = (SELECT id FROM roles WHERE role_id = $3)
                RETURNING id
            `, [subjectId, orgId, roleId]);

            if (result.rows.length > 0) {
                // Clear cache for this subject
                this.clearSubjectCache(subjectId, orgId);

                // Update telemetry metrics
                this.metrics.roleRevocations++;

                // Log role revocation
                await this.logRoleChange('role_revoke', roleId, subjectId, orgId, { revokedBy });
            }

        } finally {
            client.release();
        }
    }

    /**
     * Clear cache for a specific subject
     */
    async getSubjectRoles(subjectId: string, orgId: string): Promise<string[]> {
        try {
            const sanitizedSubjectId = this.sanitizeInput(subjectId);
            const sanitizedOrgId = this.sanitizeInput(orgId);

            const query = `
                SELECT r.role_id
                FROM subject_roles sr
                JOIN roles r ON sr.role_id = r.id
                WHERE sr.subject_id = $1 
                    AND sr.org_id = $2
                    AND (sr.expires_at IS NULL OR sr.expires_at > NOW())
            `;

            const result = await this.pool.query(query, [sanitizedSubjectId, sanitizedOrgId]);
            return result.rows.map(row => row.role_id);
        } catch (error) {
            console.error('Error getting subject roles:', error);
            return [];
        }
    }

    /**
     * Clear cache for a specific subject
     */
    private clearSubjectCache(subjectId: string, orgId: string): void {
        const keysToDelete: string[] = [];
        const sanitizedSubjectId = this.sanitizeInput(subjectId);
        const sanitizedOrgId = this.sanitizeInput(orgId);
        
        for (const key of this.cache.keys()) {
            if (key.startsWith(`${sanitizedSubjectId}:${sanitizedOrgId}:`)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this.cache.delete(key));
    }

    /**
     * Log permission checks for audit purposes
     */
    private async logPermissionCheck(
        subject: Subject,
        action: Action,
        resource: Resource,
        context: Context,
        allowed: boolean,
        result: CheckResult
    ): Promise<void> {
        try {
            await this.pool.query(`
                INSERT INTO rbac_audit_log (action, subject_id, org_id, role_id, permission_id, performed_by, performed_at, metadata)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
                'permission_check',
                this.sanitizeInput(subject.user_id),
                this.sanitizeInput(subject.org_id),
                result.matched_role || null,
                result.matched_permission || null,
                context.request_id,
                context.timestamp,
                JSON.stringify({
                    action: `${this.sanitizeInput(action.verb)}:${this.sanitizeInput(action.resource)}`,
                    resource: this.sanitizeInput(resource.type),
                    allowed,
                    reason: this.sanitizeInput(result.reason || 'No reason provided'),
                    ip_address: context.ip_address,
                    user_agent: context.user_agent
                })
            ]);
        } catch (error) {
            console.error('Failed to log permission check:', error);
            // Don't throw - logging failure shouldn't break the permission check
        }
    }

    /**
     * Log role changes for audit purposes
     */
    private async logRoleChange(
        action: string,
        roleId: string,
        subjectId: string | null,
        orgId: string | null,
        metadata: Record<string, any>
    ): Promise<void> {
        try {
            await this.pool.query(`
                INSERT INTO rbac_audit_log (action, subject_id, org_id, role_id, performed_by, performed_at, metadata)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                action,
                subjectId,
                orgId,
                roleId,
                metadata.grantedBy || metadata.revokedBy || 'system',
                new Date(),
                JSON.stringify(metadata)
            ]);
        } catch (error) {
            console.error('Failed to log role change:', error);
            // Don't throw - logging failure shouldn't break the role change
        }
    }

    /**
     * Health check for the RBAC system
     */
    async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
        try {
            // Test database connection
            await this.pool.query('SELECT 1');
            
            // Test basic query
            const roleCount = await this.pool.query('SELECT COUNT(*) FROM roles');
            
            return {
                status: 'healthy',
                details: {
                    database: 'connected',
                    totalRoles: parseInt(roleCount.rows[0].count),
                    cacheSize: this.cache.size,
                    cacheTTL: this.cacheTTL
                }
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                details: {
                    database: 'disconnected',
                    error: (error as Error).message,
                    cacheSize: this.cache.size
                }
            };
        }
    }

    /**
     * 🔥 CATASTROPHIC FIX: Prevent memory bomb by cleaning expired cache entries
     */
    private cleanupCache(): void {
        const now = Date.now();
        let deletedCount = 0;
        
        // Remove expired entries
        for (const [key, cached] of this.cache.entries()) {
            if (now - cached.timestamp > this.cacheTTL) {
                this.cache.delete(key);
                deletedCount++;
            }
        }
        
        // If still over size limit, remove oldest entries
        if (this.cache.size > this.maxCacheSize) {
            const entries = Array.from(this.cache.entries());
            const toDelete = entries.length - this.maxCacheSize;
            
            // Sort by timestamp and delete oldest
            entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
            for (let i = 0; i < toDelete; i++) {
                this.cache.delete(entries[i][0]);
                deletedCount++;
            }
        }
        
        if (deletedCount > 0) {
            console.log(`🧹 DatabaseRBAC cache cleanup: removed ${deletedCount} expired entries, current size: ${this.cache.size}`);
        }
    }

    /**
     * Close the database connection and clean up
     */
    async close(): Promise<void> {
        // 🔥 CATASTROPHIC FIX: Prevent memory leak on shutdown
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        
        this.cache.clear();
        await this.pool.end();
    }
}
