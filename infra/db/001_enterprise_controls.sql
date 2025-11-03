-- Enterprise Controls v1 - Database Schema
-- Phase 18: RBAC, Identity, Policy, Audit

-- Organizations
CREATE TABLE IF NOT EXISTS orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  retention_months INTEGER DEFAULT 24,
  feature_flags JSONB DEFAULT '{}'
);

-- Users (synchronized from IdP)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  idp_subject TEXT NOT NULL, -- 'sub' from OIDC or NameID from SAML
  idp_provider TEXT NOT NULL, -- 'oidc', 'saml'
  email TEXT NOT NULL,
  name TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE,
  UNIQUE(org_id, idp_subject, idp_provider)
);

-- Roles (minimal matrix)
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User role assignments
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID REFERENCES users(id),
  PRIMARY KEY (user_id, role_id)
);

-- API Keys with IP allowlists
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash of the actual key
  scopes TEXT[] DEFAULT '{}', -- e.g., ['sign:assets', 'read:audit']
  cidr_allow TEXT[] DEFAULT '{}', -- CIDR blocks allowed
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  last_used TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES users(id)
);

-- Organization Policies
CREATE TABLE IF NOT EXISTS org_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'keys.generate', 'sign.assets', etc.
  condition JSONB NOT NULL, -- Policy conditions
  approver_role TEXT, -- Role that can approve
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  UNIQUE(org_id, action)
);

-- SSO Configurations
CREATE TABLE IF NOT EXISTS sso_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'oidc', 'saml'
  config JSONB NOT NULL, -- Provider-specific config
  active BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(org_id, type)
);

-- SCIM Configuration
CREATE TABLE IF NOT EXISTS scim_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT false,
  bearer_token TEXT, -- SCIM bearer token
  last_sync TIMESTAMP WITH TIME ZONE,
  sync_errors INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(org_id)
);

-- Seed default roles
INSERT INTO roles (name, description) VALUES 
  ('org_admin', 'Organization Administrator - Full access'),
  ('auditor', 'Auditor - Read-only access to compliance data'),
  ('integrator', 'Integrator - API-only access for integrations')
ON CONFLICT (name) DO NOTHING;

-- Seed default policies
INSERT INTO org_policies (org_id, action, condition, approver_role, reason) 
SELECT 
  o.id,
  'keys.generate',
  '{"require_approval": false, "max_keys": 10}',
  'org_admin',
  'Default key generation policy'
FROM orgs o
ON CONFLICT (org_id, action) DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_api_keys_org_id ON api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_org_policies_org_id ON org_policies(org_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
