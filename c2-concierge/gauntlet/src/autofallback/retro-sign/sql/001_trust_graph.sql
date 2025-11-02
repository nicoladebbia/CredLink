-- Phase 11 — Trust Graph & Badge Reputation v1
-- Database Schema for Issuer Graph, Scoring, and Revocations

-- Trust Nodes (organizations, keys, devices)
CREATE TABLE IF NOT EXISTS trust_nodes (
    node_id TEXT PRIMARY KEY,                    -- Stable identifier: key:ca:fingerprint, org:org_id, dev:serial
    type TEXT NOT NULL CHECK (type IN ('key', 'org', 'device')),
    attrs JSONB NOT NULL DEFAULT '{}',           -- Node attributes (algorithm, conformance, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_trust_nodes_type ON trust_nodes(type);
CREATE INDEX IF NOT EXISTS idx_trust_nodes_created ON trust_nodes(created_at);
CREATE INDEX IF NOT EXISTS idx_trust_nodes_updated ON trust_nodes(updated_at);
CREATE INDEX IF NOT EXISTS idx_trust_nodes_attrs_gin ON trust_nodes USING GIN(attrs);

-- Trust Edges (relationships between nodes)
CREATE TABLE IF NOT EXISTS trust_edges (
    edge_id TEXT PRIMARY KEY,                    -- Composite: from_node:to_node:type
    from_node TEXT NOT NULL REFERENCES trust_nodes(node_id) ON DELETE CASCADE,
    to_node TEXT NOT NULL REFERENCES trust_nodes(node_id) ON DELETE CASCADE,
    edge_type TEXT NOT NULL CHECK (edge_type IN ('issued_by', 'rotated_to', 'attested_by', 'used_by')),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    attrs JSONB NOT NULL DEFAULT '{}',           -- Edge attributes (evidence URLs, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for graph traversal
CREATE INDEX IF NOT EXISTS idx_trust_edges_from ON trust_edges(from_node);
CREATE INDEX IF NOT EXISTS idx_trust_edges_to ON trust_edges(to_node);
CREATE INDEX IF NOT EXISTS idx_trust_edges_type ON trust_edges(edge_type);
CREATE INDEX IF NOT EXISTS idx_trust_edges_timestamp ON trust_edges(timestamp);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trust_edges_unique ON trust_edges(from_node, to_node, edge_type);

-- Revocations (key status from multiple sources)
CREATE TABLE IF NOT EXISTS revocations (
    id SERIAL PRIMARY KEY,
    key_id TEXT NOT NULL,                        -- References key:ca:fingerprint
    status TEXT NOT NULL CHECK (status IN ('good', 'revoked', 'unknown', 'hold')),
    source TEXT NOT NULL,                        -- ocsp, crl, internal
    reason TEXT,                                 -- Human-readable reason
    evidence_url TEXT,                           -- Link to revocation evidence
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for revocation lookups
CREATE INDEX IF NOT EXISTS idx_revocations_key ON revocations(key_id);
CREATE INDEX IF NOT EXISTS idx_revocations_status ON revocations(status);
CREATE INDEX IF NOT EXISTS idx_revocations_source ON revocations(source);
CREATE INDEX IF NOT EXISTS idx_revocations_timestamp ON revocations(timestamp);
CREATE UNIQUE INDEX IF NOT EXISTS idx_revocations_unique ON revocations(key_id, source, timestamp);

-- Trust Scores (computed scores with breakdown)
CREATE TABLE IF NOT EXISTS trust_scores (
    key_id TEXT PRIMARY KEY,                     -- References key:ca:fingerprint
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
    grade TEXT NOT NULL CHECK (grade IN ('A', 'B', 'C', 'D', 'E', 'F')),
    components JSONB NOT NULL DEFAULT '[]',      -- Score breakdown with deltas
    computed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,         -- Score expiration for cache invalidation
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for score lookups
CREATE INDEX IF NOT EXISTS idx_trust_scores_score ON trust_scores(score);
CREATE INDEX IF NOT EXISTS idx_trust_scores_grade ON trust_scores(grade);
CREATE INDEX IF NOT EXISTS idx_trust_scores_computed ON trust_scores(computed_at);
CREATE INDEX IF NOT EXISTS idx_trust_scores_expires ON trust_scores(expires_at);

-- Materialized view for key usage statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS key_usage_stats AS
SELECT 
    te.to_node as key_id,
    COUNT(*) as usage_count,
    MAX(te.timestamp) as last_used,
    MIN(te.timestamp) as first_used
FROM trust_edges te
WHERE te.edge_type = 'used_by'
GROUP BY te.to_node;

-- Index for materialized view
CREATE INDEX IF NOT EXISTS idx_key_usage_stats_key ON key_usage_stats(key_id);
CREATE INDEX IF NOT EXISTS idx_key_usage_stats_last_used ON key_usage_stats(last_used);

-- Function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_key_usage_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY key_usage_stats;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_trust_nodes_updated_at 
    BEFORE UPDATE ON trust_nodes 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trust_scores_updated_at 
    BEFORE UPDATE ON trust_scores 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Helper functions for node ID generation
CREATE OR REPLACE FUNCTION generate_key_node_id(issuer_ca_id TEXT, key_fingerprint TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN 'key:' || issuer_ca_id || ':' || key_fingerprint;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_org_node_id(org_id TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN 'org:' || org_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_device_node_id(device_type TEXT, device_id TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN 'dev:' || device_type || ':' || device_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get current revocation status for a key
CREATE OR REPLACE FUNCTION get_key_revocation_status(key_id TEXT)
RETURNS TABLE(status TEXT, source TEXT, reason TEXT, timestamp TIMESTAMP WITH TIME ZONE) AS $$
BEGIN
    RETURN QUERY
    SELECT r.status, r.source, r.reason, r.timestamp
    FROM revocations r
    WHERE r.key_id = key_id
    ORDER BY r.timestamp DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to compute trust path for a key
CREATE OR REPLACE FUNCTION compute_trust_path(key_id TEXT)
RETURNS TABLE(
    org_node_id TEXT,
    org_attrs JSONB,
    key_node_id TEXT,
    key_attrs JSONB,
    device_node_id TEXT,
    device_attrs JSONB,
    rotation_edge JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH key_chain AS (
        -- Get key node and its organization
        SELECT 
            kn.node_id as key_node_id,
            kn.attrs as key_attrs,
            te_from.from_node as org_node_id,
            onode.attrs as org_attrs
        FROM trust_nodes kn
        LEFT JOIN trust_edges te_from ON te_from.to_node = kn.node_id AND te_from.edge_type = 'issued_by'
        LEFT JOIN trust_nodes onode ON onode.node_id = te_from.from_node
        WHERE kn.node_id = key_id AND kn.type = 'key'
    ),
    device_info AS (
        -- Get device attestation for the key
        SELECT 
            te_attested.from_node as device_node_id,
            dnode.attrs as device_attrs,
            te_attested.attrs as attestation_attrs
        FROM key_chain kc
        LEFT JOIN trust_edges te_attested ON te_attested.to_node = kc.key_node_id AND te_attested.edge_type = 'attested_by'
        LEFT JOIN trust_nodes dnode ON dnode.node_id = te_attested.from_node
    ),
    rotation_info AS (
        -- Get rotation information (old key to new key)
        SELECT 
            te_rot.attrs as rotation_attrs
        FROM key_chain kc
        LEFT JOIN trust_edges te_rot ON te_rot.from_node = kc.key_node_id AND te_rot.edge_type = 'rotated_to'
        LIMIT 1
    )
    SELECT 
        kc.org_node_id,
        kc.org_attrs,
        kc.key_node_id,
        kc.key_attrs,
        di.device_node_id,
        di.device_attrs,
        ri.rotation_attrs
    FROM key_chain kc
    LEFT JOIN device_info di ON true
    LEFT JOIN rotation_info ri ON true;
END;
$$ LANGUAGE plpgsql;

-- Sample data for testing (can be removed in production)
INSERT INTO trust_nodes (node_id, type, attrs) VALUES 
('org:acme', 'org', '{"display_name": "Acme Media", "domain": "acme.example", "conformance": ["c2pa", "cai"]}'),
('key:ca1:af3219bd8c5e4729a8b1c4d6e7f8a9b0', 'key', '{"alg": "ES256", "created_at": "2025-07-01T00:00:00Z", "expires_at": "2026-07-01T00:00:00Z", "attested": true, "last_seen": "2025-10-31T15:03:00Z", "issuer_ca_id": "ca1"}'),
('dev:yubihsm2:SN123456', 'device', '{"kind": "yubihsm2", "evidence_pack_url": "https://example.com/evidence/yubihsm2-sn123456", "first_attested": "2025-07-01T00:00:00Z", "last_attested": "2025-09-30T00:00:00Z"}')
ON CONFLICT (node_id) DO NOTHING;

INSERT INTO trust_edges (edge_id, from_node, to_node, edge_type, timestamp, attrs) VALUES 
('org:acme:key:ca1:af3219bd8c5e4729a8b1c4d6e7f8a9b0:issued_by', 'org:acme', 'key:ca1:af3219bd8c5e4729a8b1c4d6e7f8a9b0', 'issued_by', '2025-07-01T00:00:00Z', '{"csr_fingerprint": "abc123"}'),
('dev:yubihsm2:SN123456:key:ca1:af3219bd8c5e4729a8b1c4d6e7f8a9b0:attested_by', 'dev:yubihsm2:SN123456', 'key:ca1:af3219bd8c5e4729a8b1c4d6e7f8a9b0', 'attested_by', '2025-07-01T00:00:00Z', '{"evidence_url": "https://example.com/attestation/af3219bd"}')
ON CONFLICT (edge_id) DO NOTHING;

-- Initial score for sample key
INSERT INTO trust_scores (key_id, score, grade, components, computed_at, expires_at) VALUES 
('key:ca1:af3219bd8c5e4729a8b1c4d6e7f8a9b0', 84, 'A', 
 '[{"name":"base_chain","delta":40},{"name":"hardware_attestation","delta":20},{"name":"fresh_key","delta":10},{"name":"on_time_rotation","delta":5},{"name":"conformance","delta":5},{"name":"clean_history","delta":5}]',
 '2025-10-31T15:03:00Z', '2025-10-31T15:08:00Z')
ON CONFLICT (key_id) DO UPDATE SET 
    score = EXCLUDED.score,
    grade = EXCLUDED.grade,
    components = EXCLUDED.components,
    computed_at = EXCLUDED.computed_at,
    expires_at = EXCLUDED.expires_at,
    updated_at = NOW();
