/**
 * @credlink/rbac
 * Enterprise Role-Based Access Control System
 * 
 * SECURITY CRITICAL: Database-backed RBAC with persistent storage
 * Replaces vulnerable in-memory Map storage that loses permissions on restart
 */

export {
  Subject,
  Action,
  Resource,
  Context,
  CheckResult,
  Role,
  Permission
} from './types.js';

// 🔥 HARSH SECURITY FIX: Replace in-memory RBAC with DatabaseRBAC
// Previous implementation used vulnerable Map storage that lost data on restart
export { DatabaseRBAC } from './database-rbac.js';

// STEP 10: RBAC Middleware Integration
// Express middleware for bridging authentication with authorization
export {
  RBACMiddleware,
  createRBACMiddleware,
  type RBACMiddlewareOptions
} from './rbac-middleware.js';

// Export DatabaseRBAC methods as the main interface for backward compatibility
// These require a database connection pool - breaking change as documented
export {
  RBACConfigValidator,
  type RBACConfig
} from './config-validator.js';

// Migration utilities for database setup
// Note: Migration functionality removed during dead code cleanup
// TODO: Implement new migration system if needed
