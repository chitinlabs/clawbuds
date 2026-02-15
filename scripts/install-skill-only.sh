#!/bin/bash
# Install ClawBuds skill to OpenClaw (CLI already installed via npm)
# Usage: curl -fsSL https://raw.githubusercontent.com/your-org/clawbuds/main/scripts/install-skill-only.sh | bash

set -e

# Configuration
GITHUB_REPO="your-org/clawbuds"  # 替换为实际的仓库地址
BRANCH="main"
SKILL_URL="https://github.com/${GITHUB_REPO}/archive/refs/heads/${BRANCH}.tar.gz"
OPENCLAW_DIR="$HOME/.openclaw"
SKILLS_DIR="$OPENCLAW_DIR/skills"

echo "🦞 Installing ClawBuds Skill to OpenClaw"
echo "=========================================="
echo ""

# Check if OpenClaw is installed
if [ ! -d "$OPENCLAW_DIR" ]; then
    echo "❌ OpenClaw not found at $OPENCLAW_DIR"
    echo ""
    echo "This script is for OpenClaw users only."
    echo "If you just want the CLI, use: npm install -g clawbuds"
    exit 1
fi

# Check if CLI is installed
if ! command -v clawbuds &> /dev/null; then
    echo "⚠️  ClawBuds CLI not found."
    echo ""
    echo "Please install the CLI first:"
    echo "  npm install -g clawbuds"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Create skills directory
echo "📁 Creating skills directory..."
mkdir -p "$SKILLS_DIR"

# Download and extract skill
echo "📥 Downloading ClawBuds skill..."
TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"

# Download tarball
if command -v curl &> /dev/null; then
    curl -L "$SKILL_URL" -o clawbuds.tar.gz
elif command -v wget &> /dev/null; then
    wget "$SKILL_URL" -O clawbuds.tar.gz
else
    echo "❌ Neither curl nor wget found. Please install one of them."
    exit 1
fi

# Extract skill directory
tar -xzf clawbuds.tar.gz --strip-components=2 "clawbuds-${BRANCH}/openclaw-skill"

# Copy to OpenClaw skills directory
echo "📋 Installing skill..."
rm -rf "$SKILLS_DIR/clawbuds"
cp -r clawbuds "$SKILLS_DIR/"

# Cleanup
cd /
rm -rf "$TMP_DIR"

echo ""
echo "✅ ClawBuds skill installed successfully!"
echo ""
echo "📍 Location: $SKILLS_DIR/clawbuds"
echo ""
echo "🚀 Next steps:"
echo "  1. Make sure you have a ClawBuds server running"
echo "  2. Run the setup script:"
echo "     bash ~/.openclaw/skills/clawbuds/scripts/setup.sh <server-url>"
echo ""
echo "📚 Documentation:"
echo "  https://github.com/${GITHUB_REPO}/blob/main/docs/OPENCLAW_QUICKSTART.md"
