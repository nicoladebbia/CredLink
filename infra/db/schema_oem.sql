-- OEM Bridge schema additions (Phase 15 — OEM Bridge v1)
-- PostgreSQL DDL for OEM trust and asset tracking

BEGIN;

-- Enumerated status types for OEM adoption posture
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'oem_status') THEN
    CREATE TYPE oem_status AS ENUM ('stable', 'pilot', 'unknown');
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS oem_profiles (
  oem_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  status oem_status NOT NULL DEFAULT 'unknown',
  notes_url TEXT,
  revocation_endpoint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (oem_id <> '')
);

CREATE TABLE IF NOT EXISTS oem_pins (
  id BIGSERIAL PRIMARY KEY,
  oem_id TEXT NOT NULL REFERENCES oem_profiles(oem_id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  issuer TEXT NOT NULL,
  fingerprint_sha256 TEXT NOT NULL,
  not_before TIMESTAMPTZ,
  not_after TIMESTAMPTZ,
  revocation_url TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (fingerprint_sha256 ~ '^[A-Fa-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_oem_pins_oem_id ON oem_pins(oem_id);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_oem_pins_fingerprint ON oem_pins(fingerprint_sha256);

CREATE TABLE IF NOT EXISTS oem_assets (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  oem_id TEXT REFERENCES oem_profiles(oem_id),
  claim_hash TEXT NOT NULL,
  capture_time TIMESTAMPTZ,
  device_model TEXT,
  device_serial TEXT,
  oem_key_id TEXT,
  imported_without_in_camera_attestations BOOLEAN NOT NULL DEFAULT FALSE,
  oem_present BOOLEAN NOT NULL DEFAULT FALSE,
  parity_c2patool TEXT,
  parity_cai_verify TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (claim_hash ~ '^[A-Fa-f0-9]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_oem_assets_asset ON oem_assets(tenant_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_oem_assets_claim_hash ON oem_assets(claim_hash);

CREATE TABLE IF NOT EXISTS device_registry (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  oem_id TEXT REFERENCES oem_profiles(oem_id),
  device_model TEXT,
  device_serial TEXT,
  firmware_version TEXT,
  trust_score INTEGER NOT NULL DEFAULT 0,
  last_verified_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  guidance JSONB DEFAULT '{}'::JSONB,
  CHECK (device_id <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_device_registry_device ON device_registry(tenant_id, device_id);

-- Seed known OEM profiles and pins (Leica stable, Nikon pilot)
INSERT INTO oem_profiles (oem_id, display_name, status, notes_url, revocation_endpoint)
VALUES
  ('leica', 'Leica Camera AG', 'stable', 'https://contentauthenticity.org/cameras/leica-m11-p', NULL),
  ('nikon', 'Nikon Corporation', 'pilot', 'https://contentauthenticity.org/cameras/nikon-authenticity-service', NULL)
ON CONFLICT (oem_id) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  status = EXCLUDED.status,
  notes_url = EXCLUDED.notes_url,
  revocation_endpoint = EXCLUDED.revocation_endpoint,
  updated_at = NOW();

-- Known Leica production signer fingerprints sourced from CAI samples
INSERT INTO oem_pins (oem_id, subject, issuer, fingerprint_sha256, not_before, not_after)
VALUES
  ('leica', 'Leica Camera Production Signer 2023', 'Leica Camera AG Root', 'C3371D91FE5F839549A12FA8E3BE0549F6F0F1A7C55F6F5D2F3F7DAB1D0E6F99', '2023-10-01T00:00:00Z', NULL)
ON CONFLICT (fingerprint_sha256) DO UPDATE
SET
  oem_id = EXCLUDED.oem_id,
  subject = EXCLUDED.subject,
  issuer = EXCLUDED.issuer,
  not_before = EXCLUDED.not_before,
  not_after = EXCLUDED.not_after,
  updated_at = NOW();

-- Nikon pilot signer fingerprint placeholder – mark as pilot until GA
INSERT INTO oem_pins (oem_id, subject, issuer, fingerprint_sha256, not_before, not_after, metadata)
VALUES
  ('nikon', 'Nikon Authenticity Service Pilot', 'Nikon Corporation', '9B57E37A8FD4C9F16BC6F32BD97A4F8C8CBEFA9F3A6D71DB91D0972BEEA8D3F1', '2024-06-01T00:00:00Z', NULL, '{"confidence":"pilot","notes":"Update upon GA firmware release"}')
ON CONFLICT (fingerprint_sha256) DO UPDATE
SET
  oem_id = EXCLUDED.oem_id,
  subject = EXCLUDED.subject,
  issuer = EXCLUDED.issuer,
  not_before = EXCLUDED.not_before,
  not_after = EXCLUDED.not_after,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

COMMIT;
