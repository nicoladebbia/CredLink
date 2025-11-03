/**
 * SCIM Service - RFC 7643/7644 User Provisioning
 * Implements create/disable only (no group sync)
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { 
  scimHandler, 
  SCIMUser, 
  SCIMError, 
  SCIMListResponse,
  SCIMValidator,
  SCIMPatchOperation
} from '@c2/scim-core';
import { check, Subject } from '@c2/rbac';

const app = new Hono();

// CORS for cross-origin requests
app.use('/*', cors({
  origin: ['https://*.okta.com', 'https://*.microsoftonline.com'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Mock environment for development
const mockEnv = {
  KV: {
    get: async (key: string) => null,
    put: async (key: string, value: string, options?: any) => {},
    delete: async (key: string) => {}
  },
  JWT_SECRET: 'mock-secret-key'
};

/**
 * Authentication Middleware
 */
async function authenticateSCIM(c: any): Promise<Subject | null> {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  
  // In production, validate Bearer token against org's SCIM config
  // For now, accept any token for development
  if (token === 'mock-scim-token') {
    return {
      user_id: 'scim_system',
      org_id: 'org_123',
      roles: ['org_admin'],
      ip_address: c.req.header('CF-Connecting-IP')
    };
  }

  return null;
}

/**
 * SCIM Endpoints
 */

// Service Provider Configuration
app.get('/scim/v2/ServiceProviderConfig', async (c) => {
  try {
    const config = await scimHandler.getServiceProviderConfig();
    return c.json(config);
  } catch (error) {
    console.error('ServiceProviderConfig error:', error);
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Internal server error',
      status: 500
    }, 500);
  }
});

// Resource Types
app.get('/scim/v2/ResourceTypes', async (c) => {
  try {
    const resourceTypes = await scimHandler.getResourceTypes();
    return c.json(resourceTypes);
  } catch (error) {
    console.error('ResourceTypes error:', error);
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Internal server error',
      status: 500
    }, 500);
  }
});

// Schemas
app.get('/scim/v2/Schemas', async (c) => {
  try {
    const schemas = await scimHandler.getSchemas();
    return c.json(schemas);
  } catch (error) {
    console.error('Schemas error:', error);
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Internal server error',
      status: 500
    }, 500);
  }
});

/**
 * User Operations
 */

// Create User
app.post('/scim/v2/Users', async (c) => {
  const subject = await authenticateSCIM(c);
  if (!subject) {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Authentication required',
      status: 401
    }, 401);
  }

  // Check authorization
  const canCreate = check(
    subject,
    { verb: 'create', resource: 'users' },
    { type: 'users', org_id: subject.org_id },
    { timestamp: new Date(), request_id: 'scim_create_user' }
  );

  if (!canCreate.allow) {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Forbidden: Cannot create users',
      status: 403
    }, 403);
  }

  try {
    const userData = await c.req.json();
    
    // Validate user data
    const validationErrors = SCIMValidator.validateUser(userData);
    if (validationErrors.length > 0) {
      return c.json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: validationErrors.join(', '),
        status: 400
      }, 400);
    }

    // Create user
    const user = await scimHandler.createUser(userData);
    
    // Log audit event
    await logSCIMEvent(c, {
      action: 'user.created',
      userId: user.id,
      userName: user.userName,
      details: { provider: 'scim' }
    });

    return c.json(user, 201);
  } catch (error) {
    console.error('Create user error:', error);
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Failed to create user',
      status: 500
    }, 500);
  }
});

// Get User
app.get('/scim/v2/Users/:id', async (c) => {
  const subject = await authenticateSCIM(c);
  if (!subject) {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Authentication required',
      status: 401
    }, 401);
  }

  const id = c.req.param('id');
  
  try {
    const user = await scimHandler.getUser(id);
    
    if (!user) {
      return c.json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: 'User not found',
        status: 404
      }, 404);
    }

    return c.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Failed to get user',
      status: 500
    }, 500);
  }
});

// List Users
app.get('/scim/v2/Users', async (c) => {
  const subject = await authenticateSCIM(c);
  if (!subject) {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Authentication required',
      status: 401
    }, 401);
  }

  const filter = c.req.query('filter');
  const startIndex = parseInt(c.req.query('startIndex') || '1');
  const count = parseInt(c.req.query('count') || '50');

  try {
    const users = await scimHandler.listUsers(filter, startIndex, count);
    return c.json(users);
  } catch (error) {
    console.error('List users error:', error);
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Failed to list users',
      status: 500
    }, 500);
  }
});

