# 🚀 CredLink MVP - Production Deployment Guide

## Executive Summary

This guide provides comprehensive instructions for deploying the CredLink MVP to production. The system has been thoroughly tested and is ready for production deployment with real cryptographic signing, manifest storage, and verification capabilities.

---

## 📋 Pre-Deployment Checklist

### Infrastructure Requirements
- [ ] Node.js 20+ installed
- [ ] npm or pnpm package manager
- [ ] Cloudflare R2 bucket created (optional, can use local storage)
- [ ] Domain name configured (e.g., credlink.com)
- [ ] SSL/TLS certificates ready
- [ ] Load balancer configured (if needed)
- [ ] Monitoring and logging setup

### Security Requirements
- [ ] Production signing keys generated (RSA-2048 minimum)
- [ ] Keys stored in secure key management system (KMS/HSM)
- [ ] Environment variables secured
- [ ] CORS origins configured
- [ ] Rate limiting configured
- [ ] Firewall rules in place
- [ ] Security headers enabled

### Testing Requirements
- [ ] All end-to-end tests passed
- [ ] Performance benchmarks met
- [ ] Security audit completed
- [ ] Load testing performed
- [ ] Backup and recovery tested

---

## 🔧 Environment Configuration

### Required Environment Variables

```bash
# === CORE CONFIGURATION ===
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
LOG_LEVEL=info

# === SECURITY ===
ALLOWED_ORIGINS=https://credlink.com,https://www.credlink.com
RATE_LIMIT_MAX=100
ENABLE_CSP_REPORT_ONLY=false

# === SIGNING CONFIGURATION ===
SIGNING_KEY_ID=prod-key-2025-001
SIGNING_ORG=Your Organization Name

# Cryptographic Signing
USE_REAL_CRYPTO=true  # MUST be true in production
USE_TSA=false         # Enable if TSA service is available
TSA_ENDPOINT=https://tsa.credlink.com/sign

# === STORAGE CONFIGURATION ===
# Cloudflare R2 (Recommended for Production)
R2_ACCOUNT_ID=your_account_id_here
R2_ACCESS_KEY_ID=your_access_key_here
R2_SECRET_ACCESS_KEY=your_secret_key_here
R2_BUCKET=credlink-manifests-prod
R2_PUBLIC_URL=https://manifests.credlink.com

# Manifest Base URL
MANIFEST_BASE_URL=https://manifests.credlink.com

# === PERFORMANCE ===
REQUEST_TIMEOUT=30000
BODY_LIMIT=52428800  # 50MB
```

### Optional Environment Variables

```bash
# === MONITORING ===
SENTRY_DSN=https://...
DATADOG_API_KEY=...
NEW_RELIC_LICENSE_KEY=...

# === FEATURE FLAGS ===
ENABLE_BATCH_SIGNING=true
ENABLE_WEBHOOK_NOTIFICATIONS=false
ENABLE_ANALYTICS=true
```

---

## 🔐 Key Management

### Production Key Generation

**Option 1: Local Generation (Development/Testing)**
```bash
# Generate RSA-2048 key pair
openssl genrsa -out private-key.pem 2048
openssl rsa -in private-key.pem -pubout -out public-key.pem

# Store securely - NEVER commit to git
chmod 600 private-key.pem
```

**Option 2: AWS KMS (Recommended)**
```bash
# Create KMS key
aws kms create-key \
  --description "CredLink Production Signing Key" \
  --key-usage SIGN_VERIFY \
  --key-spec RSA_2048

# Get key ID
aws kms describe-key --key-id alias/credlink-signing
```

**Option 3: Azure Key Vault**
```bash
# Create key vault
az keyvault create \
  --name credlink-vault \
  --resource-group credlink-rg

# Create signing key
az keyvault key create \
  --vault-name credlink-vault \
  --name signing-key \
  --kty RSA \
  --size 2048
```

**Option 4: HashiCorp Vault**
```bash
# Enable transit engine
vault secrets enable transit

# Create signing key
vault write transit/keys/credlink-signing \
  type=rsa-2048 \
  exportable=false
```

### Key Rotation Strategy

1. **Generate new key pair**
2. **Update `SIGNING_KEY_ID`** (e.g., `prod-key-2025-002`)
3. **Deploy with new key**
4. **Keep old key for verification** (30-90 days)
5. **Archive old key securely**

---

## 📦 Deployment Steps

### 1. Build Application

```bash
cd apps/verify-api

# Install dependencies
npm install --production

# Build TypeScript
npm run build

# Verify build
ls -la dist/
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit with production values
nano .env

# Verify configuration
node -e "require('dotenv').config(); console.log('Config loaded')"
```

