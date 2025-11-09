#!/bin/bash

# CredLink MVP - Simple Startup Script
# This script starts everything you need

echo "🚀 Starting CredLink MVP..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20+ first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3 first."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo "✅ Python version: $(python3 --version)"
echo ""

# Navigate to API directory
cd apps/verify-api

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies (first time only)..."
    npm install
    echo ""
fi

# Check if dist exists
if [ ! -d "dist" ]; then
    echo "🔨 Building application (first time only)..."
    npm run build
    echo ""
fi

# Kill any existing processes on our ports
echo "🧹 Cleaning up old processes..."
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
sleep 1

# Start API server in background
echo "🚀 Starting API server on port 3001..."
USE_REAL_CRYPTO=true NODE_ENV=development PORT=3001 ALLOWED_ORIGINS="http://localhost:8000,http://127.0.0.1:8000,http://localhost:3000" node dist/index.js > /tmp/credlink-api.log 2>&1 &
API_PID=$!
echo "   API Server PID: $API_PID"

# Wait for API to start
echo "⏳ Waiting for API server to start..."
for i in {1..10}; do
    if curl -s http://localhost:3001/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ API server is running!${NC}"
        break
    fi
    sleep 1
    if [ $i -eq 10 ]; then
        echo "❌ API server failed to start. Check logs: tail -f /tmp/credlink-api.log"
        exit 1
    fi
done

# Go back to project root
cd "$SCRIPT_DIR"

# Start web server in background
echo "🌐 Starting web server on port 8000..."
python3 -m http.server 8000 > /tmp/credlink-web.log 2>&1 &
WEB_PID=$!
echo "   Web Server PID: $WEB_PID"

# Wait for web server to start
sleep 2
if curl -s http://localhost:8000 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Web server is running!${NC}"
else
    echo "❌ Web server failed to start"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}🎉 CredLink MVP is running!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${BLUE}📤 Upload Page:${NC}  http://localhost:8000/demo/upload.html"
echo -e "${BLUE}🖼️  Gallery Page:${NC} http://localhost:8000/demo/gallery-enhanced.html"
echo -e "${BLUE}🔧 API Server:${NC}   http://localhost:3001"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${YELLOW}📝 Instructions:${NC}"
echo "   1. Open the Upload Page in your browser"
echo "   2. Drag & drop an image or click to browse"
echo "   3. Fill in your email and image details"
echo "   4. Click 'Sign Image'"
echo "   5. View signed images in the Gallery"
echo ""
echo -e "${YELLOW}🛑 To stop the servers:${NC}"
echo "   Press Ctrl+C in this terminal"
echo ""
echo -e "${YELLOW}📋 View logs:${NC}"
echo "   API:  tail -f /tmp/credlink-api.log"
echo "   Web:  tail -f /tmp/credlink-web.log"
echo ""

# Open browser automatically (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🌐 Opening browser..."
    sleep 2
    open "http://localhost:8000/demo/upload.html"
fi

# Keep script running and handle Ctrl+C
trap 'echo ""; echo "🛑 Stopping servers..."; kill $API_PID $WEB_PID 2>/dev/null; echo "✅ Servers stopped"; exit 0' INT

echo "⏳ Servers are running. Press Ctrl+C to stop."
echo ""

# Wait for processes
wait
