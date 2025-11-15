/**
 * @credlink/rbac
 * Enterprise Role-Based Access Control System
 * 
 * Provides comprehensive RBAC functionality for CredLink platform
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

export {
  check,
  addRole,
  getRole,
  getAllRoles,
  hasRole,
  hasAnyRole,
  hasAllRoles
} from './rbac.js';
