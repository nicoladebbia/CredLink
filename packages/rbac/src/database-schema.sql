-- Database Schema for RBAC System
-- Replaces in-memory Map storage with persistent PostgreSQL storage

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'super_admin', 'org_manager'
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version INTEGER DEFAULT 1
);

-- Permissions table
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    permission_id VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'org_admin_keys'
    verb VARCHAR(50) NOT NULL, -- 'create', 'read', 'update', 'delete', 'execute', '*'
    resource VARCHAR(50) NOT NULL, -- 'keys', 'policies', 'users', 'sign', '*'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Role permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(role_id, permission_id)
);

-- Role inheritance table
CREATE TABLE IF NOT EXISTS role_inheritance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    child_role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(parent_role_id, child_role_id)
);

-- Subject roles junction table (user/role assignments)
CREATE TABLE IF NOT EXISTS subject_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject_id VARCHAR(100) NOT NULL, -- user_id or service account
    org_id VARCHAR(100) NOT NULL,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    granted_by VARCHAR(100), -- who granted this role
    expires_at TIMESTAMP WITH TIME ZONE, -- optional expiration
    UNIQUE(subject_id, org_id, role_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_roles_role_id ON roles(role_id);
CREATE INDEX IF NOT EXISTS idx_permissions_permission_id ON permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_subject_roles_subject_org ON subject_roles(subject_id, org_id);
CREATE INDEX IF NOT EXISTS idx_subject_roles_org ON subject_roles(org_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_inheritance_parent ON role_inheritance(parent_role_id);
CREATE INDEX IF NOT EXISTS idx_role_inheritance_child ON role_inheritance(child_role_id);

-- Audit logging for RBAC changes
CREATE TABLE IF NOT EXISTS rbac_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action VARCHAR(50) NOT NULL, -- 'role_assign', 'role_revoke', 'permission_grant', etc.
    subject_id VARCHAR(100),
    org_id VARCHAR(100),
    role_id VARCHAR(50),
    permission_id VARCHAR(50),
    performed_by VARCHAR(100),
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_rbac_audit_performed_at ON rbac_audit_log(performed_at);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_subject ON rbac_audit_log(subject_id);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_org ON rbac_audit_log(org_id);
