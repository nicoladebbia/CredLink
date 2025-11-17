-- Insert built-in permissions for RBAC system
INSERT INTO permissions (permission_id, verb, resource) VALUES 
    ('super_admin_all', '*', '*'),
    ('org_admin_keys', 'create', 'keys'),
    ('org_admin_keys_read', 'read', 'keys'),
    ('org_admin_keys_update', 'update', 'keys'),
    ('org_admin_keys_delete', 'delete', 'keys'),
    ('org_admin_policies', 'create', 'policies'),
    ('org_admin_policies_read', 'read', 'policies'),
    ('org_admin_policies_update', 'update', 'policies'),
    ('org_admin_policies_delete', 'delete', 'policies'),
    ('org_admin_users', 'create', 'users'),
    ('org_admin_users_read', 'read', 'users'),
    ('org_admin_users_update', 'update', 'users'),
    ('org_admin_users_delete', 'delete', 'users'),
    ('org_admin_sign', 'execute', 'sign'),
    ('org_admin_verify', 'execute', 'verify'),
    ('org_manager_keys', 'create', 'keys'),
    ('org_manager_keys_read', 'read', 'keys'),
    ('org_manager_keys_update', 'update', 'keys'),
    ('org_manager_policies', 'read', 'policies'),
    ('org_manager_users', 'read', 'users'),
    ('org_manager_sign', 'execute', 'sign'),
    ('org_manager_verify', 'execute', 'verify'),
    ('developer_sign', 'execute', 'sign'),
    ('developer_verify', 'execute', 'verify'),
    ('developer_keys', 'read', 'keys'),
    ('auditor_audit', 'read', 'audit'),
    ('auditor_compliance', 'read', 'compliance'),
    ('auditor_policies', 'read', 'policies'),
    ('viewer_verify', 'execute', 'verify'),
    ('service_account_sign', 'execute', 'sign'),
    ('service_account_verify', 'execute', 'verify'),
    ('service_account_keys', 'read', 'keys')
ON CONFLICT (permission_id) DO NOTHING;

-- Insert built-in roles
INSERT INTO roles (role_id, name, description) VALUES 
    ('super_admin', 'Super Administrator', 'Full system access with all permissions'),
    ('org_admin', 'Organization Administrator', 'Complete organizational management'),
    ('org_manager', 'Organization Manager', 'Limited organizational management'),
    ('developer', 'Developer', 'API access for signing and verification'),
    ('auditor', 'Auditor', 'Read-only access to audit logs and compliance'),
    ('viewer', 'Viewer', 'Read-only access'),
    ('service_account', 'Service Account', 'Automated service access')
ON CONFLICT (role_id) DO NOTHING;

-- Link permissions to roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE (r.role_id, p.permission_id) IN (
    ('super_admin', 'super_admin_all'),
    ('org_admin', 'org_admin_keys'),
    ('org_admin', 'org_admin_keys_read'),
    ('org_admin', 'org_admin_keys_update'),
    ('org_admin', 'org_admin_keys_delete'),
    ('org_admin', 'org_admin_policies'),
    ('org_admin', 'org_admin_policies_read'),
    ('org_admin', 'org_admin_policies_update'),
    ('org_admin', 'org_admin_policies_delete'),
    ('org_admin', 'org_admin_users'),
    ('org_admin', 'org_admin_users_read'),
    ('org_admin', 'org_admin_users_update'),
    ('org_admin', 'org_admin_users_delete'),
    ('org_admin', 'org_admin_sign'),
    ('org_admin', 'org_admin_verify'),
    ('org_manager', 'org_manager_keys'),
    ('org_manager', 'org_manager_keys_read'),
    ('org_manager', 'org_manager_keys_update'),
    ('org_manager', 'org_manager_policies'),
    ('org_manager', 'org_manager_users'),
    ('org_manager', 'org_manager_sign'),
    ('org_manager', 'org_manager_verify'),
    ('developer', 'developer_sign'),
    ('developer', 'developer_verify'),
    ('developer', 'developer_keys'),
    ('auditor', 'auditor_audit'),
    ('auditor', 'auditor_compliance'),
    ('auditor', 'auditor_policies'),
    ('viewer', 'viewer_verify'),
    ('service_account', 'service_account_sign'),
    ('service_account', 'service_account_verify'),
    ('service_account', 'service_account_keys')
)
ON CONFLICT (role_id, permission_id) DO NOTHING;
