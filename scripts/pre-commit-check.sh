#!/bin/bash

# Pre-commit regression prevention script
echo "🔍 Running regression prevention checks..."

# 1. Check TypeScript compilation
echo "📝 Checking TypeScript compilation..."
npm run build 2>&1 | grep -E "(error|Error)" && {
  echo "❌ TypeScript compilation failed"
  exit 1
}

# 2. Check critical endpoints exist
echo "🔗 Checking critical endpoints..."
node -e "
const fs = require('fs');
const server = fs.readFileSync('unified-server.js', 'utf8');
const endpoints = ['/invoices', '/audit-logs', '/webhooks', '/usage/current', '/proofs', '/auth/sessions'];
endpoints.forEach(endpoint => {
  if (!server.includes(endpoint)) {
    console.log('❌ Missing endpoint:', endpoint);
    process.exit(1);
  }
});
console.log('✅ All critical endpoints present');
" || exit 1

# 3. Check environment variables
echo "🌍 Checking environment configuration..."
if [ ! -f ".env.example" ]; then
  echo "❌ .env.example missing"
  exit 1
fi

# 4. Run unit tests
echo "🧪 Running unit tests..."
npm test 2>&1 | grep -E "(fail|Fail|error|Error)" && {
  echo "❌ Unit tests failed"
  exit 1
}

echo "✅ All regression checks passed"
exit 0
