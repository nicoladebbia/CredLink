-- CredLink Initial Database Schema
-- Critical for MVP launch - enables authentication and data persistence

-- Users table for authentication and user management
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    clerk_id VARCHAR(255) UNIQUE, -- For Clerk integration
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    billing_tier VARCHAR(50) DEFAULT 'free',
    stripe_customer_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true
);

-- API Keys table for DatabaseRBAC authentication
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    key_name VARCHAR(100) NOT NULL,
    permissions JSONB NOT NULL DEFAULT '{"resources": ["proof"], "actions": ["read", "create"]}',
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- Proofs table for document signing metadata
CREATE TABLE IF NOT EXISTS proofs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_filename VARCHAR(255) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    image_hash VARCHAR(255) NOT NULL,
    proof_data JSONB NOT NULL,
    c2pa_manifest JSONB,
    storage_location VARCHAR(500), -- S3 path or local file path
    verification_count INTEGER DEFAULT 0,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit log table for security and compliance
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    request_details JSONB,
    response_status INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Billing events table for subscription management
CREATE TABLE IF NOT EXISTS billing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_event_id VARCHAR(255) UNIQUE,
    event_type VARCHAR(100) NOT NULL,
    amount_cents INTEGER,
    currency VARCHAR(3) DEFAULT 'usd',
    status VARCHAR(50) NOT NULL,
    metadata JSONB,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Usage metrics table for analytics and billing
CREATE TABLE IF NOT EXISTS usage_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    metric_type VARCHAR(50) NOT NULL, -- 'documents_signed', 'storage_used', 'api_calls'
    metric_value INTEGER NOT NULL,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, metric_type, period_start, period_end)
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active, expires_at);

CREATE INDEX IF NOT EXISTS idx_proofs_user_id ON proofs(user_id);
CREATE INDEX IF NOT EXISTS idx_proofs_hash ON proofs(image_hash);
CREATE INDEX IF NOT EXISTS idx_proofs_created_at ON proofs(created_at);
CREATE INDEX IF NOT EXISTS idx_proofs_active ON proofs(is_deleted, created_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, resource_type);

CREATE INDEX IF NOT EXISTS idx_billing_events_user_id ON billing_events(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_stripe_id ON billing_events(stripe_event_id);

CREATE INDEX IF NOT EXISTS idx_usage_metrics_user_id ON usage_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_period ON usage_metrics(metric_type, period_start);

-- Row Level Security (RLS) for multi-tenant security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data
CREATE POLICY users_own_data ON users FOR ALL USING (id = current_setting('app.current_user_id')::uuid);
CREATE POLICY api_keys_own_data ON api_keys FOR ALL USING (user_id = current_setting('app.current_user_id')::uuid);
CREATE POLICY proofs_own_data ON proofs FOR ALL USING (user_id = current_setting('app.current_user_id')::uuid);
CREATE POLICY billing_events_own_data ON billing_events FOR ALL USING (user_id = current_setting('app.current_user_id')::uuid);
CREATE POLICY usage_metrics_own_data ON usage_metrics FOR ALL USING (user_id = current_setting('app.current_user_id')::uuid);

-- RLS Policies: Service access for API operations
CREATE POLICY service_access_users ON users FOR SELECT USING (current_setting('app.service_role', true) = 'true');
CREATE POLICY service_access_api_keys ON api_keys FOR ALL USING (current_setting('app.service_role', true) = 'true');
CREATE POLICY service_access_proofs ON proofs FOR ALL USING (current_setting('app.service_role', true) = 'true');
CREATE POLICY service_access_billing ON billing_events FOR ALL USING (current_setting('app.service_role', true) = 'true');
CREATE POLICY service_access_usage ON usage_metrics FOR ALL USING (current_setting('app.service_role', true) = 'true');

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default admin user for testing
INSERT INTO users (email, first_name, last_name, billing_tier) 
VALUES ('admin@credlink.com', 'Admin', 'User', 'enterprise')
ON CONFLICT (email) DO NOTHING;

-- Create initial API key for admin user
INSERT INTO api_keys (user_id, key_hash, key_name, permissions)
SELECT 
    u.id,
    crypt('admin-test-key-123', gen_salt('bf')),
    'Initial Admin Key',
    '{"resources": ["proof", "api_key", "certificate", "billing"], "actions": ["read", "create", "update", "delete", "rotate", "revoke"]}'
FROM users u WHERE u.email = 'admin@credlink.com'
ON CONFLICT (key_hash) DO NOTHING;

COMMIT;
