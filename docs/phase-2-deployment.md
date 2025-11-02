# Phase 2: Remote Manifest Store v1 - Deployment Guide

## Overview

Phase 2 implements an immutable, fast, and discoverable remote manifest store with hash-addressed paths, write-once semantics, and comprehensive audit logging.

## Architecture

### Components

1. **Manifest Store Package** (`@c2/manifest-store`)
   - Core storage logic and business rules
   - Write-once semantics enforcement
   - Integrity checking and validation
   - Audit trail management

2. **Cloudflare Worker** (`manifest-store-worker`)
   - HTTP API endpoints
   - Edge caching and performance optimization
   - Request validation and authentication
   - Global distribution

3. **Storage Backend** (R2/S3)
   - Immutable object storage
   - Hash-addressed paths (`/{sha256}.c2pa`)
   - Versioning and lifecycle management

### Key Features

- **Write-Once Semantics**: Prevents manifest overwrites
- **Hash-Addressed Paths**: SHA-256 based object naming
- **Tamper-Evident Audit**: Complete operation logging
- **Signed URLs**: Secure upload mechanism
- **Integrity Checking**: Automatic validation
- **Performance Optimized**: p95 < 150ms from edge

## Deployment Prerequisites

### Required Services

- Cloudflare account (Pro plan or higher)
- R2 bucket (or S3-compatible storage)
- Domain for custom URLs
- TLS certificate (managed by Cloudflare)

### Environment Variables

```bash
# Core Configuration
MANIFEST_BASE_URL=https://manifests.survival.test
BUCKET_NAME=c2-manifests
REGION=auto

# Feature Flags
WRITE_ONCE_ENABLED=true
SIGNED_URL_TTL=3600000
NEGATIVE_CACHE_TTL=300000
MAX_OBJECT_SIZE=104857600

# Security
HMAC_SECRET=your-secret-key-here
```

## Deployment Steps

### 1. Package Setup

```bash
# Install dependencies
pnpm install

# Build packages
pnpm build

# Run tests
pnpm test
```

### 2. R2 Bucket Configuration

```bash
# Create production bucket
wrangler r2 bucket create c2-manifests-production

# Create staging bucket
wrangler r2 bucket create c2-manifests-staging

# Create development bucket
wrangler r2 bucket create c2-manifests-development
```

### 3. Worker Deployment

```bash
# Deploy to development
wrangler deploy --env development

# Deploy to staging
wrangler deploy --env staging

# Deploy to production
wrangler deploy --env production
```

### 4. Domain Configuration

```bash
# Add custom domain for production
wrangler custom-domains add manifests.survival.test

# Add custom domain for staging
wrangler custom-domains add manifests.staging.survival.test
```

### 5. Environment Secrets

```bash
# Set HMAC secret
wrangler secret put HMAC_SECRET

# Set TSA configuration (if using)
wrangler secret put TSA_URL
wrangler secret put TSA_CERTIFICATE
```

## Configuration

### Worker Configuration (`wrangler.toml`)

```toml
name = "c2-manifest-store-worker"
main = "dist/index.js"
compatibility_date = "2023-10-30"

[env.production]
name = "c2-manifest-store-worker"
vars = { 
  ENVIRONMENT = "production",
  MANIFEST_BASE_URL = "https://manifests.survival.test",
  WRITE_ONCE_ENABLED = "true",
  SIGNED_URL_TTL = "3600000",
  NEGATIVE_CACHE_TTL = "300000",
  MAX_OBJECT_SIZE = "104857600"
}

[[env.production.r2_buckets]]
binding = "R2"
bucket_name = "c2-manifests-production"

[env.production.custom_domains]
domain = "manifests.survival.test"
```

### Cache Configuration

- **Immutable Objects**: `public, max-age=31536000, immutable`
- **404 Responses**: `public, max-age=300` (negative caching)
- **API Endpoints**: `no-store` (no caching)
- **Metrics**: `public, max-age=300`

## API Endpoints

### Core Operations

#### Generate Signed URL
```http
POST /signed-url
Content-Type: application/json
X-C2-Signature: <request-signature>

{
  "objectKey": "a1b2c3...64.c2pa",
  "contentType": "application/c2pa",
  "contentLength": 1024,
  "tenantId": "tenant-123",
  "author": "user-456",
  "signature": "tenant-secret"
}
```

#### Upload Manifest
```http
PUT /a1b2c3...64.c2pa
Content-Type: application/c2pa
Content-Length: 1024
Authorization: C2-Signature <upload-signature>
X-C2-Tenant: tenant-123
X-C2-Author: user-456

<manifest-bytes>
```

#### Retrieve Manifest (HEAD)
```http
HEAD /a1b2c3...64.c2pa
```

#### Retrieve Manifest (GET)
```http
GET /a1b2c3...64.c2pa
```

### Management Operations

#### List Objects
```http
GET /list?prefix=a1b2&limit=100&tenantId=tenant-123
```

#### Get Metrics
```http
GET /metrics
```

#### Audit Logs
```http
GET /audit?tenantId=tenant-123&limit=100&operation=create
```

#### Integrity Check
```http
POST /integrity-check
Content-Type: multipart/form-data

file: <manifest-file>
objectKey: a1b2c3...64.c2pa
```

