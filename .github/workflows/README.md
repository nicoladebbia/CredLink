# GitHub Actions Workflows - Phase 4

This directory contains CI/CD workflows for automated testing and deployment.

## Workflows

### Phase 4 CI Pipeline (`phase4-ci.yml`)

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Only when `apps/sign-service/**` changes

**Jobs:**
1. **Lint** - ESLint and TypeScript checks
2. **Unit Tests** - Run unit test suite
3. **Integration Tests** - Run integration test suite
4. **Test Coverage** - Verify 80%+ coverage
5. **Security Scan** - Trivy vulnerability scanning
6. **Docker Build** - Test Docker image builds
7. **CI Success** - Final status check

**Required Secrets:**
- None (runs on public runners)

### Phase 4 CD Pipeline (`phase4-cd.yml`)

**Triggers:**
- Push to `main` branch (auto-deploy)
- Manual workflow dispatch

**Jobs:**
1. **Build & Push** - Build Docker image, push to ECR
2. **Deploy to Staging** - Automatic staging deployment
3. **Deploy to Production** - Manual approval required
4. **Validate Deployment** - Post-deployment checks

**Required Secrets:**
- `AWS_ACCESS_KEY_ID` - AWS credentials for deployment
- `AWS_SECRET_ACCESS_KEY` - AWS secret key

**Environments:**
- `staging` - Automatic deployment from main
- `production` - Requires manual approval

## Setup Instructions

### 1. Configure GitHub Secrets

```bash
# In your GitHub repository:
Settings → Secrets and variables → Actions → New repository secret

Add:
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
```

### 2. Create Environments

```bash
# In your GitHub repository:
Settings → Environments → New environment

Create two environments:
1. "staging" - No protection rules
2. "production" - Add required reviewers
```

### 3. Update Workflow Variables

Edit `.github/workflows/phase4-cd.yml`:

```yaml
env:
  AWS_REGION: us-east-1              # Your AWS region
  ECR_REPOSITORY: credlink-production-app    # From terraform output
  ECS_CLUSTER: credlink-production-cluster   # From terraform output
  ECS_SERVICE: credlink-production-service   # From terraform output
  CONTAINER_NAME: credlink-app       # Container name in task def
```

## Deployment Flow

### Automatic Flow (Main Branch)

```
Push to main
    ↓
CI Pipeline runs (all checks)
    ↓
Build Docker image → Push to ECR
    ↓
Deploy to Staging → Wait for stability
    ↓
Health checks pass
    ↓
[Manual Approval Required]
    ↓
Deploy to Production → Canary strategy
    ↓
Monitor deployment → Rollback on failure
    ↓
Production live ✅
```

### Pull Request Flow

```
Create PR
    ↓
CI Pipeline runs
    ↓
All checks must pass
    ↓
Review and approve
    ↓
Merge to main → Triggers CD
```

## Canary Deployment Strategy

Production deployments use a canary strategy:

1. **Deploy new tasks** (10% of capacity)
2. **Monitor for 5 minutes**
   - Check error rates
   - Check response times
   - Check health endpoints
3. **Increase to 50%** if healthy
4. **Monitor for 5 more minutes**
5. **Deploy to 100%** if healthy
6. **Rollback** if any issues detected

## Rollback Procedure

### Automatic Rollback

The CD pipeline automatically rolls back if:
- Health checks fail
- Deployment doesn't stabilize
- Error rates spike

### Manual Rollback

```bash
# Option 1: Via GitHub Actions
# Go to Actions → Phase 4 - CD Pipeline
# Click "Run workflow" → Select previous successful deployment

# Option 2: Via AWS CLI
aws ecs update-service \
  --cluster credlink-production-cluster \
  --service credlink-production-service \
  --task-definition <previous-task-definition> \
  --force-new-deployment

# Option 3: Via Terraform
cd infra/terraform
terraform apply  # Reverts to infrastructure state
```

## Monitoring Deployments

### Via GitHub Actions

```
1. Go to Actions tab
2. Click on running workflow
3. Watch real-time logs
4. Check job status
```

### Via AWS CloudWatch

```bash
# View ECS service events
aws ecs describe-services \
  --cluster credlink-production-cluster \
  --services credlink-production-service \
  --query 'services[0].events[0:10]'

# Tail application logs
aws logs tail /ecs/credlink-production --follow
```

### Via AWS Console

```
1. Go to ECS → Clusters → credlink-production-cluster
2. Click on service
3. View "Deployments" tab
4. Check "Events" for deployment status
```

## Troubleshooting

### CI Pipeline Fails

**Lint errors:**
```bash
cd apps/sign-service
pnpm lint --fix
```

**Test failures:**
```bash
cd apps/sign-service
pnpm test
```

**Coverage below 80%:**
```bash
cd apps/sign-service
pnpm test:coverage
# Add more tests
```

### CD Pipeline Fails

**ECR login fails:**
- Check AWS credentials are correct
- Verify IAM permissions include ECR access

**ECS deployment fails:**
- Check ECS service exists
- Verify cluster name is correct
- Check IAM role has ECS permissions

**Health checks fail:**
- Check ALB target group health
- View ECS task logs
- Verify application is running

**Image scan finds vulnerabilities:**
- Review Trivy output
- Update vulnerable dependencies
- Rebuild and redeploy

## Best Practices

### For Pull Requests

1. **Wait for CI** - Don't merge until CI passes
2. **Review logs** - Check for warnings
3. **Test locally** - Verify changes work
4. **Keep PRs small** - Easier to review and rollback

### For Deployments

1. **Deploy during business hours** - Team available if issues
2. **Monitor closely** - Watch logs and metrics
3. **Test thoroughly** - Run smoke tests post-deploy
4. **Document changes** - Update CHANGELOG

### For Rollbacks

1. **Act quickly** - Don't wait if issues detected
2. **Communicate** - Notify team immediately
3. **Investigate** - Find root cause
4. **Fix forward** - Deploy fix when ready

## Security Notes

### Secrets Management

- Never commit AWS credentials to git
- Rotate credentials regularly
- Use IAM roles with least privilege
- Enable MFA for AWS console access

### Image Security

- Trivy scans all images for vulnerabilities
- Failed scans don't block deployment (warning only)
- Review security reports regularly
- Update base images monthly

### Access Control

- Limit who can approve production deployments
- Require code review before merge
- Use branch protection rules
- Enable audit logging

## Metrics

### CI Pipeline

- **Duration:** ~5-8 minutes
- **Jobs:** 7 parallel jobs
- **Coverage threshold:** 80%
- **Success rate target:** >95%

### CD Pipeline

- **Build time:** ~3-5 minutes
- **Staging deployment:** ~2-3 minutes
- **Production deployment:** ~10-15 minutes (with canary)
- **Total time:** ~15-25 minutes (main to production)

## Future Enhancements

- [ ] Add performance testing (Week 7)
- [ ] Add load testing before production (Week 7)
- [ ] Integrate with Datadog/New Relic (Week 5)
- [ ] Add automated rollback triggers (Week 5)
- [ ] Implement blue-green deployments
- [ ] Add chaos engineering tests (Week 8)
- [ ] Set up deployment notifications (Slack/PagerDuty)

## Support

**Issues:** Open a GitHub issue  
**Questions:** Check #devops Slack channel  
**Urgent:** Contact DevOps on-call via PagerDuty
