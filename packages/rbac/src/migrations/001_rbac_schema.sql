-- BRUTAL RBAC Database Schema
-- Production-ready PostgreSQL schema for DatabaseRBAC

-- Enable UUID extension for generated IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Roles table - stores all available roles
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id VARCHAR(100) NOT NULL UNIQUE, -- e.g., 'super_admin', 'image_signer'
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    is_active BOOLEAN DEFAULT true
);

-- Permissions table - stores all permissions
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    permission_id VARCHAR(100) NOT NULL UNIQUE, -- e.g., 'sign_images', 'read_documents'
    verb VARCHAR(50) NOT NULL, -- e.g., 'sign', 'read', 'write', 'delete'
    resource VARCHAR(100) NOT NULL, -- e.g., 'images', 'documents', '*'
    conditions JSONB, -- Optional conditions for permission
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    is_active BOOLEAN DEFAULT true
);

-- Role Permissions junction table - links roles to permissions
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    UNIQUE(role_id, permission_id)
);

-- Subject Roles table - assigns roles to users/subjects
CREATE TABLE IF NOT EXISTS subject_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject_id VARCHAR(255) NOT NULL, -- User ID or service ID
    org_id VARCHAR(255) NOT NULL, -- Organization ID
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_by VARCHAR(100),
    expires_at TIMESTAMP WITH TIME ZONE, -- Optional expiration
    is_active BOOLEAN DEFAULT true,
    UNIQUE(subject_id, org_id, role_id)
);

-- RBAC Audit Log table - tracks all permission checks and role changes
CREATE TABLE IF NOT EXISTS rbac_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action VARCHAR(50) NOT NULL, -- 'permission_check', 'role_assign', 'role_revoke'
    subject_id VARCHAR(255), -- User ID who performed the action
    org_id VARCHAR(255), -- Organization ID
    role_id UUID REFERENCES roles(id), -- Role involved (if applicable)
    permission_id UUID REFERENCES permissions(id), -- Permission involved (if applicable)
    performed_by VARCHAR(255), -- Who performed the action
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    request_id VARCHAR(100), -- Request tracking ID
    metadata JSONB, -- Additional context (action details, IP, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_roles_role_id ON roles(role_id);
CREATE INDEX IF NOT EXISTS idx_roles_active ON roles(is_active);
CREATE INDEX IF NOT EXISTS idx_permissions_verb ON permissions(verb);
CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource);
CREATE INDEX IF NOT EXISTS idx_permissions_active ON permissions(is_active);
CREATE INDEX IF NOT EXISTS idx_subject_roles_subject ON subject_roles(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_roles_org ON subject_roles(org_id);
CREATE INDEX IF NOT EXISTS idx_subject_roles_active ON subject_roles(is_active);
CREATE INDEX IF NOT EXISTS idx_subject_roles_expires ON subject_roles(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON rbac_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_subject ON rbac_audit_log(subject_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_performed_at ON rbac_audit_log(performed_at);

-- Insert built-in roles
INSERT INTO roles (role_id, name, description, created_by) VALUES
('super_admin', 'Super Administrator', 'Full system access with all permissions', 'system'),
('org_admin', 'Organization Administrator', 'Organization-level administrative access', 'system'),
('image_signer', 'Image Signer', 'Can sign images and manage image-related operations', 'system'),
('auditor', 'Auditor', 'Read-only access for audit and compliance purposes', 'system'),
('developer', 'Developer', 'Development and testing access', 'system')
ON CONFLICT (role_id) DO NOTHING;

-- Insert built-in permissions
INSERT INTO permissions (permission_id, verb, resource, created_by) VALUES
('super_admin_all', '*', '*', 'system'),
('org_admin_manage', 'manage', 'organization', 'system'),
('sign_images', 'sign', 'images', 'system'),
('verify_images', 'verify', 'images', 'system'),
('read_documents', 'read', 'documents', 'system'),
('write_documents', 'write', 'documents', 'system'),
('delete_documents', 'delete', 'documents', 'system'),
('audit_logs', 'read', 'audit_logs', 'system'),
('manage_users', 'manage', 'users', 'system')
ON CONFLICT (permission_id) DO NOTHING;

-- Assign permissions to roles
-- Super Admin gets all permissions
INSERT INTO role_permissions (role_id, permission_id, created_by)
SELECT r.id, p.id, 'system'
FROM roles r, permissions p 
WHERE r.role_id = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Org Admin permissions
INSERT INTO role_permissions (role_id, permission_id, created_by)
SELECT r.id, p.id, 'system'
FROM roles r, permissions p 
WHERE r.role_id = 'org_admin' AND p.permission_id IN ('org_admin_manage', 'read_documents', 'audit_logs', 'manage_users')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Image Signer permissions
INSERT INTO role_permissions (role_id, permission_id, created_by)
SELECT r.id, p.id, 'system'
FROM roles r, permissions p 
WHERE r.role_id = 'image_signer' AND p.permission_id IN ('sign_images', 'verify_images', 'read_documents')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Auditor permissions
INSERT INTO role_permissions (role_id, permission_id, created_by)
SELECT r.id, p.id, 'system'
FROM roles r, permissions p 
WHERE r.role_id = 'auditor' AND p.permission_id IN ('audit_logs', 'read_documents')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Developer permissions
INSERT INTO role_permissions (role_id, permission_id, created_by)
SELECT r.id, p.id, 'system'
FROM roles r, permissions p 
WHERE r.role_id = 'developer' AND p.permission_id IN ('read_documents', 'write_documents', 'sign_images')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Create a function to check if subject has active role
CREATE OR REPLACE FUNCTION has_active_role(p_subject_id VARCHAR(255), p_org_id VARCHAR(255), p_role_id VARCHAR(100))
RETURNS BOOLEAN AS $$
DECLARE
    role_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO role_count
    FROM subject_roles sr
    JOIN roles r ON sr.role_id = r.id
    WHERE sr.subject_id = p_subject_id
      AND sr.org_id = p_org_id
      AND r.role_id = p_role_id
      AND sr.is_active = true
      AND r.is_active = true
      AND (sr.expires_at IS NULL OR sr.expires_at > NOW());
    
    RETURN role_count > 0;
END;
$$ LANGUAGE plpgsql;

-- Create a view for active role assignments
CREATE OR REPLACE VIEW active_subject_roles AS
SELECT 
    sr.subject_id,
    sr.org_id,
    r.role_id,
    r.name as role_name,
    sr.assigned_at,
    sr.assigned_by,
    sr.expires_at
FROM subject_roles sr
JOIN roles r ON sr.role_id = r.id
WHERE sr.is_active = true 
  AND r.is_active = true
  AND (sr.expires_at IS NULL OR sr.expires_at > NOW());

-- Create a view for role permissions
CREATE OR REPLACE VIEW role_permission_details AS
SELECT 
    r.role_id,
    r.name as role_name,
    p.permission_id,
    p.verb,
    p.resource,
    p.conditions
FROM roles r
JOIN role_permissions rp ON r.id = rp.role_id
JOIN permissions p ON rp.permission_id = p.id
WHERE r.is_active = true 
  AND p.is_active = true;

COMMIT;