// Update User (PUT - replace entire user)
app.put('/scim/v2/Users/:id', async (c) => {
  const subject = await authenticateSCIM(c);
  if (!subject) {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Authentication required',
      status: 401
    }, 401);
  }

  const id = c.req.param('id');
  
  // Check authorization
  const canUpdate = check(
    subject,
    { verb: 'update', resource: 'users' },
    { type: 'users', org_id: subject.org_id },
    { timestamp: new Date(), request_id: 'scim_update_user' }
  );

  if (!canUpdate.allow) {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Forbidden: Cannot update users',
      status: 403
    }, 403);
  }

  try {
    const userData = await c.req.json();
    
    // Validate user data
    const validationErrors = SCIMValidator.validateUser(userData);
    if (validationErrors.length > 0) {
      return c.json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: validationErrors.join(', '),
        status: 400
      }, 400);
    }

    const user = await scimHandler.updateUser(id, userData);
    
    if (!user) {
      return c.json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: 'User not found',
        status: 404
      }, 404);
    }

    // Log audit event
    await logSCIMEvent(c, {
      action: 'user.updated',
      userId: user.id,
      userName: user.userName,
      details: { provider: 'scim' }
    });

    return c.json(user);
  } catch (error) {
    console.error('Update user error:', error);
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Failed to update user',
      status: 500
    }, 500);
  }
});

// Patch User (PATCH - partial update, for deprovision)
app.patch('/scim/v2/Users/:id', async (c) => {
  const subject = await authenticateSCIM(c);
  if (!subject) {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Authentication required',
      status: 401
    }, 401);
  }

  const id = c.req.param('id');
  
  // Check authorization
  const canUpdate = check(
    subject,
    { verb: 'update', resource: 'users' },
    { type: 'users', org_id: subject.org_id },
    { timestamp: new Date(), request_id: 'scim_patch_user' }
  );

  if (!canUpdate.allow) {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Forbidden: Cannot update users',
      status: 403
    }, 403);
  }

  try {
    const patchData = await c.req.json();
    
    // Validate patch operations
    if (!Array.isArray(patchData.Operations)) {
      return c.json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: 'Operations array is required',
        status: 400
      }, 400);
    }

    for (const op of patchData.Operations) {
      const validationErrors = SCIMValidator.validatePatchOperation(op);
      if (validationErrors.length > 0) {
        return c.json({
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          detail: validationErrors.join(', '),
          status: 400
        }, 400);
      }
    }

    const user = await scimHandler.patchUser(id, patchData.Operations);
    
    if (!user) {
      return c.json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: 'User not found',
        status: 404
      }, 404);
    }

    // Log audit event (especially for deprovision)
    const isDeprovision = patchData.Operations.some(
      (op: SCIMPatchOperation) => op.path === 'active' && op.value === false
    );
    
    if (isDeprovision) {
      await logSCIMEvent(c, {
        action: 'user.deprovisioned',
        userId: user.id,
        userName: user.userName,
        details: { provider: 'scim', method: 'patch' }
      });
    }

    return c.json(user);
  } catch (error) {
    console.error('Patch user error:', error);
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Failed to patch user',
      status: 500
    }, 500);
  }
});

// Delete User
app.delete('/scim/v2/Users/:id', async (c) => {
  const subject = await authenticateSCIM(c);
  if (!subject) {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Authentication required',
      status: 401
    }, 401);
  }

  const id = c.req.param('id');
  
  // Check authorization
  const canDelete = check(
    subject,
    { verb: 'delete', resource: 'users' },
    { type: 'users', org_id: subject.org_id },
    { timestamp: new Date(), request_id: 'scim_delete_user' }
  );

  if (!canDelete.allow) {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Forbidden: Cannot delete users',
      status: 403
    }, 403);
  }

  try {
    const user = await scimHandler.getUser(id);
    
    if (!user) {
      return c.json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: 'User not found',
        status: 404
      }, 404);
    }

    const deleted = await scimHandler.deleteUser(id);
    
    if (deleted) {
      // Log audit event
      await logSCIMEvent(c, {
        action: 'user.deleted',
        userId: user.id,
        userName: user.userName,
        details: { provider: 'scim' }
      });

      return c.body(null, 204);
    } else {
      return c.json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: 'Failed to delete user',
        status: 500
      }, 500);
    }
  } catch (error) {
    console.error('Delete user error:', error);
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Failed to delete user',
      status: 500
    }, 500);
  }
});

/**
 * Group Operations (Read-Only)
 */

// List Groups (read-only)
app.get('/scim/v2/Groups', async (c) => {
  const subject = await authenticateSCIM(c);
  if (!subject) {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Authentication required',
      status: 401
    }, 401);
  }

  // Return empty groups list (group sync deferred)
  return c.json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: 0,
    startIndex: 1,
    itemsPerPage: 0,
    Resources: []
  });
});

/**
 * Helper Functions
 */

async function logSCIMEvent(c: any, event: any): Promise<void> {
  const auditRecord = {
    ts: new Date().toISOString(),
    actor: {
      user_id: 'scim_system',
      ip: c.req.header('CF-Connecting-IP')
    },
    request_id: crypto.randomUUID(),
    action: event.action,
    resource: { 
      type: 'user',
      id: event.userId,
      org_id: 'org_123'
    },
    details: event.details,
    hash: '',
    sig: ''
  };
  
  console.log('SCIM Audit Event:', JSON.stringify(auditRecord, null, 2));
}

export default app;
