/**
 * SSO Admin Configuration Routes
 * Manage SSO providers, view audit logs, configure SCIM
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import { encryptSCIMToken, decryptSCIMToken, generateSCIMToken } from '../utils/token-encryption';
import { SSOService } from '../services/sso-service';

export function createSSOAdminRouter(pool: Pool): Router {
  const router = Router();
  const ssoService = new SSOService(pool);

  /**
   * Middleware to require admin role
   */
  const requireAdmin = async (req: any, res: Response, next: Function): Promise<void> => {
    try {
      const userId = req.user?.id || req.headers['x-user-id'];
      
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const result = await pool.query(
        'SELECT role FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return;
      }

      next();
    } catch (error) {
      logger.error('Admin auth check failed', { error });
      res.status(500).json({ error: 'Authorization failed' });
    }
  };

  // Apply admin middleware to all routes
  router.use(requireAdmin);

  /**
   * GET /admin/sso/providers
   * List all SSO providers for organization
   */
  router.get('/providers', async (req: Request, res: Response) => {
    try {
      const orgId = req.query.orgId as string || (req as any).user?.org_id;

      if (!orgId) {
        return res.status(400).json({ error: 'Organization ID required' });
      }

      const result = await pool.query(
        `SELECT 
          id, org_id, provider_type, provider_name, enabled,
          saml_entry_point, saml_issuer, saml_callback_url,
          oauth_client_id, oauth_authorization_url,
          azure_tenant_id, google_hd,
          jit_provisioning_enabled, jit_default_role,
          scim_enabled, scim_base_url,
          enforce_sso, session_lifetime_hours,
          created_at, updated_at, last_synced_at
        FROM sso_providers
        WHERE org_id = $1
        ORDER BY created_at DESC`,
        [orgId]
      );

      res.json({
        providers: result.rows.map(row => ({
          id: row.id,
          orgId: row.org_id,
          type: row.provider_type,
          name: row.provider_name,
          enabled: row.enabled,
          config: {
            samlEntryPoint: row.saml_entry_point,
            samlIssuer: row.saml_issuer,
            samlCallbackUrl: row.saml_callback_url,
            oauthClientId: row.oauth_client_id,
            oauthAuthorizationUrl: row.oauth_authorization_url,
            azureTenantId: row.azure_tenant_id,
            googleHd: row.google_hd
          },
          jitProvisioning: row.jit_provisioning_enabled,
          jitDefaultRole: row.jit_default_role,
          scimEnabled: row.scim_enabled,
          scimBaseUrl: row.scim_base_url,
          enforceSso: row.enforce_sso,
          sessionLifetimeHours: row.session_lifetime_hours,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          lastSyncedAt: row.last_synced_at
        }))
      });
    } catch (error) {
      logger.error('Failed to list SSO providers', { error });
      res.status(500).json({ error: 'Failed to retrieve providers' });
    }
  });

  /**
   * GET /admin/sso/providers/:id
   * Get detailed SSO provider configuration
   */
  router.get('/providers/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        'SELECT * FROM sso_providers WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Provider not found' });
      }

      const row = result.rows[0];

      res.json({
        id: row.id,
        orgId: row.org_id,
        type: row.provider_type,
        name: row.provider_name,
        enabled: row.enabled,
        saml: {
          entryPoint: row.saml_entry_point,
          issuer: row.saml_issuer,
          cert: row.saml_cert ? '***REDACTED***' : null,
          callbackUrl: row.saml_callback_url,
          logoutUrl: row.saml_logout_url,
          authnContext: row.saml_authn_context,
          signatureAlgorithm: row.saml_signature_algorithm,
          wantAssertionsSigned: row.saml_want_assertions_signed,
          wantResponseSigned: row.saml_want_response_signed
        },
        oauth: {
          clientId: row.oauth_client_id,
          clientSecret: row.oauth_client_secret ? '***REDACTED***' : null,
          authorizationUrl: row.oauth_authorization_url,
          tokenUrl: row.oauth_token_url,
          userInfoUrl: row.oauth_user_info_url,
          scope: row.oauth_scope,
          pkceEnabled: row.oauth_pkce_enabled
        },
        azure: {
          tenantId: row.azure_tenant_id,
          policyName: row.azure_policy_name,
          domainHint: row.azure_domain_hint
        },
        google: {
          hostedDomain: row.google_hd
        },
        attributeMapping: row.attribute_mapping,
        jitProvisioning: {
          enabled: row.jit_provisioning_enabled,
          defaultRole: row.jit_default_role,
          groupMapping: row.jit_group_mapping
        },
        scim: {
          enabled: row.scim_enabled,
          token: row.scim_token ? '***REDACTED***' : null,
          baseUrl: row.scim_base_url
        },
        security: {
          requireEncryptedAssertions: row.require_encrypted_assertions,
          sessionLifetimeHours: row.session_lifetime_hours,
          enforceSso: row.enforce_sso
        },
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      });
    } catch (error) {
      logger.error('Failed to get SSO provider', { error });
      res.status(500).json({ error: 'Failed to retrieve provider' });
    }
  });

  /**
   * POST /admin/sso/providers
   * Create new SSO provider
   */
  router.post('/providers', async (req: Request, res: Response) => {
    try {
      const config = req.body;

      const provider = await ssoService.upsertProvider({
        orgId: config.orgId,
        providerType: config.type,
        providerName: config.name,
        enabled: config.enabled !== false,
        samlEntryPoint: config.saml?.entryPoint,
        samlIssuer: config.saml?.issuer,
        samlCert: config.saml?.cert,
        samlCallbackUrl: config.saml?.callbackUrl,
        samlLogoutUrl: config.saml?.logoutUrl,
        samlAuthnContext: config.saml?.authnContext,
        samlSignatureAlgorithm: config.saml?.signatureAlgorithm,
        samlWantAssertionsSigned: config.saml?.wantAssertionsSigned,
        samlWantResponseSigned: config.saml?.wantResponseSigned,
        oauthClientId: config.oauth?.clientId,
        oauthClientSecret: config.oauth?.clientSecret,
        oauthAuthorizationUrl: config.oauth?.authorizationUrl,
        oauthTokenUrl: config.oauth?.tokenUrl,
        oauthUserInfoUrl: config.oauth?.userInfoUrl,
        oauthScope: config.oauth?.scope,
        oauthPkceEnabled: config.oauth?.pkceEnabled,
        azureTenantId: config.azure?.tenantId,
        azurePolicyName: config.azure?.policyName,
        azureDomainHint: config.azure?.domainHint,
        googleHd: config.google?.hostedDomain,
        attributeMapping: config.attributeMapping,
        jitProvisioningEnabled: config.jitProvisioning?.enabled,
        jitDefaultRole: config.jitProvisioning?.defaultRole,
        jitGroupMapping: config.jitProvisioning?.groupMapping,
        scimEnabled: config.scim?.enabled,
        scimToken: config.scim?.token,
        scimBaseUrl: config.scim?.baseUrl,
        requireEncryptedAssertions: config.security?.requireEncryptedAssertions,
        sessionLifetimeHours: config.security?.sessionLifetimeHours,
        enforceSso: config.security?.enforceSso,
        metadata: config.metadata
      });

      res.status(201).json({
        success: true,
        provider: {
          id: provider.id,
          name: provider.providerName,
          type: provider.providerType
        }
      });
    } catch (error) {
      logger.error('Failed to create SSO provider', { error });
      res.status(500).json({ error: 'Failed to create provider' });
    }
  });

  /**
   * PUT /admin/sso/providers/:id
   * Update SSO provider
   */
  router.put('/providers/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const config = req.body;

      // Get existing provider
      const existing = await pool.query('SELECT org_id, provider_name FROM sso_providers WHERE id = $1', [id]);
      
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Provider not found' });
      }

      const provider = await ssoService.upsertProvider({
        orgId: existing.rows[0].org_id,
        providerName: existing.rows[0].provider_name,
        ...config
      });

      res.json({
        success: true,
        provider: {
          id: provider.id,
          name: provider.providerName,
          type: provider.providerType
        }
      });
    } catch (error) {
      logger.error('Failed to update SSO provider', { error });
      res.status(500).json({ error: 'Failed to update provider' });
    }
  });

  /**
   * DELETE /admin/sso/providers/:id
   * Delete SSO provider
   */
  router.delete('/providers/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      await pool.query('DELETE FROM sso_providers WHERE id = $1', [id]);

      res.json({ success: true, message: 'Provider deleted' });
    } catch (error) {
      logger.error('Failed to delete SSO provider', { error });
      res.status(500).json({ error: 'Failed to delete provider' });
    }
  });

  /**
   * POST /admin/sso/providers/:id/test
   * Test SSO provider configuration
   */
  router.post('/providers/:id/test', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        'SELECT org_id, provider_name FROM sso_providers WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Provider not found' });
      }

      const { org_id, provider_name } = result.rows[0];
      const provider = await ssoService.getProvider(org_id, provider_name);

      if (!provider) {
        return res.status(404).json({ error: 'Provider configuration not found' });
      }

      // Validate configuration
      const errors: string[] = [];

      if (provider.providerType === 'saml') {
        if (!provider.samlEntryPoint) errors.push('SAML Entry Point is required');
        if (!provider.samlIssuer) errors.push('SAML Issuer is required');
        if (!provider.samlCert) errors.push('SAML Certificate is required');
      } else if (provider.providerType === 'oauth2' || provider.providerType === 'google') {
        if (!provider.oauthClientId) errors.push('OAuth Client ID is required');
        if (!provider.oauthClientSecret) errors.push('OAuth Client Secret is required');
        if (!provider.oauthAuthorizationUrl) errors.push('OAuth Authorization URL is required');
        if (!provider.oauthTokenUrl) errors.push('OAuth Token URL is required');
      } else if (provider.providerType === 'azure-ad') {
        if (!provider.oauthClientId) errors.push('Azure Client ID is required');
        if (!provider.oauthClientSecret) errors.push('Azure Client Secret is required');
        if (!provider.azureTenantId) errors.push('Azure Tenant ID is required');
      }

      if (errors.length > 0) {
        return res.status(400).json({
          valid: false,
          errors
        });
      }

      res.json({
        valid: true,
        message: 'Configuration is valid',
        metadata: {
          type: provider.providerType,
          jitEnabled: provider.jitProvisioningEnabled,
          scimEnabled: provider.scimEnabled
        }
      });
    } catch (error) {
      logger.error('Failed to test SSO provider', { error });
      res.status(500).json({ error: 'Failed to test provider' });
    }
  });

  /**
   * GET /admin/sso/audit-logs
   * Get SSO audit logs
   */
  router.get('/audit-logs', async (req: Request, res: Response) => {
    try {
      const orgId = req.query.orgId as string;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      let query = `
        SELECT 
          al.*,
          p.provider_name,
          u.email as user_email
        FROM sso_audit_log al
        LEFT JOIN sso_providers p ON al.provider_id = p.id
        LEFT JOIN users u ON al.user_id = u.id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (orgId) {
        params.push(orgId);
        query += ` AND al.org_id = $${params.length}`;
      }

      query += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      res.json({
        logs: result.rows.map(row => ({
          id: row.id,
          orgId: row.org_id,
          providerId: row.provider_id,
          providerName: row.provider_name,
          userId: row.user_id,
          userEmail: row.user_email,
          eventType: row.event_type,
          eventStatus: row.event_status,
          eventMessage: row.event_message,
          eventData: row.event_data,
          errorDetails: row.error_details,
          ipAddress: row.ip_address,
          userAgent: row.user_agent,
          createdAt: row.created_at
        })),
        total: result.rowCount,
        limit,
        offset
      });
    } catch (error) {
      logger.error('Failed to get audit logs', { error });
      res.status(500).json({ error: 'Failed to retrieve audit logs' });
    }
  });

  /**
   * GET /admin/sso/sessions
   * Get active SSO sessions
   */
  router.get('/sessions', async (req: Request, res: Response) => {
    try {
      const orgId = req.query.orgId as string;

      let query = `
        SELECT 
          s.*,
          p.provider_name,
          u.email as user_email,
          u.display_name as user_name
        FROM sso_sessions s
        LEFT JOIN sso_providers p ON s.provider_id = p.id
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.expires_at > NOW()
      `;
      const params: any[] = [];

      if (orgId) {
        params.push(orgId);
        query += ` AND s.org_id = $${params.length}`;
      }

      query += ' ORDER BY s.created_at DESC LIMIT 100';

      const result = await pool.query(query, params);

      res.json({
        sessions: result.rows.map(row => ({
          id: row.id,
          sessionId: row.session_id,
          providerId: row.provider_id,
          providerName: row.provider_name,
          userId: row.user_id,
          userEmail: row.user_email,
          userName: row.user_name,
          authMethod: row.auth_method,
          authTime: row.auth_time,
          lastActivity: row.last_activity_at,
          expiresAt: row.expires_at,
          ipAddress: row.ip_address,
          userAgent: row.user_agent
        }))
      });
    } catch (error) {
      logger.error('Failed to get SSO sessions', { error });
      res.status(500).json({ error: 'Failed to retrieve sessions' });
    }
  });

  /**
   * POST /admin/sso/sessions/:sessionId/revoke
   * Revoke SSO session
   */
  router.post('/sessions/:sessionId/revoke', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;

      await ssoService.deleteSession(sessionId);

      res.json({ success: true, message: 'Session revoked' });
    } catch (error) {
      logger.error('Failed to revoke session', { error });
      res.status(500).json({ error: 'Failed to revoke session' });
    }
  });

  /**
   * POST /admin/sso/scim/generate-token
   * Generate new SCIM bearer token
   */
  router.post('/scim/generate-token', async (req: Request, res: Response) => {
    try {
      const { providerId } = req.body;

      if (!providerId) {
        return res.status(400).json({ error: 'Provider ID required' });
      }

      // 🔥 CRITICAL SECURITY FIX: Generate and encrypt SCIM token
      // Previously stored in plaintext allowing SSO bypass on database compromise
      const token = generateSCIMToken();
      const encryptedToken = encryptSCIMToken(token);

      // Update provider with encrypted token
      await pool.query(
        'UPDATE sso_providers SET scim_token = $1, updated_at = NOW() WHERE id = $2',
        [encryptedToken, providerId]
      );

      res.json({
        success: true,
        token,
        message: 'SCIM token generated. Store this securely - it will not be shown again.'
      });
    } catch (error) {
      logger.error('Failed to generate SCIM token', { error });
      res.status(500).json({ error: 'Failed to generate token' });
    }
  });

  /**
   * GET /admin/sso/scim/users
   * Get SCIM provisioned users
   */
  router.get('/scim/users', async (req: Request, res: Response) => {
    try {
      const providerId = req.query.providerId as string;

      if (!providerId) {
        return res.status(400).json({ error: 'Provider ID required' });
      }

      const result = await pool.query(
        `SELECT 
          scim_id, user_name, external_id, active,
          formatted_name, emails, created_at, updated_at, last_synced_at
        FROM scim_users
        WHERE provider_id = $1
        ORDER BY created_at DESC`,
        [providerId]
      );

      res.json({
        users: result.rows.map(row => ({
          scimId: row.scim_id,
          userName: row.user_name,
          externalId: row.external_id,
          active: row.active,
          name: row.formatted_name,
          emails: row.emails,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          lastSyncedAt: row.last_synced_at
        }))
      });
    } catch (error) {
      logger.error('Failed to get SCIM users', { error });
      res.status(500).json({ error: 'Failed to retrieve SCIM users' });
    }
  });

  return router;
}

export default createSSOAdminRouter;
