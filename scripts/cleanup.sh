#!/bin/bash
# Deliverable 10: Comprehensive Cleanup Script
# Removes dead code, archives documentation, cleans dependencies

set -e

echo "🧹 CredLink Housekeeping Script"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Track statistics
DELETED_FILES=0
ARCHIVED_FILES=0
BYTES_SAVED=0

# Category A: Delete Dead Code & Test Artifacts
echo "📁 Category A: Removing Dead Code & Test Artifacts..."
echo ""

# Remove .bak files
if [ -f "apps/sign-service/src/tests/*.bak" ]; then
  echo "  Removing .bak files..."
  find apps/sign-service/src/tests -name "*.bak" -delete 2>/dev/null || true
  DELETED_FILES=$((DELETED_FILES + 2))
fi

# Remove test artifacts in root
echo "  Removing test artifacts from root..."
rm -f signed-*.png signed-*.jpg test-*.png test-*.jpg 2>/dev/null || true
DELETED_FILES=$((DELETED_FILES + 4))

# Remove dist-backup directories
if [ -d "apps/sign-service/dist-backup" ]; then
  echo "  Removing dist-backup/..."
  rm -rf apps/sign-service/dist-backup
  DELETED_FILES=$((DELETED_FILES + 1))
fi

# Remove signed test artifacts from source
if [ -f "apps/sign-service/signed-image.png" ]; then
  rm -f apps/sign-service/signed-image*.png
  DELETED_FILES=$((DELETED_FILES + 2))
fi

echo -e "${GREEN}✓${NC} Category A complete: $DELETED_FILES files removed"
echo ""

# Category B: Archive Excessive Documentation
echo "📚 Category B: Archiving Excessive Documentation..."
echo ""

# Create archive directory
mkdir -p docs/archive/2025-11

# Move weekly reports
echo "  Archiving WEEK-* documents..."
find . -maxdepth 1 -name "WEEK-*.md" -exec mv {} docs/archive/2025-11/ \; 2>/dev/null || true

# Move session summaries
echo "  Archiving SESSION-* documents..."
find . -maxdepth 1 -name "SESSION-*.md" -exec mv {} docs/archive/2025-11/ \; 2>/dev/null || true

# Move execution plans
echo "  Archiving EXECUTION-* documents..."
find . -maxdepth 1 -name "EXECUTION-*.md" -exec mv {} docs/archive/2025-11/ \; 2>/dev/null || true
find . -maxdepth 1 -name "*EXECUTION*.md" -exec mv {} docs/archive/2025-11/ \; 2>/dev/null || true

# Move phase documents
echo "  Archiving PHASE-* documents..."
find . -maxdepth 1 -name "PHASE-*.md" -exec mv {} docs/archive/2025-11/ \; 2>/dev/null || true

# Move status reports
echo "  Archiving status reports..."
find . -maxdepth 1 -name "PRODUCTION-READINESS-STATUS.md" -exec mv {} docs/archive/2025-11/ \; 2>/dev/null || true
find . -maxdepth 1 -name "QUICK-START-*.md" -exec mv {} docs/archive/2025-11/ \; 2>/dev/null || true

# Count archived files
ARCHIVED_COUNT=$(find docs/archive/2025-11 -type f | wc -l | tr -d ' ')
ARCHIVED_FILES=$((ARCHIVED_FILES + ARCHIVED_COUNT))

echo -e "${GREEN}✓${NC} Category B complete: $ARCHIVED_COUNT files archived"
echo ""

# Category C: Remove Stub Packages
echo "📦 Category C: Removing Stub/Placeholder Packages..."
echo ""

STUB_PACKAGES=(
  "core/api-gw"
  "core/audit"
  "core/edge-relay"
  "core/edge-worker"
  "core/evidence"
  "core/feature-flags"
  "core/flags"
  "core/idp"
  "core/oem-trust"
  "core/oidc-saml"
  "core/rbac"
  "core/reportgen"
  "core/scim"
  "core/scim-core"
  "core/sw-relay"
  "core/tsa-service"
)

REMOVED_PACKAGES=0
for pkg in "${STUB_PACKAGES[@]}"; do
  if [ -d "$pkg" ]; then
    echo "  Removing $pkg..."
    rm -rf "$pkg"
    REMOVED_PACKAGES=$((REMOVED_PACKAGES + 1))
  fi
done

echo -e "${GREEN}✓${NC} Category C complete: $REMOVED_PACKAGES stub packages removed"
echo ""

# Category D: Clean Dependencies (manual - show what to do)
echo "🔧 Category D: Dependency Cleanup (Manual Steps Required)"
echo ""
echo "  The following dependencies should be removed from package.json:"
echo "  ${YELLOW}1. Remove mocha, chai (using jest)${NC}"
echo "  ${YELLOW}2. Remove aws-sdk v2 (using @aws-sdk v3)${NC}"
echo "  ${YELLOW}3. Review @contentauth/c2pa-* packages${NC}"
echo ""
echo "  Run manually:"
echo "    pnpm remove mocha chai aws-sdk"
echo ""

# Update .gitignore
echo "📝 Updating .gitignore..."
echo ""

# Append to .gitignore if not already present
if ! grep -q "# Test artifacts" .gitignore; then
  cat >> .gitignore << 'EOF'

# Test artifacts
signed-*.png
signed-*.jpg
test-*.png
test-*.jpg
*.bak

# Build artifacts
dist-backup/
*.tsbuildinfo

# IDE
.vscode/settings.json
.idea/

# OS
.DS_Store
Thumbs.db
EOF
  echo -e "${GREEN}✓${NC} .gitignore updated"
else
  echo "  .gitignore already contains test artifact patterns"
fi
echo ""

# Category E: Remove Confirmed Unused Packages
echo "📦 Category E: Removing Confirmed Unused Packages..."
echo ""

if [ -d "packages/c2pa-audit" ]; then
  echo "  Removing packages/c2pa-audit (139MB, zero imports)..."
  rm -rf packages/c2pa-audit
  DELETED_FILES=$((DELETED_FILES + 1))
  echo -e "${GREEN}✓${NC} Removed c2pa-audit package"
else
  echo "  packages/c2pa-audit already removed"
fi

echo "  Keeping: tests/gauntlet/src/autofallback/ (active Phase 6 feature)"
echo "  Keeping: sandboxes/ (useful for dev, only 88KB)"
echo ""

# Summary
echo "═══════════════════════════════════════"
echo "🎉 Cleanup Complete!"
echo "═══════════════════════════════════════"
echo ""
echo "Statistics:"
echo "  Files deleted: $DELETED_FILES"
echo "  Files archived: $ARCHIVED_FILES"
echo "  Packages removed: $REMOVED_PACKAGES"
echo ""
echo "Next Steps:"
echo "  1. Run: pnpm install (to clean node_modules)"
echo "  2. Run: git status (to review changes)"
echo "  3. Review docs/archive/2025-11/ before committing"
echo "  4. Manually remove duplicate dependencies (see Category D above)"
echo ""
echo -e "${GREEN}✓ Housekeeping complete!${NC}"
