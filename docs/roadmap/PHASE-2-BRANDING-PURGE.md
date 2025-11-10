# PHASE 2: COMPLETE BRANDING PURGE (Steps 51-150)

**Timeline:** 3-5 days  
**Owner:** Engineering Lead  
**Score Impact:** 5.0/10 → 5.5/10  
**Goal:** Remove ALL 325+ references to old "c2concierge" branding

---

## 🎯 THE CRITICAL PROBLEM

**Current state:** 325+ references to "c2concierge" remain in codebase

**Impact:**
```bash
# When deployed, production will show:
ps aux | grep c2
c2concierge   1234  0.1  2.3  ...  node /app/index.js  # ❌ WRONG

# Signals to customers/investors:
"They didn't care enough to finish the rebrand"
```

**Files explicitly called out in feedback:**
- `Dockerfile.reproducible`: 8 refs (CRITICAL - production image)
- `/core/c2pa-audit/phase33-reverse-lab/config/providers.ts`: 5 refs
- `/plugins/shopify-app/src/sign-worker.ts`: 1 ref
- `/tests/acceptance/tests/dr-acceptance-tests.ts`: 3 refs
- 308+ other scattered references

---

## STEPS 51-70: AUTOMATED DISCOVERY

### Create Branding Audit

```bash
# 51-54: Run comprehensive grep
grep -r "c2concierge\|c2-concierge\|c2Concierge\|C2Concierge\|C2CONCIERGE" . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --include="*.ts" \
  --include="*.js" \
  --include="*.json" \
  --include="*.md" \
  --include="Dockerfile*" \
  --include="*.yml" \
  --include="*.yaml" \
  --include="*.sh" \
  > branding-audit.txt

# Also check c2c (but not c2pa)
grep -r "c2c[^p]" . \
  --exclude-dir=node_modules \
  --include="*.ts" \
  --include="*.js" \
  >> branding-audit.txt

# Count total
wc -l branding-audit.txt
# Current: 325+ lines
# Target: 0 lines
```

### Categorize by Severity

```bash
# 55-60: Parse into priority buckets
mkdir -p branding-fixes

# CRITICAL: Docker (affects production)
grep "Dockerfile" branding-audit.txt > branding-fixes/critical-docker.txt

# HIGH: Code files  
grep -E "\.(ts|js):" branding-audit.txt > branding-fixes/high-code.txt

# HIGH: Config files
grep -E "\.(json|yml|yaml):" branding-audit.txt > branding-fixes/high-config.txt

# MEDIUM: Tests
grep "test" branding-audit.txt > branding-fixes/medium-tests.txt

# LOW: Documentation
grep "\.md:" branding-audit.txt > branding-fixes/low-docs.txt
```

### Create Fix Scripts

```bash
# 61-70: Automated fix scripts
cd branding-fixes

# Script 1: Docker files (MOST CRITICAL)
cat > 01-docker.sh << 'SCRIPT'
#!/bin/bash
set -e
echo "🔧 Fixing Docker files..."

# Dockerfile.reproducible (CRITICAL)
sed -i '' 's/c2concierge/credlink/g' ../Dockerfile.reproducible
sed -i '' 's/c2-concierge/credlink/g' ../Dockerfile.reproducible

# Regular Dockerfile
if [ -f ../Dockerfile ]; then
  sed -i '' 's/c2concierge/credlink/g' ../Dockerfile
fi

# docker-compose.yml
if [ -f ../docker-compose.yml ]; then
  sed -i '' 's/c2concierge/credlink/g' ../docker-compose.yml
fi

echo "✅ Docker files fixed"
SCRIPT

# Script 2: TypeScript/JavaScript
cat > 02-typescript.sh << 'SCRIPT'
#!/bin/bash
set -e
echo "🔧 Fixing TypeScript/JavaScript..."

find .. -type f \( -name "*.ts" -o -name "*.js" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -exec sed -i '' 's/c2concierge/credlink/g' {} \; \
  -exec sed -i '' 's/c2-concierge/credlink/g' {} \; \
  -exec sed -i '' 's/C2Concierge/CredLink/g' {} \; \
  -exec sed -i '' 's/C2CONCIERGE/CREDLINK/g' {} \;

echo "✅ TypeScript/JavaScript fixed"
SCRIPT

# Script 3: Config files
cat > 03-configs.sh << 'SCRIPT'
#!/bin/bash
set -e
echo "🔧 Fixing config files..."

find .. -type f \( -name "*.json" -o -name "*.yml" -o -name "*.yaml" \) \
  -not -path "*/node_modules/*" \
  -exec sed -i '' 's/c2concierge/credlink/g' {} \; \
  -exec sed -i '' 's/c2-concierge/credlink/g' {} \; \
  -exec sed -i '' 's/@c2concierge/@credlink/g' {} \;

echo "✅ Config files fixed"
SCRIPT

# Script 4: Tests
cat > 04-tests.sh << 'SCRIPT'
#!/bin/bash
set -e
echo "🔧 Fixing test files..."

find .. -type f \( -name "*.test.ts" -o -name "*.spec.ts" -o -name "*.test.js" \) \
  -not -path "*/node_modules/*" \
  -exec sed -i '' 's/c2concierge/credlink/g' {} \; \
  -exec sed -i '' 's/c2-concierge/credlink/g' {} \;

echo "✅ Test files fixed"
SCRIPT

# Script 5: Documentation
cat > 05-docs.sh << 'SCRIPT'
#!/bin/bash
set -e
echo "🔧 Fixing documentation..."

find .. -type f -name "*.md" \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -exec sed -i '' 's/c2concierge/credlink/g' {} \; \
  -exec sed -i '' 's/c2-concierge/credlink/g' {} \; \
  -exec sed -i '' 's/C2Concierge/CredLink/g' {} \;

echo "✅ Documentation fixed"
SCRIPT

# Script 6: Verification
cat > verify.sh << 'SCRIPT'
#!/bin/bash
COUNT=$(grep -r "c2concierge\|c2-concierge" .. \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=branding-fixes \
  | wc -l | tr -d ' ')

if [ "$COUNT" -eq 0 ]; then
  echo "✅ SUCCESS: Zero old brand references found"
  exit 0
else
  echo "❌ FAILURE: $COUNT old brand references still exist:"
  grep -r "c2concierge\|c2-concierge" .. \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=branding-fixes
  exit 1
fi
SCRIPT

# Make all executable
chmod +x *.sh
```

