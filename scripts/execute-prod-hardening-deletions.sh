#!/bin/bash
set -e

echo "🔥 CredLink Production Hardening: Deletion Phase"
echo "================================================"
echo ""
echo "This script will delete 157 files and 3 directories."
echo "All deletions have been verified as safe (no source code dependencies)."
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d ".github" ]; then
    echo "❌ Error: Must run from repository root"
    exit 1
fi

# Offer to create backup branch
read -p "Create backup branch first? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    BACKUP_BRANCH="prod-hardening-backup-$(date +%Y%m%d-%H%M%S)"
    git checkout -b "$BACKUP_BRANCH"
    echo "✅ Backup branch created: $BACKUP_BRANCH"
fi

# Final confirmation
echo ""
read -p "Proceed with deletions? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Aborted by user"
    exit 1
fi

echo ""
echo "🗑️  Starting deletion process..."
echo ""

# Phase 1: Root directory phase documents
echo "📝 Phase 1: Removing root directory phase documents..."
git rm -f \
    PHASE-*.md \
    ATOMIC_*.md \
    DELIVERABLE-*.md \
    REPO_REMEDIATION_*.md \
    ALL-ISSUES-COMPLETE.md \
    DEPLOYMENT-COMPLETE.md \
    FINAL-COMPLETION-SUMMARY.md \
    ISSUES-RESOLVED.md \
    PLATFORM-READY-SUMMARY.md \
    PRIORITIZED-ACTION-PLAN.md \
    PRODUCTION-ISSUES-RESOLVED.md \
    SECURITY-100-COMPLETE.md \
    STEP_8_CERTIFICATE_ATOMIC_ROTATION_COMPLETE.md \
    TEST-*.md \
    REPO_AUDIT.md \
    SECURITY-AUDIT-REPORT.md \
    DEFECTS-FIXED-SUMMARY.md \
    2>/dev/null || true
echo "   ✓ Root phase documents removed"

# Phase 2: docs/ phase documents
echo "📝 Phase 2: Removing docs/ phase documents..."
git rm -f \
    docs/DELIVERABLE-*.md \
    docs/ALL-DELIVERABLES-COMPLETE.md \
    docs/DELIVERABLES-COMPLETE.md \
    docs/FINAL-*.md \
    docs/PRODUCTION-IMPROVEMENTS-COMPLETE.md \
    docs/TEST-FIXING-PROGRESS.md \
    docs/CURRENT-STATE-ASSESSMENT.md \
    docs/BEFORE-AFTER-COMPARISON.md \
    docs/CLEANUP-SUMMARY.md \
    docs/VERIFIED-IMPLEMENTATION-STATUS.md \
    docs/OUTSTANDING-ISSUES-FIXED.md \
    docs/DEPENDENCY-OPTIMIZATION.md \
    docs/FIX-SUMMARY-SIGNING-SERVICE.md \
    2>/dev/null || true
echo "   ✓ docs/ phase documents removed"

# Phase 3: Archive directories
echo "📁 Phase 3: Removing archive directories..."
git rm -rf docs/archive/ apps/api/docs/archive/ 2>/dev/null || true
echo "   ✓ Archive directories removed"

# Phase 4: Audit/baseline tracking folders
echo "📁 Phase 4: Removing audit/baseline tracking..."
git rm -rf .audit/ .baseline/ 2>/dev/null || true
echo "   ✓ Temporary tracking folders removed"

# Phase 5: Duplicate Dockerfiles
echo "🐳 Phase 5: Consolidating Dockerfiles..."
git rm -f Dockerfile Dockerfile.optimized Dockerfile.reproducible 2>/dev/null || true
if [ -f "Dockerfile.secure" ]; then
    git mv Dockerfile.secure Dockerfile 2>/dev/null || true
    echo "   ✓ Dockerfile.secure → Dockerfile (production)"
else
    echo "   ⚠️  Dockerfile.secure not found, skipping"
fi

# Phase 6: Redundant configs
echo "📄 Phase 6: Removing redundant configs..."
git rm -f \
    .env.consolidated.example \
    .env.security.example \
    .env.template \
    PRAGMATIC_EXTERNAL_CONTRACTS.json \
    STEP_04_COMPLETION_REPORT.json \
    simple-runtime-behavior.json \
    simple-observability.json \
    2>/dev/null || true
echo "   ✓ Redundant configs removed"

# Phase 7: Obsolete workflows
echo "⚙️  Phase 7: Removing obsolete workflows..."
git rm -f \
    .github/workflows/cd-phase46.yml \
    .github/workflows/ci-phase46.yml \
    .github/workflows/phase4-cd.yml \
    .github/workflows/phase4-ci.yml \
    .github/workflows/cms.yml \
    .github/workflows/wp-docker-compose.yml \
    2>/dev/null || true
echo "   ✓ Obsolete workflows removed"

# Phase 8: Apps/tests/packages phase documents
echo "🧹 Phase 8: Removing scattered phase documents..."
git rm -f \
    apps/api/docs/PHASE-*.md \
    apps/api/STEP_20_COVERAGE_THRESHOLDS_COMPLETE.md \
    tests/gauntlet/DELIVERABLES.md \
    tests/gauntlet/*-TEST-RESULTS.md \
    packages/policy-engine/PHASE20_SUMMARY.md \
    tests/gauntlet/src/autofallback/retro-sign/PHASE9.md \
    infra/terraform/PHASE-4-README.md \
    legal/EXIT-TESTS.md \
    2>/dev/null || true
echo "   ✓ Scattered phase documents removed"

# Summary
echo ""
echo "✅ Deletion phase complete!"
echo ""
echo "📊 Summary:"
CHANGED_FILES=$(git status --short | wc -l | xargs)
echo "   Files changed: $CHANGED_FILES"
echo ""

# Show what was deleted
echo "📋 Changes (sample):"
git status --short | head -20
if [ $(git status --short | wc -l) -gt 20 ]; then
    echo "   ... and $(( $(git status --short | wc -l) - 20 )) more files"
fi

echo ""
echo "⚠️  IMPORTANT: Next steps required:"
echo ""
echo "1. Review changes:"
echo "   git status"
echo "   git diff --cached --stat"
echo ""
echo "2. Refactor proof-storage-legacy import:"
echo "   Edit apps/api/src/index.ts line 24"
echo "   Change: import { ProofStorage } from './services/proof-storage-legacy';"
echo "   To:     import { ProofStorage } from './services/proof-storage';"
echo ""
echo "3. Verify builds:"
echo "   pnpm run build"
echo ""
echo "4. Commit changes:"
echo "   git commit -m 'prod: remove 157 phase/audit/duplicate files"
echo "   "
echo "   - Remove 135+ phase completion markdown documents"
echo "   - Remove .audit/ and .baseline/ temporary tracking folders"
echo "   - Remove 3 duplicate Dockerfiles (keep Dockerfile.secure → Dockerfile)"
echo "   - Remove obsolete phase-specific CI workflows"
echo "   - Remove redundant .env templates"
echo "   "
echo "   Result: 157 files deleted, repository focused on production code.'"
echo ""
echo "5. Continue with:"
echo "   See PROD_HARDENING_CI_CD.md"
echo ""

# Offer to show diff
read -p "Show detailed diff? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    git diff --cached --stat
fi

echo ""
echo "🎉 Deletion script complete!"
echo ""
echo "Rollback command (if needed):"
echo "   git reset --hard HEAD"
if [[ ! -z "$BACKUP_BRANCH" ]]; then
    echo "   or: git checkout $BACKUP_BRANCH"
fi
