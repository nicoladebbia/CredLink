# CredLink Production Deployment Guide

## 📋 Overview

This guide provides step-by-step instructions for deploying the hardened CredLink API to production environments. The deployment process has been designed with security, reliability, and operational excellence as primary concerns.

**Target Audience:** DevOps Engineers, Site Reliability Engineers, System Administrators  
**Deployment Time:** 45-90 minutes  
**Downtime:** Zero (blue-green deployment)

---

## 🚨 Prerequisites

### Infrastructure Requirements
- **Kubernetes Cluster** (v1.24+) or **AWS ECS** with Fargate
- **PostgreSQL** (v14+) with SSL enabled
- **Redis** (v6+) for caching (optional but recommended)
- **S3 Bucket** for proof storage
- **AWS KMS Key** for encryption
- **Load Balancer** with SSL termination
- **Monitoring Stack** (Prometheus, Grafana, AlertManager)

### Security Requirements
- **AWS IAM Role** with least-privilege access
- **SSL/TLS Certificates** for all endpoints
- **API Keys** generated for client authentication
- **Environment Variables** secured (no hardcoded secrets)
- **Network Security Groups** properly configured

### Tool Requirements
- **Docker** (v20.10+) with BuildKit
- **kubectl** (v1.24+) or **AWS CLI** (v2.0+)
- **pnpm** (v9.0.0+) for building
- **Terraform** (v1.5+) for infrastructure (optional)

---

## 🔐 Security Configuration

### 1. Environment Variables Setup

Create a secure environment configuration:

```bash
# Production Environment Variables
NODE_ENV=production
PORT=3000
APP_NAME=credlink-api

# Database Configuration (REQUIRED)
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
KMS_KEY_ID=arn:aws:kms:us-east-1:account:key/key-id

# S3 Storage
USE_S3_PROOF_STORAGE=true
S3_PROOF_BUCKET=credlink-proofs-production
PROOF_URI_DOMAIN=https://proofs.credlink.com

# Authentication
ENABLE_API_KEY_AUTH=true
API_KEYS=key1,key2,key3

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=1000
SIGN_RATE_LIMIT_MAX=50

# Security
ALLOWED_ORIGINS=https://credlink.com,https://www.credlink.com,https://app.credlink.com

# Monitoring
ENABLE_SENTRY=true
SENTRY_DSN=https://your-sentry-dsn

# C2PA Configuration
USE_REAL_C2PA=true
IMAGE_PROCESSING_TIMEOUT_MS=30000
```

### 2. SSL/TLS Configuration

Ensure proper SSL setup:
```bash
# Verify SSL certificate
openssl s_client -connect credlink.com:443 -servername credlink.com

# Check certificate chain
curl -I https://credlink.com
```

---

## 🐳 Docker Build & Push

### 1. Build Production Image

```bash
# Clone repository
git clone https://github.com/your-org/credlink.git
cd credlink

# Checkout production tag
git checkout v1.0.0

# Build production image (distroless)
docker build -t credlink-api:1.0.0 --target production .

# Build development image (for debugging)
docker build -t credlink-api:1.0.0-dev --target development .
```

### 2. Security Scan

```bash
# Run security scan on image
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  -v $HOME/Library/Caches:/root/.cache/ \
  aquasec/trivy:latest image credlink-api:1.0.0

# Check for vulnerabilities
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  -v $HOME/Library/Caches:/root/.cache/ \
  aquasec/trivy:latest image --severity HIGH,CRITICAL credlink-api:1.0.0
```

### 3. Push to Registry

```bash
# Tag for production
docker tag credlink-api:1.0.0 ghcr.io/your-org/credlink-api:1.0.0

# Push to container registry
docker push ghcr.io/your-org/credlink-api:1.0.0
```

---

## ☸️ Kubernetes Deployment

### 1. Create Namespace

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: credlink-production
  labels:
    name: credlink-production
    environment: production
