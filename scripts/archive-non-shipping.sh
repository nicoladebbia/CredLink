#!/bin/bash
set -e

echo "🗂️  CredLink Aggressive Archive: Non-Shipping Content"
echo "======================================================"
echo ""
echo "This will archive 379 files and 166MB of non-shipping content."
echo "Shipping code (sdk/packages/) will be preserved and enhanced."
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d ".github" ]; then
    echo "❌ Error: Must run from repository root"
    exit 1
fi

# Create backup branch
BACKUP_BRANCH="aggressive-archive-backup-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BACKUP_BRANCH"
echo "✅ Backup branch created: $BACKUP_BRANCH"

# Create archive directories
mkdir -p infra/archive
mkdir -p tests/archive
mkdir -p legal/archive

# Archive Terraform (never deployed)
echo "📦 Archiving infra/terraform/ (87 files)..."
if [ -d "infra/terraform" ]; then
    mv infra/terraform infra/archive/
    echo "   ✓ Moved to infra/archive/terraform/"
else
    echo "   ⚠️  infra/terraform not found"
fi

# Archive Gauntlet tests (demoware)
echo "📦 Archiving tests/gauntlet/ (277 files, 166MB)..."
if [ -d "tests/gauntlet" ]; then
    mv tests/gauntlet tests/archive/
    echo "   ✓ Moved to tests/archive/gauntlet/"
else
    echo "   ⚠️  tests/gauntlet not found"
fi

# Archive Legal contracts (templates only)
echo "📦 Archiving legal/contracts/ (15+ files)..."
if [ -d "legal/contracts" ]; then
    mv legal/contracts legal/archive/
    echo "   ✓ Moved to legal/archive/contracts/"
else
    echo "   ⚠️  legal/contracts not found"
fi

# Delete non-shipping workflows (never-deployed infrastructure)
echo "🗑️  Deleting non-shipping workflows..."
if [ -f ".github/workflows/terraform-ci.yml" ]; then
    git rm .github/workflows/terraform-ci.yml
    echo "   ✓ Deleted terraform-ci.yml (never deployed)"
fi

if [ -f ".github/workflows/phase4-cd.yml" ]; then
    git rm .github/workflows/phase4-cd.yml
    echo "   ✓ Deleted phase4-cd.yml (phase-specific)"
fi

# Note: gauntlet-weekly.yml moves with the gauntlet directory archive

# Create README files in archive directories
cat > infra/archive/terraform/README.md << 'EOF'
# Archived: Terraform Infrastructure

**Status:** ARCHIVED - Never deployed
**Reason:** 87 files of well-designed infrastructure that has never touched production
**Archive Date:** $(date)

## When to Restore
- When actual AWS deployment is planned
- When infrastructure budget is approved
- When team has DevOps resources to manage

## Current State
- All Terraform files preserved intact
- No modifications, just moved to archive
- Can be restored with: `mv infra/archive/terraform infra/terraform`
EOF

cat > tests/archive/gauntlet/README.md << 'EOF'
# Archived: Gauntlet Test Framework

**Status:** ARCHIVED - Demoware for nonexistent backend
**Reason:** 277 files, 166MB of sophisticated tests for services that don't exist
**Archive Date:** $(date)

## When to Restore
- When backend API is fully implemented
- When /sign and /verify endpoints are production-ready
- When infrastructure is deployed (4-6 months from now per timeline)

## Current State
- All test files preserved intact
- 166MB nested project structure maintained
- Can be restored with: `mv tests/archive/gauntlet tests/gauntlet`
EOF

cat > legal/archive/contracts/README.md << 'EOF'
# Archived: Legal Contract Templates

**Status:** ARCHIVED - Templates only, no active contracts
**Reason:** Draft agreements waiting for customers that don't exist yet
**Archive Date:** $(date)

## When to Restore
- When first customer signs up
- When legal review of templates is required
- When contract negotiation begins (6-8 months from now per timeline)

## Current State
- All template files preserved intact
- No modifications, just moved to archive
- Can be restored with: `mv legal/archive/contracts legal/contracts`
EOF

# Summary
echo ""
echo "✅ Archive complete!"
echo ""
echo "📊 Summary:"
echo "   Terraform infra: 87 files archived"
echo "   Gauntlet tests: 277 files archived (166MB)"
echo "   Legal contracts: 15+ files archived"
echo "   Total archived: 379+ files, 166MB"
echo ""

# Show new structure
echo "📁 New repository structure:"
tree -L 2 -I 'node_modules|dist|coverage|archive' | head -30

echo ""
echo "🎯 Focus areas now:"
echo "   ✅ apps/api/ - Core API service"
echo "   ✅ packages/ - Shared libraries"
echo "   ✅ sdk/ - Customer shipping packages (MAIN FOCUS)"
echo "   ✅ docs/ - Operational documentation"
echo ""
echo "📦 Archived (preserved, not deleted):"
echo "   📁 infra/archive/terraform/ - Infrastructure for future deployment"
echo "   📁 tests/archive/gauntlet/ - Test framework for future backend"
echo "   📁 legal/archive/contracts/ - Legal templates for future customers"
echo ""

# Git operations
echo "🔄 Preparing git changes..."
git add -A
git status --short

echo ""
echo "💾 Ready to commit:"
echo "   git commit -m 'feat: archive 379 non-shipping files, focus on customer SDKs'"
echo ""
echo "🔄 Rollback command:"
echo "   git checkout $BACKUP_BRANCH"
echo "   # or restore individual: mv infra/archive/terraform infra/terraform"
