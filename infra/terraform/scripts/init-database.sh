#!/bin/bash
# Initialize CredLink Database
# Run this after RDS is created to set up the schema

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Check prerequisites
if ! command -v psql &> /dev/null; then
    print_error "PostgreSQL client (psql) is not installed"
    echo "Install it with: brew install postgresql"
    exit 1
fi

# Get database credentials from Secrets Manager
print_info "Fetching database credentials from Secrets Manager..."

SECRET_NAME=$(terraform output -raw secrets_manager_name)
SECRET=$(aws secretsmanager get-secret-value --secret-id "$SECRET_NAME" --query SecretString --output text)

DB_HOST=$(echo "$SECRET" | jq -r '.host')
DB_PORT=$(echo "$SECRET" | jq -r '.port')
DB_NAME=$(echo "$SECRET" | jq -r '.dbname')
DB_USER=$(echo "$SECRET" | jq -r '.username')
DB_PASS=$(echo "$SECRET" | jq -r '.password')

print_success "Database credentials retrieved"

# Export password for psql
export PGPASSWORD="$DB_PASS"

# Test connection
print_info "Testing database connection..."
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT version();" > /dev/null 2>&1; then
    print_error "Cannot connect to database"
    print_info "Make sure the database security group allows connections from your IP"
    exit 1
fi

print_success "Database connection successful"

# Create schema
print_info "Creating database schema..."

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << 'EOF'

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS credlink;

-- Set search path
SET search_path TO credlink, public;

-- Proofs table
CREATE TABLE IF NOT EXISTS proofs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proof_uri TEXT NOT NULL UNIQUE,
    manifest_hash TEXT NOT NULL,
    image_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    accessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    access_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_proofs_manifest_hash ON proofs(manifest_hash);
CREATE INDEX IF NOT EXISTS idx_proofs_image_hash ON proofs(image_hash);
CREATE INDEX IF NOT EXISTS idx_proofs_created_at ON proofs(created_at DESC);

-- Signing operations table
CREATE TABLE IF NOT EXISTS signing_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proof_id UUID REFERENCES proofs(id) ON DELETE CASCADE,
    issuer TEXT,
    software_agent TEXT,
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Verification operations table
CREATE TABLE IF NOT EXISTS verification_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proof_id UUID REFERENCES proofs(id) ON DELETE SET NULL,
    valid BOOLEAN NOT NULL,
    confidence DECIMAL(5,2),
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    details JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for operations
CREATE INDEX IF NOT EXISTS idx_signing_ops_proof_id ON signing_operations(proof_id);
CREATE INDEX IF NOT EXISTS idx_signing_ops_created_at ON signing_operations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_ops_proof_id ON verification_operations(proof_id);
CREATE INDEX IF NOT EXISTS idx_verification_ops_created_at ON verification_operations(created_at DESC);

-- Statistics view
CREATE OR REPLACE VIEW proof_statistics AS
SELECT 
    COUNT(*) as total_proofs,
    COUNT(DISTINCT image_hash) as unique_images,
    MAX(created_at) as last_proof_created,
    SUM(access_count) as total_accesses,
    AVG(access_count) as avg_accesses_per_proof
FROM proofs;

-- Function to update accessed_at
CREATE OR REPLACE FUNCTION update_proof_access()
RETURNS TRIGGER AS $$
BEGIN
    NEW.accessed_at = CURRENT_TIMESTAMP;
    NEW.access_count = OLD.access_count + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic access tracking
DROP TRIGGER IF EXISTS trigger_update_proof_access ON proofs;
CREATE TRIGGER trigger_update_proof_access
    BEFORE UPDATE ON proofs
    FOR EACH ROW
    WHEN (OLD.* IS DISTINCT FROM NEW.*)
    EXECUTE FUNCTION update_proof_access();

-- Grant permissions (adjust as needed)
GRANT USAGE ON SCHEMA credlink TO PUBLIC;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA credlink TO PUBLIC;
GRANT SELECT ON proof_statistics TO PUBLIC;

EOF

if [ $? -eq 0 ]; then
    print_success "Database schema created successfully"
else
    print_error "Failed to create database schema"
    exit 1
fi

# Verify tables
print_info "Verifying tables..."
TABLES=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='credlink';")

if [ "$TABLES" -ge 3 ]; then
    print_success "All tables created ($TABLES tables found)"
else
    print_error "Some tables may be missing"
fi

# Insert test data (optional)
read -p "Insert test data? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Inserting test data..."
    
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << 'EOF'
    SET search_path TO credlink, public;
    
    INSERT INTO proofs (proof_uri, manifest_hash, image_hash, metadata) 
    VALUES 
        ('https://proofs.credlink.com/test-1', 'hash1', 'imghash1', '{"test": true}'::jsonb),
        ('https://proofs.credlink.com/test-2', 'hash2', 'imghash2', '{"test": true}'::jsonb)
    ON CONFLICT (proof_uri) DO NOTHING;
EOF
    
    print_success "Test data inserted"
fi

# Show summary
print_success "Database initialization complete!"
echo ""
echo "Database Details:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  Schema: credlink"
echo ""
echo "Tables created:"
echo "  - proofs"
echo "  - signing_operations"
echo "  - verification_operations"
echo ""
echo "To connect manually:"
echo "  psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"
echo ""
print_info "Remember to update your application's DATABASE_URL environment variable"

# Unset password
unset PGPASSWORD
