/**
 * OIDC/SAML Provider Configuration and Claim Mappers
 * Implements OpenID Connect and SAML 2.0 for enterprise SSO
 */

export interface OIDCConfig {
  issuer: string; // https://login.microsoftonline.com/{tenant}/v2.0
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
  scopes: string[]; // ['openid', 'email', 'profile']
  pkce: boolean; // Always true for security
}

export interface SAMLConfig {
  idp_metadata_url?: string;
  idp_metadata_xml?: string;
  sp_entity_id: string;
  sp_acs_url: string;
  sp_slo_url?: string;
  signing_certificates: string[];
  attribute_mappings: Record<string, string>;
}

export interface ClaimsMapping {
  user_id: string; // 'sub' or 'NameID'
  email: string; // 'email' or 'Email'
  name?: string; // 'name' or 'displayName'
  groups?: string; // 'groups' or 'memberOf'
  role_mapping?: Record<string, string>; // Map groups to roles
}

export interface IdPUser {
  id: string; // Internal user ID
  idp_subject: string; // 'sub' from IdP
  idp_provider: string; // 'oidc' or 'saml'
  email: string;
  name?: string;
  groups?: string[];
  role?: string; // Mapped role
}

/**
 * OIDC Provider Implementation
 */
export class OIDCProvider {
  private config: OIDCConfig;
  private metadata?: any;

  constructor(config: OIDCConfig) {
    this.config = config;
  }

  /**
   * Discover OIDC configuration
   */
  async discover(): Promise<any> {
    if (this.metadata) {
      return this.metadata;
    }

    const wellKnownUrl = `${this.config.issuer}/.well-known/openid-configuration`;
    const response = await fetch(wellKnownUrl);
    
    if (!response.ok) {
      throw new Error(`OIDC discovery failed: ${response.statusText}`);
    }

    this.metadata = await response.json();
    return this.metadata;
  }

  /**
   * Generate authorization URL with PKCE
   */
  async generateAuthUrl(state: string, codeVerifier: string): Promise<string> {
    const metadata = await this.discover();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.client_id,
      redirect_uri: this.config.redirect_uris[0],
      scope: this.config.scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    return `${metadata.authorization_endpoint}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(code: string, codeVerifier: string): Promise<TokenResponse> {
    const metadata = await this.discover();
    
    const response = await fetch(metadata.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${this.config.client_id}:${this.config.client_secret}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.redirect_uris[0],
        code_verifier: codeVerifier
      })
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get user info from OIDC endpoint
   */
  async getUserInfo(accessToken: string): Promise<any> {
    const metadata = await this.discover();
    
    const response = await fetch(metadata.userinfo_endpoint, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`User info request failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Validate ID token and extract claims
   */
  async validateIdToken(idToken: string): Promise<any> {
    // For now, decode without signature verification
    // In production, verify signature with IdP keys
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid ID token format');
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    
    // Validate basic claims
    if (!payload.iss || !payload.sub || !payload.aud || !payload.exp) {
      throw new Error('ID token missing required claims');
    }

    // Check issuer
    if (payload.iss !== this.config.issuer) {
      throw new Error('Invalid token issuer');
    }

    // Check audience
    if (Array.isArray(payload.aud)) {
      if (!payload.aud.includes(this.config.client_id)) {
        throw new Error('Invalid token audience');
      }
    } else if (payload.aud !== this.config.client_id) {
      throw new Error('Invalid token audience');
    }

    // Check expiration
    if (Date.now() / 1000 > payload.exp) {
      throw new Error('Token expired');
    }

    return payload;
  }

  /**
   * Map OIDC claims to internal user format
   */
  mapClaims(claims: any, mapping: ClaimsMapping): IdPUser {
    return {
      id: `oidc_${claims[mapping.user_id]}`,
      idp_subject: claims[mapping.user_id],
      idp_provider: 'oidc',
      email: claims[mapping.email],
      name: mapping.name ? claims[mapping.name] || claims[mapping.email] : claims[mapping.email],
      groups: mapping.groups ? claims[mapping.groups] || [] : [],
      role: this.mapRole(mapping.groups ? claims[mapping.groups] || [] : [], mapping.role_mapping)
    };
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Buffer.from(digest).toString('base64url');
  }

  private mapRole(groups: string[], roleMapping?: Record<string, string>): string {
    if (!roleMapping) return 'auditor'; // Default role
    
    for (const group of groups) {
      if (roleMapping[group]) {
        return roleMapping[group];
      }
    }
    
    return 'auditor'; // Default if no mapping matches
  }
}

/**
 * SAML Provider Implementation
 */
export class SAMLProvider {
  private config: SAMLConfig;
  private idpMetadata?: any;

