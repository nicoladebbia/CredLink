# Phase 46: Branch Protection & Environment Setup

Complete setup guide for GitHub branch protections, required checks, and deployment environments.

## 1. Branch Protection Rules

### Protected Branches
- `main`
- `release/*`

### Steps to Configure (GitHub UI)

1. **Navigate to Settings**
   - Go to repository → Settings → Branches
   - Click "Add branch protection rule"

2. **Configure `main` branch protection**

   **Branch name pattern**: `main`
   
   ✅ **Require a pull request before merging**
   - Require approvals: **2**
   - Dismiss stale pull request approvals when new commits are pushed
   - Require review from Code Owners (CODEOWNERS file)
   
   ✅ **Require status checks to pass before merging**
   - Require branches to be up to date before merging
   - Status checks that are required:
     - `lint` (from ci-phase46.yml)
     - `unit` (from ci-phase46.yml)
     - `build` (from ci-phase46.yml)
     - `integration` (from ci-phase46.yml)
     - `survival-harness` (from ci-phase46.yml) **← BLOCKING GATE**
     - `security` (from ci-phase46.yml)
   
   ✅ **Require conversation resolution before merging**
   
   ✅ **Require signed commits**
   
   ✅ **Require linear history** (optional but recommended)
   
   ✅ **Do not allow bypassing the above settings**
   - Include administrators
   
   ❌ **Allow force pushes** (disabled)
   
   ❌ **Allow deletions** (disabled)

3. **Configure `release/*` branch protection**

   **Branch name pattern**: `release/*`
   
   Same settings as `main`, with additional:
   
   ✅ **Restrict who can push to matching branches**
   - Only allow: Release team, CI/CD bot

## 2. GitHub Environments

Required environments for CD pipeline with manual approvals.

### Create Environments

1. **Navigate to Environments**
   - Go to repository → Settings → Environments
   - Click "New environment"

### Environment 1: `staging`

**Name**: `staging`

**Deployment branches**: Selected branches
- `main`

**Environment secrets**:
- `CLOUDFLARE_API_TOKEN` (staging token)
- `CLOUDFLARE_ACCOUNT_ID`

**Protection rules**:
- Wait timer: 0 minutes (auto-deploy)
- Required reviewers: None

**Environment URL**: `https://staging.c2concierge.dev`

### Environment 2: `prod-canary`

**Name**: `prod-canary`

**Deployment branches**: Selected branches
- `main`

**Environment secrets**:
- `CLOUDFLARE_API_TOKEN` (prod token)
- `CLOUDFLARE_ACCOUNT_ID`

**Protection rules**:
- Wait timer: 10 minutes (bake period)
- Required reviewers: **1 reviewer from ops team**

**Environment URL**: `https://c2concierge.dev`

### Environment 3: `prod`

**Name**: `prod`

**Deployment branches**: Selected branches
- `main`
- `release/*`

**Environment secrets**:
- `CLOUDFLARE_API_TOKEN` (prod token)
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_WORKER_NAME`

**Protection rules**:
- Wait timer: 0 minutes
- Required reviewers: **2 reviewers from [ops team, engineering leads]**

**Environment URL**: `https://c2concierge.dev`

## 3. GitHub Teams & CODEOWNERS

### Required Teams

Create the following teams in GitHub organization:

1. **@CredLink/core-team**
   - Role: Maintain
   - Members: Engineering leads, architects

2. **@CredLink/security-team**
   - Role: Maintain
   - Members: Security engineers, AppSec team

3. **@CredLink/backend-team**
   - Role: Write
   - Members: Backend engineers

4. **@CredLink/infra-team**
   - Role: Write
   - Members: DevOps, SRE, Platform engineers

5. **@CredLink/db-team**
   - Role: Write
   - Members: Database engineers, DBA

6. **@CredLink/sre-team**
   - Role: Write
   - Members: SRE, on-call engineers

7. **@CredLink/qa-team**
   - Role: Write
   - Members: QA engineers, test engineers

### CODEOWNERS Configuration

The `.github/CODEOWNERS` file has been created with appropriate ownership rules.

**Verification**:
```bash
# Check CODEOWNERS syntax
cat .github/CODEOWNERS | grep -v "^#" | grep -v "^$"
```

## 4. Required Status Checks

Configure these status checks to be required before merge:

### From `ci-phase46.yml`
- ✅ `lint` - ESLint and TypeScript checks
- ✅ `unit` - Unit test suite
- ✅ `build` - Build verification
- ✅ `integration` - Integration tests (API, storage, worker)
- ✅ `survival-harness` - **BLOCKING GATE** (≥99.9% remote survival)
- ✅ `security` - Security audit

### GitHub Settings Path
1. Repository → Settings → Branches
2. Edit branch protection rule for `main`
3. Enable "Require status checks to pass before merging"
4. Search and select each status check name
5. Enable "Require branches to be up to date before merging"

## 5. Signed Commits Setup

### Configure GPG signing

**For team members**:
```bash
# Generate GPG key
gpg --full-generate-key

# List keys
gpg --list-secret-keys --keyid-format LONG

# Export public key
gpg --armor --export YOUR_KEY_ID

# Add to GitHub: Settings → SSH and GPG keys → New GPG key
```

**Configure Git**:
```bash
git config --global user.signingkey YOUR_KEY_ID
git config --global commit.gpgsign true
git config --global tag.gpgsign true
```

**For CI/CD bot**:
- Use GitHub's automatic commit signing
- Or configure bot GPG key in Actions secrets

## 6. Workflow Permissions

### Repository Settings → Actions → General

**Workflow permissions**:
- Read and write permissions
- Allow GitHub Actions to create and approve pull requests: **Disabled**

**Fork pull request workflows**:
- Require approval for all outside collaborators: **Enabled**

## 7. Release Train Schedule

Configure release train cadence in project management tool (Linear, Jira, etc.)

**Weekly Release Train**:
- **Day**: Every Tuesday
- **Cut-off**: Monday 5 PM UTC
- **Deploy window**: Tuesday 10 AM - 2 PM UTC
- **Rollback window**: Tuesday 2 PM - Thursday 5 PM UTC

**Hotfix Lane**:
- Emergency fixes only
- Requires: CTO or VP Engineering approval
- Must include canary deployment
- Minimum 30-minute bake period

## 8. Incident Correlation Setup

### Link releases to monitoring

**Datadog/New Relic**:
```bash
# Add deployment marker after each release
curl -X POST "https://api.datadoghq.com/api/v1/events" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -d '{
    "title": "Deployment: '$RELEASE_SHA'",
    "text": "Deployed version '$RELEASE_SHA' to production",
    "tags": ["deployment", "phase46"]
  }'
```

**GitHub API**:
- Already tracked via `cd-phase46.yml` workflow
- Deployment artifacts uploaded with metadata

## 9. Verification Checklist

After setup, verify all protections are active:

```bash
# Clone fresh
git clone git@github.com:org/CredLink.git test-clone
cd test-clone

# Try to push to main (should fail)
git checkout main
echo "test" >> README.md
git commit -am "test: direct push"
git push origin main
# Expected: ERROR - branch protection rules

# Try unsigned commit on branch (should fail on PR)
git checkout -b test-unsigned
git commit --no-gpg-sign -am "test: unsigned"
git push origin test-unsigned
# Expected: PR fails status check if unsigned commits required

# Verify required checks
gh pr create --title "Test PR" --body "Testing branch protections"
# Expected: Shows required checks: lint, unit, build, integration, survival-harness, security
```

## 10. Emergency Bypass Procedure

**ONLY for production incidents**:

1. **Incident declared** by on-call lead
2. **Approval required** from:
   - CTO or VP Engineering
   - Security lead (for security incidents)
3. **Document bypass** in incident report
4. **Temporary disable** protection rules
5. **Apply hotfix**
6. **Re-enable** protections immediately
7. **Post-incident review** why bypass was necessary
8. **Prevent recurrence** through process improvements

## 11. Migration from Existing Setup

If you have an existing CI/CD pipeline:

1. **Keep old pipelines active** during transition
2. **Run Phase 46 pipelines in parallel** (non-blocking)
3. **Monitor for 2 release cycles**
4. **Compare metrics**: survival rates, deploy frequency, MTTR
5. **Promote Phase 46 to required** once validated
6. **Deprecate old pipelines**

## 12. Rollback Procedures

See [`docs/phase46-rollback-runbook.md`](./phase46-rollback-runbook.md) for detailed rollback procedures.

## References

- [GitHub Branch Protection Rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/about-protected-branches)
- [GitHub Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
- [GitHub CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
- [Signed Commits](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits)