```

```bash
kubectl apply -f namespace.yaml
```

### 2. Create Secrets

```bash
# Create secrets from environment file
kubectl create secret generic credlink-secrets \
  --from-env-file=.env.production \
  --namespace=credlink-production

# Create API key secret
kubectl create secret generic credlink-api-keys \
  --from-literal=keys="key1,key2,key3" \
  --namespace=credlink-production
```

### 3. Deploy Application

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: credlink-api
  namespace: credlink-production
  labels:
    app: credlink-api
    version: v1.0.0
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: credlink-api
  template:
    metadata:
      labels:
        app: credlink-api
        version: v1.0.0
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        runAsGroup: 1001
        fsGroup: 1001
      containers:
      - name: credlink-api
        image: ghcr.io/your-org/credlink-api:1.0.0
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 3000
          name: http
          protocol: TCP
        envFrom:
        - secretRef:
            name: credlink-secrets
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop:
            - ALL
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
        volumeMounts:
        - name: tmp
          mountPath: /tmp
        - name: proofs
          mountPath: /app/proofs
      volumes:
      - name: tmp
        emptyDir: {}
      - name: proofs
        persistentVolumeClaim:
          claimName: credlink-proofs-pvc
      imagePullSecrets:
      - name: ghcr-secret
---
apiVersion: v1
kind: Service
metadata:
  name: credlink-api-service
  namespace: credlink-production
  labels:
    app: credlink-api
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
    name: http
  selector:
    app: credlink-api
```

### 4. Apply Deployment

```bash
# Apply deployment configuration
kubectl apply -f deployment.yaml

# Monitor rollout
kubectl rollout status deployment/credlink-api -n credlink-production

# Check pod status
kubectl get pods -n credlink-production -l app=credlink-api
```

---

## 🔄 Blue-Green Deployment

### 1. Create Green Environment

```bash
# Create green namespace
kubectl create namespace credlink-green

# Deploy to green environment
kubectl apply -f deployment.yaml -n credlink-green

# Wait for green to be ready
kubectl wait --for=condition=available deployment/credlink-api \
  -n credlink-green --timeout=300s
```

### 2. Switch Traffic

```bash
# Update service selector to green
kubectl patch service credlink-api-service -n credlink-production \
  -p '{"spec":{"selector":{"version":"v1.0.0-green"}}}'

# Verify traffic routing
kubectl get service credlink-api-service -n credlink-production -o yaml
```

### 3. Validate Deployment

```bash
# Health check
curl -f https://staging.credlink.com/health

# Load test
curl -X POST https://staging.credlink.com/sign \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-key" \
  -d '{"test": true}'

# Monitor metrics
kubectl top pods -n credlink-green
```

---

## 📊 Monitoring & Observability

### 1. Prometheus Configuration

```yaml
# prometheus-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
  namespace: monitoring
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
    scrape_configs:
    - job_name: 'credlink-api'
      static_configs:
      - targets: ['credlink-api-service.credlink-production.svc.cluster.local:80']
      metrics_path: /metrics
      scrape_interval: 10s
```

### 2. AlertManager Rules

```yaml
# alert-rules.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: credlink-alerts
  namespace: monitoring
spec:
  groups:
  - name: credlink-api
    rules:
    - alert: CredLinkAPIHighErrorRate
      expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
      for: 2m
      labels:
        severity: critical
      annotations:
        summary: "High error rate detected"
        description: "Error rate is {{ $value }} errors per second"
    
    - alert: CredLinkAPIHighMemoryUsage
      expr: container_memory_usage_bytes / container_spec_memory_limit_bytes > 0.9
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High memory usage"
        description: "Memory usage is above 90%"
```

---

## 🔍 Post-Deployment Verification

### 1. Health Checks

