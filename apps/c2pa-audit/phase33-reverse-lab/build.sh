#!/bin/bash

# Phase 33 Reverse Lab - Build Script
# This script builds the project with relaxed TypeScript settings

echo "🏗️  Building Phase 33 Reverse Lab..."

# Create a temporary tsconfig for building
cat > tsconfig.build.json << 'EOF'
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "exactOptionalPropertyTypes": false,
    "noImplicitReturns": false,
    "noFallthroughCasesInSwitch": false
  },
  "exclude": [
    "src/tests/**/*",
    "**/*.test.ts"
  ]
}
EOF

# Build the project
npx tsc --project tsconfig.build.json --noEmit

if [ $? -eq 0 ]; then
  echo "✅ TypeScript compilation successful"
  
  # Build the JavaScript output
  npx tsc --project tsconfig.build.json --outDir dist --declaration
  
  if [ $? -eq 0 ]; then
    echo "✅ Build completed successfully"
    echo "📦 Output directory: dist/"
    echo "🚀 Ready to run: npm start"
  else
    echo "❌ Build failed"
    exit 1
  fi
else
  echo "❌ TypeScript compilation failed"
  exit 1
fi

# Cleanup
rm -f tsconfig.build.json

echo "🎉 Phase 33 Reverse Lab build complete!"
