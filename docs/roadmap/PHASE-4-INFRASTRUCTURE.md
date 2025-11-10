# PHASE 4: INFRASTRUCTURE DEPLOYMENT (Steps 501-800)

**Timeline:** 4-8 weeks  
**Owner:** DevOps/Infrastructure Team  
**Score Impact:** 6.5/10 → 7.5/10  
**Goal:** Deploy to production and prove it works at scale

---

## 🎯 THE REALITY CHECK

**After Phase 3:** Works on localhost  
**After Phase 4:** Works on internet, handles real traffic, monitored 24/7

This is where you prove it's not just a toy project.

---

## STEPS 501-550: CLOUD INFRASTRUCTURE SETUP

### Cloud Provider Selection (Steps 501-520)

**Decision Matrix:**
| Provider | Cost (100K req/mo) | Latency | Complexity | Recommendation |
|----------|-------------------|---------|------------|----------------|
| Cloudflare Workers | $5-20 | <50ms edge | Low | ✅ Primary compute |
| AWS Lambda | $20-50 | 100-200ms | Medium | Alternative |
| Traditional VPS | $50-200 | Varies | High | Not recommended |

**Chosen Architecture:**
- **Compute:** Cloudflare Workers (edge functions, low latency)
- **Storage:** AWS S3 (proof storage) + DynamoDB (metadata)
- **Cache:** Cloudflare KV (proof caching)
- **CDN:** Cloudflare (asset delivery, DDoS protection)
- **Monitoring:** Datadog or CloudWatch

### AWS Setup (Steps 521-540)

```bash
# Install AWS CLI
brew install awscli

# Configure credentials
aws configure
# Access Key ID: [from AWS Console]
# Secret Access Key: [from AWS Console]
# Region: us-east-1

# Create S3 bucket for proofs
aws s3 mb s3://credlink-proofs-prod --region us-east-1

# Enable versioning (proof history)
aws s3api put-bucket-versioning \
  --bucket credlink-proofs-prod \
  --versioning-configuration Status=Enabled

# Enable encryption at rest
aws s3api put-bucket-encryption \
  --bucket credlink-proofs-prod \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

# Create DynamoDB table for metadata
aws dynamodb create-table \
  --table-name credlink-proofs-metadata \
  --attribute-definitions \
    AttributeName=proofId,AttributeType=S \
    AttributeName=imageHash,AttributeType=S \
  --key-schema \
    AttributeName=proofId,KeyType=HASH \
  --global-secondary-indexes '[{
    "IndexName": "ImageHashIndex",
    "KeySchema": [{"AttributeName": "imageHash", "KeyType": "HASH"}],
    "Projection": {"ProjectionType": "ALL"},
    "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
  }]' \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  --region us-east-1
```

### Cloudflare Setup (Steps 541-560)

```bash
# Install Wrangler
npm install -g wrangler

# Login
wrangler login

# Create Workers project
cd apps/sign-service
wrangler init credlink-workers

# Configure wrangler.toml
cat > wrangler.toml << 'EOF'
name = "credlink-sign-service"
main = "src/index.ts"
compatibility_date = "2024-01-01"
node_compat = true

[env.production]
routes = [
  { pattern = "api.credlink.com/sign", zone_name = "credlink.com" },
  { pattern = "api.credlink.com/verify", zone_name = "credlink.com" }
]

[[kv_namespaces]]
binding = "PROOFS"
id = "YOUR_KV_ID"

[env.production.vars]
ENVIRONMENT = "production"
LOG_LEVEL = "info"

[env.staging]
routes = [{ pattern = "staging-api.credlink.com/*", zone_name = "credlink.com" }]
EOF

# Create KV namespace
wrangler kv:namespace create "PROOFS"
wrangler kv:namespace create "PROOFS" --preview

# Update wrangler.toml with IDs
```

---

## STEPS 561-620: DEPLOYMENT PIPELINE

### GitHub Actions CI/CD

```yaml
# .github/workflows/deploy-production.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Run tests
        run: pnpm test
      
      - name: Run linter
        run: pnpm lint
      
      - name: Type check
        run: pnpm type-check
      
      - name: Security audit
        run: pnpm audit --audit-level=high
  
  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build application
        run: pnpm build
      
      - name: Build Docker image
        run: docker build -t credlink-sign:${{ github.sha }} .
      
      - name: Scan image for vulnerabilities
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: credlink-sign:${{ github.sha }}
          severity: 'HIGH,CRITICAL'
      
      - name: Sign container image
        run: cosign sign credlink-sign:${{ github.sha }}
  
  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to Cloudflare Workers (staging)
        run: |
          wrangler publish --env staging
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      
      - name: Run smoke tests
        run: |
          curl -f https://staging-api.credlink.com/health || exit 1
          ./tests/smoke/test-sign.sh staging-api.credlink.com
          ./tests/smoke/test-verify.sh staging-api.credlink.com
  
  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to Cloudflare Workers (production)
        run: |
          wrangler publish --env production
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      
      - name: Run smoke tests
        run: |
          curl -f https://api.credlink.com/health || exit 1
          ./tests/smoke/test-sign.sh api.credlink.com
      
      - name: Notify team
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'Production deployment complete'
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

---

## STEPS 621-670: MONITORING & OBSERVABILITY

### Datadog Setup

```bash
# Install Datadog agent (if using traditional infrastructure)
DD_AGENT_MAJOR_VERSION=7 DD_API_KEY=<YOUR_KEY> DD_SITE="datadoghq.com" \
  bash -c "$(curl -L https://s3.amazonaws.com/dd-agent/scripts/install_script.sh)"

