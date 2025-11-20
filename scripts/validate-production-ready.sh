#!/bin/bash

echo "🚀 Production Readiness Validation"

# Service health checks
echo "📊 Checking service health..."
curl -s http://localhost:3001/health || echo "❌ API service not responding"
curl -s http://localhost:3002/ || echo "❌ Web service not responding"
curl -s http://localhost:3003/health || echo "❌ Sign service not responding"

# Database connectivity
echo "🗄️ Checking database..."
npm run db:check 2>/dev/null || echo "⚠️  Database check script not found"

# Environment validation
echo "🌍 Validating environment..."
node -e "
require('dotenv').config();
const required = ['DATABASE_URL', 'JWT_SECRET', 'WEB_URL'];
const missing = required.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.log('❌ Missing environment variables:', missing.join(', '));
  process.exit(1);
}
console.log('✅ Environment variables present');
"

# Build verification
echo "🔨 Verifying build..."
npm run build >/dev/null 2>&1 && echo "✅ Build successful" || echo "❌ Build failed"

echo "🎯 Production validation complete"
