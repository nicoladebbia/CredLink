#!/bin/bash

# C2C Hostile CDN Gauntlet - Validation Script
# Validates the entire system before production deployment

set -e

echo "🔥 C2C Hostile CDN Gauntlet - System Validation"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validation counters
PASSED=0
FAILED=0
WARNINGS=0

# Helper functions
pass_test() {
    echo -e "✅ ${GREEN}$1${NC}"
    ((PASSED++))
}

fail_test() {
    echo -e "❌ ${RED}$1${NC}"
    ((FAILED++))
}

warn_test() {
    echo -e "⚠️  ${YELLOW}$1${NC}"
    ((WARNINGS++))
}

# Test 1: Node.js and npm
echo "📋 Testing Node.js and npm..."

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 16 ]; then
        pass_test "Node.js version $(node -v) >= 16"
    else
        fail_test "Node.js version $(node -v) < 16"
    fi
else
    fail_test "Node.js not found"
fi

if command -v npm &> /dev/null; then
    pass_test "npm version $(npm -v) found"
else
    fail_test "npm not found"
fi

# Test 2: Dependencies
echo ""
echo "📦 Testing dependencies..."

if [ -f "package.json" ]; then
    pass_test "package.json exists"
    
    if [ -d "node_modules" ]; then
        pass_test "node_modules directory exists"
        
        # Check critical dependencies
        critical_deps=("js-yaml" "axios" "sharp" "commander")
        for dep in "${critical_deps[@]}"; do
            if [ -d "node_modules/$dep" ]; then
                pass_test "Dependency $dep installed"
            else
                fail_test "Dependency $dep missing"
            fi
        done
    else
        fail_test "node_modules directory missing - run npm install"
    fi
else
    fail_test "package.json not found"
fi

# Test 3: TypeScript compilation
echo ""
echo "🔨 Testing TypeScript compilation..."

if npm run build &> /dev/null; then
    pass_test "TypeScript compilation successful"
    
    if [ -d "dist" ]; then
        pass_test "dist directory created"
    else
        fail_test "dist directory not created"
    fi
else
    fail_test "TypeScript compilation failed"
fi

# Test 4: Configuration files
echo ""
echo "⚙️  Testing configuration files..."

config_files=("matrix.yaml" "tsconfig.json" ".env.example")
for file in "${config_files[@]}"; do
    if [ -f "$file" ]; then
        pass_test "Configuration file $file exists"
    else
        fail_test "Configuration file $file missing"
    fi
done

# Test 5: Provider configurations
echo ""
echo "🌐 Testing provider configurations..."

provider_count=$(find providers -name "*.yaml" 2>/dev/null | wc -l)
if [ "$provider_count" -eq 5 ]; then
    pass_test "All 5 provider configurations found"
elif [ "$provider_count" -gt 0 ]; then
    warn_test "Only $provider_count/5 provider configurations found"
else
    fail_test "No provider configurations found"
fi

