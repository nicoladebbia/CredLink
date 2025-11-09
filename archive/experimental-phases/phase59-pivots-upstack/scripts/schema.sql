-- Phase 59 - Pivots Up-Stack Database Schema

-- Custody keys table
CREATE TABLE IF NOT EXISTS custody_keys (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  key_id VARCHAR(255) NOT NULL UNIQUE,
  alias VARCHAR(255) NOT NULL,
  mode VARCHAR(50) NOT NULL CHECK (mode IN ('aws-kms', 'cloudhsm', 'yubihsm2')),
  region VARCHAR(50),
  rotation_days INTEGER NOT NULL,
  fips_validated BOOLEAN DEFAULT false,
  cluster_id VARCHAR(255),
  device_serial VARCHAR(255),
  endpoint VARCHAR(255),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  rotated_at TIMESTAMP
);

CREATE INDEX idx_custody_keys_tenant_active ON custody_keys(tenant_id, active);
CREATE INDEX idx_custody_keys_key_id ON custody_keys(key_id);

-- Signing operations log (append-only)
CREATE TABLE IF NOT EXISTS signing_operations (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  key_id VARCHAR(255) NOT NULL,
  signature_hash VARCHAR(64) NOT NULL,
  tsa_token_hash VARCHAR(64),
  operation_id UUID NOT NULL UNIQUE,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_signing_ops_tenant ON signing_operations(tenant_id);
CREATE INDEX idx_signing_ops_key ON signing_operations(key_id);
CREATE INDEX idx_signing_ops_timestamp ON signing_operations(timestamp DESC);

-- Evidence packs table
CREATE TABLE IF NOT EXISTS evidence_packs (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('initial_provision', 'rotation', 'audit', 'quarterly')),
  content JSONB NOT NULL,
  hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_evidence_packs_tenant ON evidence_packs(tenant_id);
CREATE INDEX idx_evidence_packs_type ON evidence_packs(type);
CREATE INDEX idx_evidence_packs_created ON evidence_packs(created_at DESC);

-- Verify results table (analytics ingestion)
CREATE TABLE IF NOT EXISTS verify_results (
  id UUID PRIMARY KEY,
  asset_hash VARCHAR(64) NOT NULL,
  route VARCHAR(255),
  provider VARCHAR(255),
  result VARCHAR(10) NOT NULL CHECK (result IN ('pass', 'fail')),
  manifest_discovery VARCHAR(20) NOT NULL CHECK (manifest_discovery IN ('embedded', 'link')),
  timestamp TIMESTAMP NOT NULL,
  source VARCHAR(50) NOT NULL,
  raw_data JSONB,
  ingested_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_verify_results_asset ON verify_results(asset_hash);
CREATE INDEX idx_verify_results_provider ON verify_results(provider);
CREATE INDEX idx_verify_results_result ON verify_results(result);
CREATE INDEX idx_verify_results_timestamp ON verify_results(timestamp DESC);
CREATE INDEX idx_verify_results_manifest ON verify_results(manifest_discovery);

-- Compliance packs table
CREATE TABLE IF NOT EXISTS compliance_packs (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  period VARCHAR(7) NOT NULL,
  regions VARCHAR(255) NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_compliance_packs_tenant ON compliance_packs(tenant_id);
CREATE INDEX idx_compliance_packs_period ON compliance_packs(period);
CREATE INDEX idx_compliance_packs_created ON compliance_packs(created_at DESC);

-- SKU tracking table
CREATE TABLE IF NOT EXISTS sku_usage (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  sku_type VARCHAR(50) NOT NULL CHECK (sku_type IN ('custody', 'analytics-only', 'base')),
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  mrr DECIMAL(10, 2)
);

CREATE INDEX idx_sku_usage_tenant ON sku_usage(tenant_id);
CREATE INDEX idx_sku_usage_type ON sku_usage(sku_type);
CREATE INDEX idx_sku_usage_started ON sku_usage(started_at DESC);
