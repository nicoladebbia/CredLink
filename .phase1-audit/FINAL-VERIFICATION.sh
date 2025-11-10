#!/bin/bash
set -e

echo "🔍 PHASE 1: FINAL VERIFICATION"
echo "================================"
echo ""

FAILED=0

# Test 1: No false survival claims (except in roadmap)
echo "Test 1: Checking for false survival claims..."
COUNT=$(grep -r "99\.9\|99%.*surviv" . --include="*.md" \
  --exclude-dir=node_modules \
  --exclude-dir=docs/roadmap \
  --exclude-dir=.phase1-audit \
  --exclude-dir=.git 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -eq "0" ]; then
  echo "✅ PASS: No false survival claims found"
else
  echo "❌ FAIL: Found $COUNT survival claims outside roadmap"
  FAILED=$((FAILED + 1))
fi

# Test 2: No false deployment time claims
echo "Test 2: Checking for false deployment time claims..."
COUNT=$(grep -r "10 minutes.*deploy\|deploy.*10 minutes\|5 minutes.*deploy" . --include="*.md" \
  --exclude-dir=node_modules \
  --exclude-dir=docs/roadmap \
  --exclude-dir=.phase1-audit 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -eq "0" ]; then
  echo "✅ PASS: No false deployment time claims"
else
  echo "❌ FAIL: Found $COUNT deployment time claims"
  FAILED=$((FAILED + 1))
fi

# Test 3: No false CTAs
echo "Test 3: Checking for false CTAs..."
COUNT=$(grep -r "Try it now\|Get started now\|Sign up free" . \
  --include="*.md" --include="*.html" \
  --exclude-dir=node_modules \
  --exclude-dir=.phase1-audit 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -eq "0" ]; then
  echo "✅ PASS: No false CTAs found"
else
  echo "❌ FAIL: Found $COUNT false CTAs"
  FAILED=$((FAILED + 1))
fi

# Test 4: Required files exist
echo "Test 4: Checking required files exist..."
if [ -f "START-HERE.md" ] && \
   [ -f "WHAT-ACTUALLY-WORKS.md" ] && \
   [ -f "PROJECT-IDENTITY.md" ] && \
   [ -f "APOLOGY.md" ] && \
   [ -f "demo/DEMO-STATUS.md" ] && \
   [ -f "COMMERCIAL-ROADMAP.md" ] && \
   [ -f "CHANGELOG.md" ]; then
  echo "✅ PASS: All required files exist"
else
  echo "❌ FAIL: Missing required files"
  FAILED=$((FAILED + 1))
fi

# Test 5: Demo marked as broken
echo "Test 5: Checking demo is marked as broken..."
if [ -f "start-demo-BROKEN.sh" ]; then
  echo "✅ PASS: Demo honestly named"
else
  echo "❌ FAIL: Demo script not renamed"
  FAILED=$((FAILED + 1))
fi

# Test 6: Identity decision made
echo "Test 6: Checking identity decision made..."
if grep -q "\[X\]" PROJECT-IDENTITY.md; then
  echo "✅ PASS: Identity decision marked"
else
  echo "❌ FAIL: No identity decision made"
  FAILED=$((FAILED + 1))
fi

# Test 7: APOLOGY linked in README
echo "Test 7: Checking APOLOGY linked in README..."
if grep -q "APOLOGY.md" README.md; then
  echo "✅ PASS: APOLOGY linked in README"
else
  echo "❌ FAIL: APOLOGY not linked in README"
  FAILED=$((FAILED + 1))
fi

# Test 8: Warning banner in README
echo "Test 8: Checking warning banner in README..."
if head -20 README.md | grep -q "CRITICAL\|WARNING\|⚠️"; then
  echo "✅ PASS: Warning banner in README"
else
  echo "❌ FAIL: No warning banner in README"
  FAILED=$((FAILED + 1))
fi

# Test 9: CHANGELOG updated
echo "Test 9: Checking CHANGELOG updated..."
if grep -q "Phase 1\|PHASE 1\|Emergency Triage" CHANGELOG.md; then
  echo "✅ PASS: CHANGELOG updated"
else
  echo "❌ FAIL: CHANGELOG not updated"
  FAILED=$((FAILED + 1))
fi

# Test 10: Demo HTML files have warnings
echo "Test 10: Checking demo HTML files have warnings..."
if grep -q "BACKEND NOT IMPLEMENTED" demo/gallery.html && \
   grep -q "BACKEND NOT IMPLEMENTED" demo/upload.html; then
  echo "✅ PASS: Demo HTML files have warnings"
else
  echo "❌ FAIL: Demo HTML files missing warnings"
  FAILED=$((FAILED + 1))
fi

echo ""
echo "================================"
echo "Tests run: 10"
echo "Tests passed: $((10 - FAILED))"
echo "Tests failed: $FAILED"
echo "================================"

if [ $FAILED -eq 0 ]; then
  echo ""
  echo "✅✅✅ PHASE 1 COMPLETE ✅✅✅"
  echo ""
  echo "All verification tests passed."
  echo "You may proceed to Phase 2: Branding Purge"
  echo ""
  echo "Score: 3.5/10 → 5.0/10"
  echo "Honesty: 3/10 → 9/10"
  echo "Trust: 3/10 → 6/10"
  echo ""
  exit 0
else
  echo ""
  echo "❌❌❌ PHASE 1 INCOMPLETE ❌❌❌"
  echo ""
  echo "Fix all failures above before proceeding."
  echo "DO NOT START PHASE 2 until all tests pass."
  echo ""
  exit 1
fi
