import 'dotenv/config';
import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { DatabaseRBAC, createRBACMiddleware } from '@credlink/rbac';
import { logger } from '../utils/logger';

// 🔥 PRAGMATIC FIX: Initialize DatabaseRBAC on first request
let rbacInstance: DatabaseRBAC | null = null;
let rbacMiddleware: any = null;
let initializationPromise: Promise<void> | null = null;

// Database pool for RBAC
const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Force environment variables
process.env.ENABLE_API_KEY_AUTH = 'true';
process.env.USE_DATABASE_API_KEYS = 'true';

async function initializeRBAC() {
  if (initializationPromise) {
    return initializationPromise;
  }

  console.log('🔧 PRAGMATIC FIX: Initializing DatabaseRBAC in middleware...');
  
  initializationPromise = (async () => {
    try {
      console.log('🔧 Creating DatabaseRBAC instance...');
      rbacInstance = new DatabaseRBAC(dbPool);
      console.log('✅ DatabaseRBAC instance created');

      rbacMiddleware = createRBACMiddleware(rbacInstance, {
        getOrgId: (req: Request) => process.env.DEFAULT_ORG_ID || 'default-org'
      });
      console.log('✅ RBAC middleware created');

      const health = await rbacInstance.healthCheck();
      console.log('✅ RBAC health check passed:', health);
      logger.info('DatabaseRBAC initialized successfully in middleware', health);

    } catch (error) {
      console.error('❌ DatabaseRBAC initialization failed:', error);
      logger.error('DatabaseRBAC initialization failed in middleware', error);
      throw error;
    }
  })();

  return initializationPromise;
}

// Export the middleware function that ensures RBAC is initialized
export async function ensureRBACInitialized(req: Request, res: Response, next: NextFunction) {
  try {
    if (!rbacMiddleware) {
      await initializeRBAC();
    }
    
    if (!rbacMiddleware) {
      throw new Error('RBAC middleware failed to initialize');
    }

    // Apply the actual RBAC middleware
    return rbacMiddleware(req, res, next);
    
  } catch (error) {
    console.error('❌ RBAC middleware error:', error);
    logger.error('RBAC middleware error', error);
    res.status(500).json({ error: 'Authentication system unavailable' });
  }
}

// Export for direct testing
export { rbacInstance, rbacMiddleware, initializeRBAC };