### 3. Test Locally

```bash
# Start server
NODE_ENV=production npm start

# Test in another terminal
curl http://localhost:3001/health
curl http://localhost:3001/signing/status
curl http://localhost:3001/storage/info
```

### 4. Deploy to Production

**Option A: PM2 (Process Manager)**
```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start dist/index.js \
  --name credlink-api \
  --instances 4 \
  --exec-mode cluster

# Save PM2 configuration
pm2 save

# Setup startup script
pm2 startup

# Monitor
pm2 monit
```

**Option B: Docker**
```bash
# Build image
docker build -t credlink-api:latest .

# Run container
docker run -d \
  --name credlink-api \
  -p 3001:3001 \
  --env-file .env \
  --restart unless-stopped \
  credlink-api:latest

# Check logs
docker logs -f credlink-api
```

**Option C: Kubernetes**
```bash
# Apply deployment
kubectl apply -f k8s/deployment.yaml

# Apply service
kubectl apply -f k8s/service.yaml

# Check status
kubectl get pods -l app=credlink-api
kubectl logs -f deployment/credlink-api
```

**Option D: Serverless (AWS Lambda)**
```bash
# Package application
npm run package

# Deploy with Serverless Framework
serverless deploy --stage production

# Or with AWS SAM
sam build
sam deploy --guided
```

---

## 🌐 Cloudflare R2 Setup

### 1. Create R2 Bucket

```bash
# Via Cloudflare Dashboard
1. Log in to Cloudflare Dashboard
2. Navigate to R2 Object Storage
3. Click "Create bucket"
4. Name: credlink-manifests-prod
5. Location: Automatic
6. Create bucket
```

### 2. Generate API Tokens

```bash
# Via Cloudflare Dashboard
1. Go to R2 > Manage R2 API Tokens
2. Click "Create API token"
3. Token name: credlink-production
4. Permissions: Object Read & Write
5. TTL: Never expire (or set appropriate expiry)
6. Create token
7. Copy Access Key ID and Secret Access Key
```

### 3. Configure Custom Domain

```bash
# Via Cloudflare Dashboard
1. Go to your R2 bucket
2. Click "Settings"
3. Under "Public access", click "Connect domain"
4. Enter: manifests.credlink.com
5. Add CNAME record to DNS:
   CNAME manifests -> bucket-url.r2.cloudflarestorage.com
6. Wait for DNS propagation
```

### 4. Configure CORS

```json
[
  {
    "AllowedOrigins": ["https://credlink.com", "https://www.credlink.com"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "X-Manifest-Hash"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## 🔒 Security Hardening

### 1. Firewall Configuration

```bash
# Allow only necessary ports
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (redirect to HTTPS)
ufw allow 443/tcp   # HTTPS
ufw enable

# Deny all other traffic
ufw default deny incoming
ufw default allow outgoing
```

### 2. SSL/TLS Configuration

```bash
# Using Let's Encrypt
certbot --nginx -d api.credlink.com

# Or using Cloudflare
# Enable "Full (strict)" SSL/TLS mode in Cloudflare Dashboard
```

### 3. Rate Limiting

```nginx
# Nginx configuration
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

server {
    location /sign {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://localhost:3001;
    }
}
```

### 4. Security Headers

Already configured in application:
- Content-Security-Policy
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security
- X-XSS-Protection

---

## 📊 Monitoring & Logging

### 1. Application Monitoring

**Prometheus + Grafana**
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'credlink-api'
    static_configs:
      - targets: ['localhost:3001']
```

**Datadog**
```javascript
// Add to index.ts
import tracer from 'dd-trace';
tracer.init({
  service: 'credlink-api',
  env: 'production'
});
```

### 2. Log Aggregation

**ELK Stack**
```bash
# Filebeat configuration
filebeat.inputs:
  - type: log
    paths:
      - /var/log/credlink/*.log
    
output.elasticsearch:
  hosts: ["elasticsearch:9200"]
```

**CloudWatch Logs**
```bash
# Install CloudWatch agent
aws logs create-log-group --log-group-name /credlink/api
```

### 3. Alerts

```yaml
# Example alert rules
alerts:
  - name: HighErrorRate
    condition: error_rate > 5%
    action: notify_oncall
    
  - name: SlowSigningTime
    condition: signing_time_p95 > 1000ms
    action: notify_team
    
  - name: StorageFailure
    condition: storage_errors > 10
    action: page_oncall
```

