/**
 * RBAC Implementation
 * Role-based access control with permission checking
 */

import { Subject, Action, Resource, Context, CheckResult, Role, Permission } from './types.js';

/**
 * Built-in role definitions
 * SECURITY: Define a comprehensive role hierarchy
 */
const BUILT_IN_ROLES: Role[] = [
  {
    id: 'super_admin',
    name: 'Super Administrator',
    description: 'Full system access',
    permissions: [
      { id: 'super_admin_all', verb: '*', resource: '*' }
    ]
  },
  {
    id: 'org_admin',
    name: 'Organization Administrator',
    description: 'Full organization access',
    permissions: [
      { id: 'org_admin_keys', verb: '*', resource: 'keys' },
      { id: 'org_admin_policies', verb: '*', resource: 'policies' },
      { id: 'org_admin_users', verb: '*', resource: 'users' },
      { id: 'org_admin_sign', verb: '*', resource: 'sign' },
      { id: 'org_admin_verify', verb: '*', resource: 'verify' },
      { id: 'org_admin_audit', verb: 'read', resource: 'audit' },
      { id: 'org_admin_compliance', verb: '*', resource: 'compliance' }
    ]
  },
  {
    id: 'org_manager',
    name: 'Organization Manager',
    description: 'Manage organization resources',
    permissions: [
      { id: 'org_manager_keys', verb: 'read', resource: 'keys' },
      { id: 'org_manager_policies', verb: 'read', resource: 'policies' },
      { id: 'org_manager_users', verb: 'read', resource: 'users' },
      { id: 'org_manager_sign', verb: 'execute', resource: 'sign' },
      { id: 'org_manager_verify', verb: 'execute', resource: 'verify' },
      { id: 'org_manager_audit', verb: 'read', resource: 'audit' }
    ]
  },
  {
    id: 'developer',
    name: 'Developer',
    description: 'API access for signing and verification',
    permissions: [
      { id: 'developer_sign', verb: 'execute', resource: 'sign' },
      { id: 'developer_verify', verb: 'execute', resource: 'verify' },
      { id: 'developer_keys', verb: 'read', resource: 'keys' }
    ]
  },
  {
    id: 'auditor',
    name: 'Auditor',
    description: 'Read-only access to audit logs and compliance',
    permissions: [
      { id: 'auditor_audit', verb: 'read', resource: 'audit' },
      { id: 'auditor_compliance', verb: 'read', resource: 'compliance' },
      { id: 'auditor_policies', verb: 'read', resource: 'policies' }
    ]
  },
  {
    id: 'viewer',
    name: 'Viewer',
    description: 'Read-only access',
    permissions: [
      { id: 'viewer_verify', verb: 'execute', resource: 'verify' }
    ]
  },
  {
    id: 'service_account',
    name: 'Service Account',
    description: 'Automated service access',
    permissions: [
      { id: 'service_sign', verb: 'execute', resource: 'sign' },
      { id: 'service_verify', verb: 'execute', resource: 'verify' }
    ]
  }
];

/**
 * Role store - In production, this would be backed by a database
 */
class RoleStore {
  private roles: Map<string, Role> = new Map();
  
  constructor() {
    // Initialize with built-in roles
    BUILT_IN_ROLES.forEach(role => {
      this.roles.set(role.id, role);
    });
  }
  
  getRole(roleId: string): Role | undefined {
    return this.roles.get(roleId);
  }
  
  addRole(role: Role): void {
    this.roles.set(role.id, role);
  }
  
  getAllRoles(): Role[] {
    return Array.from(this.roles.values());
  }
}

// Singleton role store
const roleStore = new RoleStore();

/**
 * Check if a subject has permission to perform an action on a resource
 * SECURITY: Comprehensive permission checking with audit trail
 * 
 * @param subject - The entity performing the action
 * @param action - The action being performed
 * @param resource - The resource being accessed
 * @param context - Additional context for the check
 * @returns CheckResult indicating whether the action is allowed
 */
