#!/bin/bash
echo "🔍 Verifying project identity consistency..."

# Check if choice was made
if ! grep -q "\[X\]" PROJECT-IDENTITY.md; then
  echo "❌ FAIL: No choice made in PROJECT-IDENTITY.md"
  exit 1
fi

CHOICE=$(grep "I choose" PROJECT-IDENTITY.md)
echo "Choice made: $CHOICE"

# Check for inconsistencies
if echo "$CHOICE" | grep -q "Commercial"; then
  echo "Verifying Commercial positioning..."
  
  # Should have roadmap
  if [ ! -f "COMMERCIAL-ROADMAP.md" ]; then
    echo "❌ FAIL: Commercial project needs COMMERCIAL-ROADMAP.md"
    exit 1
  fi
  
  # Should NOT claim "production ready"
  if grep -q "production ready" README.md 2>/dev/null; then
    echo "⚠️  WARNING: Should not claim 'production ready' yet"
  fi
  
  # Should have pricing marked as planned
  if [ ! -f "pricing/README.md" ]; then
    echo "❌ FAIL: Need pricing/README.md marking pricing as planned"
    exit 1
  fi
  
  # Should have legal templates marked
  if ! grep -q "TEMPLATES ONLY" legal/README.md 2>/dev/null; then
    echo "⚠️  WARNING: Legal contracts should be marked as templates"
  fi
  
  echo "✅ Commercial positioning verified"
fi

echo "\n✅ Identity choice is consistent across project"
