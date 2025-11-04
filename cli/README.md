# C2 Concierge CLI

Operator-grade power tools for cryptographic provenance verification, signing, and compliance.

## Overview

The C2 Concierge CLI provides a comprehensive command-line interface for:
- **Signing** files and directories with optional TSA timestamps
- **Verification** of assets with page crawling and batch processing
- **Inspection** of manifests and claims
- **Diffing** assets to highlight changes
- **Batch operations** with resumable checkpoints
- **Compliance Pack** generation for WORM storage
- **Cloud storage** support (S3/R2) as first-class citizens

## Installation

### Pre-built Binaries

Download the appropriate binary for your platform from the [releases page](https://github.com/c2concierge/cli/releases).

- Linux x86_64: `c2c-linux-amd64`
- Windows x64: `c2c-windows-amd64.exe`
- macOS Universal: `c2c-darwin-universal`

### Build from Source

```bash
git clone https://github.com/c2concierge/cli.git
cd cli
make build-all
```

## Quick Start

```bash
# Verify a single asset
c2c verify image.jpg

# Sign a folder with TSA timestamps
c2c sign ./images --tsa --concurrency 8

# Verify a web page and all assets
c2c verify https://example.com/article --page --json

# Batch verify from a feed
c2c batch verify --feed assets.jsonl --resume

# Generate a compliance pack
c2c pack --input s3://bucket/campaign/ --out campaign-pack.tar.gz
```

## Commands

### Global Options

These flags are available on all commands:

- `--json`: Output JSON format (machine-readable)
- `--quiet`: Suppress non-error output
- `--yes`: Auto-confirm prompts
- `--profile`: Signing profile ID
- `--endpoint`: API endpoint URL
- `--retries`: Maximum retry attempts (default: 5)
- `--timeout`: Request timeout (default: 30s)
- `--idempotency-key`: Idempotency key for safe retries
- `--dry-run`: Show what would be done without executing

### Sign

Sign files, directories, or cloud prefixes.

```bash
c2c sign <path> [options]
```

**Options:**
- `--tsa`: Enable RFC-3161 TSA timestamps
- `--recursive`: Process subdirectories (default: true)
- `--concurrency`: Parallel upload concurrency (default: 4)
- `--resume`: Resume interrupted operation
- `--inject`: Inject Link headers in HTML (default: true)
- `--patterns`: File patterns to include
- `--min-bytes`: Minimum file size
- `--max-bytes`: Maximum file size
- `--type`: Filter by type: image|video|audio

**Examples:**
```bash
# Sign local folder
c2c sign ./images --tsa --profile newsroom

# Sign cloud prefix with high concurrency
c2c sign s3://bucket/assets/ --concurrency 12 --resume

# Dry run with cost projection
c2c sign ./photos --dry-run --json
```

### Verify

Verify single or multiple assets.

```bash
c2c verify <path|url> [options]
```

**Options:**
- `--page`: Crawl a web page for assets
- `--stream`: Output streaming NDJSON
- `--threshold`: Survival threshold (e.g., survival>=0.999)
- `--follow-links`: Follow links on page crawl
- `--max-depth`: Maximum depth for page crawl (default: 2)
- `--prefix`: Verify all objects with prefix
- `--delimiter`: Delimiter for prefix listing

**Examples:**
```bash
# Verify single asset
c2c verify image.jpg

# Verify web page and assets
c2c verify https://news.example/article --page --json

# Verify cloud prefix
c2c verify s3://bucket/photos/ --prefix --threshold survival>=0.95

# Stream verification results
c2c verify r2://account/bucket/assets/ --stream > results.ndjson
```

### Inspect

Display manifest information and claims.

```bash
c2c inspect <asset> [options]
```

**Options:**
- `--detail`: Show detailed manifest JSON
- `--remote`: Fetch remote manifest if available
- `--format`: Output format: json|yaml|table
- `--claims`: Show all claims in detail
- `--cert`: Show certificate chain details

**Examples:**
```bash
# Show summary
c2c inspect image.jpg

# Detailed manifest
c2c inspect s3://bucket/asset.jpg --detail

# Table format
c2c inspect asset.jpg --format table

# Include certificates
c2c inspect asset.jpg --cert --detail
```

### Diff

Compare two assets or manifests.

```bash
c2c diff <assetA> <assetB|manifest> [options]
```

**Options:**
- `--claims`: Show claim differences (default: true)
- `--certs`: Show certificate differences
- `--provenance`: Show provenance differences (default: true)
- `--context`: Context lines for differences (default: 3)

**Examples:**
```bash
# Compare two assets
c2c diff image1.jpg image2.jpg

# Compare with manifest
c2c diff asset.jpg manifest.json

# Show all differences
c2c diff asset1.jpg asset2.jpg --certs --context 5
```

### Batch

Execute batch operations from feed files.

```bash
c2c batch <command> [options]
```

**Subcommands:**
- `verify`: Batch verify from feed
- `sign`: Batch sign from feed

**Options:**
- `--feed`: Feed file path (CSV or JSONL)
- `--from`: Feed file from cloud storage
- `--resume`: Resume interrupted operation
- `--concurrency`: Parallel processing limit (default: 4)
- `--halt-on`: Halt on error type: continue|VerifyFail|SrvErr
- `--state-file`: State file for checkpointing
- `--output`: Output file for results

**Examples:**
```bash
# Batch verify from local file
c2c batch verify --feed assets.jsonl --resume

# Batch verify from cloud storage
c2c batch verify --from s3://bucket/feeds/today.jsonl --json

# Batch sign with custom state file
c2c batch sign --feed photos.csv --state-file photos.state
```

### Pack

Create Compliance Packs for WORM storage.

```bash
c2c pack --input <glob|prefix> [options]
```

**Options:**
- `--input`: Input glob or cloud prefix (required)
- `--out`: Output file (default: auto-generated)
- `--format`: Output format: tar.gz|tar.zst|zip
- `--include`: Additional files to include
- `--exclude`: Patterns to exclude
- `--manifest`: Include detailed manifests (default: true)
- `--verbose`: Verbose output

**Examples:**
```bash
# Pack local folder
c2c pack --input "./photos/*.jpg" --out photos-pack.tar.gz

# Pack cloud prefix
c2c pack --input s3://bucket/campaign/ --format tar.zst

# Dry run with estimates
c2c pack --input r2://acct/bkt/assets/ --dry-run
```

### Cache

Manage local cache for manifests and verification responses.

```bash
c2c cache <command> [options]
```

**Subcommands:**
- `ls`: List cache contents
- `prune`: Prune old cache entries
- `clear`: Clear all cache entries
- `stats`: Show cache statistics

**Examples:**
```bash
# Show cache statistics
c2c cache stats

# List cache contents
c2c cache ls --json

# Prune entries older than 7 days
c2c cache prune --max-age 168h

# Clear all cache
c2c cache clear
```

### Ls

List files and directories for local and cloud paths.

```bash
c2c ls <path> [options]
```

**Options:**
- `-l, --long`: Long listing format
- `-h, --human`: Human-readable sizes (default: true)
- `-R, --recursive`: List subdirectories recursively
- `-a, --all`: Show hidden files
- `--delimiter`: Delimiter for cloud paths
- `--prefix`: Filter by prefix
- `--filter`: Filter pattern (glob)
- `--sort`: Sort by: name|size|modified

**Examples:**
```bash
# List local directory
c2c ls ./photos/

# List cloud prefix
c2c ls s3://bucket/photos/ --long

# Recursive listing with filter
c2c ls ./assets/ --recursive --filter "*.jpg"

# Sort by size
c2c ls s3://bucket/ --sort size --human
```

### Doctor

Perform environment diagnostics.

```bash
c2c doctor [options]
```

**Options:**
- `-v, --verbose`: Verbose output
- `--fix`: Attempt to fix issues automatically
- `--all`: Run all checks (default: true)
- `--network`: Check network connectivity only
- `--paths`: Check path handling only
- `--encoding`: Check encoding support only
- `--cert`: Check certificates only

**Examples:**
```bash
# Run all checks
c2c doctor

# Verbose with auto-fix
c2c doctor --verbose --fix

# Check only network
c2c doctor --network

# JSON output
c2c doctor --json
```

## Exit Codes

The CLI uses predictable exit codes for automation:

- `0`: Success
- `2`: Verification failed
- `3`: Partial failure
- `4`: Input error
- `5`: Authentication error
- `6`: Rate limit exceeded
- `7`: Network error
- `8`: Server error

## Cloud Storage Support

The CLI supports S3-compatible storage as first-class citizens:

### S3 URLs
```
s3://bucket/key
s3://bucket/prefix/
```

### R2 URLs
```
r2://account/bucket/key
r2://account/bucket/prefix/
```

### Cloud Features
- **Multipart uploads** for large files with parallel parts
- **Prefix listing** with delimiter support for pseudo-directories
- **Resume support** for interrupted operations
- **Cost projection** in dry-run mode

## Feed Formats

Batch operations support CSV and JSONL feed formats:

### CSV Format
```csv
url,options
https://example.com/image1.jpg,{"threshold":"survival>=0.95"}
s3://bucket/asset2.png,
```

### JSONL Format
```json
{"url": "https://example.com/image1.jpg", "options": {"threshold": "survival>=0.95"}}
{"url": "s3://bucket/asset2.png"}
{"url": "./local/file.jpg"}
```

## Configuration

The CLI follows standard configuration patterns:

### Environment Variables
- `C2C_API_KEY`: API authentication key
- `C2C_ENDPOINT`: API endpoint URL
- `C2C_PROFILE`: Default signing profile
- `AWS_ACCESS_KEY_ID`: AWS credentials for S3
- `AWS_SECRET_ACCESS_KEY`: AWS credentials for S3
- `AWS_REGION`: AWS region for S3

### Cache Location
- **Linux**: `$XDG_CACHE_HOME/c2concierge` or `~/.cache/c2concierge`
- **macOS**: `~/Library/Caches/C2Concierge`
- **Windows**: `%LOCALAPPDATA%\\C2Concierge\\Cache`

## Examples

### Retro-sign with TSA
```bash
c2c sign ./images --tsa --profile newsroom-default --resume --concurrency 8
```

### CI/CD Verification
```bash
c2c verify --page https://news.example/post/42 --json \
  --threshold survival>=0.999 --timeout 10s
```

### Batch from Cloud Storage
```bash
c2c batch verify --from r2://acct/bkt/feeds/today.jsonl --resume --json
```

### Asset Comparison
```bash
c2c inspect s3://bucket/a.jpg --detail > a.manifest.json
c2c inspect s3://bucket/a_1200.webp --detail > b.manifest.json
c2c diff a.manifest.json b.manifest.json
```

### Cost Projection
```bash
c2c verify r2://acct/bkt/catalog/2025/ --prefix --dry-run --json
```

### Compliance Pack
```bash
c2c pack --input r2://acct/bkt/campaign-14/ --out campaign-14-pack.tar.zst
```

## Troubleshooting

### Windows Long Paths
If you encounter path length issues on Windows:
```bash
c2c doctor --paths --fix
```

### Network Issues
Check connectivity and proxy settings:
```bash
c2c doctor --network --verbose
```

### Cache Issues
Clear or inspect cache:
```bash
c2c cache stats
c2c cache clear
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
