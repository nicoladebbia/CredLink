/**
 * Enterprise SSO Service
 * Supports SAML 2.0, OAuth 2.0, OIDC, Azure AD, Google Workspace
 * 
 * Features:
 * - Multi-provider SSO (SAML, OAuth, OIDC)
 * - JIT (Just-In-Time) user provisioning
 * - SCIM 2.0 user/group provisioning
 * - Session management with SLO (Single Logout)
 * - Comprehensive audit logging
 * - Attribute mapping and transformation
 */

import { Pool } from 'pg';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

export interface SSOProvider {
  id: string;
  orgId: string;
  providerType: 'saml' | 'oauth2' | 'oidc' | 'azure-ad' | 'google' | 'okta' | 'onelogin';
  providerName: string;
  enabled: boolean;
  
  // SAML Config
  samlEntryPoint?: string;
  samlIssuer?: string;
  samlCert?: string;
  samlCallbackUrl?: string;
  samlLogoutUrl?: string;
  samlAuthnContext?: string[];
  samlSignatureAlgorithm?: string;
  samlWantAssertionsSigned?: boolean;
  samlWantResponseSigned?: boolean;
  
  // OAuth/OIDC Config
  oauthClientId?: string;
  oauthClientSecret?: string;
  oauthAuthorizationUrl?: string;
  oauthTokenUrl?: string;
  oauthUserInfoUrl?: string;
  oauthScope?: string[];
  oauthPkceEnabled?: boolean;
  
  // Azure AD Config
  azureTenantId?: string;
  azurePolicyName?: string;
  azureDomainHint?: string;
  
  // Google Config
  googleHd?: string;
  
  // Attribute Mapping
  attributeMapping: Record<string, string>;
  
  // JIT Provisioning
  jitProvisioningEnabled: boolean;
  jitDefaultRole: string;
  jitGroupMapping?: Record<string, string>;
  
  // SCIM Config
  scimEnabled: boolean;
  scimToken?: string;
  scimBaseUrl?: string;
  
  // Security
  requireEncryptedAssertions: boolean;
  sessionLifetimeHours: number;
  enforceSso: boolean;
  
  metadata?: Record<string, any>;
}

export interface SSOSession {
  id: string;
  sessionId: string;
  providerId: string;
  userId: string;
  orgId: string;
  nameId?: string;
  sessionIndex?: string;
  authMethod: string;
  authTime: Date;
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  tokenExpiresAt?: Date;
  expiresAt: Date;
}

export interface SSOUser {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  groups?: string[];
  roles?: string[];
  attributes?: Record<string, any>;
}

export class SSOService {
  private pool: Pool;
  private encryptionKey: Buffer;

  constructor(pool: Pool) {
    this.pool = pool;
    
    // Initialize encryption key for sensitive data
    const key = process.env.SSO_ENCRYPTION_KEY || process.env.JWT_SECRET || 'default-key-change-in-production';
    this.encryptionKey = crypto.scryptSync(key, 'salt', 32);
  }

