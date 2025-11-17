# Production Hardening: CI/CD Workflows
## GitHub Actions for Production Deployment

**Goal:** Replace 16 fragmented workflows with 8 production-grade pipelines  
**Stack:** Node.js 20+, pnpm, Turbo, TypeScript  
**Deployment:** Staging → Production with approvals  

---

## 🎯 Current State Analysis

### Existing Workflows (16 files)
```
✅ KEEP & ENHANCE:
- ci.yml (base CI)
- security-scan.yml (SAST/secrets)
- terraform-ci.yml (infrastructure)
- release.yml (versioning)
- survival.yml (acceptance tests)

❌ DELETE (obsolete/duplicate):
- cd-phase46.yml, ci-phase46.yml (phase-specific)
- phase4-cd.yml, phase4-ci.yml (phase-specific)
- cms.yml, wp-docker-compose.yml (not core)

🔄 CONSOLIDATE:
- build-sign-attest.yml → integrate into ci.yml
- bundle-size-monitor.yml → integrate into ci.yml
- feature-check.yml → integrate into ci.yml
```

---

## 📋 Production Workflow Architecture

### 1. **ci.yml** - Core CI Pipeline
**Trigger:** PR, push to main/develop  
**Purpose:** Build, test, lint, type-check with Turbo caching

```yaml
name: CI Pipeline

on:
  pull_request:
  push:
    branches: [main, develop]
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '20'
  PNPM_VERSION: '9.0.0'
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}

jobs:
  setup:
    runs-on: ubuntu-latest
    outputs:
      pnpm-cache: ${{ steps.pnpm-cache.outputs.dir }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}
      
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      
      - name: Get pnpm store directory
        id: pnpm-cache
        run: echo "dir=$(pnpm store path)" >> $GITHUB_OUTPUT
      
      - name: Setup Turbo cache
        uses: actions/cache@v4
        with:
          path: .turbo
          key: ${{ runner.os }}-turbo-${{ github.sha }}
          restore-keys: |
            ${{ runner.os }}-turbo-

  lint:
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run type-check

  test:
    needs: setup
    runs-on: ubuntu-latest
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      
      - run: pnpm install --frozen-lockfile
      - name: Run tests (shard ${{ matrix.shard }}/4)
        run: pnpm run test:ci --shard=${{ matrix.shard }}/4
      
      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: ./coverage/coverage-final.json
          flags: shard-${{ matrix.shard }}

  build:
    needs: [lint, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      
      - name: Check bundle size
        run: |
          pnpm exec bundlewatch --config .bundlewatch.json
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-artifacts
          path: |
            apps/*/dist
            packages/*/dist
          retention-days: 7
```

### 2. **security-scan.yml** - SAST & Dependency Audits
**Trigger:** PR, push, schedule (daily)  
**Purpose:** CodeQL, secret scanning, dependency vulnerabilities

```yaml
name: Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
  schedule:
    - cron: '0 8 * * 1' # Weekly on Monday
  workflow_dispatch:

jobs:
  codeql:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      
      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: javascript, typescript
          queries: security-extended
      
      - name: Autobuild
        uses: github/codeql-action/autobuild@v3
      
      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3

  secret-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Gitleaks scan
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  dependency-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9.0.0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit --audit-level moderate
      
      - name: Check for high/critical vulns
        run: |
          pnpm audit --json | jq '.vulnerabilities | to_entries[] | select(.value.severity | IN("high", "critical"))' > vulns.json
          if [ -s vulns.json ]; then
            echo "❌ High/critical vulnerabilities found"
            cat vulns.json
            exit 1
          fi
```

### 3. **cd.yml** - Continuous Deployment
**Trigger:** Push to main (after CI passes)  
**Purpose:** Deploy to staging → production with approvals

```yaml
name: Continuous Deployment

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy'
        required: true
        type: choice
        options:
          - staging
          - production

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    environment:
      name: staging
      url: https://staging.credlink.com
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN_STAGING }}
          aws-region: us-east-1
      
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      
      - name: Build Docker image
        run: |
          docker build -t credlink-api:${{ github.sha }} -f Dockerfile .
          docker tag credlink-api:${{ github.sha }} ${{ secrets.ECR_REGISTRY }}/credlink-api:staging
      
      - name: Push to ECR
        run: |
          aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ${{ secrets.ECR_REGISTRY }}
          docker push ${{ secrets.ECR_REGISTRY }}/credlink-api:staging
      
      - name: Deploy to ECS
        run: |
          aws ecs update-service --cluster credlink-staging --service api --force-new-deployment
      
      - name: Wait for deployment
        run: |
          aws ecs wait services-stable --cluster credlink-staging --services api
      
      - name: Smoke test
        run: |
          curl -f https://staging.credlink.com/health || exit 1

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    if: github.event_name == 'workflow_dispatch' && github.event.inputs.environment == 'production'
    environment:
      name: production
      url: https://api.credlink.com
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN_PRODUCTION }}
          aws-region: us-east-1
      
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      
      - name: Build Docker image
        run: |
          docker build -t credlink-api:${{ github.sha }} -f Dockerfile .
          docker tag credlink-api:${{ github.sha }} ${{ secrets.ECR_REGISTRY }}/credlink-api:${{ github.sha }}
          docker tag credlink-api:${{ github.sha }} ${{ secrets.ECR_REGISTRY }}/credlink-api:latest
      
      - name: Push to ECR
        run: |
          aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ${{ secrets.ECR_REGISTRY }}
          docker push ${{ secrets.ECR_REGISTRY }}/credlink-api:${{ github.sha }}
          docker push ${{ secrets.ECR_REGISTRY }}/credlink-api:latest
      
      - name: Deploy to ECS (blue-green)
        run: |
          # Create new task definition with new image
          TASK_DEF=$(aws ecs describe-task-definition --task-definition credlink-api --query 'taskDefinition' | jq --arg IMAGE "${{ secrets.ECR_REGISTRY }}/credlink-api:${{ github.sha }}" '.containerDefinitions[0].image = $IMAGE')
          NEW_TASK_DEF=$(aws ecs register-task-definition --cli-input-json "$TASK_DEF" --query 'taskDefinition.taskDefinitionArn' --output text)
          
          # Update service with new task definition
          aws ecs update-service --cluster credlink-production --service api --task-definition $NEW_TASK_DEF
      
      - name: Wait for deployment
        run: |
          aws ecs wait services-stable --cluster credlink-production --services api --max-attempts 20 --delay 30
      
      - name: Health check
        run: |
          for i in {1..10}; do
            if curl -f https://api.credlink.com/health; then
              echo "✅ Health check passed"
              exit 0
            fi
            echo "Attempt $i failed, retrying..."
            sleep 10
          done
          exit 1
      
      - name: Rollback on failure
        if: failure()
        run: |
          echo "❌ Deployment failed, rolling back..."
          PREV_TASK=$(aws ecs describe-services --cluster credlink-production --services api --query 'services[0].taskDefinition' --output text)
          aws ecs update-service --cluster credlink-production --service api --task-definition $PREV_TASK
```

