-- Initial schema for Key Custody Control Plane

-- Signing policies table
CREATE TABLE IF NOT EXISTS signing_policies (
    tenant_id TEXT PRIMARY KEY,
    algorithm TEXT NOT NULL,
    tsa_profile TEXT NOT NULL,
    assertions_allow TEXT NOT NULL, -- JSON array
    assertions_deny TEXT NOT NULL, -- JSON array
    embed_allowed_origins TEXT NOT NULL, -- JSON array
    key_type TEXT NOT NULL, -- hsm|kms|software
    provider TEXT NOT NULL, -- yubihsm2|vault|aws-kms|gcp-kms
    handle TEXT NOT NULL, -- HSM slot or KMS key ARN
    cert_chain TEXT NOT NULL, -- JSON array of PEM certificates
    not_before DATETIME NOT NULL,
    not_after DATETIME NOT NULL,
    rotate_every_days INTEGER NOT NULL,
    max_issuance_per_24h INTEGER NOT NULL,
    sign_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    policy_hash TEXT NOT NULL -- SHA-256 of canonical policy JSON
);

-- Rotation calendar table
CREATE TABLE IF NOT EXISTS rotation_calendar (
    tenant_id TEXT PRIMARY KEY,
    scheduled_rotation DATETIME NOT NULL,
    rotation_window_start DATETIME NOT NULL,
    rotation_window_end DATETIME NOT NULL,
    owner TEXT NOT NULL,
    approval_required BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'Scheduled', -- Scheduled|InProgress|Completed|Failed|Cancelled
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES signing_policies(tenant_id) ON DELETE CASCADE
);

-- Rotation evidence packs table
CREATE TABLE IF NOT EXISTS rotation_evidence_packs (
    pack_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    rotation_date DATETIME NOT NULL,
    files TEXT NOT NULL, -- JSON array of file metadata
    pack_hash TEXT NOT NULL, -- SHA-256 of all files
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    signed BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (tenant_id) REFERENCES signing_policies(tenant_id) ON DELETE CASCADE
);

-- Incident tracking table
CREATE TABLE IF NOT EXISTS incidents (
    incident_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    trigger_reason TEXT NOT NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    status TEXT NOT NULL DEFAULT 'Active', -- Active|Investigating|Rotating|Resigning|Resolved|Closed
    actions_taken TEXT NOT NULL, -- JSON array of actions
    evidence_files TEXT NOT NULL, -- JSON array of file paths
    impact_summary TEXT NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES signing_policies(tenant_id) ON DELETE CASCADE
);

-- Signing audit log table
CREATE TABLE IF NOT EXISTS signing_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    key_handle TEXT NOT NULL,
    digest_sha256 TEXT NOT NULL,
    signature TEXT NOT NULL, -- hex-encoded
    tsa_timestamp TEXT, -- RFC3161 timestamp token
    request_id TEXT NOT NULL,
    client_ip TEXT,
    user_agent TEXT,
    policy_hash TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES signing_policies(tenant_id) ON DELETE CASCADE
);

-- Key usage tracking table
CREATE TABLE IF NOT EXISTS key_usage_stats (
    tenant_id TEXT NOT NULL,
    date DATE NOT NULL,
    signatures_count INTEGER NOT NULL DEFAULT 0,
    bytes_signed INTEGER NOT NULL DEFAULT 0,
    errors_count INTEGER NOT NULL DEFAULT 0,
    last_signature_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, date),
    FOREIGN KEY (tenant_id) REFERENCES signing_policies(tenant_id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_signing_policies_tenant_id ON signing_policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rotation_calendar_scheduled ON rotation_calendar(scheduled_rotation);
CREATE INDEX IF NOT EXISTS idx_incidents_tenant_id ON incidents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_signing_audit_log_tenant_id ON signing_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_signing_audit_log_created_at ON signing_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_key_usage_stats_date ON key_usage_stats(date);

-- Create trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_signing_policies_updated_at
    AFTER UPDATE ON signing_policies
    FOR EACH ROW
BEGIN
    UPDATE signing_policies SET updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;

CREATE TRIGGER IF NOT EXISTS update_key_usage_stats_updated_at
    AFTER UPDATE ON key_usage_stats
    FOR EACH ROW
BEGIN
    UPDATE key_usage_stats SET updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id AND date = NEW.date;
END;