## Performance Optimization

### Edge Caching Strategy

1. **Manifest Objects**: Long-term immutable caching
2. **Metadata**: Short-term caching with validation
3. **API Responses**: No caching for security
4. **Negative Caching**: 5 minutes for 404s

### Performance Targets

- **HEAD/GET Latency**: p95 < 150ms from edge
- **Signed URL Generation**: p95 < 50ms
- **Upload Processing**: p95 < 500ms
- **Listing Operations**: p95 < 200ms

### Monitoring Metrics

```typescript
interface StoreMetrics {
  totalObjects: number;
  totalSize: number;
  objectCountByTenant: Record<string, number>;
  sizeByTenant: Record<string, number>;
  averageObjectSize: number;
  oldestObject: string;
  newestObject: string;
  writeAttempts24h: number;
  writeSuccesses24h: number;
  readRequests24h: number;
  cacheHitRate24h: number;
}
```

## Security Considerations

### Access Control

1. **Signed URLs**: HMAC-based request authentication
2. **Tenant Isolation**: Per-tenant data segregation
3. **Request Validation**: Input sanitization and limits
4. **Audit Logging**: Complete operation tracking

### Data Protection

1. **Write-Once Semantics**: Prevents data tampering
2. **Integrity Checking**: Hash validation on all operations
3. **Secure Headers**: CSP, CORS, and security headers
4. **Rate Limiting**: DDoS protection

### Compliance

1. **Audit Trail**: Tamper-evident operation logs
2. **Data Retention**: Configurable retention policies
3. **Access Logs**: Complete access tracking
4. **Incident Response**: Automated alerts and reporting

## Testing

### Acceptance Tests

```bash
# Run full acceptance test suite
pnpm test:acceptance

# Run performance benchmarks
pnpm test:performance

# Run scalability tests
pnpm test:scalability
```

### Test Coverage

- ✅ Write-once semantics
- ✅ Hash-addressed paths
- ✅ Cache control headers
- ✅ Integrity checking
- ✅ Audit trail completeness
- ✅ Performance targets
- ✅ Scalability (100k objects)
- ✅ Security validation

## Monitoring and Alerting

### Key Metrics

1. **Performance**: Request latency, error rates
2. **Storage**: Object count, storage usage
3. **Security**: Failed auth attempts, unusual patterns
4. **Business**: Tenant activity, growth metrics

### Alert Configuration

```yaml
alerts:
  - name: High Latency
    condition: p95_latency > 150ms
    duration: 5m
    
  - name: Storage Growth
    condition: storage_growth_rate > 20%
    duration: 1h
    
  - name: Auth Failures
    condition: auth_failure_rate > 5%
    duration: 10m
```

## Troubleshooting

### Common Issues

#### 1. Upload Failures
- Check signed URL expiration
- Verify content type matches
- Validate file size limits
- Check HMAC signature

#### 2. Performance Issues
- Review cache hit rates
- Check edge location distribution
- Monitor storage backend latency
- Verify worker CPU limits

#### 3. Integrity Check Failures
- Verify hash calculation
- Check file corruption
- Validate naming convention
- Review audit logs

### Debug Commands

```bash
# Check worker logs
wrangler tail --env production

# Test connectivity
curl -I https://manifests.survival.test/health

# Verify storage
wrangler r2 object list c2-manifests-production

# Check metrics
curl https://manifests.survival.test/metrics
```

## Rollback Procedures

### Emergency Rollback

1. **Worker Rollback**: Deploy previous version
2. **DNS Changes**: Point to previous environment
3. **Storage Recovery**: Restore from backups if needed
4. **Communication**: Notify stakeholders

### Data Recovery

1. **Audit Logs**: Reconstruct operation history
2. **Backup Restore**: Restore from point-in-time backups
3. **Integrity Verification**: Validate all recovered data
4. **Service Restoration**: Gradual traffic restoration

## Maintenance

### Regular Tasks

1. **Performance Reviews**: Weekly metrics analysis
2. **Security Audits**: Monthly security scans
3. **Capacity Planning**: Quarterly capacity reviews
4. **Backup Testing**: Monthly backup verification

### Updates and Patches

1. **Worker Updates**: Rolling deployments
2. **Dependency Updates**: Security patches
3. **Configuration Updates**: Feature flag changes
4. **Documentation Updates**: Keep docs current

## Support

### Escalation Contacts

- **Primary**: DevOps team
- **Secondary**: Engineering lead
- **Emergency**: On-call engineer

### Documentation

- **API Reference**: `/api/docs`
- **Monitoring**: `/metrics/dashboard`
- **Status**: `/status`
- **Support**: Create GitHub issue

---

## Exit Criteria Completion

✅ **Store policy blocking overwrites**: Implemented and tested
✅ **Listing 100k object test namespace**: Scalability tests pass
✅ **p95 HEAD/GET < 150ms**: Performance targets met
✅ **Green integrity checker**: Validation working on seeded corpus
✅ **Complete audit trail**: Tamper-evident logging operational
✅ **Security validation**: All security tests passing
✅ **Documentation complete**: Deployment and operational docs ready

**Phase 2 is production-ready and meets all exit criteria.**
