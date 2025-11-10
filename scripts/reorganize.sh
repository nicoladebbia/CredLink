#!/bin/bash
# CredLink Repository Reorganization Script
# WARNING: This will move and delete files. Commit your work first!

set -e

echo "🚨 CredLink Repository Reorganization"
echo "======================================"
echo ""
echo "This will:"
echo "  - Rename credlink → credlink"
echo "  - Reorganize folder structure"
echo "  - Archive phase-numbered folders"
echo "  - Delete redundant files"
echo ""
read -p "Have you committed all changes? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Aborting. Please commit your changes first."
    exit 1
fi

# Create backup
echo "📦 Creating backup..."
cp -r . ../CredLink-backup-$(date +%Y%m%d-%H%M%S) || true

# Create new structure
echo "📁 Creating new folder structure..."
mkdir -p core/{signer,verify,manifest-store,policy-engine}
mkdir -p integrations/{cms,browser-extension,mobile}
mkdir -p ui/{badge,admin,landing}
mkdir -p sdk/{javascript,python,go}
mkdir -p tests/{acceptance,integration,e2e}
mkdir -p docs/{api,guides,compliance}
mkdir -p archive

# Move existing packages to core
echo "🔄 Moving packages to core..."
[ -d "packages/manifest-store" ] && mv packages/manifest-store core/manifest-store/ || true
[ -d "apps/verify-api" ] && mv apps/verify-api core/verify/ || true
[ -d "apps/policy" ] && mv apps/policy core/policy-engine/ || true

# Move badge
echo "🔄 Moving badge..."
[ -d "packages/c2-badge" ] && mv packages/c2-badge ui/badge/ || true
[ -d "ui/admin" ] && echo "Admin already exists" || true

# Move SDK
echo "🔄 Moving SDKs..."
[ -d "sdk/js" ] && mv sdk/js sdk/javascript/ || true
[ -d "sdk/python" ] && echo "Python SDK exists" || true
[ -d "sdk/go" ] && echo "Go SDK exists" || true

# Move CMS connectors
echo "🔄 Moving CMS connectors..."
[ -d "packages/cms-connectors" ] && mv packages/cms-connectors integrations/cms/ || true
[ -d "plugins/wp-credlink" ] && mv plugins/wp-credlink integrations/cms/wordpress/ || true
[ -d "plugins/shopify-app" ] && mv plugins/shopify-app integrations/cms/shopify/ || true

# Move tests
echo "🔄 Moving tests..."
[ -d "packages/acceptance" ] && mv packages/acceptance tests/acceptance/ || true

# Move docs
echo "🔄 Organizing docs..."
[ -d "docs" ] && echo "Docs folder exists" || mkdir -p docs

# Archive phase folders
echo "📦 Archiving phase-numbered folders..."
for dir in phase*/; do
    if [ -d "$dir" ]; then
        echo "  Archiving $dir..."
        mv "$dir" archive/ || true
    fi
done

# Archive PHASE-XX markdown files
echo "📦 Archiving phase completion files..."
mv PHASE-*-COMPLETE.md archive/ 2>/dev/null || true

# Delete temp folders
echo "🗑️  Deleting temporary folders..."
rm -rf temp-verification/ || true
rm -rf .artifacts/ || true

# Archive empty or minimal packages
echo "📦 Archiving incomplete packages..."
for dir in packages/*/; do
    if [ -d "$dir" ]; then
        file_count=$(find "$dir" -type f -name "*.ts" -o -name "*.js" | wc -l)
        if [ "$file_count" -lt 3 ]; then
            echo "  Archiving sparse package: $dir"
            mv "$dir" archive/ || true
        fi
    fi
done

echo ""
echo "✅ Reorganization complete!"
echo ""
echo "⚠️  IMPORTANT NEXT STEPS:"
echo "  1. Review the changes: git status"
echo "  2. Update import paths in remaining files"
echo "  3. Update package.json workspaces"
echo "  4. Run: pnpm install"
echo "  5. Run: pnpm build"
echo ""
echo "📂 Backup created at: ../CredLink-backup-*"
