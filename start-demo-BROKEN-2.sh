#!/bin/bash

# CredLink Demo Startup Script
# Starts the API server and opens the demo UI

set -e

echo "🚀 Starting CredLink Demo..."
echo ""

# Check if we're in the right directory
if [ ! -d "apps/verify-api" ]; then
    echo "❌ Error: Must run from CredLink root directory"
    exit 1
fi

# Build the API if needed
echo "📦 Building API server..."
cd apps/verify-api
npm install --silent
npm run build

# Start the server in background
echo "🔧 Starting API server on http://localhost:3001..."
NODE_ENV=development LOG_LEVEL=info PORT=3001 HOST=localhost node dist/index.js &
SERVER_PID=$!

# Wait for server to be ready
echo "⏳ Waiting for server to start..."
sleep 2

# Check if server is running
if ! curl -s http://localhost:3001/health > /dev/null; then
    echo "❌ Server failed to start"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
fi

echo "✅ Server is running!"
echo ""
echo "📋 Demo URLs:"
echo "   Upload: http://localhost:8000/demo/upload.html"
echo "   Gallery: http://localhost:8000/demo/gallery.html"
echo "   API: http://localhost:3001"
echo ""
echo "🌐 Starting local web server on port 8000..."

# Go back to root
cd ../..

# Start a simple HTTP server for the demo files
python3 -m http.server 8000 &
WEB_PID=$!

echo ""
echo "✅ Demo is ready!"
echo ""
echo "📖 Instructions:"
echo "   1. Open http://localhost:8000/demo/upload.html in your browser"
echo "   2. Upload an image and fill in the creator name"
echo "   3. Click 'Sign Image' to create a signed manifest"
echo "   4. View your signed images in the gallery"
echo ""
echo "🛑 To stop the demo, press Ctrl+C"
echo ""

# Trap Ctrl+C to clean up
trap "echo ''; echo '🛑 Stopping demo...'; kill $SERVER_PID $WEB_PID 2>/dev/null; exit 0" INT

# Wait for user to stop
wait