  constructor(config: SAMLConfig) {
    this.config = config;
  }

  /**
   * Load IdP metadata
   */
  async loadMetadata(): Promise<any> {
    if (this.idpMetadata) {
      return this.idpMetadata;
    }

    let metadataXml: string;
    
    if (this.config.idp_metadata_xml) {
      metadataXml = this.config.idp_metadata_xml;
    } else if (this.config.idp_metadata_url) {
      const response = await fetch(this.config.idp_metadata_url);
      if (!response.ok) {
        throw new Error(`Failed to fetch SAML metadata: ${response.statusText}`);
      }
      metadataXml = await response.text();
    } else {
      throw new Error('No SAML metadata provided');
    }

    // Parse XML metadata (simplified - would use proper XML parser in production)
    this.idpMetadata = this.parseMetadataXml(metadataXml);
    return this.idpMetadata;
  }

  /**
   * Generate SP metadata for IdP configuration
   */
  generateSPMetadata(): string {
    return `<?xml version="1.0"?>
<EntityDescriptor entityID="${this.config.sp_entity_id}" xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <SPSSODescriptor AuthnRequestsSigned="true" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${this.config.sp_acs_url}" index="0"/>
    ${this.config.sp_slo_url ? `<SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${this.config.sp_slo_url}"/>` : ''}
  </SPSSODescriptor>
</EntityDescriptor>`;
  }

  /**
   * Process SAML response
   */
  async processResponse(samlResponse: string): Promise<IdPUser> {
    // In production, would properly validate SAML response signature
    // and decrypt assertions
    
    const attributes = this.extractAttributes(samlResponse);
    
    return {
      id: `saml_${attributes[this.config.attribute_mappings.NameID || 'NameID']}`,
      idp_subject: attributes[this.config.attribute_mappings.NameID || 'NameID'],
      idp_provider: 'saml',
      email: attributes[this.config.attribute_mappings.Email || 'Email'] || '',
      name: attributes[this.config.attribute_mappings.displayName || 'displayName'],
      groups: this.parseGroups(attributes[this.config.attribute_mappings.memberOf || 'memberOf'] || ''),
      role: this.mapRole(attributes[this.config.attribute_mappings.memberOf || 'memberOf'] || '')
    };
  }

  private parseMetadataXml(xml: string): any {
    // Simplified XML parsing - would use proper library in production
    return {
      idp_sso_url: 'https://login.microsoftonline.com/login.srf',
      idp_slo_url: 'https://login.microsoftonline.com/logout.srf',
      certificates: this.config.signing_certificates
    };
  }

  private extractAttributes(samlResponse: string): Record<string, string> {
    // Simplified attribute extraction - would use proper SAML library
    return {
      NameID: 'user_123',
      Email: 'user@example.com',
      displayName: 'User Name',
      memberOf: 'CN=Users,DC=example,DC=com'
    };
  }

  private parseGroups(memberOf: string): string[] {
    // Parse LDAP-style group strings
    return memberOf.split(',').map(g => g.replace('CN=', '').trim());
  }

  private mapRole(memberOf: string): string {
    // Simple role mapping based on group membership
    if (memberOf.includes('Admin')) return 'org_admin';
    if (memberOf.includes('Integrator')) return 'integrator';
    return 'auditor';
  }
}

/**
 * Token response from OIDC
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token: string;
  scope?: string;
}

/**
 * SSO Manager - coordinates OIDC and SAML providers
 */
export class SSOManager {
  private oidcProviders: Map<string, OIDCProvider> = new Map();
  private samlProviders: Map<string, SAMLProvider> = new Map();

  /**
   * Register OIDC provider
   */
  registerOIDC(orgId: string, config: OIDCConfig): void {
    this.oidcProviders.set(orgId, new OIDCProvider(config));
  }

  /**
   * Register SAML provider
   */
  registerSAML(orgId: string, config: SAMLConfig): void {
    this.samlProviders.set(orgId, new SAMLProvider(config));
  }

  /**
   * Get OIDC provider for organization
   */
  getOIDCProvider(orgId: string): OIDCProvider | undefined {
    return this.oidcProviders.get(orgId);
  }

  /**
   * Get SAML provider for organization
   */
  getSAMLProvider(orgId: string): SAMLProvider | undefined {
    return this.samlProviders.get(orgId);
  }

  /**
   * Generate PKCE verifier
   */
  generatePKCEVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Buffer.from(array).toString('base64url');
  }
}

// Singleton instance
export const ssoManager = new SSOManager();
