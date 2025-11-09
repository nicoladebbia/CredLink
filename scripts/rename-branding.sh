#!/bin/bash
# Rename c2-concierge → CredLink across entire codebase

set -e

echo "🏷️  Rebranding: c2-concierge → CredLink"
echo "========================================"
echo ""

# Find and replace in files
echo "📝 Updating package.json files..."
find . -name "package.json" -type f -exec sed -i '' 's/"c2-concierge"/"credlink"/g' {} \;
find . -name "package.json" -type f -exec sed -i '' 's/@c2\//&#64;credlink\//g' {} \;

echo "📝 Updating TypeScript/JavaScript files..."
find . -type f \( -name "*.ts" -o -name "*.js" -o -name "*.tsx" -o -name "*.jsx" \) \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -exec sed -i '' 's/c2-concierge/credlink/g' {} \;

find . -type f \( -name "*.ts" -o -name "*.js" -o -name "*.tsx" -o -name "*.jsx" \) \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -exec sed -i '' 's/C2 Concierge/CredLink/g' {} \;

echo "📝 Updating Markdown files..."
find . -name "*.md" -type f \
    -not -path "*/node_modules/*" \
    -exec sed -i '' 's/c2-concierge/credlink/g' {} \;

find . -name "*.md" -type f \
    -not -path "*/node_modules/*" \
    -exec sed -i '' 's/C2 Concierge/CredLink/g' {} \;

echo "📝 Updating Go files..."
find . -name "*.go" -type f -exec sed -i '' 's/c2concierge/credlink/g' {} \;

echo "📝 Updating HTML files..."
find . -name "*.html" -type f -exec sed -i '' 's/c2-concierge/credlink/g' {} \;
find . -name "*.html" -type f -exec sed -i '' 's/C2 Concierge/CredLink/g' {} \;

echo "📝 Updating YAML files..."
find . -name "*.yaml" -o -name "*.yml" -type f -exec sed -i '' 's/c2-concierge/credlink/g' {} \;

# Rename CLI binary
echo "🔧 Renaming CLI binary..."
if [ -f "cli/bin/c2c" ]; then
    mv cli/bin/c2c cli/bin/credlink
fi

# Update Go module name if exists
if [ -f "cli/go.mod" ]; then
    echo "📝 Updating Go module..."
    sed -i '' 's|github.com/c2concierge/cli|github.com/credlink/cli|g' cli/go.mod
fi

echo ""
echo "✅ Rebranding complete!"
echo ""
echo "⚠️  Manual steps still needed:"
echo "  1. Update GitHub repo name: c2-concierge → CredLink"
echo "  2. Update domain references"
echo "  3. Review and test imports"
echo "  4. Update CI/CD configs"
echo ""
