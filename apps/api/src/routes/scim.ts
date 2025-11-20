/**
 * SCIM 2.0 User Provisioning Routes
 * Supports automated user/group provisioning from IdPs
 * 
 * Spec: RFC 7643, RFC 7644
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { decryptSCIMToken } from '../utils/token-encryption';
import { SSOService } from '../services/sso-service';
import { initializeSCIMTokenCache, getSCIMTokenCache } from '../utils/scim-token-cache';
import crypto from 'crypto';

interface SCIMUser {
  id?: string;
  externalId?: string;
  userName: string;
  name?: {
    formatted?: string;
    familyName?: string;
    givenName?: string;
    middleName?: string;
    honorificPrefix?: string;
    honorificSuffix?: string;
  };
  displayName?: string;
  emails?: Array<{ value: string; type?: string; primary?: boolean }>;
  phoneNumbers?: Array<{ value: string; type?: string; primary?: boolean }>;
  active?: boolean;
  groups?: Array<{ value: string; display?: string }>;
  roles?: Array<{ value: string; display?: string }>;
  meta?: {
    resourceType?: string;
    created?: string;
    lastModified?: string;
    location?: string;
  };
}

interface SCIMGroup {
  id?: string;
  displayName: string;
  members?: Array<{ value: string; display?: string; type?: string }>;
  meta?: {
    resourceType?: string;
    created?: string;
    lastModified?: string;
    location?: string;
  };
}

export function createSCIMRouter(pool: Pool): Router {
  const router = Router();
  const ssoService = new SSOService(pool);
  
  // 🔥 OPTIMIZATION: Initialize SCIM token cache for performance
  const tokenCache = initializeSCIMTokenCache(pool);

  /**
   * SCIM Bearer Token Authentication Middleware
   */
  const scimAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          status: '401',
          detail: 'Authentication required'
        });
        return;
      }

      const token = authHeader.substring(7);
      
      // 🔥 OPTIMIZATION: Use cached SCIM token validation for performance
      // Replaces slow loop-through-all-providers approach
      const validProvider = await tokenCache.findProviderByToken(token);
      
      if (!validProvider) {
        res.status(401).json({
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          status: '401',
          detail: 'Invalid authentication token'
        });
        return;
      }

      // Attach provider info to request
      (req as any).scimProvider = validProvider;
      
      next();
    } catch (error) {
      logger.error('SCIM authentication failed', { error });
      res.status(500).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '500',
        detail: 'Internal server error'
      });
    }
  };

  /**
   * GET /scim/v2/ServiceProviderConfig
   * Service provider configuration
   */
  router.get('/ServiceProviderConfig', (req: Request, res: Response) => {
    res.json({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
      documentationUri: 'https://docs.credlink.com/scim',
      patch: {
        supported: true
      },
      bulk: {
        supported: false,
        maxOperations: 0,
        maxPayloadSize: 0
      },
      filter: {
        supported: true,
        maxResults: 200
      },
      changePassword: {
        supported: false
      },
      sort: {
        supported: true
      },
      etag: {
        supported: true
      },
      authenticationSchemes: [
        {
          type: 'oauthbearertoken',
          name: 'OAuth Bearer Token',
          description: 'Authentication scheme using the OAuth Bearer Token Standard',
          specUri: 'https://tools.ietf.org/html/rfc6750',
          documentationUri: 'https://docs.credlink.com/scim/auth',
          primary: true
        }
      ]
    });
  });

  /**
   * GET /scim/v2/ResourceTypes
   * Supported resource types
   */
  router.get('/ResourceTypes', (req: Request, res: Response) => {
    res.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: 2,
      Resources: [
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
          id: 'User',
          name: 'User',
          endpoint: '/Users',
          description: 'User Account',
          schema: 'urn:ietf:params:scim:schemas:core:2.0:User'
        },
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
          id: 'Group',
          name: 'Group',
          endpoint: '/Groups',
          description: 'Group',
          schema: 'urn:ietf:params:scim:schemas:core:2.0:Group'
        }
      ]
    });
  });

  /**
   * GET /scim/v2/Schemas
   * Supported schemas
   */
  router.get('/Schemas', (req: Request, res: Response) => {
    res.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: 2,
      Resources: [
        {
          id: 'urn:ietf:params:scim:schemas:core:2.0:User',
          name: 'User',
          description: 'User Account'
        },
        {
          id: 'urn:ietf:params:scim:schemas:core:2.0:Group',
          name: 'Group',
          description: 'Group'
        }
      ]
    });
  });

  // Apply authentication to all user/group endpoints
  router.use('/Users', scimAuth);
  router.use('/Groups', scimAuth);

  /**
   * GET /scim/v2/Users
   * List users with filtering
   */
  router.get('/Users', async (req: Request, res: Response) => {
    try {
      const { scimProvider } = req as any;
      const { filter, startIndex = 1, count = 100 } = req.query;

      let query = `
        SELECT * FROM scim_users
        WHERE provider_id = $1
      `;
      const params: any[] = [scimProvider.id];

      // Simple filter support (userName eq "value")
      if (filter) {
        const filterStr = filter as string;
        const match = filterStr.match(/userName eq "([^"]+)"/);
        if (match) {
          query += ' AND user_name = $2';
          params.push(match[1]);
        }
      }

      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(parseInt(count as string), parseInt(startIndex as string) - 1);

      const result = await pool.query(query, params);

      const users = result.rows.map(row => ({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        id: row.scim_id,
        externalId: row.external_id,
        userName: row.user_name,
        name: {
          formatted: row.formatted_name,
          familyName: row.family_name,
          givenName: row.given_name,
          middleName: row.middle_name,
          honorificPrefix: row.honorific_prefix,
          honorificSuffix: row.honorific_suffix
        },
        displayName: row.formatted_name,
        emails: row.emails,
        phoneNumbers: row.phone_numbers,
        active: row.active,
        groups: row.groups,
        meta: {
          resourceType: 'User',
          created: row.created_at,
          lastModified: row.updated_at,
          location: `${process.env.API_URL}/scim/v2/Users/${row.scim_id}`
        }
      }));

      res.json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
        totalResults: users.length,
        startIndex: parseInt(startIndex as string),
        itemsPerPage: users.length,
        Resources: users
      });
    } catch (error) {
      logger.error('SCIM list users failed', { error });
      res.status(500).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '500',
        detail: 'Internal server error'
      });
    }
  });

  /**
   * GET /scim/v2/Users/:id
   * Get user by ID
   */
  router.get('/Users/:id', async (req: Request, res: Response) => {
    try {
      const { scimProvider } = req as any;
      const { id } = req.params;

      const result = await pool.query(
        'SELECT * FROM scim_users WHERE scim_id = $1 AND provider_id = $2',
        [id, scimProvider.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          status: '404',
          detail: 'User not found'
        });
      }

      const row = result.rows[0];

      res.json({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        id: row.scim_id,
        externalId: row.external_id,
        userName: row.user_name,
        name: {
          formatted: row.formatted_name,
          familyName: row.family_name,
          givenName: row.given_name,
          middleName: row.middle_name,
          honorificPrefix: row.honorific_prefix,
          honorificSuffix: row.honorific_suffix
        },
        displayName: row.formatted_name,
        emails: row.emails,
        phoneNumbers: row.phone_numbers,
        active: row.active,
        groups: row.groups,
        meta: {
          resourceType: 'User',
          created: row.created_at,
          lastModified: row.updated_at,
          location: `${process.env.API_URL}/scim/v2/Users/${row.scim_id}`
        }
      });
    } catch (error) {
      logger.error('SCIM get user failed', { error });
      res.status(500).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '500',
        detail: 'Internal server error'
      });
    }
  });

  /**
   * POST /scim/v2/Users
   * Create user
   */
  router.post('/Users', async (req: Request, res: Response) => {
    try {
      const { scimProvider } = req as any;
      const user: SCIMUser = req.body;

      const scimId = crypto.randomUUID();
      const primaryEmail = user.emails?.find(e => e.primary)?.value || user.emails?.[0]?.value;

      const result = await pool.query(
        `INSERT INTO scim_users (
          scim_id, provider_id, org_id, user_name, external_id, active,
          formatted_name, family_name, given_name, middle_name,
          honorific_prefix, honorific_suffix,
          emails, phone_numbers, groups
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *`,
        [
          scimId,
          scimProvider.id,
          scimProvider.org_id,
          user.userName,
          user.externalId,
          user.active !== false,
          user.name?.formatted,
          user.name?.familyName,
          user.name?.givenName,
          user.name?.middleName,
          user.name?.honorificPrefix,
          user.name?.honorificSuffix,
          JSON.stringify(user.emails || []),
          JSON.stringify(user.phoneNumbers || []),
          JSON.stringify(user.groups || [])
        ]
      );

      const row = result.rows[0];

      // Log provisioning event
      await ssoService.logAudit({
        orgId: scimProvider.org_id,
        providerId: scimProvider.id,
        eventType: 'scim_sync',
        eventStatus: 'success',
        eventMessage: 'User created via SCIM',
        eventData: { userName: user.userName, scimId }
      });

      res.status(201).json({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        id: row.scim_id,
        externalId: row.external_id,
        userName: row.user_name,
        name: {
          formatted: row.formatted_name,
          familyName: row.family_name,
          givenName: row.given_name
        },
        emails: row.emails,
        active: row.active,
        meta: {
          resourceType: 'User',
          created: row.created_at,
          lastModified: row.updated_at,
          location: `${process.env.API_URL}/scim/v2/Users/${row.scim_id}`
        }
      });
    } catch (error) {
      logger.error('SCIM create user failed', { error });
      res.status(500).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '500',
        detail: 'Internal server error'
      });
    }
  });

  /**
   * PUT /scim/v2/Users/:id
   * Update user (full replace)
   */
  router.put('/Users/:id', async (req: Request, res: Response) => {
    try {
      const { scimProvider } = req as any;
      const { id } = req.params;
      const user: SCIMUser = req.body;

      const result = await pool.query(
        `UPDATE scim_users SET
          user_name = $1,
          external_id = $2,
          active = $3,
          formatted_name = $4,
          family_name = $5,
          given_name = $6,
          middle_name = $7,
          emails = $8,
          phone_numbers = $9,
          groups = $10,
          updated_at = NOW()
        WHERE scim_id = $11 AND provider_id = $12
        RETURNING *`,
        [
          user.userName,
          user.externalId,
          user.active !== false,
          user.name?.formatted,
          user.name?.familyName,
          user.name?.givenName,
          user.name?.middleName,
          JSON.stringify(user.emails || []),
          JSON.stringify(user.phoneNumbers || []),
          JSON.stringify(user.groups || []),
          id,
          scimProvider.id
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          status: '404',
          detail: 'User not found'
        });
      }

      const row = result.rows[0];

      await ssoService.logAudit({
        orgId: scimProvider.org_id,
        providerId: scimProvider.id,
        eventType: 'scim_sync',
        eventStatus: 'success',
        eventMessage: 'User updated via SCIM',
        eventData: { userName: user.userName, scimId: id }
      });

      res.json({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        id: row.scim_id,
        externalId: row.external_id,
        userName: row.user_name,
        name: {
          formatted: row.formatted_name,
          familyName: row.family_name,
          givenName: row.given_name
        },
        emails: row.emails,
        active: row.active,
        meta: {
          resourceType: 'User',
          created: row.created_at,
          lastModified: row.updated_at,
          location: `${process.env.API_URL}/scim/v2/Users/${row.scim_id}`
        }
      });
    } catch (error) {
      logger.error('SCIM update user failed', { error });
      res.status(500).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '500',
        detail: 'Internal server error'
      });
    }
  });

  /**
   * PATCH /scim/v2/Users/:id
   * Partial update user
   */
  router.patch('/Users/:id', async (req: Request, res: Response) => {
    try {
      const { scimProvider } = req as any;
      const { id } = req.params;
      const { Operations } = req.body;

      // Get current user
      const current = await pool.query(
        'SELECT * FROM scim_users WHERE scim_id = $1 AND provider_id = $2',
        [id, scimProvider.id]
      );

      if (current.rows.length === 0) {
        return res.status(404).json({
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          status: '404',
          detail: 'User not found'
        });
      }

      let user = current.rows[0];

      // Apply operations
      for (const op of Operations || []) {
        if (op.op === 'replace') {
          if (op.path === 'active') {
            user.active = op.value;
          } else if (op.path === 'emails') {
            user.emails = op.value;
          }
        }
      }

      // Update user
      const result = await pool.query(
        `UPDATE scim_users SET
          active = $1,
          emails = $2,
          updated_at = NOW()
        WHERE scim_id = $3 AND provider_id = $4
        RETURNING *`,
        [user.active, JSON.stringify(user.emails), id, scimProvider.id]
      );

      const row = result.rows[0];

      res.json({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        id: row.scim_id,
        userName: row.user_name,
        active: row.active,
        emails: row.emails,
        meta: {
          resourceType: 'User',
          lastModified: row.updated_at
        }
      });
    } catch (error) {
      logger.error('SCIM patch user failed', { error });
      res.status(500).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '500',
        detail: 'Internal server error'
      });
    }
  });

  /**
   * DELETE /scim/v2/Users/:id
   * Delete user (deactivate)
   */
  router.delete('/Users/:id', async (req: Request, res: Response) => {
    try {
      const { scimProvider } = req as any;
      const { id } = req.params;

      const result = await pool.query(
        'UPDATE scim_users SET active = false, updated_at = NOW() WHERE scim_id = $1 AND provider_id = $2 RETURNING *',
        [id, scimProvider.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          status: '404',
          detail: 'User not found'
        });
      }

      await ssoService.logAudit({
        orgId: scimProvider.org_id,
        providerId: scimProvider.id,
        eventType: 'scim_sync',
        eventStatus: 'success',
        eventMessage: 'User deactivated via SCIM',
        eventData: { scimId: id }
      });

      res.status(204).send();
    } catch (error) {
      logger.error('SCIM delete user failed', { error });
      res.status(500).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '500',
        detail: 'Internal server error'
      });
    }
  });

  /**
   * GET /scim/v2/Groups
   * List groups
   */
  router.get('/Groups', async (req: Request, res: Response) => {
    try {
      const { scimProvider } = req as any;

      const result = await pool.query(
        'SELECT * FROM scim_groups WHERE provider_id = $1 ORDER BY created_at DESC',
        [scimProvider.id]
      );

      const groups = result.rows.map(row => ({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        id: row.scim_id,
        displayName: row.display_name,
        members: row.members,
        meta: {
          resourceType: 'Group',
          created: row.created_at,
          lastModified: row.updated_at
        }
      }));

      res.json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
        totalResults: groups.length,
        Resources: groups
      });
    } catch (error) {
      logger.error('SCIM list groups failed', { error });
      res.status(500).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '500',
        detail: 'Internal server error'
      });
    }
  });

  /**
   * POST /scim/v2/Groups
   * Create group
   */
  router.post('/Groups', async (req: Request, res: Response) => {
    try {
      const { scimProvider } = req as any;
      const group: SCIMGroup = req.body;

      const scimId = crypto.randomUUID();

      const result = await pool.query(
        `INSERT INTO scim_groups (scim_id, provider_id, org_id, display_name, external_id, members)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          scimId,
          scimProvider.id,
          scimProvider.org_id,
          group.displayName,
          null,
          JSON.stringify(group.members || [])
        ]
      );

      const row = result.rows[0];

      res.status(201).json({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        id: row.scim_id,
        displayName: row.display_name,
        members: row.members,
        meta: {
          resourceType: 'Group',
          created: row.created_at,
          lastModified: row.updated_at
        }
      });
    } catch (error) {
      logger.error('SCIM create group failed', { error });
      res.status(500).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '500',
        detail: 'Internal server error'
      });
    }
  });

  return router;
}

export default createSCIMRouter;
