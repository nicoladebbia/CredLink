/**
 * Feature Flags Service - Beta feature gating
 * Controls access to beta features per organization
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { check, Subject } from '@credlink/rbac';

interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  org_id?: string; // undefined for global flags
  environments: ('development' | 'staging' | 'production')[];
  owner_role: string; // Role that can toggle this flag
  created_at: string;
  updated_at: string;
  updated_by: string;
}

interface FlagEvaluation {
  flag_id: string;
  enabled: boolean;
  reason: string;
}

const app = new Hono();

// Mock storage
const mockStorage = {
  flags: new Map<string, FeatureFlag>(),
  
  async getFlag(id: string): Promise<FeatureFlag | null> {
    return this.flags.get(id) || null;
  },
  
  async createFlag(flag: FeatureFlag): Promise<void> {
    this.flags.set(flag.id, flag);
  },
  
  async updateFlag(id: string, updates: Partial<FeatureFlag>): Promise<boolean> {
    const flag = this.flags.get(id);
    if (flag) {
      this.flags.set(id, { ...flag, ...updates });
      return true;
    }
    return false;
  },
  
  async listFlags(orgId?: string): Promise<FeatureFlag[]> {
    const allFlags = Array.from(this.flags.values());
    
    if (orgId) {
      // Return global flags + org-specific flags
      return allFlags.filter(flag => 
        !flag.org_id || flag.org_id === orgId
      );
    }
    
    return allFlags;
  },
  
  async deleteFlag(id: string): Promise<boolean> {
    return this.flags.delete(id);
  }
};

// Seed default feature flags
mockStorage.createFlag({
  id: 'beta-key-custody-hsm',
  name: 'Key Custody HSM',
  description: 'Hardware Security Module support for key custody',
  enabled: false,
  environments: ['development', 'staging'],
  owner_role: 'org_admin',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  updated_by: 'system'
});

mockStorage.createFlag({
  id: 'beta-tsa-anchoring',
  name: 'TSA Anchoring',
  description: 'RFC3161 Time Stamp Authority anchoring for provenance',
  enabled: false,
  environments: ['development', 'staging'],
  owner_role: 'org_admin',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  updated_by: 'system'
});

mockStorage.createFlag({
  id: 'pilot-org-enhanced-audit',
  name: 'Enhanced Audit Logging',
  description: 'Enhanced audit logging with detailed chain of custody',
  enabled: true,
  org_id: 'pilot_org_123',
  environments: ['development', 'staging', 'production'],
  owner_role: 'org_admin',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  updated_by: 'system'
});

/**
 * Authentication Middleware
 */
async function authenticate(c: any): Promise<Subject | null> {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  
  // Mock authentication
  if (token === 'mock-admin-token') {
    return {
      user_id: 'admin_123',
      org_id: 'org_123',
      roles: ['org_admin'],
      ip_address: c.req.header('CF-Connecting-IP')
    };
  }
  
  if (token === 'mock-pilot-token') {
    return {
      user_id: 'pilot_user_123',
      org_id: 'pilot_org_123',
      roles: ['org_admin'],
      ip_address: c.req.header('CF-Connecting-IP')
    };
  }

  return null;
}

/**
 * Feature Flag Evaluation
 */
export class FeatureFlagEvaluator {
  /**
   * Evaluate if feature is enabled for organization
   */
  static async evaluate(
    flagId: string,
    orgId: string,
    environment: string = 'production'
  ): Promise<FlagEvaluation> {
    const flag = await mockStorage.getFlag(flagId);
    
    if (!flag) {
      return {
        flag_id: flagId,
        enabled: false,
        reason: 'Flag not found'
      };
    }

    // Check environment support
    if (!flag.environments.includes(environment as any)) {
      return {
        flag_id: flagId,
        enabled: false,
        reason: `Flag not available in ${environment} environment`
      };
    }

    // Check if flag is org-specific
    if (flag.org_id && flag.org_id !== orgId) {
      return {
        flag_id: flagId,
        enabled: false,
        reason: 'Flag not available for this organization'
      };
    }

    // Check if flag is enabled
    if (!flag.enabled) {
      return {
        flag_id: flagId,
        enabled: false,
        reason: 'Flag disabled'
      };
    }

    return {
      flag_id: flagId,
      enabled: true,
      reason: 'Flag enabled'
    };
  }

  /**
   * Check multiple flags
   */
  static async evaluateMany(
    flagIds: string[],
    orgId: string,
    environment?: string
  ): Promise<FlagEvaluation[]> {
    const results = await Promise.all(
      flagIds.map(id => this.evaluate(id, orgId, environment))
    );
    return results;
  }

