#!/bin/bash
# Complete branding discovery script
# Finds ALL variations of credlink branding

set -e

echo "🔍 PHASE 2: BRANDING PURGE - DISCOVERY AUDIT"
echo "Started: $(date)" | tee .phase2-branding/audit-log.txt
echo ""

# Output file
OUTPUT=".phase2-branding/branding-references.txt"
> "$OUTPUT"

echo "Searching for ALL credlink variations..."
echo ""

# Variation 1: credlink (lowercase)
echo "=== SEARCHING: credlink (lowercase) ===" | tee -a "$OUTPUT"
grep -rn "credlink" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=dist \
  --exclude-dir=build \
  --exclude-dir=.next \
  --exclude="*.log" \
  . | tee -a "$OUTPUT" || true

echo "" | tee -a "$OUTPUT"

# Variation 2: credlink (with hyphen)
echo "=== SEARCHING: credlink (with hyphen) ===" | tee -a "$OUTPUT"
grep -rn "credlink" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=dist \
  --exclude-dir=build \
  . | tee -a "$OUTPUT" || true

echo "" | tee -a "$OUTPUT"

# Variation 3: CredLink (PascalCase)
echo "=== SEARCHING: CredLink (PascalCase) ===" | tee -a "$OUTPUT"
grep -rn "CredLink" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=dist \
  . | tee -a "$OUTPUT" || true

echo "" | tee -a "$OUTPUT"

# Variation 4: CREDLINK (UPPERCASE)
echo "=== SEARCHING: CREDLINK (UPPERCASE) ===" | tee -a "$OUTPUT"
grep -rn "CREDLINK" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=dist \
  . | tee -a "$OUTPUT" || true

echo "" | tee -a "$OUTPUT"

# Variation 5: c2c (but not c2pa - careful!)
echo "=== SEARCHING: c2c (abbreviation, excluding c2pa) ===" | tee -a "$OUTPUT"
grep -rn "c2c[^p]" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=dist \
  . | grep -v "c2pa" | tee -a "$OUTPUT" || true

echo "" | tee -a "$OUTPUT"

# Count total references
echo "=== SUMMARY ===" | tee -a "$OUTPUT"
TOTAL=$(grep -c ":" "$OUTPUT" || echo "0")
echo "Total references found: $TOTAL" | tee -a "$OUTPUT"
echo "Finished: $(date)" | tee -a .phase2-branding/audit-log.txt

if [ "$TOTAL" -lt 300 ]; then
  echo "⚠️  WARNING: Only $TOTAL references found. Expected 300-400+."
  echo "You may have missed some variations. Check manually!"
else
  echo "✅ Found $TOTAL references - this matches expected range."
fi

echo ""
echo "Results saved to: $OUTPUT"
echo "Review this file to understand scope of changes."
