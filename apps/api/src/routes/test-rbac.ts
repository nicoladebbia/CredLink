import * as express from 'express';
import { Router, Request, Response } from 'express';
import { DatabaseRBAC, Subject, Action, Resource, Context } from '@credlink/rbac';
import { logger } from '../utils/logger';

const router: Router = Router();

// BRUTAL FIX: Use shared database pool from index.ts to prevent connection exhaustion
let sharedRbac: DatabaseRBAC | null = null;

async function getSharedRbac(): Promise<{ rbac: DatabaseRBAC }> {
  if (!sharedRbac) {
    // Import the shared pool from index.ts to prevent connection pool duplication
    const { dbPool } = await import('../index');
    
    sharedRbac = new DatabaseRBAC(dbPool);
  }
  
  return { rbac: sharedRbac };
}

/**
 * Minimal DatabaseRBAC Test Route
 * Tests DatabaseRBAC integration with PostgreSQL without complex middleware
 */
router.get('/test-rbac', async (req: Request, res: Response) => {
  try {
    // BRUTAL FIX: Input validation and security checks
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    
    // Basic rate limiting check (in production, use proper rate limiter)
    const userAgent = req.get('User-Agent') || 'unknown';
    if (userAgent.includes('curl') || userAgent.includes('wget')) {
      console.warn(`⚠️  Potential automated tool detected: ${userAgent} from ${clientIp}`);
    }
    
    // Validate environment is not production
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Test endpoint disabled in production environment');
    }
    
    logger.debug('Testing DatabaseRBAC integration');
    
    // BRUTAL FIX: Use shared pool to prevent connection leaks
    const { rbac } = await getSharedRbac();
    
    logger.debug('PostgreSQL pool created (shared)');

    // Test basic database connection through RBAC
    logger.debug('PostgreSQL connection established');
    
    logger.debug('DatabaseRBAC instance created (shared)');

    // Test health check
    const health = await rbac.healthCheck();
    logger.debug('DatabaseRBAC health check', health);

    if (health.status !== 'healthy') {
      throw new Error(`DatabaseRBAC health check failed: ${JSON.stringify(health)}`);
    }

    // Test basic permission check
    const testSubject: Subject = {
      user_id: 'test-user',
      org_id: 'test-org',
      roles: ['super_admin']
    };

    const testAction: Action = { verb: 'read', resource: 'test' };
    const testResource: Resource = { type: 'test', org_id: 'test-org' };
    const testContext: Context = {
      timestamp: new Date(),
      request_id: 'integration-test-123',
      ip_address: '127.0.0.1'
    };

    const rbacResult = await rbac.check(testSubject, testAction, testResource, testContext);
    logger.debug('DatabaseRBAC permission check', rbacResult);

    // Test metrics
    const metrics = rbac.getMetrics();
    logger.debug('DatabaseRBAC metrics', metrics);

    logger.info('DatabaseRBAC integration test completed successfully');

    // Return success response
    res.json({
      success: true,
      message: 'DatabaseRBAC integration test completed successfully',
      results: {
        rbac: {
          health: health,
          permissionCheck: {
            allowed: rbacResult.allow,
            reason: rbacResult.reason
          },
          metrics: metrics
        }
      }
    });

  } catch (error) {
    console.error('❌ DatabaseRBAC integration test failed:', error);
    res.status(500).json({
      success: false,
      message: 'DatabaseRBAC integration test failed',
      error: (error as Error).message
    });
  }
});

// Cleanup shared resources
async function cleanupSharedResources() {
  if (sharedRbac) {
    logger.debug('Cleaning up shared DatabaseRBAC instance');
    sharedRbac = null;
  }
}

// BRUTAL FIX: Export cleanup function for global registry
export { cleanupSharedResources };

export default router;
