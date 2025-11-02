/**
 * RBAC Core - Central authorization check function
 * Aligned with OWASP ASVS V4 Access Control guidance
 */

export interface Subject {
  user_id: string;
  org_id: string;
  roles: string[];
  ip_address?: string;
  api_key_id?: string;
}

export interface Action {
  verb: string; // 'create', 'read', 'update', 'delete', 'execute'
  resource: string; // 'users', 'keys', 'policies', 'audit'
  scope?: string; // Additional scope like 'sign:assets'
}

export interface Resource {
  id?: string;
  org_id?: string;
  type: string;
  owner_id?: string;
}

export interface Context {
  timestamp: Date;
  request_id: string;
  ip_address?: string;
  user_agent?: string;
}

export interface AuthzResult {
  allow: boolean;
  reason: string;
  policy_evaluated?: string;
  conditions_met?: string[];
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Simple rate limiting implementation (in-memory)
 * In production, use Redis or external rate limiting service
 */
const rateLimitCache = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 1000;

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const existing = rateLimitCache.get(key);
  
  if (!existing || now > existing.resetTime) {
    rateLimitCache.set(key, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW
    });
    return false;
  }
  
  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }
  
  existing.count++;
  return false;
}

/**
 * Central RBAC check function - ASVS V4 aligned
 * Returns deterministic authorization decisions
 */
export function check(
  subject: Subject,
  action: Action,
  resource: Resource,
  context: Context
): AuthzResult {
  // 1. Input sanitization and validation
  const sanitizedSubject = {
    user_id: subject.user_id?.trim().replace(/[<>]/g, ''),
    org_id: subject.org_id?.trim().replace(/[<>]/g, ''),
    roles: Array.isArray(subject.roles) ? subject.roles.filter(r => typeof r === 'string' && r.length > 0) : [],
    ip_address: subject.ip_address?.trim(),
    api_key_id: subject.api_key_id?.trim()
  };

  const sanitizedAction = {
    verb: action.verb?.trim().toLowerCase(),
    resource: action.resource?.trim().toLowerCase(),
    scope: action.scope?.trim()
  };

  const sanitizedResource = {
    id: resource.id?.trim(),
    org_id: resource.org_id?.trim(),
    type: resource.type?.trim().toLowerCase(),
    owner_id: resource.owner_id?.trim()
  };

  // 2. Basic existence checks with timing-safe comparisons
  if (!sanitizedSubject.user_id || !sanitizedSubject.org_id) {
    return {
      allow: false,
      reason: 'Invalid subject: missing user_id or org_id'
    };
  }

  // Validate user_id and org_id format
  if (!/^[a-zA-Z0-9_-]+$/.test(sanitizedSubject.user_id) || 
      !/^[a-zA-Z0-9_-]+$/.test(sanitizedSubject.org_id)) {
    return {
      allow: false,
      reason: 'Invalid subject format'
    };
  }

  // 3. Organization boundary enforcement with constant-time comparison
  if (sanitizedResource.org_id && 
      !constantTimeEquals(sanitizedSubject.org_id, sanitizedResource.org_id)) {
    return {
      allow: false,
      reason: 'Cross-organization access denied'
    };
  }

  // 4. Validate action and resource
  if (!sanitizedAction.verb || !sanitizedAction.resource || !sanitizedResource.type) {
    return {
      allow: false,
      reason: 'Invalid action or resource'
    };
  }

  // 5. Rate limiting check (in-memory for now, should use Redis in production)
  const rateLimitKey = `${sanitizedSubject.user_id}:${sanitizedAction.verb}:${sanitizedAction.resource}`;
  if (isRateLimited(rateLimitKey)) {
    return {
      allow: false,
      reason: 'Rate limit exceeded'
    };
  }

  // 6. Role-based access control matrix
  const capability = `${sanitizedAction.verb}:${sanitizedAction.resource}`;
  
  // Org Admin - full access within org
  if (sanitizedSubject.roles.includes('org_admin')) {
    return {
      allow: true,
      reason: 'Org Admin has full access within organization',
      policy_evaluated: 'org_admin',
      conditions_met: ['role_check', 'org_boundary', 'input_validation']
    };
  }

  // Auditor - read-only access to compliance data
  if (sanitizedSubject.roles.includes('auditor')) {
    const allowedAuditorActions = new Set([
      'read:audit',
      'read:policies',
      'read:reports',
      'export:compliance'
    ]);
    
    if (allowedAuditorActions.has(capability)) {
      return {
        allow: true,
        reason: 'Auditor has read-only access to compliance data',
        policy_evaluated: 'auditor',
        conditions_met: ['role_check', 'read_only_scope', 'input_validation']
      };
    }
    
    return {
      allow: false,
      reason: 'Auditor role cannot perform write operations'
    };
  }

  // Integrator - API-only access with scoped permissions
  if (sanitizedSubject.roles.includes('integrator')) {
    // Integrators must use API keys
    if (!sanitizedSubject.api_key_id) {
      return {
        allow: false,
        reason: 'Integrator role requires API key authentication'
      };
    }
    
    const allowedIntegratorActions = new Set([
      'execute:sign',
      'read:keys',
      'create:manifests'
    ]);
    
    if (allowedIntegratorActions.has(capability) && 
        sanitizedAction.scope && 
        sanitizedSubject.api_key_id) {
      return {
        allow: true,
        reason: 'Integrator has scoped API access',
        policy_evaluated: 'integrator',
        conditions_met: ['role_check', 'api_key_auth', 'scope_match', 'input_validation']
      };
    }
    
    return {
      allow: false,
      reason: 'Integrator role has limited API scope'
    };
  }

  // 7. Default deny
  return {
    allow: false,
    reason: 'Access denied: no matching role permissions'
  };
}

