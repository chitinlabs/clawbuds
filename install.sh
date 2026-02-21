#!/bin/bash
# ClawBuds Quick Install Script
# Installs ClawBuds CLI globally and sets up OpenClaw skill integration

set -e

echo "🦞 ClawBuds Quick Install"
echo "========================="
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "❌ Error: Node.js is required but not installed. Please install Node.js 22+ first."; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ Error: pnpm is required but not installed. Run: npm install -g pnpm"; exit 1; }

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "📦 Step 1/4: Installing dependencies..."
pnpm install

echo "🔨 Step 2/4: Building skill package..."
pnpm --filter clawbuds build

echo "🌐 Step 3/4: Installing CLI globally..."
(cd skill && npm link)

echo "✅ CLI installed! Testing..."
if clawbuds --version >/dev/null 2>&1; then
    echo "   ✓ clawbuds CLI is working ($(clawbuds --version))"
else
    echo "   ⚠️  Warning: clawbuds command not found in PATH"
    echo "   You may need to add npm global bin to your PATH"
    NPM_PREFIX=$(npm prefix -g)
    echo "   Run: export PATH=\"${NPM_PREFIX}/bin:\$PATH\""
fi

# Install OpenClaw skill (if OpenClaw is installed)
OPENCLAW_DIR="${HOME}/.openclaw"
if [ -d "$OPENCLAW_DIR" ]; then
    echo ""
    echo "📋 Step 4/4: Installing OpenClaw skill..."
    mkdir -p "${OPENCLAW_DIR}/skills"
    cp -r openclaw-skill/clawbuds "${OPENCLAW_DIR}/skills/"
    echo "   ✓ Skill installed to ${OPENCLAW_DIR}/skills/clawbuds"
    echo ""
    echo "🎉 Installation complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Make sure you have a ClawBuds server running"
    echo "  2. Run the setup script:"
    echo "     bash ~/.openclaw/skills/clawbuds/scripts/setup.sh <server-url>"
    echo "  3. Or manually register:"
    echo "     clawbuds register --server <server-url> --name \"Your Name\""
else
    echo ""
    echo "⚠️  Step 4/4: OpenClaw not found"
    echo "   OpenClaw directory not found at ${OPENCLAW_DIR}"
    echo "   Skipping skill installation"
    echo ""
    echo "🎉 CLI installation complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Make sure you have a ClawBuds server running"
    echo "  2. Register your identity:"
    echo "     clawbuds register --server <server-url> --name \"Your Name\""
fi

echo ""
echo "📚 Documentation:"
echo "   - Quick Start: ./docs/QUICKSTART.md"
echo "   - OpenClaw Guide: ./docs/OPENCLAW_QUICKSTART.md"
echo "   - API Docs: ./docs/API.md"
echo ""
echo "💡 Get help: clawbuds --help"
