-- Phase 11 — Trust Graph & Badge Reputation v1
-- Audit Events Schema for Security and Compliance

-- Audit events table for security logging
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    action VARCHAR(100) NOT NULL,                    -- e.g., KEY_REVOCATION, ADMIN_ACCESS
    user_id VARCHAR(255) NOT NULL,                   -- User who performed the action
    session_id VARCHAR(255),                         -- Session identifier
    ip_address INET NOT NULL,                        -- Client IP address
    user_agent TEXT,                                 -- Client user agent
    resource_id VARCHAR(255),                        -- Target resource (e.g., key_id)
    resource_type VARCHAR(50),                       -- Resource type (e.g., 'key', 'user')
    details JSONB NOT NULL DEFAULT '{}',             -- Additional event details
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    success BOOLEAN NOT NULL DEFAULT true,           -- Whether the action succeeded
    error_message TEXT,                              -- Error message if action failed
    request_id VARCHAR(100),                         -- Request tracking ID
    correlation_id VARCHAR(100),                     -- Correlation ID for distributed tracing
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for audit event queries
CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_user_id ON audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_events_severity ON audit_events(severity);
CREATE INDEX IF NOT EXISTS idx_audit_events_resource_id ON audit_events(resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_ip_address ON audit_events(ip_address);
CREATE INDEX IF NOT EXISTS idx_audit_events_success ON audit_events(success);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_events_user_timestamp ON audit_events(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_action_timestamp ON audit_events(action, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_severity_timestamp ON audit_events(severity, timestamp DESC);

-- GIN index for details JSONB queries
CREATE INDEX IF NOT EXISTS idx_audit_events_details_gin ON audit_events USING GIN(details);

-- Partition audit events by month for performance (optional for high volume)
-- Uncomment if you expect high audit volume
/*
CREATE TABLE IF NOT EXISTS audit_events_y2024m01 PARTITION OF audit_events
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE IF NOT EXISTS audit_events_y2024m02 PARTITION OF audit_events
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
-- Add more partitions as needed
*/

-- Audit event retention policy
-- Create function to clean up old audit events
CREATE OR REPLACE FUNCTION cleanup_old_audit_events()
RETURNS void AS $$
DECLARE
    cutoff_date TIMESTAMP WITH TIME ZONE;
    deleted_count INTEGER;
BEGIN
    -- Keep audit events for 1 year (adjust as needed for compliance)
    cutoff_date := NOW() - INTERVAL '1 year';
    
    DELETE FROM audit_events 
    WHERE timestamp < cutoff_date;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RAISE NOTICE 'Cleaned up % old audit events older than %', deleted_count, cutoff_date;
END;
$$ LANGUAGE plpgsql;

-- Create a materialized view for audit statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS audit_statistics AS
SELECT 
    DATE_TRUNC('day', timestamp) as date,
    action,
    severity,
    COUNT(*) as event_count,
    COUNT(CASE WHEN NOT success THEN 1 END) as failure_count,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT ip_address) as unique_ips
FROM audit_events
WHERE timestamp >= NOW() - INTERVAL '90 days'
GROUP BY DATE_TRUNC('day', timestamp), action, severity
ORDER BY date DESC, action;

-- Create index for the materialized view
CREATE INDEX IF NOT EXISTS idx_audit_statistics_date ON audit_statistics(date DESC);
CREATE INDEX IF NOT EXISTS idx_audit_statistics_action ON audit_statistics(action);
CREATE INDEX IF NOT EXISTS idx_audit_statistics_severity ON audit_statistics(severity);

-- Function to refresh audit statistics
CREATE OR REPLACE FUNCTION refresh_audit_statistics()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY audit_statistics;
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to refresh statistics (requires pg_cron extension)
-- Uncomment if pg_cron is available
/*
SELECT cron.schedule('refresh-audit-stats', '0 2 * * *', 'SELECT refresh_audit_statistics();');
SELECT cron.schedule('cleanup-audit-events', '0 3 * * 0', 'SELECT cleanup_old_audit_events();');
*/

-- Create view for recent security events
CREATE OR REPLACE VIEW recent_security_events AS
SELECT 
    id,
    timestamp,
    action,
    user_id,
    ip_address,
    resource_id,
    details,
    severity,
    success,
    error_message
FROM audit_events
WHERE 
    severity IN ('high', 'critical')
    OR action IN ('KEY_REVOCATION', 'ADMIN_ACCESS', 'SECURITY_BREACH')
    OR NOT success
ORDER BY timestamp DESC
LIMIT 1000;

-- Grant permissions (adjust for your setup)
-- GRANT SELECT, INSERT ON audit_events TO audit_service;
-- GRANT SELECT ON audit_statistics TO analytics_service;
-- GRANT SELECT ON recent_security_events TO security_team;

-- Row Level Security for audit events (optional)
-- Uncomment if you need row-level security
/*
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own audit events
CREATE POLICY user_audit_events ON audit_events
    FOR SELECT
    USING (user_id = current_setting('app.current_user_id', true));

-- Policy: Admin users can see all audit events
CREATE POLICY admin_audit_events ON audit_events
    FOR SELECT
    USING (current_setting('app.user_role', true) = 'admin');
*/

-- Trigger for audit event validation
CREATE OR REPLACE FUNCTION validate_audit_event()
RETURNS trigger AS $$
BEGIN
    -- Validate required fields
    IF NEW.action IS NULL OR LENGTH(TRIM(NEW.action)) = 0 THEN
        RAISE EXCEPTION 'Action cannot be null or empty';
    END IF;
    
    IF NEW.user_id IS NULL OR LENGTH(TRIM(NEW.user_id)) = 0 THEN
        RAISE EXCEPTION 'User ID cannot be null or empty';
    END IF;
    
    IF NEW.ip_address IS NULL THEN
        RAISE EXCEPTION 'IP address cannot be null';
    END IF;
    
    -- Validate severity
    IF NEW.severity NOT IN ('low', 'medium', 'high', 'critical') THEN
        RAISE EXCEPTION 'Invalid severity: %', NEW.severity;
    END IF;
    
    -- Set default timestamp if not provided
    IF NEW.timestamp IS NULL THEN
        NEW.timestamp := NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS audit_event_validation ON audit_events;
CREATE TRIGGER audit_event_validation
    BEFORE INSERT OR UPDATE ON audit_events
    FOR EACH ROW
    EXECUTE FUNCTION validate_audit_event();

-- Comments for documentation
COMMENT ON TABLE audit_events IS 'Audit trail for security and compliance tracking';
COMMENT ON COLUMN audit_events.id IS 'Unique identifier for the audit event';
COMMENT ON COLUMN audit_events.timestamp IS 'When the event occurred';
COMMENT ON COLUMN audit_events.action IS 'The action performed (e.g., KEY_REVOCATION)';
COMMENT ON COLUMN audit_events.user_id IS 'User who performed the action';
COMMENT ON COLUMN audit_events.ip_address IS 'Client IP address';
COMMENT ON COLUMN audit_events.severity IS 'Event severity level';
COMMENT ON COLUMN audit_events.success IS 'Whether the action succeeded';
COMMENT ON COLUMN audit_events.details IS 'Additional event data in JSON format';

-- Create indexes for common security queries
CREATE INDEX IF NOT EXISTS idx_audit_events_failed ON audit_events(timestamp DESC) WHERE NOT success;
CREATE INDEX IF NOT EXISTS idx_audit_events_critical ON audit_events(timestamp DESC) WHERE severity = 'critical';
CREATE INDEX IF NOT EXISTS idx_audit_events_revocations ON audit_events(timestamp DESC) WHERE action = 'KEY_REVOCATION';

-- Function to get audit summary for dashboard
CREATE OR REPLACE FUNCTION get_audit_summary(days INTEGER DEFAULT 7)
RETURNS TABLE(
    total_events BIGINT,
    critical_events BIGINT,
    failed_events BIGINT,
    unique_users BIGINT,
    top_actions JSON,
    top_ips JSON
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_events,
        COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_events,
        COUNT(CASE WHEN NOT success THEN 1 END) as failed_events,
        COUNT(DISTINCT user_id) as unique_users,
        (
            SELECT jsonb_agg(action_counts)
            FROM (
                SELECT jsonb_build_object('action', action, 'count', cnt) as action_counts
                FROM (
                    SELECT action, COUNT(*) as cnt
                    FROM audit_events
                    WHERE timestamp >= NOW() - INTERVAL '1 day' * days
                    GROUP BY action
                    ORDER BY cnt DESC
                    LIMIT 5
                ) top_actions
            ) subquery
        ) as top_actions,
        (
            SELECT jsonb_agg(ip_counts)
            FROM (
                SELECT jsonb_build_object('ip', ip_address::text, 'count', cnt) as ip_counts
                FROM (
                    SELECT ip_address, COUNT(*) as cnt
                    FROM audit_events
                    WHERE timestamp >= NOW() - INTERVAL '1 day' * days
                    GROUP BY ip_address
                    ORDER BY cnt DESC
                    LIMIT 5
                ) top_ips
            ) subquery
        ) as top_ips
    FROM audit_events
    WHERE timestamp >= NOW() - INTERVAL '1 day' * days;
END;
$$ LANGUAGE plpgsql;
