-- Migration 002: Create API Keys table with rotation support
-- STEP 7: CRED-007 - API Key Rotation Mechanism

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create API keys table with rotation and expiration support
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_id VARCHAR(100) UNIQUE NOT NULL, -- Public identifier for logging
    key_hash VARCHAR(255) NOT NULL, -- SHA-256 hash of the actual key
    client_id VARCHAR(100) NOT NULL, -- Client identifier
    client_name VARCHAR(255) NOT NULL, -- Human-readable client name
    version INTEGER NOT NULL DEFAULT 1, -- Key version for rotation tracking
    is_active BOOLEAN NOT NULL DEFAULT true, -- Enable/disable keys
    expires_at TIMESTAMP WITH TIME ZONE, -- Key expiration for automatic rotation
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE, -- Track key usage for rotation decisions
    rotation_interval_hours INTEGER DEFAULT 8760, -- Default 1 year (365 * 24)
    created_by VARCHAR(100), -- Service or user who created the key
    
    -- Constraints
    CONSTRAINT api_keys_client_id_version_unique UNIQUE (client_id, version),
    CONSTRAINT api_keys_key_hash_not_empty CHECK (length(key_hash) > 0),
    CONSTRAINT api_keys_expires_after_created CHECK (expires_at IS NULL OR expires_at > created_at),
    CONSTRAINT api_keys_rotation_interval_positive CHECK (rotation_interval_hours > 0)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_client_id ON api_keys(client_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_last_used_at ON api_keys(last_used_at);

-- Create audit table for key rotation tracking
CREATE TABLE IF NOT EXISTS api_key_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- 'created', 'rotated', 'revoked', 'expired'
    previous_key_hash VARCHAR(255), -- For rotation tracking
    performed_by VARCHAR(100), -- Service or user who performed action
    performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    metadata JSONB -- Additional context (reason, etc.)
);

-- Create index for audit log queries
CREATE INDEX IF NOT EXISTS idx_api_key_audit_log_api_key_id ON api_key_audit_log(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_key_audit_log_action ON api_key_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_api_key_audit_log_performed_at ON api_key_audit_log(performed_at);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER api_keys_updated_at_trigger
    BEFORE UPDATE ON api_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_api_keys_updated_at();

-- Create function to check for expired keys and mark them inactive
CREATE OR REPLACE FUNCTION deactivate_expired_keys()
RETURNS INTEGER AS $$
DECLARE
    deactivated_count INTEGER;
BEGIN
    UPDATE api_keys 
    SET is_active = false 
    WHERE is_active = true 
    AND expires_at IS NOT NULL 
    AND expires_at <= NOW();
    
    GET DIAGNOSTICS deactivated_count = ROW_COUNT;
    
    -- Log the deactivation
    INSERT INTO api_key_audit_log (api_key_id, action, performed_by, metadata)
    SELECT id, 'expired', 'system', jsonb_build_object('auto_deactivated', true)
    FROM api_keys 
    WHERE is_active = false 
    AND expires_at IS NOT NULL 
    AND expires_at <= NOW()
    AND id NOT IN (
        SELECT api_key_id FROM api_key_audit_log 
        WHERE action = 'expired' 
        AND performed_at >= NOW() - INTERVAL '1 hour'
    );
    
    RETURN deactivated_count;
END;
$$ LANGUAGE plpgsql;

-- Create view for active keys (for performance)
CREATE OR REPLACE VIEW active_api_keys AS
SELECT 
    id,
    key_id,
    key_hash,
    client_id,
    client_name,
    version,
    expires_at,
    created_at,
    updated_at,
    last_used_at,
    rotation_interval_hours
FROM api_keys 
WHERE is_active = true 
AND (expires_at IS NULL OR expires_at > NOW());

-- Create view for active keys (for performance)
CREATE OR REPLACE VIEW active_api_keys AS
SELECT 
    id,
    key_id,
    key_hash,
    client_id,
    client_name,
    version,
    expires_at,
    created_at,
    updated_at,
    last_used_at,
    rotation_interval_hours
FROM api_keys 
WHERE is_active = true 
AND (expires_at IS NULL OR expires_at > NOW());

-- Grant permissions to the application user
-- Note: Replace 'credlink_user' with actual database user
GRANT SELECT, INSERT, UPDATE, DELETE ON api_keys TO credlink_user;
GRANT SELECT, INSERT ON api_key_audit_log TO credlink_user;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO credlink_user;
GRANT EXECUTE ON FUNCTION update_api_keys_updated_at() TO credlink_user;
GRANT EXECUTE ON FUNCTION deactivate_expired_keys() TO credlink_user;
GRANT SELECT ON active_api_keys TO credlink_user;

-- Add comment for documentation
COMMENT ON TABLE api_keys IS 'API keys with rotation, expiration, and audit capabilities';
COMMENT ON TABLE api_key_audit_log IS 'Audit log for API key lifecycle events';
COMMENT ON VIEW active_api_keys IS 'Performance view for active, non-expired API keys';
