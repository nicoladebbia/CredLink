/**
 * RBAC Type Definitions
 * Core types for role-based access control
 */

/**
 * Subject - The entity performing the action (user, service, etc.)
 */
export interface Subject {
  /** Unique user identifier */
  user_id: string;
  
  /** Organization identifier */
  org_id: string;
  
  /** Roles assigned to the subject */
  roles: string[];
  
  /** Optional additional attributes */
  attributes?: Record<string, any>;
}

/**
 * Action - The operation being performed
 */
export interface Action {
  /** The action verb (create, read, update, delete, execute, etc.) */
  verb: string;
  
  /** The resource type being acted upon */
  resource: string;
}

/**
 * Resource - The target of the action
 */
export interface Resource {
  /** Resource type */
  type: string;
  
  /** Organization identifier */
  org_id?: string;
  
  /** Resource identifier */
  id?: string;
  
  /** Optional additional attributes */
  attributes?: Record<string, any>;
}

/**
 * Context - Additional context for the authorization decision
 */
export interface Context {
  /** Timestamp of the request */
  timestamp: Date;
  
  /** Request identifier for tracking */
  request_id: string;
  
  /** User agent information */
  user_agent?: string;
  
  /** IP address */
  ip_address?: string;
  
  /** Optional additional context */
  metadata?: Record<string, any>;
}

/**
 * CheckResult - The result of an RBAC check
 */
export interface CheckResult {
  /** Whether the action is allowed */
  allow: boolean;
  
  /** Reason for the decision */
  reason: string;
  
  /** Optional matched role */
  matched_role?: string;
  
  /** Optional matched permission */
  matched_permission?: string;
}

/**
 * Role Definition
 */
export interface Role {
  /** Role identifier */
  id: string;
  
  /** Role name */
  name: string;
  
  /** Role description */
  description?: string;
  
  /** Permissions granted by this role */
  permissions: Permission[];
  
  /** Optional role hierarchy (inherits from) */
  inherits?: string[];
}

/**
 * Permission Definition
 */
export interface Permission {
  /** Permission identifier */
  id: string;
  
  /** Action verb */
  verb: string;
  
  /** Resource type */
  resource: string;
  
  /** Optional resource attributes constraints */
  constraints?: Record<string, any>;
}
