#!/bin/bash
# Save as .phase1-audit/01-find-all-lies.sh

set -e
echo "🔍 PHASE 1: Finding all dishonest claims..."
echo "Started: $(date)" > .phase1-audit/audit-log.txt

# Survival rate claims (99.9%, 99%, high survival, etc.)
echo "\n=== SURVIVAL RATE CLAIMS (UNMEASURED) ===" | tee -a .phase1-audit/dishonest-claims.txt
grep -rn "99\.\?9\?%\|surviv\|retention rate" \
  --include="*.md" \
  --include="*.html" \
  --include="*.txt" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=archive \
  . | tee -a .phase1-audit/dishonest-claims.txt || true

# Deployment time claims (10 minutes, instant, fast, etc.)
echo "\n=== DEPLOYMENT TIME CLAIMS (UNMEASURED) ===" | tee -a .phase1-audit/dishonest-claims.txt
grep -rn "10 minutes\|5 minutes\|instant\|seconds to deploy\|quick deploy" \
  --include="*.md" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  . | tee -a .phase1-audit/dishonest-claims.txt || true

# Pricing claims (for non-existent service)
echo "\n=== PRICING CLAIMS (NO WORKING PRODUCT) ===" | tee -a .phase1-audit/dishonest-claims.txt
grep -rn "\$[0-9]\+/mo\|\$[0-9]\+/month\|pricing\|subscription\|buy now\|purchase" \
  --include="*.md" \
  --exclude-dir=node_modules \
  --exclude-dir=archive \
  . | tee -a .phase1-audit/dishonest-claims.txt || true

# Comparison claims (comparing to real products)
echo "\n=== COMPETITOR COMPARISONS (VAPORWARE VS REAL) ===" | tee -a .phase1-audit/dishonest-claims.txt
grep -rn "Adobe\|Getty\|vs\.\|compared to\|better than\|faster than" \
  --include="*.md" \
  --exclude-dir=node_modules \
  . | tee -a .phase1-audit/dishonest-claims.txt || true

# Production/Complete claims
echo "\n=== FALSE COMPLETION CLAIMS ===" | tee -a .phase1-audit/dishonest-claims.txt
grep -rn "production ready\|complete\|finished\|✅\|Status: Complete\|implemented" \
  --include="*.md" \
  --exclude-dir=node_modules \
  --exclude-dir=docs/roadmap \
  . | tee -a .phase1-audit/dishonest-claims.txt || true

# Call-to-actions (for broken product)
echo "\n=== FALSE CTAs (PRODUCT DOESN'T WORK) ===" | tee -a .phase1-audit/dishonest-claims.txt
grep -rn "Try it now\|Get started\|Sign up\|Download\|Install now\|Start free" \
  --include="*.md" \
  --include="*.html" \
  --exclude-dir=node_modules \
  . | tee -a .phase1-audit/dishonest-claims.txt || true

# Performance claims
echo "\n=== PERFORMANCE CLAIMS (UNMEASURED) ===" | tee -a .phase1-audit/dishonest-claims.txt
grep -rn "fast\|<[0-9]\+ms\|low latency\|p95\|p99" \
  --include="*.md" \
  --exclude-dir=node_modules \
  --exclude-dir=docs/roadmap \
  . | tee -a .phase1-audit/dishonest-claims.txt || true

echo "\n=== AUDIT COMPLETE ===" | tee -a .phase1-audit/dishonest-claims.txt
echo "Finished: $(date)" | tee -a .phase1-audit/audit-log.txt
echo "\nTotal dishonest claims found:" | tee -a .phase1-audit/dishonest-claims.txt
wc -l .phase1-audit/dishonest-claims.txt | tee -a .phase1-audit/audit-log.txt

echo "\n🔴 REVIEW: .phase1-audit/dishonest-claims.txt"
echo "Fix EVERY SINGLE LINE before proceeding."
