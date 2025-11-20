-- =====================================================
-- Enterprise SSO Configuration Tables
-- Supports SAML 2.0, OAuth 2.0, OIDC, Azure AD, Google Workspace
-- =====================================================

-- SSO Provider Configurations (per organization)
CREATE TABLE IF NOT EXISTS sso_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id VARCHAR(255) NOT NULL,
    provider_type VARCHAR(50) NOT NULL, -- 'saml', 'oauth2', 'oidc', 'azure-ad', 'google', 'okta', 'onelogin'
    provider_name VARCHAR(255) NOT NULL, -- Display name
    enabled BOOLEAN DEFAULT true,
    
    -- SAML Configuration
    saml_entry_point TEXT, -- IdP SSO URL
    saml_issuer TEXT, -- IdP Entity ID
    saml_cert TEXT, -- IdP X.509 Certificate
    saml_callback_url TEXT, -- SP Assertion Consumer Service URL
    saml_logout_url TEXT, -- IdP Logout URL
    saml_authn_context TEXT[], -- Authentication context classes
    saml_signature_algorithm VARCHAR(50) DEFAULT 'sha256', -- 'sha1', 'sha256', 'sha512'
    saml_digest_algorithm VARCHAR(50) DEFAULT 'sha256',
    saml_want_assertions_signed BOOLEAN DEFAULT true,
    saml_want_response_signed BOOLEAN DEFAULT true,
    saml_force_authn BOOLEAN DEFAULT false,
    saml_passive BOOLEAN DEFAULT false,
    
    -- OAuth 2.0 / OIDC Configuration
    oauth_client_id TEXT,
    oauth_client_secret TEXT, -- Encrypted
    oauth_authorization_url TEXT,
    oauth_token_url TEXT,
    oauth_user_info_url TEXT,
    oauth_scope TEXT[], -- ['openid', 'profile', 'email']
    oauth_response_type VARCHAR(50) DEFAULT 'code', -- 'code', 'token', 'id_token'
    oauth_grant_type VARCHAR(50) DEFAULT 'authorization_code',
    oauth_pkce_enabled BOOLEAN DEFAULT true,
    
    -- Azure AD Specific
    azure_tenant_id TEXT,
    azure_policy_name TEXT, -- For B2C
    azure_domain_hint TEXT,
    azure_prompt VARCHAR(50), -- 'login', 'consent', 'select_account'
    
    -- Google Workspace Specific
    google_hd TEXT, -- Hosted domain restriction
    google_access_type VARCHAR(50) DEFAULT 'online', -- 'online', 'offline'
    
    -- Attribute Mapping (SAML/OIDC claims to user attributes)
    attribute_mapping JSONB DEFAULT '{
        "email": "email",
        "firstName": "given_name",
        "lastName": "family_name",
        "displayName": "name",
        "groups": "groups",
        "roles": "roles"
    }'::jsonb,
    
    -- JIT (Just-In-Time) Provisioning
    jit_provisioning_enabled BOOLEAN DEFAULT true,
    jit_default_role VARCHAR(50) DEFAULT 'user',
    jit_group_mapping JSONB, -- Map IdP groups to app roles
    
    -- SCIM Configuration
    scim_enabled BOOLEAN DEFAULT false,
    scim_token TEXT, -- Bearer token for SCIM API
    scim_base_url TEXT,
    
    -- Security Settings
    require_encrypted_assertions BOOLEAN DEFAULT true,
    allowed_clock_drift_ms INTEGER DEFAULT 5000,
    session_lifetime_hours INTEGER DEFAULT 24,
    enforce_sso BOOLEAN DEFAULT false, -- Disable password login when true
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(255),
    last_synced_at TIMESTAMP,
    
    UNIQUE(org_id, provider_name)
);