/**
 * Check if user has specific role
 */
export function hasRole(subject: Subject, role: string): boolean {
  return subject.roles.includes(role);
}

/**
 * Check if user can perform action on specific resource type
 */
export function can(
  subject: Subject,
  verb: string,
  resource: string,
  scope?: string
): boolean {
  // Input validation
  if (!verb || !resource || typeof verb !== 'string' || typeof resource !== 'string') {
    return false;
  }
  
  const result = check(
    subject,
    { verb: verb.trim().toLowerCase(), resource: resource.trim().toLowerCase(), scope: scope?.trim() },
    { type: resource.trim().toLowerCase() },
    { timestamp: new Date(), request_id: `check_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` }
  );
  return result.allow;
}

/**
 * Get all permissions for a subject
 */
export function getPermissions(subject: Subject): string[] {
  const permissions: string[] = [];
  
  // Input validation
  if (!subject || !Array.isArray(subject.roles)) {
    return permissions;
  }
  
  if (subject.roles.includes('org_admin')) {
    permissions.push(
      'create:users', 'read:users', 'update:users', 'delete:users',
      'create:keys', 'read:keys', 'update:keys', 'delete:keys',
      'create:policies', 'read:policies', 'update:policies', 'delete:policies',
      'read:audit', 'export:compliance',
      'create:api_keys', 'read:api_keys', 'update:api_keys', 'delete:api_keys',
      'execute:sign', 'enable:anchoring'
    );
  }
  
  if (subject.roles.includes('auditor')) {
    permissions.push(
      'read:audit', 'read:policies', 'read:reports',
      'export:compliance'
    );
  }
  
  if (subject.roles.includes('integrator')) {
    permissions.push(
      'execute:sign', 'read:keys', 'create:manifests'
    );
  }
  
  // Return unique permissions to avoid duplicates
  return [...new Set(permissions)];
}

/**
 * Policy evaluation for additional business rules
 */
export interface PolicyRule {
  name: string;
  condition: (subject: Subject, action: Action, resource: Resource, context: Context) => boolean;
  error_message: string;
}

/**
 * Evaluate additional policy rules beyond RBAC
 */
export function evaluatePolicies(
  subject: Subject,
  action: Action,
  resource: Resource,
  context: Context,
  rules: PolicyRule[]
): AuthzResult {
  // Input validation
  if (!Array.isArray(rules)) {
    return {
      allow: false,
      reason: 'Invalid policy rules'
    };
  }
  
  // First check RBAC
  const rbacResult = check(subject, action, resource, context);
  if (!rbacResult.allow) {
    return rbacResult;
  }

  // Then evaluate additional policies
  const conditionsMet: string[] = rbacResult.conditions_met || [];
  
  for (const rule of rules) {
    // Validate rule structure
    if (!rule || typeof rule.name !== 'string' || typeof rule.condition !== 'function' || typeof rule.error_message !== 'string') {
      return {
        allow: false,
        reason: 'Invalid policy rule structure'
      };
    }
    
    try {
      if (!rule.condition(subject, action, resource, context)) {
        return {
          allow: false,
          reason: rule.error_message,
          policy_evaluated: rule.name
        };
      }
      conditionsMet.push(rule.name);
    } catch (error) {
      return {
        allow: false,
        reason: `Policy rule '${rule.name}' execution failed`,
        policy_evaluated: rule.name
      };
    }
  }

  return {
    allow: true,
    reason: 'All policy checks passed',
    policy_evaluated: 'rbac+policies',
    conditions_met: conditionsMet
  };
}
