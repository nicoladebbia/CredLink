# CredLink Branching Strategy

## 🌿 Branch Structure

### **Permanent Branches**

#### `main`
- **Purpose**: Production-ready code
- **Protection**: ✅ Protected, requires PR reviews
- **Deploy**: Automatically deploys to production
- **Rules**: 
  - No direct commits
  - Requires 1 approval
  - Must pass all CI/CD checks

#### `develop`
- **Purpose**: Integration branch for next release
- **Protection**: ✅ Protected, requires PR reviews
- **Deploy**: Automatically deploys to staging
- **Rules**:
  - No direct commits
  - Merge from feature/bugfix branches
  - Must pass all tests

---

## 🚀 Temporary Branches

### **Feature Branches**
```bash
feature/<feature-name>
```

**Examples:**
- `feature/video-signing`
- `feature/mobile-sdk`
- `feature/ai-detection`

**Workflow:**
```bash
# Create from develop
git checkout develop
git pull origin develop
git checkout -b feature/video-signing

# Work on feature
git add .
git commit -m "feat: Add video signing capability"
git push origin feature/video-signing

# Create PR to develop
# After merge, delete branch
git branch -d feature/video-signing
git push origin --delete feature/video-signing
```

**Lifespan:** 1-7 days

---

### **Bugfix Branches**
```bash
bugfix/<bug-description>
```

**Examples:**
- `bugfix/api-compilation-error`
- `bugfix/memory-leak`
- `bugfix/certificate-rotation`

**Workflow:**
```bash
# Create from develop
git checkout develop
git checkout -b bugfix/api-compilation-error

# Fix the bug
git commit -m "fix: Resolve API service compilation errors"
git push origin bugfix/api-compilation-error

# Create PR to develop
```

**Lifespan:** 1-2 days

---

### **Hotfix Branches**
```bash
hotfix/<critical-issue>
```

**Examples:**
- `hotfix/security-vulnerability`
- `hotfix/production-crash`
- `hotfix/data-loss-bug`

**Workflow:**
```bash
# Create from main (emergency!)
git checkout main
git checkout -b hotfix/security-vulnerability

# Fix immediately
git commit -m "hotfix: Patch critical security issue"
git push origin hotfix/security-vulnerability

# Create PR to main AND develop
# Fast-track review and merge
```

**Lifespan:** Hours (emergency only)

---

### **Release Branches**
```bash
release/v<version>
```

**Examples:**
- `release/v1.0.0`
- `release/v1.1.0`
- `release/v2.0.0`

**Workflow:**
```bash
# Create from develop when ready for release
git checkout develop
git checkout -b release/v1.0.0

# Final testing, version bumps, changelog
git commit -m "chore: Prepare v1.0.0 release"

# Merge to main (production)
# Merge back to develop
# Tag the release
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

**Lifespan:** 1-3 days

---

## 📋 Branch Naming Rules

### ✅ Good Names
```bash
feature/add-video-signing-support
bugfix/fix-memory-leak-in-sign-service
hotfix/patch-security-vulnerability
release/v1.2.0
docs/update-api-documentation
refactor/improve-crypto-performance
test/add-integration-tests
```

### ❌ Bad Names
```bash
fix-stuff
test
my-branch
temp
new-feature
update
```

---

## 🔄 Workflow Diagrams

### Standard Feature Development
```
develop
  │
  ├─── feature/video-signing
  │      │
  │      ├─── commit: Add video upload
  │      ├─── commit: Add video validation
  │      └─── commit: Add video signing
  │
  └─── merge PR → develop
```

### Hotfix Workflow
```
main (production)
  │
  ├─── hotfix/security-patch
  │      │
  │      └─── commit: Fix vulnerability
  │
  ├─── merge PR → main (production)
  └─── merge PR → develop (staging)
```

### Release Workflow
```
develop
  │
  ├─── release/v1.0.0
  │      │
  │      ├─── commit: Bump version
  │      ├─── commit: Update changelog
  │      └─── commit: Final testing
  │
  ├─── merge → main (tag v1.0.0)
  └─── merge → develop
```

---

## 🛡️ Branch Protection Rules

### `main` Branch
- ✅ Require pull request reviews (1 reviewer minimum)
- ✅ Require status checks to pass
- ✅ Require branches to be up to date before merging
- ✅ Require conversation resolution before merging
- ❌ Allow force pushes (NEVER)
- ❌ Allow deletions (NEVER)

### `develop` Branch
- ✅ Require pull request reviews (1 reviewer minimum)
- ✅ Require status checks to pass
- ✅ Require branches to be up to date before merging
- ❌ Allow force pushes (NEVER)

---

## 📝 Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
feat:     New feature
fix:      Bug fix
docs:     Documentation changes
style:    Code style changes (formatting)
refactor: Code refactoring
test:     Adding or updating tests
chore:    Maintenance tasks
perf:     Performance improvements
ci:       CI/CD changes
build:    Build system changes
```

**Examples:**
```bash
feat: Add video signing capability
fix: Resolve API service compilation errors
docs: Update architecture documentation
refactor: Improve cryptographic performance
test: Add integration tests for sign service
chore: Update dependencies
hotfix: Patch critical security vulnerability
```

---

## 🧹 Branch Cleanup

### Delete Merged Branches
```bash
# Delete local branch
git branch -d feature/old-feature

# Delete remote branch
git push origin --delete feature/old-feature
```

### List Merged Branches
```bash
# See which branches are merged
git branch --merged

# See which branches are not merged
git branch --no-merged
```

### Prune Deleted Remote Branches
```bash
# Remove references to deleted remote branches
git fetch --prune
```

---

## 🚫 What NOT to Do

### ❌ Never Do These
1. **Direct commits to `main`** - Always use PR
2. **Force push to protected branches** - Destroys history
3. **Long-lived feature branches** - Merge conflicts nightmare
4. **Committing secrets** - Use `.env.example` instead
5. **Vague commit messages** - "fix stuff" is useless
6. **Leaving branches undeleted** - Clutters repository
7. **Working on `main` directly** - Use feature branches

---

## ✅ Best Practices

### 1. Pull Before You Push
```bash
git pull origin develop
git push origin feature/my-feature
```

### 2. Keep Branches Updated
```bash
# Update feature branch with latest develop
git checkout feature/my-feature
git merge develop
```

### 3. Small, Focused Commits
```bash
✅ "feat: Add video upload validation"
✅ "fix: Resolve memory leak in sign service"
❌ "Update everything"
```

### 4. Test Before Pushing
```bash
# Run tests locally
pnpm test
pnpm lint

# Then push
git push origin feature/my-feature
```

### 5. Delete After Merge
```bash
# After PR is merged
git branch -d feature/my-feature
git push origin --delete feature/my-feature
```

---

## 📊 Branch Lifecycle

```
1. Create branch from develop
   ↓
2. Work on feature/bugfix
   ↓
3. Commit changes regularly
   ↓
4. Push to remote
   ↓
5. Create Pull Request
   ↓
6. Code review
   ↓
7. Merge to develop
   ↓
8. Delete branch
```

---

## 🎯 Quick Reference

```bash
# Create feature branch
git checkout develop
git checkout -b feature/my-feature

# Work and commit
git add .
git commit -m "feat: Add new feature"
git push origin feature/my-feature

# Update from develop
git checkout feature/my-feature
git merge develop

# Delete after merge
git branch -d feature/my-feature
git push origin --delete feature/my-feature

# List all branches
git branch -a

# See merged branches
git branch --merged
```

---

*Last Updated: November 18, 2025*  
*CredLink Project - Professional Branch Management*