-- SSO Sessions (track active SSO sessions)
CREATE TABLE IF NOT EXISTS sso_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    provider_id UUID REFERENCES sso_providers(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    org_id VARCHAR(255) NOT NULL,
    
    -- Session Data
    name_id TEXT, -- SAML NameID
    session_index TEXT, -- SAML SessionIndex for logout
    idp_session_id TEXT, -- IdP session identifier
    
    -- Authentication Context
    auth_method VARCHAR(50), -- 'saml', 'oauth2', 'oidc'
    auth_time TIMESTAMP DEFAULT NOW(),
    auth_context_class TEXT,
    
    -- Token Storage (encrypted)
    access_token TEXT,
    refresh_token TEXT,
    id_token TEXT,
    token_expires_at TIMESTAMP,
    
    -- Session Metadata
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Lifecycle
    created_at TIMESTAMP DEFAULT NOW(),
    last_activity_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sso_sessions_user ON sso_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sso_sessions_org ON sso_sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_sso_sessions_provider ON sso_sessions(provider_id);
CREATE INDEX IF NOT EXISTS idx_sso_sessions_expires ON sso_sessions(expires_at);

-- SSO Audit Log (comprehensive audit trail)
CREATE TABLE IF NOT EXISTS sso_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id VARCHAR(255) NOT NULL,
    provider_id UUID REFERENCES sso_providers(id) ON DELETE SET NULL,
    user_id VARCHAR(255),
    
    -- Event Details
    event_type VARCHAR(100) NOT NULL, -- 'login', 'logout', 'config_change', 'jit_provision', 'scim_sync'
    event_status VARCHAR(50) NOT NULL, -- 'success', 'failure', 'error'
    event_message TEXT,
    
    -- Request Context
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(255),
    
    -- Event Data
    event_data JSONB DEFAULT '{}'::jsonb,
    error_details JSONB,
    
    -- Timestamp
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sso_audit_org ON sso_audit_log(org_id);
CREATE INDEX IF NOT EXISTS idx_sso_audit_user ON sso_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_sso_audit_event ON sso_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_sso_audit_created ON sso_audit_log(created_at);

-- SCIM Users (for SCIM 2.0 provisioning)
CREATE TABLE IF NOT EXISTS scim_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scim_id VARCHAR(255) UNIQUE NOT NULL, -- External SCIM ID
    provider_id UUID REFERENCES sso_providers(id) ON DELETE CASCADE,
    org_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255), -- Internal user ID (after provisioning)
    
    -- SCIM User Schema
    user_name VARCHAR(255) NOT NULL,
    external_id VARCHAR(255),
    active BOOLEAN DEFAULT true,
    
    -- Name
    formatted_name TEXT,
    family_name VARCHAR(255),
    given_name VARCHAR(255),
    middle_name VARCHAR(255),
    honorific_prefix VARCHAR(50),
    honorific_suffix VARCHAR(50),
    
    -- Contact
    emails JSONB, -- [{"value": "user@example.com", "type": "work", "primary": true}]
    phone_numbers JSONB,
    addresses JSONB,
    
    -- Enterprise
    employee_number VARCHAR(100),
    cost_center VARCHAR(100),
    organization VARCHAR(255),
    division VARCHAR(255),
    department VARCHAR(255),
    manager_id VARCHAR(255),
    
    -- Groups & Roles
    groups JSONB, -- [{"value": "group-id", "display": "Admins"}]
    roles JSONB,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_synced_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(provider_id, user_name)
);

CREATE INDEX IF NOT EXISTS idx_scim_users_org ON scim_users(org_id);
CREATE INDEX IF NOT EXISTS idx_scim_users_provider ON scim_users(provider_id);
CREATE INDEX IF NOT EXISTS idx_scim_users_user ON scim_users(user_id);

-- SCIM Groups (for group-based provisioning)
CREATE TABLE IF NOT EXISTS scim_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scim_id VARCHAR(255) UNIQUE NOT NULL,
    provider_id UUID REFERENCES sso_providers(id) ON DELETE CASCADE,
    org_id VARCHAR(255) NOT NULL,
    
    -- Group Data
    display_name VARCHAR(255) NOT NULL,
    external_id VARCHAR(255),
    
    -- Members
    members JSONB, -- [{"value": "user-scim-id", "display": "John Doe"}]
    
    -- Role Mapping
    mapped_role VARCHAR(100), -- Internal role this group maps to
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_synced_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(provider_id, display_name)
);

CREATE INDEX IF NOT EXISTS idx_scim_groups_org ON scim_groups(org_id);
CREATE INDEX IF NOT EXISTS idx_scim_groups_provider ON scim_groups(provider_id);

-- Create updated_at trigger for sso_providers
CREATE OR REPLACE FUNCTION update_sso_providers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sso_providers_updated_at
    BEFORE UPDATE ON sso_providers
    FOR EACH ROW
    EXECUTE FUNCTION update_sso_providers_updated_at();

-- Create updated_at trigger for scim_users
CREATE OR REPLACE FUNCTION update_scim_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scim_users_updated_at
    BEFORE UPDATE ON scim_users
    FOR EACH ROW
    EXECUTE FUNCTION update_scim_users_updated_at();

-- Create updated_at trigger for scim_groups
CREATE OR REPLACE FUNCTION update_scim_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scim_groups_updated_at
    BEFORE UPDATE ON scim_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_scim_groups_updated_at();

-- Grant permissions
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'credlink_api') THEN
        CREATE ROLE credlink_api LOGIN;
    END IF;
END$$;

GRANT ALL ON sso_providers TO credlink_api;
GRANT ALL ON sso_sessions TO credlink_api;
GRANT ALL ON sso_audit_log TO credlink_api;
GRANT ALL ON scim_users TO credlink_api;
GRANT ALL ON scim_groups TO credlink_api;
