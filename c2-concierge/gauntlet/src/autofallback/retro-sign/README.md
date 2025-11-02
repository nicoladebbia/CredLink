# C2 Concierge Retro-Sign CLI - Phase 8

High-performance, deterministic retro-signing system for C2PA manifests at scale.

## 🚀 Quick Start

```bash
# Build
cargo build --release

# Inventory collection
./target/release/c2c inventory --tenant acme --origin s3 --bucket acme-prod --prefix uploads/

# Planning and cost estimation
./target/release/c2c plan --tenant acme --input inventory.jsonl --dry-run

# Execute retro-signing
./target/release/c2c run --tenant acme --input plan.jsonl --concurrency 256

# Resume from checkpoint
./target/release/c2c resume --checkpoint .state/c2c-checkpoint.sqlite
```

## 📋 Features

### Core Capabilities
- **Deterministic Processing**: Same bytes ⇒ same claim hash ⇒ same manifest
- **At-Least-Once Semantics**: Crash anywhere ⇒ resume without duplicates
- **Cost Ledger**: Per-tenant estimates with ±5% accuracy guarantee
- **Performance Target**: ≥50 assets/s on modest instances
- **Idempotent Writes**: PUT-if-absent prevents duplicate manifests

### Architecture
- **CLI-First**: Single binary with subcommands for all operations
- **SQLite Checkpoints**: Crash-safe state management
- **Batch Processing**: Configurable concurrency and backpressure
- **Real-time Metrics**: Prometheus-compatible monitoring
- **HTML/CSV Reports**: Customer-facing deliverables

## 🛠️ Installation

### Prerequisites
- Rust 1.70+
- AWS credentials (for S3/R2)
- SQLite 3.x

### Build from Source
```bash
git clone <repository>
cd retro-sign
cargo build --release
```

### Configuration
Set environment variables or use config file:

```bash
export C2C_TENANT_ID="your-tenant"
export C2C_BUCKET="your-bucket"
export C2C_REGION="us-east-1"
export C2C_SIGNER_URL="http://localhost:8080"
export C2C_STORE_URL="http://localhost:8081"
```

## 📖 Usage

### 1. Inventory Collection
Discover and catalog assets for processing:

```bash
# S3/R3 bucket
c2c inventory \
  --tenant acme \
  --origin s3 \
  --bucket acme-prod \
  --prefix uploads/ \
  --prefix media/ \
  --output inventory.jsonl

# Filesystem
c2c inventory \
  --tenant acme \
  --origin file \
  --prefix /data/uploads/ \
  --output inventory.jsonl
```

### 2. Planning & Cost Estimation
Generate execution plan and cost estimates:

```bash
# Dry run with cost calculation
c2c plan \
  --tenant acme \
  --input inventory.jsonl \
  --dry-run \
  --plan-out plan.jsonl \
  --ledger-out ledger.json \
  --report-out report/

# Stratified sampling for "first 10k free"
c2c sample \
  --tenant acme \
  --origin s3 \
  --bucket acme-prod \
  --sample 10000 \
  --stratify mime,size,prefix,date
```

### 3. Execution
Run the retro-signing process:

```bash
# Full execution
c2c run \
  --tenant acme \
  --input plan.jsonl \
  --checkpoint .state/c2c.sqlite \
  --concurrency 256 \
  --max-inflight 4096 \
  --verify-after

# Resume from checkpoint
c2c resume \
  --checkpoint .state/c2c.sqlite \
  --verify-after
```

### 4. Verification
Test survival rates on delivery paths:

```bash
c2c verify \
  --input ledger.json \
  --sample 1000 \
  --verify-url http://localhost:8080 \
  --report-out verify-report/
```

### 5. Reporting
Generate customer-facing reports:

```bash
c2c report \
  --input ledger.json \
  --output report/ \
  --format all
```

## 📊 Data Models

### Inventory Record
```json
{
  "key": "uploads/2024/10/pic.jpg",
  "etag": "\"a1b2c3d4\"",
  "size": 382114,
  "last_modified": "2024-10-11T12:31:05Z",
  "storage_class": "STANDARD",
  "mime": "image/jpeg"
}
```

### Plan Item
```json
{
  "content_sha256": "sha256:abc123...",
  "objects": [
    {
      "key": "uploads/pic.jpg",
      "size": 382114,
      "last_modified": "2024-10-11T12:31:05Z",
      "mime": "image/jpeg"
    }
  ],
  "mode": "remote",
  "preserve_embed": false,
  "estimated_size": 382114
}
```