  /**
   * Get SSO provider configuration for an organization
   */
  async getProvider(orgId: string, providerName?: string): Promise<SSOProvider | null> {
    try {
      let query = `
        SELECT 
          id, org_id, provider_type, provider_name, enabled,
          saml_entry_point, saml_issuer, saml_cert, saml_callback_url, saml_logout_url,
          saml_authn_context, saml_signature_algorithm, saml_want_assertions_signed, saml_want_response_signed,
          oauth_client_id, oauth_client_secret, oauth_authorization_url, oauth_token_url,
          oauth_user_info_url, oauth_scope, oauth_pkce_enabled,
          azure_tenant_id, azure_policy_name, azure_domain_hint,
          google_hd,
          attribute_mapping, jit_provisioning_enabled, jit_default_role, jit_group_mapping,
          scim_enabled, scim_token, scim_base_url,
          require_encrypted_assertions, session_lifetime_hours, enforce_sso,
          metadata
        FROM sso_providers
        WHERE org_id = $1 AND enabled = true
      `;
      
      const params: any[] = [orgId];
      
      if (providerName) {
        query += ' AND provider_name = $2';
        params.push(providerName);
      } else {
        query += ' ORDER BY created_at DESC LIMIT 1';
      }
      
      const result = await this.pool.query(query, params);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      
      return {
        id: row.id,
        orgId: row.org_id,
        providerType: row.provider_type,
        providerName: row.provider_name,
        enabled: row.enabled,
        samlEntryPoint: row.saml_entry_point,
        samlIssuer: row.saml_issuer,
        samlCert: row.saml_cert,
        samlCallbackUrl: row.saml_callback_url,
        samlLogoutUrl: row.saml_logout_url,
        samlAuthnContext: row.saml_authn_context,
        samlSignatureAlgorithm: row.saml_signature_algorithm,
        samlWantAssertionsSigned: row.saml_want_assertions_signed,
        samlWantResponseSigned: row.saml_want_response_signed,
        oauthClientId: row.oauth_client_id,
        oauthClientSecret: this.decrypt(row.oauth_client_secret) || undefined,
        oauthAuthorizationUrl: row.oauth_authorization_url,
        oauthTokenUrl: row.oauth_token_url,
        oauthUserInfoUrl: row.oauth_user_info_url,
        oauthScope: row.oauth_scope,
        oauthPkceEnabled: row.oauth_pkce_enabled,
        azureTenantId: row.azure_tenant_id,
        azurePolicyName: row.azure_policy_name,
        azureDomainHint: row.azure_domain_hint,
        googleHd: row.google_hd,
        attributeMapping: row.attribute_mapping,
        jitProvisioningEnabled: row.jit_provisioning_enabled,
        jitDefaultRole: row.jit_default_role,
        jitGroupMapping: row.jit_group_mapping,
        scimEnabled: row.scim_enabled,
        scimToken: this.decrypt(row.scim_token) || undefined,
        scimBaseUrl: row.scim_base_url,
        requireEncryptedAssertions: row.require_encrypted_assertions,
        sessionLifetimeHours: row.session_lifetime_hours,
        enforceSso: row.enforce_sso,
        metadata: row.metadata
      };
    } catch (error) {
      logger.error('Failed to get SSO provider', { error, orgId, providerName });
      throw error;
    }
  }