```bash
# Basic health check
curl -f https://credlink.com/health

# Detailed health check
curl -f https://credlink.com/health | jq .

# Check specific endpoints
curl -f https://credlink.com/api/v1/status
curl -f https://credlink.com/api/v1/health
```

### 2. Security Validation

```bash
# Check security headers
curl -I https://credlink.com | grep -E "(Strict-Transport|Content-Security|X-Frame)"

# Test CORS
curl -H "Origin: https://malicious.com" -H "Access-Control-Request-Method: POST" \
  -X OPTIONS https://credlink.com/api/v1/sign

# Test rate limiting
for i in {1..110}; do
  curl -s https://credlink.com/health > /dev/null
done
```

### 3. Performance Testing

```bash
# Load test with Apache Bench
ab -n 1000 -c 10 https://credlink.com/health

# Load test with wrk
wrk -t12 -c400 -d30s https://credlink.com/health

# Memory usage check
kubectl top pods -n credlink-production
```

---

## 🚨 Rollback Procedures

### 1. Immediate Rollback

```bash
# Rollback to previous revision
kubectl rollout undo deployment/credlink-api -n credlink-production

# Monitor rollback
kubectl rollout status deployment/credlink-api -n credlink-production
```

### 2. Emergency Rollback

```bash
# Scale down current deployment
kubectl scale deployment credlink-api --replicas=0 -n credlink-production

# Deploy previous version
kubectl set image deployment/credlink-api \
  credlink-api=ghcr.io/your-org/credlink-api:0.9.0 \
  -n credlink-production

# Scale up previous version
kubectl scale deployment credlink-api --replicas=3 -n credlink-production
```

---

## 📋 Deployment Checklist

### Pre-Deployment
- [ ] Environment variables configured and validated
- [ ] SSL certificates installed and verified
- [ ] Database connectivity tested
- [ ] S3 buckets and KMS keys configured
- [ ] API keys generated and secured
- [ ] Monitoring and alerting configured
- [ ] Backup procedures verified

### During Deployment
- [ ] Blue-green deployment initiated
- [ ] Health checks passing on green environment
- [ ] Load tests completed successfully
- [ ] Security validations passed
- [ ] Traffic switched to green environment

### Post-Deployment
- [ ] All health endpoints responding correctly
- [ ] Error rates below 1%
- [ ] Memory usage within limits
- [ ] Security headers properly configured
- [ ] Rate limiting working as expected
- [ ] Monitoring alerts configured
- [ ] Documentation updated

---

## 🆘 Troubleshooting

### Common Issues

#### Pod Not Starting
```bash
# Check pod logs
kubectl logs -f deployment/credlink-api -n credlink-production

# Check events
kubectl describe pod -l app=credlink-api -n credlink-production

# Check resource limits
kubectl top pods -n credlink-production
```

#### Database Connection Issues
```bash
# Test database connectivity
kubectl exec -it deployment/credlink-api -n credlink-production -- \
  node -e "const { Pool } = require('pg'); const pool = new Pool(process.env.DATABASE_URL); pool.query('SELECT 1').then(() => console.log('DB OK')).catch(console.error);"
```

#### High Memory Usage
```bash
# Check memory usage
kubectl exec -it deployment/credlink-api -n credlink-production -- \
  node -e "console.log(process.memoryUsage());"

# Restart deployment if needed
kubectl rollout restart deployment/credlink-api -n credlink-production
```

---

## 📞 Support

For deployment issues:
1. Check the [RUNBOOK.md](./RUNBOOK.md) for detailed troubleshooting
2. Review monitoring dashboards for error patterns
3. Contact the on-call engineering team
4. Create incident ticket with deployment details

**Deployment Success Criteria:**
- All health endpoints responding with 200 OK
- Error rate < 1% over 5 minutes
- Memory usage < 80% of allocated limits
- Security headers properly configured
- Rate limiting functioning correctly

---

*Last Updated: November 2025*  
*Version: 1.0.0*  
*Environment: Production*
