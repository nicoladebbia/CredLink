#!/bin/bash

# C2C Hostile CDN Gauntlet - Installation Script
# This script installs all dependencies and sets up the environment

set -e  # Exit on any error

echo "🔥 C2C Hostile CDN Gauntlet - Installation"
echo "=============================================="

# Check Node.js version
echo "📋 Checking Node.js version..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version 16+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Check npm version
echo "📋 Checking npm version..."
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    exit 1
fi

echo "✅ npm version: $(npm -v)"

# Install dependencies
echo "📦 Installing npm dependencies..."
npm install

# Check for c2patool
echo "🔧 Checking for c2patool..."
if ! command -v c2patool &> /dev/null; then
    echo "⚠️  c2patool not found in PATH"
    echo "💡 To install c2patool:"
    echo "   npm install -g @contentauth/c2patool"
    echo "   or download from: https://github.com/contentauth/c2patool"
    echo ""
    echo "🔄 Continuing without c2patool (Sharp fallback will be used)..."
else
    echo "✅ c2patool found: $(c2patool --version)"
fi

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p output
mkdir -p docs/survival-reports
mkdir -p /tmp/gauntlet

# Copy environment configuration
echo "⚙️  Setting up environment..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env file from .env.example"
    echo "⚠️  Please edit .env file with your actual configuration"
else
    echo "✅ .env file already exists"
fi

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# Test basic functionality
echo "🧪 Testing basic functionality..."
echo "Testing URL generation..."
npm run build-urls

if [ $? -eq 0 ]; then
    echo "✅ URL generation test passed"
else
    echo "❌ URL generation test failed"
    exit 1
fi

# Check provider configurations
echo "📋 Validating provider configurations..."
for provider in providers/*.yaml; do
    if [ -f "$provider" ]; then
        provider_name=$(basename "$provider" .yaml)
        echo "✅ Provider configuration found: $provider_name"
    fi
done

# Check matrix configuration
echo "📋 Validating matrix configuration..."
if [ -f "matrix.yaml" ]; then
    echo "✅ Matrix configuration found"
else
    echo "❌ Matrix configuration not found"
    exit 1
fi

# Create systemd service file (optional)
echo "🔧 Creating systemd service file..."
cat > c2c-gauntlet.service << EOF
[Unit]
Description=C2C Hostile CDN Gauntlet
After=network.target

[Service]
Type=simple
User=gauntlet
WorkingDirectory=$(pwd)
Environment=NODE_ENV=production
ExecStart=$(which node) dist/cli.js run
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=c2c-gauntlet

[Install]
WantedBy=multi-user.target
EOF

echo "✅ Systemd service file created: c2c-gauntlet.service"
echo "💡 To install: sudo cp c2c-gauntlet.service /etc/systemd/system/"
echo "💡 To enable: sudo systemctl enable c2c-gauntlet"
echo "💡 To start: sudo systemctl start c2c-gauntlet"

# Create logrotate configuration
echo "📋 Creating logrotate configuration..."
cat > logrotate-c2c-gauntlet << EOF
/var/log/c2c-gauntlet/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 gauntlet gauntlet
    postrotate
        systemctl reload c2c-gauntlet || true
    endscript
}
EOF

echo "✅ Logrotate configuration created: logrotate-c2c-gauntlet"
echo "💡 To install: sudo cp logrotate-c2c-gauntlet /etc/logrotate.d/"

# Installation summary
echo ""
echo "🎉 Installation completed successfully!"
echo "======================================"
echo ""
echo "📁 Directories created:"
echo "   - output/ (test results)"
echo "   - docs/survival-reports/ (HTML reports)"
echo "   - /tmp/gauntlet/ (temporary files)"
echo ""
echo "⚙️  Configuration files:"
echo "   - .env (environment variables)"
echo "   - c2c-gauntlet.service (systemd service)"
echo "   - logrotate-c2c-gauntlet (log rotation)"
echo ""
echo "🚀 Next steps:"
echo "   1. Edit .env file with your actual configuration"
echo "   2. Set up CDN provider endpoints"
echo "   3. Install c2patool for full C2PA verification"
echo "   4. Run: npm run test (for a quick test)"
echo "   5. Run: npm run validate (for full validation)"
echo ""
echo "📚 Documentation:"
echo "   - README.md (usage guide)"
echo "   - recipes.md (provider configurations)"
echo "   - DELIVERABLES.md (project summary)"
echo ""
echo "🔥 Ready to run: C2C Hostile CDN Gauntlet v1.0"
