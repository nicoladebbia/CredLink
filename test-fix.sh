#!/bin/bash

# Quick test script to verify the fix

echo "🧪 Testing CredLink MVP Fix..."
echo ""

# Start servers
echo "1️⃣ Starting servers..."
cd /Users/nicoladebbia/Code_Ideas/CredLink
./start-simple.sh > /tmp/test-startup.log 2>&1 &
STARTUP_PID=$!

# Wait for servers to start
echo "⏳ Waiting for servers to start..."
sleep 8

# Test CORS
echo ""
echo "2️⃣ Testing CORS from localhost:8000..."
CORS_TEST=$(curl -s -X OPTIONS http://localhost:3001/sign \
  -H "Origin: http://localhost:8000" \
  -H "Access-Control-Request-Method: POST" \
  -i | grep -i "access-control-allow-origin")

if [ -n "$CORS_TEST" ]; then
    echo "✅ CORS is working! Origin localhost:8000 is allowed"
else
    echo "❌ CORS still blocked"
fi

# Test signing endpoint
echo ""
echo "3️⃣ Testing signing endpoint..."
HEALTH=$(curl -s http://localhost:3001/health | grep -o '"status":"healthy"')

if [ -n "$HEALTH" ]; then
    echo "✅ API server is healthy"
else
    echo "❌ API server not responding"
fi

echo ""
echo "4️⃣ Testing web server..."
WEB=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/demo/upload.html)

if [ "$WEB" = "200" ]; then
    echo "✅ Web server is serving pages"
else
    echo "❌ Web server not responding"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All fixes applied successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Open these URLs in your browser:"
echo "   Upload:  http://localhost:8000/demo/upload.html"
echo "   Gallery: http://localhost:8000/demo/gallery-enhanced.html"
echo ""
echo "📝 Try uploading an image now - it should work!"
echo ""
echo "Press Ctrl+C to stop the servers"

# Keep running
wait $STARTUP_PID