### 4. **release.yml** - Semantic Versioning & Changelog

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Generate changelog
        id: changelog
        run: |
          git log --pretty=format:"- %s (%h)" $(git describe --tags --abbrev=0 HEAD^)..HEAD > CHANGELOG.txt
      
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          body_path: CHANGELOG.txt
          generate_release_notes: true
          draft: false
          prerelease: ${{ contains(github.ref, '-rc') || contains(github.ref, '-beta') }}
```

---

## 🔐 GitHub Secrets & Variables Required

### Secrets
```bash
# AWS (for OIDC)
AWS_ROLE_ARN_STAGING=arn:aws:iam::ACCOUNT:role/credlink-staging-deployer
AWS_ROLE_ARN_PRODUCTION=arn:aws:iam::ACCOUNT:role/credlink-production-deployer
ECR_REGISTRY=ACCOUNT.dkr.ecr.us-east-1.amazonaws.com

# Turbo (for caching)
TURBO_TOKEN=<turborepo-token>

# Codecov (for coverage reports)
CODECOV_TOKEN=<codecov-token>
```

### Variables
```bash
TURBO_TEAM=credlink
```

---

## 🛡️ Branch Protection Rules

**Apply to:** `main` and `develop`

```yaml
protection_rules:
  required_status_checks:
    strict: true
    checks:
      - "lint"
      - "test (1)"
      - "test (2)"
      - "test (3)"
      - "test (4)"
      - "build"
      - "security-scan / codeql"
      - "security-scan / secret-scan"
      - "security-scan / dependency-audit"
  
  required_pull_request_reviews:
    required_approving_review_count: 1
    dismiss_stale_reviews: true
    require_code_owner_reviews: true
  
  enforce_admins: true
  require_linear_history: true
  allow_force_pushes: false
  allow_deletions: false
```

---

## 📦 Dependabot Configuration

**File:** `.github/dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 10
    reviewers:
      - "credlink/backend-team"
    groups:
      production-dependencies:
        patterns:
          - "*"
        exclude-patterns:
          - "@types/*"
          - "eslint*"
          - "prettier"
      development-dependencies:
        dependency-type: "development"
        patterns:
          - "*"
  
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 5
```

---

## 👥 CODEOWNERS

**File:** `.github/CODEOWNERS`

```
# Default owners
* @credlink/backend-team

# Infrastructure
/infra/ @credlink/devops-team
/.github/workflows/ @credlink/devops-team
/Dockerfile @credlink/devops-team

# Security-sensitive files
/apps/api/src/middleware/auth.ts @credlink/security-team
/apps/api/src/services/*-manager*.ts @credlink/security-team
/packages/rbac/ @credlink/security-team

# Documentation
/docs/ @credlink/docs-team
*.md @credlink/docs-team
```

---

## 🚀 Deployment Strategy

### Staging Environment
- **Trigger:** Automatic on push to `main`
- **Purpose:** Integration testing, QA validation
- **Rollback:** Automatic on failed health checks
- **URL:** https://staging.credlink.com

### Production Environment
- **Trigger:** Manual approval via GitHub UI
- **Purpose:** Customer-facing production
- **Rollback:** Automatic on failed health checks + manual option
- **URL:** https://api.credlink.com
- **Strategy:** Blue-green deployment with ECS task definitions

---

## ✅ Verification

```bash
# 1. Validate workflow syntax
for file in .github/workflows/*.yml; do
  yamllint $file
done

# 2. Test locally with act (GitHub Actions simulator)
act -l  # List jobs
act pull_request  # Simulate PR

# 3. Verify secrets are configured
gh secret list

# 4. Check branch protection
gh api repos/:owner/:repo/branches/main/protection

# 5. Test deployment (staging)
gh workflow run cd.yml --ref main
```

---

**Next:** [PROD_HARDENING_SECURITY.md](./PROD_HARDENING_SECURITY.md)
