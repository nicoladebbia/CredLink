-- Phase 19: Marketplace Connectors - Provider Schema
-- Read-only adapters for Getty, AP, Shutterstock with license mapping

-- Provider assets table - stores metadata and references only
CREATE TABLE IF NOT EXISTS provider_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('getty', 'ap', 'shutterstock', 'reuters')),
  provider_asset_id VARCHAR(255) NOT NULL,
  asset_url TEXT CHECK (asset_url ~ '^https://.*'), -- Only if provider allows hotlinking, HTTPS only
  asset_kind VARCHAR(20) DEFAULT 'image' CHECK (asset_kind IN ('image', 'video', 'audio')),
  title TEXT,
  caption TEXT,
  credit TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB, -- Raw provider metadata
  etag VARCHAR(255), -- For incremental sync
  UNIQUE(tenant_id, provider, provider_asset_id),
  CONSTRAINT provider_assets_tenant_provider_asset_not_null CHECK (tenant_id IS NOT NULL AND provider IS NOT NULL AND provider_asset_id IS NOT NULL)
);

-- Provider licenses table - license information and rights
CREATE TABLE IF NOT EXISTS provider_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('getty', 'ap', 'shutterstock', 'reuters')),
  provider_asset_id VARCHAR(255) NOT NULL,
  license_id VARCHAR(255) NOT NULL,
  license_type VARCHAR(20) CHECK (license_type IN ('editorial', 'creative', 'other')),
  license_url TEXT CHECK (license_url ~ '^https://.*'), -- HTTPS only for license URLs
  licensor_name VARCHAR(255),
  usage_terms TEXT,
  restrictions TEXT[], -- Array of restriction strings
  download_allowed BOOLEAN DEFAULT false,
  embed_allowed BOOLEAN DEFAULT false,
  commercial_use_allowed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, provider, provider_asset_id),
  CONSTRAINT provider_licenses_tenant_provider_asset_not_null CHECK (tenant_id IS NOT NULL AND provider IS NOT NULL AND provider_asset_id IS NOT NULL)
);

-- Rights window table - temporal license boundaries
CREATE TABLE IF NOT EXISTS rights_window (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('getty', 'ap', 'shutterstock', 'reuters')),
  provider_asset_id VARCHAR(255) NOT NULL,
  rights_from TIMESTAMP WITH TIME ZONE,
  rights_to TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, provider, provider_asset_id),
  CONSTRAINT rights_window_valid_period CHECK (rights_to IS NULL OR rights_from IS NULL OR rights_to > rights_from),
  CONSTRAINT rights_window_tenant_provider_asset_not_null CHECK (tenant_id IS NOT NULL AND provider IS NOT NULL AND provider_asset_id IS NOT NULL)
);

-- Releases table - model and property release information
CREATE TABLE IF NOT EXISTS releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('getty', 'ap', 'shutterstock', 'reuters')),
  provider_asset_id VARCHAR(255) NOT NULL,
  model_release_status VARCHAR(30) CHECK (model_release_status IN ('MR-NOT-APPLICABLE', 'MR-NONE', 'MR-APPLIED', 'MR-REQUIRED')),
  property_release_status VARCHAR(30) CHECK (property_release_status IN ('PR-NOT-APPLICABLE', 'PR-NONE', 'PR-APPLIED', 'PR-REQUIRED')),
  release_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, provider, provider_asset_id),
  CONSTRAINT releases_tenant_provider_asset_not_null CHECK (tenant_id IS NOT NULL AND provider IS NOT NULL AND provider_asset_id IS NOT NULL)
);

-- Sync state table - track cursors and ETags for incremental sync
CREATE TABLE IF NOT EXISTS provider_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('getty', 'ap', 'shutterstock', 'reuters')),
  cursor TEXT, -- Provider-specific cursor for pagination
  etag VARCHAR(255), -- ETag for conditional requests
  last_sync_at TIMESTAMP WITH TIME ZONE,
  sync_status VARCHAR(20) DEFAULT 'pending' CHECK (sync_status IN ('pending', 'running', 'completed', 'failed')),
  error_message TEXT,
  retry_after TIMESTAMP WITH TIME ZONE CHECK (retry_after IS NULL OR retry_after >= NOW()),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, provider),
  CONSTRAINT provider_sync_state_tenant_provider_not_null CHECK (tenant_id IS NOT NULL AND provider IS NOT NULL)
);

-- Indexes for performance and security
CREATE INDEX IF NOT EXISTS idx_provider_assets_tenant_provider ON provider_assets(tenant_id, provider);
CREATE INDEX IF NOT EXISTS provider_assets_provider_asset_id_idx ON provider_assets(provider, provider_asset_id);
CREATE INDEX IF NOT EXISTS provider_assets_created_at_idx ON provider_assets(created_at);
CREATE INDEX IF NOT EXISTS idx_provider_licenses_tenant_provider ON provider_licenses(tenant_id, provider);
CREATE INDEX IF NOT EXISTS idx_provider_licenses_license_type_idx ON provider_licenses(license_type);
CREATE INDEX IF NOT EXISTS idx_rights_window_tenant_provider ON rights_window(tenant_id, provider);
CREATE INDEX IF NOT EXISTS idx_rights_window_active_period ON rights_window(rights_from, rights_to) WHERE rights_from IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_releases_tenant_provider ON releases(tenant_id, provider);
CREATE INDEX IF NOT EXISTS idx_releases_model_status ON releases(model_release_status);
CREATE INDEX IF NOT EXISTS idx_provider_sync_state_tenant_provider ON provider_sync_state(tenant_id, provider);
CREATE INDEX IF NOT EXISTS idx_provider_sync_state_status ON provider_sync_state(sync_status);

-- RLS policies for tenant isolation
ALTER TABLE provider_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE rights_window ENABLE ROW LEVEL SECURITY;
ALTER TABLE releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_sync_state ENABLE ROW LEVEL SECURITY;

-- RLS policies - strict tenant isolation
CREATE POLICY provider_assets_tenant_policy ON provider_assets
  FOR ALL TO authenticated_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY provider_licenses_tenant_policy ON provider_licenses
  FOR ALL TO authenticated_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY rights_window_tenant_policy ON rights_window
  FOR ALL TO authenticated_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY releases_tenant_policy ON releases
  FOR ALL TO authenticated_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY provider_sync_state_tenant_policy ON provider_sync_state
  FOR ALL TO authenticated_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Audit trigger for provider tables
CREATE TRIGGER provider_assets_audit
  AFTER INSERT OR UPDATE OR DELETE ON provider_assets
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER provider_licenses_audit
  AFTER INSERT OR UPDATE OR DELETE ON provider_licenses
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER rights_window_audit
  AFTER INSERT OR UPDATE OR DELETE ON rights_window
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER releases_audit
  AFTER INSERT OR UPDATE OR DELETE ON releases
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER provider_sync_state_audit
  AFTER INSERT OR UPDATE OR DELETE ON provider_sync_state
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- Updated timestamp triggers
CREATE TRIGGER provider_assets_updated_at
  BEFORE UPDATE ON provider_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER provider_licenses_updated_at
  BEFORE UPDATE ON provider_licenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER rights_window_updated_at
  BEFORE UPDATE ON rights_window
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER releases_updated_at
  BEFORE UPDATE ON releases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER provider_sync_state_updated_at
  BEFORE UPDATE ON provider_sync_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
