# CredLink Production Deployment Guide

Complete guide for deploying CredLink to production on AWS.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Infrastructure Setup](#infrastructure-setup)
3. [Application Deployment](#application-deployment)
4. [Monitoring Setup](#monitoring-setup)
5. [Post-Deployment](#post-deployment)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

- AWS CLI v2.x
- Docker 20.x+
- Terraform 1.5+
- Node.js 18+
- Git

### AWS Account Setup

1. **Create AWS Account** (if not exists)
2. **Configure IAM User** with permissions:
   - ECS Full Access
   - EC2 Full Access
   - S3 Full Access
   - CloudWatch Full Access
   - Secrets Manager Full Access
   - Certificate Manager Full Access

3. **Configure AWS CLI:**
```bash
aws configure
# AWS Access Key ID: YOUR_KEY
# AWS Secret Access Key: YOUR_SECRET
# Default region: us-east-1
# Default output format: json
```

### Domain & SSL

1. **Register domain** (e.g., credlink.com)
2. **Request SSL certificate** in AWS Certificate Manager:
```bash
aws acm request-certificate \
  --domain-name api.credlink.com \
  --validation-method DNS \
  --region us-east-1
```

3. **Validate certificate** via DNS records

---

## Infrastructure Setup

### Step 1: Create VPC and Networking

```bash
cd infra/terraform

# Initialize Terraform
terraform init

# Plan infrastructure
terraform plan -var-file=production.tfvars

# Apply infrastructure
terraform apply -var-file=production.tfvars
```

### Step 2: Create Secrets in AWS Secrets Manager

```bash
# JWT Secret
aws secretsmanager create-secret \
  --name credlink/jwt-secret \
  --secret-string "$(openssl rand -base64 32)"

# Database Password
aws secretsmanager create-secret \
  --name credlink/db-password \
  --secret-string "$(openssl rand -base64 32)"

# Redis Password
aws secretsmanager create-secret \
  --name credlink/redis-password \
  --secret-string "$(openssl rand -base64 32)"

# Sentry DSN
aws secretsmanager create-secret \
  --name credlink/sentry-dsn \
  --secret-string "https://your-sentry-dsn@sentry.io/project"
```

### Step 3: Create ECR Repository

```bash
# Create repository
aws ecr create-repository \
  --repository-name credlink-api \
  --region us-east-1

# Get repository URI
aws ecr describe-repositories \
  --repository-names credlink-api \
  --query 'repositories[0].repositoryUri' \
  --output text
```

### Step 4: Deploy Application Load Balancer

```bash
cd infra/alb

aws cloudformation deploy \
  --template-file credlink-alb.yaml \
  --stack-name credlink-alb-prod \
  --parameter-overrides \
    VpcId=vpc-xxxxx \
    PublicSubnet1=subnet-xxxxx \
    PublicSubnet2=subnet-xxxxx \
    PublicSubnet3=subnet-xxxxx \
    CertificateArn=arn:aws:acm:us-east-1:xxx:certificate/xxx \
  --capabilities CAPABILITY_IAM
```

---

## Application Deployment

### Step 1: Build Docker Image

```bash
cd apps/api-gw

# Build image
docker build -t credlink-api:latest .

# Test locally
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=test-secret \
  credlink-api:latest
```

### Step 2: Push to ECR

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Tag image
docker tag credlink-api:latest \
  ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/credlink-api:latest

# Push image
docker push ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/credlink-api:latest
```

### Step 3: Deploy ECS Service

```bash
cd infra/scripts

# Run deployment script
./deploy-ecs.sh production

# Or manually:
cd infra/ecs

# Register task definition
aws ecs register-task-definition \
  --cli-input-json file://credlink-api-task-definition.json

# Create/Update service
aws ecs create-service \
  --cluster credlink-prod \
  --service-name credlink-api \
  --task-definition credlink-api \
  --desired-count 3 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=credlink-api,containerPort=3000"
```

### Step 4: Deploy CloudFront CDN

```bash
cd infra/cloudfront

# Create distribution
aws cloudfront create-distribution \
  --distribution-config file://credlink-distribution.json

# Get distribution domain
aws cloudfront list-distributions \
  --query 'DistributionList.Items[?Comment==`CredLink API CloudFront Distribution`].DomainName' \
  --output text
```

### Step 5: Update DNS

```bash
# Create Route53 record pointing to CloudFront
aws route53 change-resource-record-sets \
  --hosted-zone-id ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "api.credlink.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z2FDTNDATAQYW2",
          "DNSName": "d111111abcdef8.cloudfront.net",
          "EvaluateTargetHealth": false
        }
      }
    }]
  }'
```

---

## Monitoring Setup

### Step 1: Deploy CloudWatch Dashboard

```bash
cd infra/monitoring/dashboards

aws cloudwatch put-dashboard \
  --dashboard-name credlink-prod \
  --dashboard-body file://cloudwatch-dashboard.json
```

### Step 2: Start Prometheus & Grafana

```bash
cd infra/monitoring

# Set environment variables
export GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 16)
export REDIS_PASSWORD=your-redis-password
export DB_USER=postgres
export DB_PASSWORD=your-db-password
export DB_NAME=credlink