# For Cloudflare Workers, use logs
# wrangler tail --format=json | datadog-ci lambda send-logs
```

### Custom Metrics

```typescript
// src/utils/metrics.ts
export class Metrics {
  static async recordSignDuration(duration: number) {
    await fetch('https://api.datadoghq.com/api/v1/series', {
      method: 'POST',
      headers: {
        'DD-API-KEY': process.env.DATADOG_API_KEY!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        series: [{
          metric: 'credlink.sign.duration',
          points: [[Date.now() / 1000, duration]],
          type: 'gauge',
          tags: ['env:production', 'service:sign']
        }]
      })
    });
  }

  static async recordVerifySuccess(success: boolean) {
    await this.recordMetric('credlink.verify.success', success ? 1 : 0);
  }

  static async recordProofStorageSize(bytes: number) {
    await this.recordMetric('credlink.proof.size', bytes);
  }
}

// Add to endpoints
app.post('/sign', async (req, res) => {
  const start = Date.now();
  // ... signing logic ...
  await Metrics.recordSignDuration(Date.now() - start);
});
```

### Alerting Rules

```yaml
# datadog-monitors.yaml
monitors:
  - name: "High Error Rate - Sign Endpoint"
    type: metric alert
    query: "avg(last_5m):sum:credlink.sign.errors{env:production} > 10"
    message: |
      Sign endpoint error rate is high.
      @pagerduty-credlink @slack-engineering
    
  - name: "Slow Sign Performance"
    type: metric alert
    query: "avg(last_5m):avg:credlink.sign.duration{env:production} > 1000"
    message: |
      Sign endpoint is slow (>1s average).
      Check performance metrics.
      @slack-engineering
  
  - name: "Low Survival Rate"
    type: metric alert
    query: "avg(last_1h):avg:credlink.survival.rate{env:production} < 90"
    message: |
      Survival rate dropped below 90%.
      Investigate immediately.
      @pagerduty-credlink
```

---

## STEPS 671-720: PRODUCTION DEPLOYMENT

### Pre-Deployment Checklist

```markdown
## Pre-Deployment Checklist

### Infrastructure
- [ ] DNS configured (api.credlink.com, proofs.credlink.com)
- [ ] SSL certificates valid
- [ ] S3 buckets created and encrypted
- [ ] DynamoDB tables created
- [ ] Cloudflare Workers KV namespaces created
- [ ] Environment variables set in Wrangler

### Monitoring
- [ ] Datadog/CloudWatch configured
- [ ] Alerts configured and tested
- [ ] PagerDuty integration working
- [ ] Slack notifications working
- [ ] Status page created (status.credlink.com)

### Security
- [ ] API keys rotated
- [ ] Secrets in Secrets Manager (not env files)
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] WAF rules active
- [ ] DDoS protection enabled

### Testing
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Load test passed (1000 req/min)
- [ ] Smoke tests prepared
- [ ] Rollback procedure documented
```

### Deployment Strategy (Canary)

```bash
# 1. Deploy to 5% of traffic
wrangler publish --env production --percent 5

# 2. Monitor for 30 minutes
# - Check error rates
# - Check latency
# - Check logs

# 3. If healthy, increase to 25%
wrangler publish --env production --percent 25

# 4. Monitor for 30 minutes

# 5. If healthy, increase to 100%
wrangler publish --env production --percent 100

# 6. Monitor for 24 hours

# If issues at any stage:
wrangler rollback --env production
```

### Post-Deployment Verification

```bash
# Test all endpoints
curl -f https://api.credlink.com/health
curl -f https://api.credlink.com/ready
curl -f https://proofs.credlink.com/test-id

# Test sign endpoint
curl -X POST https://api.credlink.com/sign \
  -F "image=@test.jpg" \
  -o signed.jpg

# Test verify endpoint
curl -X POST https://api.credlink.com/verify \
  -F "image=@signed.jpg"

# Check from multiple regions
curl -w "@curl-format.txt" https://api.credlink.com/health
# Should show < 100ms globally
```

---

## STEPS 721-800: MEASURE ACTUAL METRICS

### THIS IS WHERE YOU CAN FINALLY MAKE HONEST CLAIMS

**Steps 721-750: Measure Survival Rates (FOR REAL)**

```bash
# Run survival tests in production
pnpm test:survival:production

