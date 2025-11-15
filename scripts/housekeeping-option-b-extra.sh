#!/bin/bash
# Housekeeping Option B (extra): remove enhanced route/middleware and root test/debug scripts

set -euo pipefail

echo "Starting Housekeeping Option B (extra)..."

########################################
# 1) Remove enhanced sign route + dedicated middleware
########################################

for f in \
  "apps/api/src/routes/sign-enhanced.ts" \
  "apps/api/src/middleware/auth-enhanced.ts" \
  "apps/api/src/middleware/assertion-validator.ts" \
  "apps/api/src/middleware/error-handler-enhanced.ts"; do
  if [ -f "$f" ]; then
    rm -f "$f"
    echo "Removed enhanced-only artifact: $f"
  fi
done

########################################
# 2) Remove root manual test/debug scripts and HTML
########################################

for f in \
  "test-manual-embed.cjs" \
  "test-png-chunks.cjs" \
  "test-simple-embed.cjs" \
  "test-png-chunks.js" \
  "test-server.js" \
  "test-interface.html" \
  "restart.sh"; do
  if [ -f "$f" ]; then
    rm -f "$f"
    echo "Removed dev-only script/UI: $f"
  fi
done

echo "✅ Housekeeping Option B (extra) complete. Review 'git status' before committing."