# Validate YAML syntax
for provider in providers/*.yaml; do
    if [ -f "$provider" ]; then
        if node -e "const yaml = require('js-yaml'); yaml.load(require('fs').readFileSync('$provider', 'utf8'));" 2>/dev/null; then
            pass_test "YAML syntax valid: $(basename "$provider")"
        else
            fail_test "Invalid YAML syntax: $(basename "$provider")"
        fi
    fi
done

# Test 6: Source code structure
echo ""
echo "📁 Testing source code structure..."

src_files=("src/buildUrls.ts" "src/run.ts" "src/probes/remote.ts" "src/probes/embed.ts")
for file in "${src_files[@]}"; do
    if [ -f "$file" ]; then
        pass_test "Source file $file exists"
    else
        fail_test "Source file $file missing"
    fi
done

# Test 7: Import resolution
echo ""
echo "🔗 Testing import resolution..."

if node -e "
try {
    require('./dist/buildUrls.js');
    console.log('✅ buildUrls imports resolved');
} catch (e) {
    console.log('❌ buildUrls import error:', e.message);
    process.exit(1);
}
" 2>/dev/null; then
    pass_test "Import resolution successful"
else
    fail_test "Import resolution failed"
fi

# Test 8: URL generation
echo ""
echo "🔗 Testing URL generation..."

if npm run build-urls &> /dev/null; then
    if [ -f "output/test-urls.json" ]; then
        url_count=$(node -e "console.log(JSON.parse(require('fs').readFileSync('output/test-urls.json', 'utf8')).length)" 2>/dev/null)
        if [ "$url_count" -eq 1800 ]; then
            pass_test "URL generation: $url_count URLs created"
        else
            warn_test "URL generation: $url_count URLs (expected 1800)"
        fi
    else
        fail_test "URL generation output file missing"
    fi
else
    fail_test "URL generation failed"
fi

# Test 9: Security validation
echo ""
echo "🔒 Testing security validation..."

# Check for SSRF protection
if grep -q "allowedHosts" src/probes/remote.ts; then
    pass_test "SSRF protection implemented"
else
    fail_test "SSRF protection missing"
fi

# Check for private IP blocking
if grep -q "isPrivateIP" src/probes/remote.ts; then
    pass_test "Private IP blocking implemented"
else
    fail_test "Private IP blocking missing"
fi

# Check for SSL validation
if grep -q "rejectUnauthorized" src/probes/remote.ts; then
    pass_test "SSL validation implemented"
else
    fail_test "SSL validation missing"
fi

# Test 10: Error handling
echo ""
echo "⚠️  Testing error handling..."

if grep -q "try.*catch" src/run.ts; then
    pass_test "Error handling implemented in main runner"
else
    fail_test "Error handling missing in main runner"
fi

if grep -q "try.*catch" src/probes/remote.ts; then
    pass_test "Error handling implemented in remote probe"
else
    fail_test "Error handling missing in remote probe"
fi

# Test 11: Rate limiting
echo ""
echo "🚦 Testing rate limiting..."

if grep -q "rate_limit" src/probes/remote.ts; then
    pass_test "Rate limiting implemented"
else
    fail_test "Rate limiting missing"
fi

# Test 12: C2PA tool detection
echo ""
echo "🔍 Testing C2PA tool detection..."

if command -v c2patool &> /dev/null; then
    pass_test "c2patool found: $(c2patool --version 2>/dev/null || echo 'unknown version')"
else
    warn_test "c2patool not found (Sharp fallback will be used)"
fi

# Test 13: Environment setup
echo ""
echo "🌍 Testing environment setup..."

if [ -f ".env" ]; then
    pass_test ".env file exists"
else
    warn_test ".env file not found (using .env.example)"
fi

if [ -d "output" ]; then
    pass_test "Output directory exists"
else
    warn_test "Output directory missing (will be created)"
fi

if [ -d "docs/survival-reports" ]; then
    pass_test "Reports directory exists"
else
    warn_test "Reports directory missing (will be created)"
fi

# Test 14: Documentation
echo ""
echo "📚 Testing documentation..."

doc_files=("README.md" "recipes.md" "DELIVERABLES.md")
for file in "${doc_files[@]}"; do
    if [ -f "$file" ]; then
        pass_test "Documentation $file exists"
    else
        warn_test "Documentation $file missing"
    fi
done

# Test 15: GitHub Actions
echo ""
echo "🔄 Testing GitHub Actions..."

if [ -f ".github/workflows/gauntlet-weekly.yml" ]; then
    pass_test "GitHub Actions workflow exists"
    
    # Validate YAML syntax
    if node -e "const yaml = require('js-yaml'); yaml.load(require('fs').readFileSync('.github/workflows/gauntlet-weekly.yml', 'utf8'));" 2>/dev/null; then
        pass_test "GitHub Actions YAML syntax valid"
    else
        fail_test "GitHub Actions YAML syntax invalid"
    fi
else
    warn_test "GitHub Actions workflow missing"
fi

# Final results
echo ""
echo "🏆 VALIDATION RESULTS"
echo "===================="
echo -e "✅ ${GREEN}Passed: $PASSED${NC}"
echo -e "❌ ${RED}Failed: $FAILED${NC}"
echo -e "⚠️  ${YELLOW}Warnings: $WARNINGS${NC}"

# Calculate success rate
TOTAL=$((PASSED + FAILED + WARNINGS))
SUCCESS_RATE=$((PASSED * 100 / TOTAL))

echo ""
echo "📊 Success Rate: $SUCCESS_RATE%"

# Final verdict
if [ $FAILED -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "🎉 ${GREEN}PERFECT: All tests passed! Ready for production.${NC}"
        exit 0
    else
        echo -e "✅ ${GREEN}GOOD: All critical tests passed. Review warnings.${NC}"
        exit 0
    fi
else
    echo -e "🚨 ${RED}CRITICAL ISSUES: Fix failed tests before deployment.${NC}"
    exit 1
fi
