#!/bin/bash

# Test PostgreSQL Setup Script
# Sets up a test database for RBAC validation

set -e

echo "🔧 Setting up test PostgreSQL database..."

# Check if PostgreSQL is running
if ! pg_isready -q; then
    echo "❌ PostgreSQL is not running. Please start PostgreSQL service."
    echo "   macOS: brew services start postgresql"
    echo "   Ubuntu: sudo systemctl start postgresql"
    exit 1
fi

# Create test database
echo "📦 Creating test database..."
createdb rbac_test_2 || echo "Database might already exist"

# Set environment variables for testing
export DATABASE_URL="postgresql://postgres@localhost:5432/rbac_test_2"
export TEST_DATABASE_URL="postgresql://postgres@localhost:5432/rbac_test_2"

echo "✅ Test database setup complete"
echo "🔗 DATABASE_URL: $DATABASE_URL"
echo "🚀 Ready to run migration tests"