---

## STEPS 71-100: FIX CRITICAL FILES

### Docker Files (HIGHEST PRIORITY)

**71-72: Dockerfile.reproducible**
```dockerfile
# BEFORE (WRONG):
FROM node:18-alpine
RUN adduser -S c2concierge:nodejs  ❌
WORKDIR /app
COPY . .
RUN chown c2concierge /app  ❌
USER c2concierge  ❌
CMD ["node", "index.js"]

# AFTER (CORRECT):
FROM node:18-alpine
RUN adduser -S credlink:nodejs  ✅
WORKDIR /app
COPY . .
RUN chown credlink /app  ✅
USER credlink  ✅
CMD ["node", "index.js"]
```

**73-80: Other infrastructure**
- [ ] Dockerfile (regular)
- [ ] docker-compose.yml service names
- [ ] All package.json "name" fields: `@c2concierge/*` → `@credlink/*`
- [ ] pnpm-workspace.yaml references
- [ ] turbo.json task names
- [ ] Makefile targets
- [ ] All shell scripts (*.sh)
- [ ] Environment files (.env.example)

### Code Files (HIGH PRIORITY)

**81-90: Folders and imports**
- [ ] Rename `/plugins/wp-c2concierge/` → `/plugins/wp-credlink/`
- [ ] Remove or rename `/c2-concierge/` folder
- [ ] Fix `/core/c2pa-audit/phase33-reverse-lab/config/providers.ts` (5 refs)
- [ ] Fix `/plugins/shopify-app/src/sign-worker.ts` (1 ref)
- [ ] Fix `/tests/acceptance/tests/dr-acceptance-tests.ts` (3 refs)
- [ ] All imports: `from '@c2concierge/*'` → `from '@credlink/*'`
- [ ] All namespaces: `namespace C2Concierge` → `namespace CredLink`
- [ ] All class names: `class C2ConciergeService` → `class CredLinkService`
- [ ] All constants: `C2C_API_KEY` → `CREDLINK_API_KEY`
- [ ] All function names with old brand