  /**
   * Create or update SSO provider configuration
   */
  async upsertProvider(provider: Partial<SSOProvider> & { orgId: string; providerName: string }): Promise<SSOProvider> {
    try {
      const query = `
        INSERT INTO sso_providers (
          org_id, provider_type, provider_name, enabled,
          saml_entry_point, saml_issuer, saml_cert, saml_callback_url, saml_logout_url,
          saml_authn_context, saml_signature_algorithm, saml_want_assertions_signed, saml_want_response_signed,
          oauth_client_id, oauth_client_secret, oauth_authorization_url, oauth_token_url,
          oauth_user_info_url, oauth_scope, oauth_pkce_enabled,
          azure_tenant_id, azure_policy_name, azure_domain_hint,
          google_hd,
          attribute_mapping, jit_provisioning_enabled, jit_default_role, jit_group_mapping,
          scim_enabled, scim_token, scim_base_url,
          require_encrypted_assertions, session_lifetime_hours, enforce_sso,
          metadata, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36
        )
        ON CONFLICT (org_id, provider_name)
        DO UPDATE SET
          provider_type = EXCLUDED.provider_type,
          enabled = EXCLUDED.enabled,
          saml_entry_point = EXCLUDED.saml_entry_point,
          saml_issuer = EXCLUDED.saml_issuer,
          saml_cert = EXCLUDED.saml_cert,
          saml_callback_url = EXCLUDED.saml_callback_url,
          saml_logout_url = EXCLUDED.saml_logout_url,
          saml_authn_context = EXCLUDED.saml_authn_context,
          saml_signature_algorithm = EXCLUDED.saml_signature_algorithm,
          saml_want_assertions_signed = EXCLUDED.saml_want_assertions_signed,
          saml_want_response_signed = EXCLUDED.saml_want_response_signed,
          oauth_client_id = EXCLUDED.oauth_client_id,
          oauth_client_secret = EXCLUDED.oauth_client_secret,
          oauth_authorization_url = EXCLUDED.oauth_authorization_url,
          oauth_token_url = EXCLUDED.oauth_token_url,
          oauth_user_info_url = EXCLUDED.oauth_user_info_url,
          oauth_scope = EXCLUDED.oauth_scope,
          oauth_pkce_enabled = EXCLUDED.oauth_pkce_enabled,
          azure_tenant_id = EXCLUDED.azure_tenant_id,
          azure_policy_name = EXCLUDED.azure_policy_name,
          azure_domain_hint = EXCLUDED.azure_domain_hint,
          google_hd = EXCLUDED.google_hd,
          attribute_mapping = EXCLUDED.attribute_mapping,
          jit_provisioning_enabled = EXCLUDED.jit_provisioning_enabled,
          jit_default_role = EXCLUDED.jit_default_role,
          jit_group_mapping = EXCLUDED.jit_group_mapping,
          scim_enabled = EXCLUDED.scim_enabled,
          scim_token = EXCLUDED.scim_token,
          scim_base_url = EXCLUDED.scim_base_url,
          require_encrypted_assertions = EXCLUDED.require_encrypted_assertions,
          session_lifetime_hours = EXCLUDED.session_lifetime_hours,
          enforce_sso = EXCLUDED.enforce_sso,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING id
      `;
      
      const values = [
        provider.orgId,
        provider.providerType || 'saml',
        provider.providerName,
        provider.enabled !== undefined ? provider.enabled : true,
        provider.samlEntryPoint,
        provider.samlIssuer,
        provider.samlCert,
        provider.samlCallbackUrl,
        provider.samlLogoutUrl,
        provider.samlAuthnContext,
        provider.samlSignatureAlgorithm || 'sha256',
        provider.samlWantAssertionsSigned !== undefined ? provider.samlWantAssertionsSigned : true,
        provider.samlWantResponseSigned !== undefined ? provider.samlWantResponseSigned : true,
        provider.oauthClientId,
        provider.oauthClientSecret ? this.encrypt(provider.oauthClientSecret) : null,
        provider.oauthAuthorizationUrl,
        provider.oauthTokenUrl,
        provider.oauthUserInfoUrl,
        provider.oauthScope,
        provider.oauthPkceEnabled !== undefined ? provider.oauthPkceEnabled : true,
        provider.azureTenantId,
        provider.azurePolicyName,
        provider.azureDomainHint,
        provider.googleHd,
        provider.attributeMapping || {},
        provider.jitProvisioningEnabled !== undefined ? provider.jitProvisioningEnabled : true,
        provider.jitDefaultRole || 'user',
        provider.jitGroupMapping,
        provider.scimEnabled || false,
        provider.scimToken ? this.encrypt(provider.scimToken) : null,
        provider.scimBaseUrl,
        provider.requireEncryptedAssertions !== undefined ? provider.requireEncryptedAssertions : true,
        provider.sessionLifetimeHours || 24,
        provider.enforceSso || false,
        provider.metadata || {},
        'system' // created_by
      ];
      
      const result = await this.pool.query(query, values);
      
      await this.logAudit({
        orgId: provider.orgId,
        providerId: result.rows[0].id,
        eventType: 'config_change',
        eventStatus: 'success',
        eventMessage: `SSO provider ${provider.providerName} configured`,
        eventData: { providerType: provider.providerType }
      });
      
      return this.getProvider(provider.orgId, provider.providerName) as Promise<SSOProvider>;
    } catch (error) {
      logger.error('Failed to upsert SSO provider', { error, provider });
      throw error;
    }
  }