export function check(
  subject: Subject,
  action: Action,
  resource: Resource,
  context: Context
): CheckResult {
  // SECURITY: Validate inputs
  if (!subject || !action || !resource || !context) {
    return {
      allow: false,
      reason: 'Invalid check parameters: missing required fields'
    };
  }
  
  // SECURITY: Validate subject has required fields
  if (!subject.user_id || !subject.org_id || !Array.isArray(subject.roles)) {
    return {
      allow: false,
      reason: 'Invalid subject: missing user_id, org_id, or roles'
    };
  }
  
  // SECURITY: Validate action has required fields
  if (!action.verb || !action.resource) {
    return {
      allow: false,
      reason: 'Invalid action: missing verb or resource'
    };
  }
  
  // SECURITY: Check organization match for non-global resources
  if (resource.org_id && resource.org_id !== subject.org_id) {
    return {
      allow: false,
      reason: 'Organization mismatch: subject cannot access resources from other organizations'
    };
  }
  
  // Check if subject has no roles
  if (subject.roles.length === 0) {
    return {
      allow: false,
      reason: 'No roles assigned to subject'
    };
  }
  
  // Check each role for matching permissions
  for (const roleId of subject.roles) {
    const role = roleStore.getRole(roleId);
    
    if (!role) {
      continue; // Skip unknown roles
    }
    
    // Check role permissions
    for (const permission of role.permissions) {
      if (matchesPermission(action, permission)) {
        return {
          allow: true,
          reason: 'Permission granted',
          matched_role: roleId,
          matched_permission: permission.id
        };
      }
    }
    
    // Check inherited roles
    if (role.inherits && role.inherits.length > 0) {
      for (const inheritedRoleId of role.inherits) {
        const inheritedRole = roleStore.getRole(inheritedRoleId);
        if (inheritedRole) {
          for (const permission of inheritedRole.permissions) {
            if (matchesPermission(action, permission)) {
              return {
                allow: true,
                reason: 'Permission granted via role inheritance',
                matched_role: inheritedRoleId,
                matched_permission: permission.id
              };
            }
          }
        }
      }
    }
  }
  
  // No matching permission found
  return {
    allow: false,
    reason: `Permission denied: ${action.verb}:${action.resource}`
  };
}

/**
 * Check if an action matches a permission
 * SECURITY: Wildcard matching with proper precedence
 */
function matchesPermission(action: Action, permission: Permission): boolean {
  // Check verb match
  const verbMatch = permission.verb === '*' || permission.verb === action.verb;
  
  // Check resource match
  const resourceMatch = permission.resource === '*' || permission.resource === action.resource;
  
  return verbMatch && resourceMatch;
}

/**
 * Add a custom role to the role store
 * SECURITY: Validate role before adding
 */
export function addRole(role: Role): void {
  // SECURITY: Validate role structure
  if (!role.id || !role.name || !Array.isArray(role.permissions)) {
    throw new Error('Invalid role: missing id, name, or permissions');
  }
  
  // SECURITY: Validate role ID format (alphanumeric and underscores only)
  if (!/^[a-zA-Z0-9_]+$/.test(role.id)) {
    throw new Error('Invalid role ID: must contain only alphanumeric characters and underscores');
  }
  
  roleStore.addRole(role);
}

/**
 * Get a role by ID
 */
export function getRole(roleId: string): Role | undefined {
  return roleStore.getRole(roleId);
}

/**
 * Get all available roles
 */
export function getAllRoles(): Role[] {
  return roleStore.getAllRoles();
}

/**
 * Check if a subject has a specific role
 */
export function hasRole(subject: Subject, roleId: string): boolean {
  return subject.roles.includes(roleId);
}

/**
 * Check if a subject has any of the specified roles
 */
export function hasAnyRole(subject: Subject, roleIds: string[]): boolean {
  return roleIds.some(roleId => subject.roles.includes(roleId));
}

/**
 * Check if a subject has all of the specified roles
 */
export function hasAllRoles(subject: Subject, roleIds: string[]): boolean {
  return roleIds.every(roleId => subject.roles.includes(roleId));
}