# Start monitoring stack
docker-compose up -d

# Access Grafana
open http://localhost:3001
# Login: admin / $GRAFANA_ADMIN_PASSWORD
```

### Step 3: Configure Alerting

```bash
# Update Slack webhook in alertmanager-config.yaml
# Update PagerDuty service key

# Restart alertmanager
docker-compose restart alertmanager
```

---

## Post-Deployment

### Verification Checklist

- [ ] **Health Check**: `curl https://api.credlink.com/health`
- [ ] **API Docs**: `curl https://api.credlink.com/api/docs`
- [ ] **SSL Certificate**: Check HTTPS is working
- [ ] **CloudFront**: Verify CDN is serving requests
- [ ] **Monitoring**: Check CloudWatch metrics
- [ ] **Logs**: Verify logs in CloudWatch Logs
- [ ] **Alerts**: Test alert notifications
- [ ] **Auto-scaling**: Verify ECS tasks scale up/down
- [ ] **Error Tracking**: Check Sentry dashboard

### Performance Testing

```bash
# Load test with Apache Bench
ab -n 1000 -c 10 https://api.credlink.com/health

# Expected results:
# - Requests per second: > 100
# - Time per request: < 100ms
# - Failed requests: 0
```

### Security Audit

- [ ] All secrets in Secrets Manager
- [ ] No hardcoded credentials
- [ ] HTTPS enforced everywhere
- [ ] Security groups properly configured
- [ ] IAM roles follow least privilege
- [ ] CloudFront WAF enabled (optional)

---

## Troubleshooting

### ECS Tasks Not Starting

**Check task logs:**
```bash
aws ecs describe-tasks \
  --cluster credlink-prod \
  --tasks TASK_ARN
```

**Common issues:**
- Secrets Manager permissions
- ECR image pull errors
- Insufficient memory/CPU
- Network configuration

### High Latency

**Check:**
1. CloudFront cache hit rate
2. ALB target health
3. ECS task CPU/memory
4. Database connections
5. Redis cache hit rate

**Solutions:**
- Increase ECS task count
- Optimize database queries
- Increase Redis memory
- Enable CloudFront caching

### 5XX Errors

**Check:**
1. Application logs in CloudWatch
2. Sentry error dashboard
3. ECS task health
4. Database connectivity

**Debug:**
```bash
# View recent errors
aws logs tail /ecs/credlink-api --follow --filter-pattern "ERROR"

# Check Sentry
open https://sentry.io/organizations/credlink/issues/
```

### Memory Leaks

**Monitor:**
```bash
# Check memory usage
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name MemoryUtilization \
  --dimensions Name=ServiceName,Value=credlink-api \
  --start-time 2025-01-01T00:00:00Z \
  --end-time 2025-01-02T00:00:00Z \
  --period 300 \
  --statistics Average
```

**Fix:**
- Enable garbage collection logging
- Increase task memory
- Fix memory leaks in code

---

## Rollback Procedure

### Quick Rollback

```bash
# Rollback to previous task definition
aws ecs update-service \
  --cluster credlink-prod \
  --service credlink-api \
  --task-definition credlink-api:PREVIOUS_REVISION

# Wait for deployment
aws ecs wait services-stable \
  --cluster credlink-prod \
  --services credlink-api
```

### Full Rollback

```bash
# Rollback infrastructure
cd infra/terraform
terraform apply -var-file=production.tfvars -target=module.ecs

# Rollback application
cd infra/scripts
./deploy-ecs.sh production --tag=v1.0.0
```

---

## Maintenance

### Regular Tasks

**Daily:**
- Check CloudWatch alarms
- Review Sentry errors
- Monitor costs

**Weekly:**
- Review performance metrics
- Update dependencies
- Backup configurations

**Monthly:**
- Security patches
- Cost optimization
- Capacity planning

### Backup Strategy

**Automated:**
- ECS task definitions (versioned)
- CloudFormation stacks (versioned)
- Terraform state (S3 with versioning)
- Application logs (30-day retention)

**Manual:**
- Configuration files (Git)
- Secrets (encrypted backup)
- Documentation (Git)

---

## Support

### Escalation Path

1. **Level 1**: Check logs and metrics
2. **Level 2**: Review Sentry and CloudWatch
3. **Level 3**: Contact DevOps team
4. **Level 4**: Engage AWS Support

### Useful Commands

```bash
# View service status
aws ecs describe-services --cluster credlink-prod --services credlink-api

# View task details
aws ecs list-tasks --cluster credlink-prod --service-name credlink-api

# View logs
aws logs tail /ecs/credlink-api --follow

# Execute command in container
aws ecs execute-command \
  --cluster credlink-prod \
  --task TASK_ID \
  --container credlink-api \
  --interactive \
  --command "/bin/sh"
```

---

## Additional Resources

- [AWS ECS Documentation](https://docs.aws.amazon.com/ecs/)
- [CloudFront Documentation](https://docs.aws.amazon.com/cloudfront/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Sentry Documentation](https://docs.sentry.io/)

---

**Last Updated**: November 2025  
**Version**: 1.0.0  
**Maintained by**: CredLink DevOps Team