# Test 10,000+ real operations
# - 1,000 ImageOptim compressions
# - 1,000 Social media simulations
# - 1,000 CDN optimizations
# - 1,000 Format conversions
# - etc.

# Results (example):
# ImageOptim: 98.7% (987/1000)
# Twitter: 89.3% (893/1000)
# Instagram: 91.2% (912/1000)
# Cloudflare: 97.5% (975/1000)
# Format conversion: 94.8% (948/1000)
# Overall: 94.3% survival rate

# NOW update documentation with REAL numbers
echo "94.3% survival rate (measured across 10,000 operations)" > docs/SURVIVAL-RATE.md
```

**Steps 751-770: Measure Deployment Time**

```bash
# Time actual deployments
for i in {1..10}; do
  start=$(date +%s)
  wrangler publish --env production
  end=$(date +%s)
  duration=$((end - start))
  echo "Deployment $i: ${duration}s"
done

# Average: likely 2-5 minutes, not "10 minutes" and definitely not "instantly"
# Update docs with REAL time
```

**Steps 771-790: Calculate Actual Costs**

```bash
# After first month of production:

# Cloudflare Workers: $5-20/month
# AWS S3: $10-50/month (storage)
# DynamoDB: $5-25/month (on-demand)
# Datadog: $15-100/month (monitoring)
# Total: $35-195/month for first 100K requests

# Cost per request: $0.00035 - $0.00195
# At scale (1M requests): $350-1,950/month

# NOW you can set pricing:
# Small: $49/mo (50K requests)
# Medium: $199/mo (500K requests)
# Large: $499/mo (2M requests)
# Enterprise: Custom

# Update docs with REAL pricing based on REAL costs
```

**Steps 791-800: Update Documentation with Real Data**

```markdown
## README.md - HONEST VERSION

### Proven Performance

**Survival Rates** (measured across 10,000 operations):
- Overall: 94.3% survival
- CDN optimization: 97.5%
- Social media: 89.3%
- Format conversion: 94.8%

*Methodology: [link to detailed test results]*

**Performance** (measured at p95):
- Signing: 380ms average
- Verification: 145ms average
- Proof retrieval: 85ms average

*Infrastructure: Cloudflare Workers edge network*

**Deployment:**
- Average deployment time: 3.5 minutes
- Zero-downtime canary rollout
- Automatic rollback on errors

**Pricing** (based on actual costs + margin):
- Starter: $49/mo (50K requests)
- Growth: $199/mo (500K requests)
- Scale: $499/mo (2M requests)
- Enterprise: Custom pricing

### Transparency

All metrics are measured in production and updated monthly.
See [metrics dashboard](https://status.credlink.com/metrics) for real-time data.
```

---

## ✅ PHASE 4 COMPLETION CRITERIA

### Infrastructure
- [ ] Production environment fully deployed
- [ ] DNS configured and working globally
- [ ] SSL certificates valid
- [ ] CDN configured and caching properly
- [ ] Auto-scaling configured and tested

### Monitoring
- [ ] All metrics flowing to Datadog/CloudWatch
- [ ] Alerts configured and tested
- [ ] PagerDuty integration working
- [ ] Status page live and updating
- [ ] Logs aggregated and searchable

### Performance
- [ ] p95 latency < 100ms for proof retrieval
- [ ] p95 latency < 500ms for signing
- [ ] p95 latency < 200ms for verification
- [ ] Handles 1,000 concurrent requests
- [ ] 99.9%+ uptime measured over 30 days

### Measurement (CRITICAL)
- [ ] Survival rates measured across 10,000+ operations
- [ ] Deployment time measured across 10+ deployments
- [ ] Costs calculated from actual infrastructure usage
- [ ] All metrics documented with methodology
- [ ] Dashboard showing real-time metrics

### Documentation
- [ ] Remove all theoretical claims
- [ ] Update with measured survival rates
- [ ] Update with measured deployment time
- [ ] Update with cost-based pricing
- [ ] Add links to public metrics dashboard

### Scoring
**After Phase 4: 6.5/10 → 7.5/10**
- Production readiness: 0/10 → 7/10 (+7)
- Honesty: 9/10 → 10/10 (+1, now have proof)
- Performance: 5/10 → 7/10 (+2)
- Overall: 6.5/10 → 7.5/10 (+1.0)

**You now have a real, working, deployed product with proven metrics.**

---

## WHAT COMES NEXT

**Proceed to: [Phase 5: Customer Validation](./PHASE-5-CUSTOMER-VALIDATION.md)**

**Timeline:** 8-16 weeks  
**Goal:** Get real customers, validate product-market fit, grow to 100+ users  
**Score:** 7.5/10 → 8.0/10

The hard technical work is done. Now prove people want this.
