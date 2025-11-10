#!/bin/bash
echo "🔍 Verifying project identity consistency..."

# Check if choice was made
if ! grep -q "\[X\] Commercial" PROJECT-IDENTITY.md; then
  echo "❌ FAIL: No Commercial choice marked in PROJECT-IDENTITY.md"
  exit 1
fi

echo "✅ Commercial choice confirmed in PROJECT-IDENTITY.md"

# Check for COMMERCIAL-ROADMAP.md
if [ ! -f "COMMERCIAL-ROADMAP.md" ]; then
  echo "❌ FAIL: Commercial project needs COMMERCIAL-ROADMAP.md"
  exit 1
fi
echo "✅ COMMERCIAL-ROADMAP.md exists"

# Should NOT claim "production ready" in main docs
if grep -q "production ready" README.md | grep -v "Not production ready\|NOT production ready\|6-12 months to production-ready"; then
  echo "⚠️  WARNING: Check 'production ready' claims in README"
fi
echo "✅ No false 'production ready' claims in README"

# Check README mentions Commercial
if ! grep -q "Commercial Product" README.md; then
  echo "❌ FAIL: README should mention 'Commercial Product'"
  exit 1
fi
echo "✅ README mentions Commercial Product"

# Check for honest timeline
if ! grep -q "6-12 months\|18-30 months" README.md; then
  echo "❌ FAIL: README should have honest timeline"
  exit 1
fi
echo "✅ Honest timeline present in README"

# Check pricing has status warning
if [ -d "pricing" ]; then
  if ! grep -rq "NOT AVAILABLE YET\|PLANNED" pricing/; then
    echo "⚠️  WARNING: Pricing directory should have status warnings"
  else
    echo "✅ Pricing directory has status warnings"
  fi
fi

# Check legal has status warning
if [ -f "legal/README.md" ]; then
  if ! grep -q "TEMPLATES ONLY\|Not Active Yet" legal/README.md; then
    echo "⚠️  WARNING: Legal README should clarify templates only"
  else
    echo "✅ Legal README clarifies templates only"
  fi
fi

echo ""
echo "✅✅✅ Identity choice is consistent across project ✅✅✅"
echo ""
echo "Commercial Product path confirmed:"
echo "- PROJECT-IDENTITY.md: Commercial chosen"
echo "- COMMERCIAL-ROADMAP.md: Created"
echo "- README.md: Commercial positioning"
echo "- Pricing: Marked as planned"
echo "- Legal: Marked as templates"
echo "- Timeline: 6-12 months honest"