  /**
   * Create SSO session
   */
  async createSession(session: Omit<SSOSession, 'id' | 'createdAt'>): Promise<SSOSession> {
    try {
      const query = `
        INSERT INTO sso_sessions (
          session_id, provider_id, user_id, org_id,
          name_id, session_index, auth_method, auth_time,
          access_token, refresh_token, id_token, token_expires_at,
          ip_address, user_agent, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id
      `;
      
      const values = [
        session.sessionId,
        session.providerId,
        session.userId,
        session.orgId,
        session.nameId,
        session.sessionIndex,
        session.authMethod,
        session.authTime,
        session.accessToken ? this.encrypt(session.accessToken) : null,
        session.refreshToken ? this.encrypt(session.refreshToken) : null,
        session.idToken ? this.encrypt(session.idToken) : null,
        session.tokenExpiresAt,
        null, // ip_address
        null, // user_agent
        session.expiresAt
      ];
      
      const result = await this.pool.query(query, values);
      
      return {
        id: result.rows[0].id,
        ...session
      };
    } catch (error) {
      logger.error('Failed to create SSO session', { error, session });
      throw error;
    }
  }

  /**
   * Get SSO session
   */
  async getSession(sessionId: string): Promise<SSOSession | null> {
    try {
      const query = `
        SELECT * FROM sso_sessions
        WHERE session_id = $1 AND expires_at > NOW()
      `;
      
      const result = await this.pool.query(query, [sessionId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      
      return {
        id: row.id,
        sessionId: row.session_id,
        providerId: row.provider_id,
        userId: row.user_id,
        orgId: row.org_id,
        nameId: row.name_id,
        sessionIndex: row.session_index,
        authMethod: row.auth_method,
        authTime: row.auth_time,
        accessToken: this.decrypt(row.access_token) || undefined,
        refreshToken: this.decrypt(row.refresh_token) || undefined,
        idToken: this.decrypt(row.id_token) || undefined,
        tokenExpiresAt: row.token_expires_at,
        expiresAt: row.expires_at
      };
    } catch (error) {
      logger.error('Failed to get SSO session', { error, sessionId });
      throw error;
    }
  }

  /**
   * Delete SSO session (logout)
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      await this.pool.query('DELETE FROM sso_sessions WHERE session_id = $1', [sessionId]);
    } catch (error) {
      logger.error('Failed to delete SSO session', { error, sessionId });
      throw error;
    }
  }

  /**
   * Map SAML/OIDC attributes to user object
   */
  mapAttributes(profile: any, attributeMapping: Record<string, string>): SSOUser {
    const user: SSOUser = {
      userId: '',
      email: '',
      attributes: {}
    };
    
    // Extract attributes based on mapping
    for (const [targetAttr, sourceAttr] of Object.entries(attributeMapping)) {
      const value = this.getNestedValue(profile, sourceAttr);
      
      if (value !== undefined) {
        switch (targetAttr) {
          case 'email':
            user.email = value;
            break;
          case 'firstName':
            user.firstName = value;
            break;
          case 'lastName':
            user.lastName = value;
            break;
          case 'displayName':
            user.displayName = value;
            break;
          case 'groups':
            user.groups = Array.isArray(value) ? value : [value];
            break;
          case 'roles':
            user.roles = Array.isArray(value) ? value : [value];
            break;
          default:
            user.attributes![targetAttr] = value;
        }
      }
    }
    
    // Generate userId from email if not set
    user.userId = user.email || crypto.randomUUID();
    
    return user;
  }

  /**
   * JIT (Just-In-Time) user provisioning
   */
  async provisionUser(provider: SSOProvider, ssoUser: SSOUser): Promise<any> {
    try {
      if (!provider.jitProvisioningEnabled) {
        throw new Error('JIT provisioning is disabled for this provider');
      }
      
      // Check if user exists
      const existingUser = await this.pool.query(
        'SELECT id, email FROM users WHERE email = $1 AND org_id = $2',
        [ssoUser.email, provider.orgId]
      );
      
      if (existingUser.rows.length > 0) {
        // Update existing user
        await this.pool.query(
          `UPDATE users SET 
            first_name = $1, 
            last_name = $2, 
            display_name = $3,
            updated_at = NOW()
          WHERE email = $4 AND org_id = $5`,
          [ssoUser.firstName, ssoUser.lastName, ssoUser.displayName, ssoUser.email, provider.orgId]
        );
        
        await this.logAudit({
          orgId: provider.orgId,
          providerId: provider.id,
          userId: existingUser.rows[0].id,
          eventType: 'jit_provision',
          eventStatus: 'success',
          eventMessage: 'User updated via JIT provisioning',
          eventData: { email: ssoUser.email }
        });
        
        return existingUser.rows[0];
      }
      
      // Create new user
      const newUser = await this.pool.query(
        `INSERT INTO users (
          email, first_name, last_name, display_name, org_id, role, sso_enabled, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
        RETURNING id, email`,
        [
          ssoUser.email,
          ssoUser.firstName,
          ssoUser.lastName,
          ssoUser.displayName,
          provider.orgId,
          this.mapGroupsToRole(ssoUser.groups, provider.jitGroupMapping) || provider.jitDefaultRole
        ]
      );
      
      await this.logAudit({
        orgId: provider.orgId,
        providerId: provider.id,
        userId: newUser.rows[0].id,
        eventType: 'jit_provision',
        eventStatus: 'success',
        eventMessage: 'User created via JIT provisioning',
        eventData: { email: ssoUser.email }
      });
      
      return newUser.rows[0];
    } catch (error) {
      logger.error('Failed to provision user', { error, ssoUser });
      
      await this.logAudit({
        orgId: provider.orgId,
        providerId: provider.id,
        eventType: 'jit_provision',
        eventStatus: 'error',
        eventMessage: 'Failed to provision user',
        errorDetails: { error: error instanceof Error ? error.message : String(error) }
      });
      
      throw error;
    }
  }

  /**
   * Log SSO audit event
   */
  async logAudit(event: {
    orgId: string;
    providerId?: string;
    userId?: string;
    eventType: string;
    eventStatus: string;
    eventMessage: string;
    eventData?: any;
    errorDetails?: any;
  }): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO sso_audit_log (
          org_id, provider_id, user_id, event_type, event_status, event_message, event_data, error_details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          event.orgId,
          event.providerId,
          event.userId,
          event.eventType,
          event.eventStatus,
          event.eventMessage,
          event.eventData || {},
          event.errorDetails
        ]
      );
    } catch (error) {
      logger.error('Failed to log SSO audit event', { error, event });
    }
  }

  /**
   * Encrypt sensitive data
   */
  private encrypt(text: string | null): string | null {
    if (!text) return null;
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt sensitive data
   */
  private decrypt(text: string | null): string | null {
    if (!text) return null;
    
    const parts = text.split(':');
    if (parts.length !== 2) return null;
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Map IdP groups to application role
   */
  private mapGroupsToRole(groups: string[] | undefined, groupMapping: Record<string, string> | undefined): string | null {
    if (!groups || !groupMapping) return null;
    
    for (const group of groups) {
      if (groupMapping[group]) {
        return groupMapping[group];
      }
    }
    
    return null;
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await this.pool.query(
        'DELETE FROM sso_sessions WHERE expires_at < NOW() RETURNING id'
      );
      
      logger.info('Cleaned up expired SSO sessions', { count: result.rowCount });
      
      return result.rowCount || 0;
    } catch (error) {
      logger.error('Failed to cleanup expired SSO sessions', { error });
      return 0;
    }
  }
}