**91-100: Configs and infrastructure**
- [ ] GitHub Actions workflows (.github/workflows/*.yml)
- [ ] GitHub CODEOWNERS
- [ ] Issue templates
- [ ] Kubernetes manifests (/infra/k8s/)
- [ ] Cloudflare wrangler.toml
- [ ] Database migrations
- [ ] SQL scripts
- [ ] Monitoring configs
- [ ] Logging configs
- [ ] CI/CD pipelines

---

## STEPS 101-150: COMPREHENSIVE CLEANUP

### Execute Fix Scripts

```bash
# 101-110: Run in priority order
cd branding-fixes

# 1. Docker (CRITICAL)
./01-docker.sh
git add ../Dockerfile* ../docker-compose.yml
git commit -m "fix(docker): Rebrand from c2concierge to credlink in Docker files"

# 2. TypeScript/JavaScript (HIGH)
./02-typescript.sh
git add ../**/*.ts ../**/*.js
git commit -m "fix(code): Rebrand all TypeScript/JavaScript files"

# 3. Configs (HIGH)
./03-configs.sh
git add ../**/*.json ../**/*.yml ../**/*.yaml
git commit -m "fix(config): Rebrand all config files"

# 4. Tests (MEDIUM)
./04-tests.sh
git add ../**/*.test.* ../**/*.spec.*
git commit -m "fix(tests): Rebrand all test files"

# 5. Documentation (LOW)
./05-docs.sh
git add ../**/*.md
git commit -m "fix(docs): Rebrand all documentation"
```

### Verification

```bash
# 111-120: Verify and test
./verify.sh
# Must output: ✅ SUCCESS: Zero old brand references found

# Run tests to ensure nothing broke
cd ..
pnpm install  # Reinstall with new package names
pnpm test     # All tests must pass

# Build Docker image
docker build -t credlink:test -f Dockerfile.reproducible .
# Must succeed

# Verify Docker user
docker run --rm credlink:test ps aux | grep credlink
# Should show credlink user, not c2concierge
```

### Documentation

```bash
# 121-130: Document completion
cat > ../REBRANDING-COMPLETE.md << 'EOF'
# Rebranding Complete ✅

## Summary
- **Date:** [TODAY]
- **Files Changed:** [count from git diff]
- **References Fixed:** 325+
- **Verification:** 0 old brand references

## Verification Command
```bash
grep -r "c2concierge\|c2-concierge" . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  | wc -l
# Output: 0
```

## Critical Fixes
1. ✅ Dockerfile.reproducible (production user account)
2. ✅ All 325+ code references
3. ✅ All config files
4. ✅ All tests
5. ✅ All documentation

## Production Impact
- Docker images run under `credlink` user
- All service names updated
- All imports use new namespaces
- Zero legacy references in production

## Tests Status
- All unit tests: PASSING
- All integration tests: PASSING
- Docker build: SUCCESS
- TypeScript compilation: SUCCESS

## Next Steps
Proceed to Phase 3: Backend Implementation
EOF

# Update CHANGELOG
cat >> ../CHANGELOG.md << 'EOF'
## [Unreleased]

### Fixed
- Complete rebrand from c2concierge to CredLink
- Fixed 325+ references across codebase
- Updated production Docker images to use correct branding
- Fixed all package names, imports, and namespaces
EOF
```

### Final Cleanup

```bash
# 131-140: Clean up audit files
git add branding-fixes/
git add REBRANDING-COMPLETE.md CHANGELOG.md
git commit -m "docs: Complete rebranding documentation

All 325+ references to c2concierge fixed.
Verification: 0 old brand references remain.
All tests passing."

# 141-150: Validate and deploy
# Rebuild all packages
pnpm install --frozen-lockfile
pnpm build

# Run full test suite
pnpm test

# Verify no broken imports
pnpm type-check

# Update documentation
pnpm docs:build  # if exists

# Push changes
git push origin feature/complete-rebrand

# Create PR
gh pr create \
  --title "Complete rebrand: Fix all 325+ c2concierge references" \
  --body "Closes #XXX

## Changes
- Fixed Dockerfile.reproducible (critical)
- Fixed all TypeScript/JavaScript imports
- Fixed all configuration files
- Fixed all tests and documentation
- Verified: 0 old brand references remain

## Verification
\`\`\`bash
grep -r 'c2concierge' . --exclude-dir=node_modules | wc -l
# Output: 0
\`\`\`

## Tests
- ✅ All unit tests passing
- ✅ All integration tests passing
- ✅ Docker build successful
- ✅ TypeScript compilation successful"
```

---

## ✅ PHASE 2 COMPLETION CRITERIA

### Must Verify ALL Before Phase 3:

**Zero Old Brand References**
```bash
grep -r "c2concierge\|c2-concierge" . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  | wc -l
# Must return: 0
```

**All Tests Passing**
```bash
pnpm test
# Must show: All tests passed
```

**Docker Build Success**
```bash
docker build -t credlink:test .
# Must succeed without errors
```

**No Broken Imports**
```bash
pnpm type-check
# Must show: No errors
```

**Documentation Complete**
- [ ] REBRANDING-COMPLETE.md exists
- [ ] CHANGELOG.md updated
- [ ] All commits have clear messages
- [ ] PR created and reviewed

### Scoring
**After Phase 2: 5.0/10 → 5.5/10**
- Consistency: 4/10 → 10/10 (+6)
- Professionalism: 5/10 → 7/10 (+2)
- Overall: 5.0/10 → 5.5/10 (+0.5)

Brand is consistent, but still no working product.

---

## WHAT COMES NEXT

**Critical Path:**
Phase 2 (branding) → **[Phase 3: Backend Implementation](./PHASE-3-BACKEND.md)**

**Phase 3 Preview:**
- Timeline: 4-8 weeks
- Goal: Build /sign and /verify endpoints
- Impact: 5.5/10 → 6.5/10

**You're now ready to build the actual product.**

---

**Complete Phase 2 in 3-5 days maximum. Then immediately begin Phase 3.**