  /**
   * Get all enabled flags for organization
   */
  static async getEnabledFlags(
    orgId: string,
    environment?: string
  ): Promise<FeatureFlag[]> {
    const allFlags = await mockStorage.listFlags(orgId);
    
    return allFlags.filter(flag => {
      // Check environment
      if (environment && !flag.environments.includes(environment as any)) {
        return false;
      }
      
      // Check org scope
      if (flag.org_id && flag.org_id !== orgId) {
        return false;
      }
      
      // Check enabled
      return flag.enabled;
    });
  }
}

/**
 * Feature Flag Endpoints
 */

// Evaluate feature flag
app.get('/flags/:flagId/evaluate', async (c) => {
  const flagId = c.req.param('flagId');
  const orgId = c.req.query('orgId') || 'default';
  const environment = c.req.query('environment') || 'production';
  
  const result = await FeatureFlagEvaluator.evaluate(flagId, orgId, environment);
  
  return c.json(result);
});

// Evaluate multiple flags
app.post('/flags/evaluate', async (c) => {
  const { flagIds, orgId, environment } = await c.req.json();
  
  const results = await FeatureFlagEvaluator.evaluateMany(
    flagIds,
    orgId || 'default',
    environment || 'production'
  );
  
  return c.json({ results });
});

// List all flags
app.get('/flags', async (c) => {
  const subject = await authenticate(c);
  if (!subject) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Check authorization
  const canRead = check(
    subject,
    { verb: 'read', resource: 'flags' },
    { type: 'flags', org_id: subject.org_id },
    { timestamp: new Date(), request_id: 'list_flags' }
  );

  if (!canRead.allow) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const orgId = c.req.query('orgId');
  const flags = await mockStorage.listFlags(orgId);
  
  return c.json({ flags });
});

// Create feature flag
app.post('/flags', async (c) => {
  const subject = await authenticate(c);
  if (!subject) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Check authorization
  const canCreate = check(
    subject,
    { verb: 'create', resource: 'flags' },
    { type: 'flags', org_id: subject.org_id },
    { timestamp: new Date(), request_id: 'create_flag' }
  );

  if (!canCreate.allow) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const flagData = await c.req.json();
  
  const flag: FeatureFlag = {
    id: `flag_${crypto.randomUUID()}`,
    name: flagData.name,
    description: flagData.description,
    enabled: flagData.enabled || false,
    org_id: flagData.org_id,
    environments: flagData.environments || ['development'],
    owner_role: flagData.owner_role || 'org_admin',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: subject.user_id
  };

  await mockStorage.createFlag(flag);
  
  return c.json(flag, 201);
});

// Update feature flag
app.put('/flags/:flagId', async (c) => {
  const flagId = c.req.param('flagId');
  const subject = await authenticate(c);
  if (!subject) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const existingFlag = await mockStorage.getFlag(flagId);
  if (!existingFlag) {
    return c.json({ error: 'Flag not found' }, 404);
  }

  // Check if user has permission to update this flag
  if (!subject.roles.includes(existingFlag.owner_role)) {
    return c.json({ error: 'Forbidden: Cannot update this flag' }, 403);
  }

  // Check authorization
  const canUpdate = check(
    subject,
    { verb: 'update', resource: 'flags' },
    { type: 'flags', org_id: subject.org_id },
    { timestamp: new Date(), request_id: 'update_flag' }
  );

  if (!canUpdate.allow) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const updates = await c.req.json();
  
  const updatedFlag = {
    ...existingFlag,
    ...updates,
    updated_at: new Date().toISOString(),
    updated_by: subject.user_id
  };

  const success = await mockStorage.updateFlag(flagId, updatedFlag);
  
  if (success) {
    return c.json(updatedFlag);
  } else {
    return c.json({ error: 'Failed to update flag' }, 500);
  }
});

// Delete feature flag
app.delete('/flags/:flagId', async (c) => {
  const flagId = c.req.param('flagId');
  const subject = await authenticate(c);
  if (!subject) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const existingFlag = await mockStorage.getFlag(flagId);
  if (!existingFlag) {
    return c.json({ error: 'Flag not found' }, 404);
  }

  // Only system or org_admin can delete flags
  if (!subject.roles.includes('org_admin') && subject.user_id !== 'system') {
    return c.json({ error: 'Forbidden: Cannot delete flags' }, 403);
  }

  const success = await mockStorage.deleteFlag(flagId);
  
  if (success) {
    return c.body(null, 204);
  } else {
    return c.json({ error: 'Failed to delete flag' }, 500);
  }
});

/**
 * Helper Functions
 */

/**
 * Check if feature is enabled (for use by other services)
 */
export async function isFeatureEnabled(
  flagId: string,
  orgId: string,
  environment?: string
): Promise<boolean> {
  const result = await FeatureFlagEvaluator.evaluate(flagId, orgId, environment);
  return result.enabled;
}

/**
 * Get enabled features for organization
 */
export async function getEnabledFeatures(
  orgId: string,
  environment?: string
): Promise<string[]> {
  const flags = await FeatureFlagEvaluator.getEnabledFlags(orgId, environment);
  return flags.map(flag => flag.id);
}

export default app;
