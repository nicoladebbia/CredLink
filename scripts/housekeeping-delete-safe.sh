#!/bin/bash
# Safe housekeeping deletion script for Deliverable 10
# Removes confirmed dead/temporary files only.

set -euo pipefail

echo "Starting safe housekeeping deletions..."

########################################
# 1) Duplicate/unused implementations
########################################

# Historical duplicate error handler (may or may not exist in current tree)
if [ -f apps/api/src/services/error-handler.ts ]; then
  rm -f apps/api/src/services/error-handler.ts
  echo "Removed duplicate: apps/api/src/services/error-handler.ts"
fi

# Unused performance profiler implementation (not imported anywhere)
if [ -f apps/api/src/performance/performance-profiler.ts ]; then
  rm -f apps/api/src/performance/performance-profiler.ts
  echo "Removed unused: apps/api/src/performance/performance-profiler.ts"
fi

########################################
# 2) Unused server implementation
########################################

if [ -f apps/api/src/server-http2.ts ]; then
  rm -f apps/api/src/server-http2.ts
  echo "Removed unused: apps/api/src/server-http2.ts"
fi

########################################
# 3) Skipped / dead test implementation
########################################

if [ -f apps/api/src/services/real-world-survival-tester.ts.skip ]; then
  rm -f apps/api/src/services/real-world-survival-tester.ts.skip
  echo "Removed skipped: apps/api/src/services/real-world-survival-tester.ts.skip"
fi

########################################
# 4) Broken demo scripts
########################################

for f in start-demo-BROKEN.sh start-demo-BROKEN-2.sh; do
  if [ -f "$f" ]; then
    rm -f "$f"
    echo "Removed broken demo script: $f"
  fi
done

########################################
# 5) Test logs (should be gitignored)
########################################

for f in \
  "apps/api/test-results.json" \
  "apps/api/test-results-after-fixes.log" \
  "apps/api/test-results-full.log" \
  "apps/api/test-output.log"
  do
    if [ -f "$f" ]; then
      rm -f "$f"
      echo "Removed test artifact: $f"
    fi
  done

########################################
# 6) TypeScript build cache artifacts
########################################

find . -name "*.tsbuildinfo" -not -path "*/node_modules/*" -print -delete

echo "Removed TypeScript build caches (*.tsbuildinfo)"

echo "✅ Safe housekeeping deletions done. Please review 'git status' before committing."