### Cost Ledger
```json
{
  "tenant_id": "acme",
  "ts": "2025-10-31T12:00:00Z",
  "objects_total": 1000000,
  "objects_unique": 845233,
  "bytes_total": 412345678901,
  "est_runtime_sec": 7200,
  "est_cost": {
    "tsa_usd": 8.45,
    "egress_usd": 8.00,
    "cpu_usd": 2.50,
    "storage_usd": 1.20,
    "total_usd": 20.15
  }
}
```

## 🔧 Configuration

### Global Flags
- `--tenant <ID>`: Required tenant identifier
- `--origin <s3|r2|file>`: Source storage type
- `--bucket <NAME>`: S3/R2 bucket name
- `--concurrency <N>`: Connection pool size (default: 256)
- `--max-inflight <N>`: Maximum concurrent operations (default: 4096)

### Performance Tuning
- `--timeout <MS>`: Per-object timeout (default: 12000)
- `--retries <N>`: Retry attempts with backoff (default: 6)
- `--tsa-profile <NAME>`: TSA profile (std, low-latency, cheap)

### Cost Configuration
- `--egress-cost <$/GB>`: Egress pricing for estimates
- `--tsa-cost <$/timestamp>`: TSA pricing
- `--cpu-cost <$/hr>`: Compute pricing
- `--storage-cost <$/GB-mo>`: Storage pricing

## 📈 Performance

### Benchmarks
- **Target Throughput**: 50+ assets/second
- **Memory Usage**: <2GB for 1M objects
- **Checkpoint Overhead**: <1% runtime impact
- **Resume Time**: <30 seconds for any size

### Sizing Guide
| Objects | Runtime | Memory | Network |
|---------|---------|--------|---------|
| 100K    | 30 min  | 512 MB | 25 Mbps |
| 1M      | 5 hours | 2 GB   | 200 Mbps |
| 10M     | 2 days  | 8 GB   | 500 Mbps |

## 🔍 Monitoring

### Metrics
```bash
# Prometheus metrics
curl http://localhost:9090/metrics

# Key metrics
c2c_objects_processed_total
c2c_assets_per_second
c2c_sign_duration_seconds
c2c_bytes_processed_total
```

### Logs
```bash
# Structured logging
export RUST_LOG=info
c2c run --tenant acme --input plan.jsonl

# Log to file
c2c run --tenant acme --input plan.jsonl --log-file /var/log/c2c.log
```

## 🧪 Testing

### Unit Tests
```bash
cargo test
```

### Integration Tests
```bash
cargo test --test integration
```

### Performance Tests
```bash
cargo bench
```

## 🚨 Error Handling

### Exit Codes
- `0`: Success
- `10`: Partial success (non-fatal errors)
- `20`: Fatal misconfiguration

### Common Errors
- **Authentication**: Check AWS credentials
- **Network**: Verify endpoint connectivity
- **Storage**: Confirm bucket permissions
- **TSA**: Validate TSA service availability

## 📚 Examples

### Million-Object Dry Run
```bash
# Using S3 Inventory (fastest)
c2c inventory \
  --tenant enterprise \
  --origin s3 \
  --bucket enterprise-prod \
  --inventory-csv inventory.csv \
  --output inventory.jsonl

c2c plan \
  --tenant enterprise \
  --input inventory.jsonl \
  --dry-run \
  --plan-out million-plan.jsonl \
  --ledger-out million-ledger.json \
  --report-out million-report/
```

### First 10K Free Sample
```bash
c2c sample \
  --tenant prospect \
  --origin s3 \
  --bucket prospect-prod \
  --sample 10000 \
  --stratify mime,size,prefix,date \
  --plan-out prospect-10k.jsonl

c2c run \
  --tenant prospect \
  --input prospect-10k.jsonl \
  --checkpoint prospect-10k.sqlite \
  --ledger-out prospect-10k-ledger.json \
  --report-out prospect-10k-report/
```

### Production Backfill
```bash
c2c run \
  --tenant production \
  --input production-plan.jsonl \
  --checkpoint .state/production.sqlite \
  --concurrency 512 \
  --max-inflight 8192 \
  --verify-after \
  --report-out production-report/
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

- Documentation: [Link to docs]
- Issues: [GitHub Issues]
- Email: support@credlink.io