---

## 🧪 Production Testing

### 1. Smoke Tests

```bash
# Health check
curl https://api.credlink.com/health

# Signing status
curl https://api.credlink.com/signing/status

# Storage info
curl https://api.credlink.com/storage/info
```

### 2. End-to-End Test

```bash
# Sign an image
curl -X POST https://api.credlink.com/sign \
  -F "image=@test.jpg" \
  -F "creator=test@credlink.com"

# Retrieve manifest
curl https://manifests.credlink.com/{hash}

# Verify
curl -X POST https://api.credlink.com/verify \
  -H "Content-Type: application/json" \
  -d '{"manifest_url":"https://manifests.credlink.com/{hash}"}'
```

### 3. Load Testing

```bash
# Using Apache Bench
ab -n 1000 -c 10 https://api.credlink.com/health

# Using k6
k6 run load-test.js
```

---

## 📈 Performance Optimization

### 1. Caching

```nginx
# Nginx caching for manifests
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=manifests:10m;

location /manifests/ {
    proxy_cache manifests;
    proxy_cache_valid 200 365d;
    proxy_cache_key $uri;
}
```

### 2. CDN Configuration

```bash
# Cloudflare CDN
1. Enable Cloudflare for manifests.credlink.com
2. Set cache rules:
   - Cache Level: Standard
   - Browser Cache TTL: 1 year
   - Edge Cache TTL: 1 year
3. Enable Argo Smart Routing
```

### 3. Database Optimization

```sql
-- If using PostgreSQL for metadata
CREATE INDEX idx_manifests_hash ON manifests(hash);
CREATE INDEX idx_manifests_created_at ON manifests(created_at);
```

---

## 🔄 Backup & Recovery

### 1. Backup Strategy

```bash
# R2 bucket backup
rclone sync r2:credlink-manifests-prod r2:credlink-manifests-backup

# Database backup (if applicable)
pg_dump credlink_db > backup_$(date +%Y%m%d).sql

# Automated daily backups
0 2 * * * /usr/local/bin/backup-credlink.sh
```

### 2. Disaster Recovery

```bash
# Recovery procedure
1. Restore R2 bucket from backup
2. Restore database from backup
3. Redeploy application
4. Verify all services
5. Run smoke tests
```

---

## 📋 Post-Deployment Checklist

- [ ] All services running
- [ ] Health checks passing
- [ ] Signing endpoint working
- [ ] Storage endpoint working
- [ ] Verification endpoint working
- [ ] Manifests retrievable
- [ ] SSL/TLS configured
- [ ] Monitoring active
- [ ] Alerts configured
- [ ] Backups scheduled
- [ ] Documentation updated
- [ ] Team notified

---

## 🆘 Troubleshooting

### Common Issues

**Issue: Signing fails with "Key not found"**
```bash
# Solution: Verify signing keys are configured
echo $SIGNING_KEY_ID
# Regenerate keys if needed
```

**Issue: R2 storage fails**
```bash
# Solution: Verify R2 credentials
aws s3 ls s3://credlink-manifests-prod --endpoint-url https://...
```

**Issue: High latency**
```bash
# Solution: Enable CDN caching
# Check: curl -I https://manifests.credlink.com/{hash}
# Look for: X-Cache: HIT
```

**Issue: Rate limiting too strict**
```bash
# Solution: Adjust rate limits in .env
RATE_LIMIT_MAX=200
```

---

## 📞 Support & Maintenance

### Regular Maintenance Tasks

**Daily:**
- Monitor error logs
- Check system health
- Review performance metrics

**Weekly:**
- Review security alerts
- Update dependencies
- Backup verification

**Monthly:**
- Security audit
- Performance review
- Capacity planning
- Key rotation review

**Quarterly:**
- Disaster recovery drill
- Security penetration testing
- Load testing
- Documentation update

---

## 🎯 Success Metrics

### Key Performance Indicators (KPIs)

- **Uptime**: > 99.9%
- **Signing Time (P95)**: < 500ms
- **Retrieval Time (P95)**: < 100ms
- **Error Rate**: < 0.1%
- **Verification Success Rate**: > 99%

### Monitoring Dashboards

1. **System Health**
   - CPU usage
   - Memory usage
   - Disk I/O
   - Network traffic

2. **Application Metrics**
   - Request rate
   - Response time
   - Error rate
   - Success rate

3. **Business Metrics**
   - Images signed per day
   - Verifications per day
   - Storage usage
   - User growth

---

**Deployment guide complete. System ready for production.** 🚀
