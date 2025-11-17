#!/bin/bash
# analyze-todos.sh - Quick TODO analysis

echo "=== TODO Analysis ==="
cd "$(dirname "$0")/../.." || exit
grep -r "TODO\|FIXME\|HACK\|XXX" --include="*.ts" --include="*.js" apps/ packages/ infra/ --exclude-dir=node_modules --exclude-dir=dist | wc -l | xargs echo "Total TODOs:"
