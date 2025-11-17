#!/bin/bash

echo "=== Running Test Assessment ==="

# Run tests with detailed output
ENCRYPTION_KEY=test-key-32-chars-long-here! pnpm test --verbose --coverage --json > test-results.json 2>&1
TEST_EXIT_CODE=$?

echo "Test exit code: $TEST_EXIT_CODE"

# Parse results
if [ $TEST_EXIT_CODE -ne 0 ]; then
    echo "❌ Tests are failing"
    
    # Extract failing test files
    grep -E "FAIL|✗" test-results.json | head -20
    
    # Get coverage report
    echo "=== Current Coverage ==="
    grep -E "All files|Lines|Functions|Branches|Statements" coverage/lcov-report/index.txt || echo "Coverage report not found"
else
    echo "✅ All tests passing"
fi

# Check test files
echo "=== Test File Analysis ==="
find . -name "*.test.ts" -o -name "*.spec.ts" | wc -l
echo "Test files found"

# Check for missing tests
echo "=== Missing Test Coverage ==="
find apps/api/src -name "*.ts" ! -name "*.test.ts" ! -name "*.spec.ts" | head -10
