import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { DatabaseRBAC, Subject, Action, Resource, Context } from '@credlink/rbac';
import { logger } from '../utils/logger';

// Global DatabaseRBAC instance
let rbacInstance: DatabaseRBAC | null = null;
let dbPool: Pool | null = null;

/**
 * Initialize DatabaseRBAC with database connection
 */
export function initializeRBAC(pool: Pool): void {
    dbPool = pool;
    rbacInstance = new DatabaseRBAC(pool);
    logger.debug('DatabaseRBAC initialized for main API');
}

/**
 * Get DatabaseRBAC instance
 */
export function getRBAC(): DatabaseRBAC {
    if (!rbacInstance) {
        throw new Error('DatabaseRBAC not initialized - call initializeRBAC() first');
    }
    return rbacInstance;
}

/**
 * RBAC Authentication Middleware
 * Checks if user has permission to access the requested resource
 */
export function requirePermission(verb: string, resource: string) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            if (!rbacInstance) {
                console.error('❌ DatabaseRBAC not initialized');
                res.status(500).json({ error: 'RBAC system not initialized' });
                return;
            }

            // Extract user information from request (from API key auth or JWT)
            const userId = req.headers['x-user-id'] as string || 
                          (req as any).user?.id || 
                          'anonymous';
            
            const orgId = req.headers['x-org-id'] as string || 
                         (req as any).user?.orgId || 
                         'default';

            // Create RBAC subject
            const subject: Subject = {
                user_id: userId,
                org_id: orgId,
                roles: [], // Will be populated by DatabaseRBAC from database
                attributes: {
                    ip: req.ip
                }
            };

            // Create RBAC action
            const action: Action = {
                verb: verb,
                resource: resource
            };

            // Create RBAC resource
            const rbacResource: Resource = {
                type: 'api_endpoint',
                id: resource,
                attributes: {
                    method: req.method,
                    path: req.path
                }
            };

            // Create RBAC context
            const context: Context = {
                timestamp: new Date(),
                request_id: req.headers['x-request-id'] as string,
                ip_address: req.ip,
                user_agent: req.headers['user-agent']
            };

            // Check permission using DatabaseRBAC
            const result = await rbacInstance.check(subject, action, rbacResource, context);

            if (!result.allow) {
                console.warn(`🚫 Permission denied: ${userId} cannot ${verb}:${resource} - ${result.reason}`);
                res.status(403).json({ 
                    error: 'Permission denied',
                    reason: result.reason,
                    required_permission: `${verb}:${resource}`
                });
                return;
            }

            // Add RBAC result to request for downstream use
            (req as any).rbacResult = result;
            // 🔥 CRITICAL SECURITY FIX: Remove user permission logging to prevent information disclosure
            // Log permission grants without exposing user identities
            logger.debug(`Permission granted: ${verb}:${resource}`);
            
            next();

        } catch (error) {
            console.error('❌ RBAC permission check failed:', error);
            res.status(500).json({ error: 'Permission check failed' });
        }
    };
}

/**
 * Health check for DatabaseRBAC
 */
export async function rbacHealthCheck(): Promise<any> {
    if (!rbacInstance) {
        return { status: 'uninitialized', message: 'DatabaseRBAC not initialized' };
    }
    
    try {
        return await rbacInstance.healthCheck();
    } catch (error) {
        return { status: 'error', error: (error as Error).message };
    }
}
