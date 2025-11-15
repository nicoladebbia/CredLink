#!/bin/bash
# Housekeeping Option B: more aggressive but still safe
# - Remove ui/admin-temp stub app
# - Consolidate docs/archived/ into docs/archive/
# NOTE: This does NOT remove enhanced middleware or root dev scripts automatically.

set -euo pipefail

echo "Starting Housekeeping Option B..."

########################################
# 1) Remove ui/admin-temp stub (admin UI placeholder)
########################################

if [ -d "ui/admin-temp" ]; then
  rm -rf "ui/admin-temp"
  echo "Removed stub admin UI directory: ui/admin-temp/"
else
  echo "ui/admin-temp/ not present, skipping"
fi

########################################
# 2) Consolidate docs/archived into docs/archive
########################################

if [ -d "docs/archived" ]; then
  echo "Consolidating docs/archived/ into docs/archive/ ..."
  mkdir -p "docs/archive"

  # Move files one by one, avoid overwriting existing files in docs/archive
  for f in docs/archived/*; do
    base="$(basename "$f")"
    if [ -e "docs/archive/$base" ]; then
      echo "  Skipping $base (already exists in docs/archive/)"
    else
      mv "$f" "docs/archive/"
      echo "  Moved $base -> docs/archive/"
    fi
  done

  # Attempt to remove now-empty docs/archived directory
  rmdir "docs/archived" 2>/dev/null || echo "docs/archived/ not empty or already removed; please review manually if needed"
else
  echo "docs/archived/ not present, skipping"
fi

########################################
# 3) Optional aggressive cleanup (commented)
########################################
# If you later decide to remove enhanced middleware / routes and root dev scripts,
# you can uncomment and run the following blocks.
#
# # Remove enhanced sign route and associated middleware cluster (ONLY if confirmed unused)
# for f in \
#   "apps/api/src/routes/sign-enhanced.ts" \
#   "apps/api/src/middleware/auth-enhanced.ts" \
#   "apps/api/src/middleware/assertion-validator.ts" \
#   "apps/api/src/middleware/error-handler-enhanced.ts"; do
#   if [ -f "$f" ]; then
#     rm -f "$f"
#     echo "Removed enhanced-only artifact: $f"
#   fi
# done
#
# # Remove root manual test scripts and debug HTML (ONLY if confirmed obsolete)
# for f in \
#   "test-manual-embed.cjs" \
#   "test-png-chunks.cjs" \
#   "test-simple-embed.cjs" \
#   "test-png-chunks.js" \
#   "test-server.js" \
#   "test-interface.html" \
#   "restart.sh"; do
#   if [ -f "$f" ]; then
#     rm -f "$f"
#     echo "Removed dev-only script/UI: $f"
#   fi
# done

echo "✅ Housekeeping Option B complete. Review 'git status' before committing."
