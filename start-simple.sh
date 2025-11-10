#!/bin/bash
# CredLink - Simple Local Start Script
# Starts the sign service backend

set -e

echo "🚀 CredLink - Starting Local Development Environment"
echo ""

# Check if we're in the right directory
if [ ! -d "apps/sign-service" ]; then
    echo "❌ Error: apps/sign-service directory not found"
    echo "Please run this script from the CredLink root directory"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ] || [ ! -d "apps/sign-service/node_modules" ]; then
    echo "📦 Installing dependencies..."
    pnpm install
fi

# Check if sign-service is built
if [ ! -d "apps/sign-service/dist" ]; then
    echo "🔨 Building sign-service..."
    cd apps/sign-service
    pnpm build
    cd ../..
fi

echo ""
echo "✅ Starting CredLink Sign Service on http://localhost:3001"
echo ""
echo "Available endpoints:"
echo "  - POST   http://localhost:3001/sign   (Sign images)"
echo "  - POST   http://localhost:3001/verify (Verify images)"
echo "  - GET    http://localhost:3001/health (Health check)"
echo "  - GET    http://localhost:3001/sign/stats (Statistics)"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Start the service
cd apps/sign-service
pnpm start
