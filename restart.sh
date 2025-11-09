#!/bin/bash

# Quick restart script with all fixes applied

echo "🔄 Restarting CredLink with fixes..."
echo ""

# Kill old processes
echo "🛑 Stopping old servers..."
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
sleep 2

# Navigate to project
cd /Users/nicoladebbia/Code_Ideas/CredLink

# Start with the fixed script
echo "🚀 Starting servers..."
./start-simple.sh

echo ""
echo "✅ Servers restarted with CORS fix!"
echo ""
echo "🌐 Try uploading an image now at:"
echo "   http://localhost:8000/demo/upload.html"
echo ""
