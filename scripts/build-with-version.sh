#!/bin/bash

# Build-time Version Injection Script
# Reads version from package.json and injects into Docker builds

set -euo pipefail

# Read version from package.json
APP_VERSION=$(node -p "require('./package.json').version")
BUILD_NUMBER=${BUILD_NUMBER:-local}
GIT_COMMIT=${GIT_COMMIT:-$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')}
BUILD_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

echo "🏷️  Version Injection Build Script"
echo "=================================="
echo "App Version: $APP_VERSION"
echo "Build Number: $BUILD_NUMBER"
echo "Git Commit: $GIT_COMMIT"
echo "Build Timestamp: $BUILD_TIMESTAMP"
echo ""

# Export for Docker build
export APP_VERSION
export BUILD_NUMBER
export GIT_COMMIT
export BUILD_TIMESTAMP

# Build Docker image with version injection
echo "🐳 Building Docker image with injected versions..."
docker build \
  --build-arg APP_VERSION="$APP_VERSION" \
  --build-arg BUILD_NUMBER="$BUILD_NUMBER" \
  --build-arg GIT_COMMIT="$GIT_COMMIT" \
  --build-arg BUILD_TIMESTAMP="$BUILD_TIMESTAMP" \
  -f Dockerfile.reproducible \
  -t credlink:"$APP_VERSION" \
  -t credlink:"$APP_VERSION-$BUILD_NUMBER" \
  -t credlink:latest \
  .

echo ""
echo "✅ Version injection complete!"
echo "📦 Built images:"
echo "   - credlink:$APP_VERSION"
echo "   - credlink:$APP_VERSION-$BUILD_NUMBER"
echo "   - credlink:latest"

# Verify version injection
echo ""
echo "🔍 Verifying version injection..."
docker run --rm credlink:"$APP_VERSION" node -e "
const pkg = require('./package.json');
console.log('Package version:', pkg.version);
console.log('Environment version:', process.env.APP_VERSION || 'not set');
console.log('Build number:', process.env.BUILD_NUMBER || 'not set');
"

echo ""
echo "🎉 Build completed successfully!"
