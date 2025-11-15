# CLI Utilities

Command-line utilities for the CredLink Sign Service.

## Available Scripts

### 1. Bulk Sign (`bulk-sign.ts`)

Sign multiple images in a directory recursively.

**Usage:**
```bash
ts-node scripts/bulk-sign.ts <input-dir> <output-dir> [options]
```

**Options:**
- `--creator <name>` - Creator name for all images
- `--title-prefix <text>` - Prefix for image titles
- `--concurrency <n>` - Number of concurrent operations (default: 5)

**Example:**
```bash
# Sign all images in ./images directory
ts-node scripts/bulk-sign.ts ./images ./signed-images --creator "John Doe" --concurrency 10

# Sign with title prefix
ts-node scripts/bulk-sign.ts ./photos ./signed --title-prefix "Wedding 2025"
```

**Features:**
- Recursively processes all image files (.jpg, .jpeg, .png, .webp)
- Maintains directory structure in output
- Concurrent processing for speed
- Progress tracking
- Success/failure reporting

---

### 2. Validate Config (`validate-config.ts`)

Validate environment configuration before deployment.

**Usage:**
```bash
ts-node scripts/validate-config.ts [--env <file>]
```

**Options:**
- `--env <file>` - Path to .env file to validate (optional)

**Example:**
```bash
# Validate current environment
ts-node scripts/validate-config.ts

# Validate specific .env file
ts-node scripts/validate-config.ts --env .env.production

# Use in CI/CD
ts-node scripts/validate-config.ts && npm run deploy
```

**Checks:**
- Required environment variables
- Production-specific requirements
- Value format validation (ports, file sizes, etc.)
- API key format
- S3 configuration
- Sentry configuration
- Certificate file existence

**Exit Codes:**
- `0` - Configuration valid
- `1` - Configuration invalid

---

### 3. Generate Certificate (`generate-cert.ts`)

Generate self-signed certificates for development.

**Usage:**
```bash
ts-node scripts/generate-cert.ts [options]
```

**Options:**
- `--output-dir <dir>` - Output directory (default: ./certs)
- `--common-name <name>` - Common Name (default: CredLink Signing Service)
- `--organization <org>` - Organization (default: CredLink)
- `--country <code>` - Country code (default: US)
- `--valid-days <days>` - Validity period (default: 365)

**Example:**
```bash
# Generate with defaults
ts-node scripts/generate-cert.ts

# Custom organization
ts-node scripts/generate-cert.ts --organization "My Company" --country "GB"

# Longer validity
ts-node scripts/generate-cert.ts --valid-days 730

# Custom output directory
ts-node scripts/generate-cert.ts --output-dir /etc/credlink/certs
```

**Files Generated:**
- `signing-key.pem` - Private key (RSA 2048-bit)
- `signing-cert.pem` - Self-signed certificate
- `signing.csr` - Certificate Signing Request

**⚠️ Warning:** Only use for development! Production requires CA-signed certificates.

---

### 4. Migrate Storage (`migrate-storage.ts`)

Migrate proofs between storage backends.

**Usage:**
```bash
ts-node scripts/migrate-storage.ts <source> <destination> [options]
```

**Sources/Destinations:**
- `memory` - In-memory storage
- `filesystem` - Local filesystem
- `s3` - AWS S3

**Example:**
```bash
# Migrate from filesystem to S3
ts-node scripts/migrate-storage.ts filesystem s3

# Migrate from memory to filesystem
ts-node scripts/migrate-storage.ts memory filesystem
```

---

### 5. Create Test Fixtures (`create-test-fixtures.ts`)

Generate test images for development and testing.

**Usage:**
```bash
ts-node scripts/create-test-fixtures.ts
```

**Generates:**
- Various image formats (JPEG, PNG, WebP)
- Different sizes and dimensions
- Edge cases for testing

---

### 6. Run Survival Tests (`run-survival-tests.ts`)

Run metadata survival tests across transformations.

**Usage:**
```bash
ts-node scripts/run-survival-tests.ts [options]
```

**Tests:**
- Resize operations
- Quality compression
- Format conversion
- Crop and rotate
- CDN transformations

---

## Requirements

All scripts require:
- Node.js >= 20.0.0
- ts-node installed globally or via npx
- Proper environment configuration

## CI/CD Integration

### Pre-deployment validation
```bash
# In your CI/CD pipeline
ts-node scripts/validate-config.ts --env .env.production || exit 1
```

### Bulk processing in CI
```bash
# Process all staging images
ts-node scripts/bulk-sign.ts ./staging ./production --concurrency 20
```

## Troubleshooting

### Script won't execute
```bash
# Make scripts executable
chmod +x scripts/*.ts

# Or use ts-node explicitly
npx ts-node scripts/bulk-sign.ts
```

### Import errors
```bash
# Ensure dependencies are installed
npm install

# Check TypeScript compilation
npm run build
```

### Permission denied (certificates)
```bash
# Ensure proper permissions
chmod 600 certs/signing-key.pem
chmod 644 certs/signing-cert.pem
```

## Development

To add a new script:

1. Create `scripts/my-script.ts`
2. Add shebang: `#!/usr/bin/env ts-node`
3. Make executable: `chmod +x scripts/my-script.ts`
4. Document in this README
5. Test thoroughly

## Support

For issues or feature requests, open an issue on GitHub or contact support@credlink.com.
