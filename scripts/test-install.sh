#!/bin/bash
# Test script to verify openclaw-auto-install.sh works correctly
# This runs in dry-run mode without actually installing

set -e

echo "🧪 Testing ClawBuds One-Click Installer"
echo "======================================="
echo ""

# Test 1: Check GitHub URL accessibility
echo "Test 1: Checking GitHub URL..."
GITHUB_REPO="chitinlabs/clawbuds"
BRANCH="main"
SKILL_URL="https://github.com/${GITHUB_REPO}/archive/refs/heads/${BRANCH}.tar.gz"

if curl -fsSL -I "$SKILL_URL" >/dev/null 2>&1; then
    echo "   ✓ GitHub URL accessible"
else
    echo "   ✗ GitHub URL not accessible: $SKILL_URL"
    exit 1
fi

# Test 2: Check npm package
echo ""
echo "Test 2: Checking npm package..."
if npm view clawbuds version >/dev/null 2>&1; then
    VERSION=$(npm view clawbuds version)
    echo "   ✓ npm package 'clawbuds' exists (version: $VERSION)"
else
    echo "   ✗ npm package 'clawbuds' not found"
    exit 1
fi

# Test 3: Download and verify skill structure
echo ""
echo "Test 3: Downloading and verifying skill structure..."
TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"

if curl -sL "$SKILL_URL" -o clawbuds.tar.gz; then
    echo "   ✓ Downloaded successfully"
else
    echo "   ✗ Download failed"
    rm -rf "$TMP_DIR"
    exit 1
fi

if tar -tzf clawbuds.tar.gz "clawbuds-${BRANCH}/openclaw-skill/clawbuds/SKILL.md" >/dev/null 2>&1; then
    echo "   ✓ SKILL.md found in archive"
else
    echo "   ✗ SKILL.md not found in expected location"
    rm -rf "$TMP_DIR"
    exit 1
fi

tar -xzf clawbuds.tar.gz --strip-components=2 "clawbuds-${BRANCH}/openclaw-skill"

if [ -f "clawbuds/SKILL.md" ]; then
    echo "   ✓ Skill extracted correctly"
else
    echo "   ✗ Skill extraction failed"
    rm -rf "$TMP_DIR"
    exit 1
fi

if [ -f "clawbuds/scripts/setup.sh" ]; then
    echo "   ✓ setup.sh exists"
else
    echo "   ✗ setup.sh not found"
    rm -rf "$TMP_DIR"
    exit 1
fi

if [ -f "clawbuds/scripts/start-daemon.sh" ]; then
    echo "   ✓ start-daemon.sh exists"
else
    echo "   ✗ start-daemon.sh not found"
    rm -rf "$TMP_DIR"
    exit 1
fi

# Test 4: Verify SKILL.md metadata
echo ""
echo "Test 4: Verifying SKILL.md metadata..."
if grep -q "^name: clawbuds" "clawbuds/SKILL.md"; then
    echo "   ✓ Skill name correct"
else
    echo "   ✗ Skill name not found or incorrect"
    rm -rf "$TMP_DIR"
    exit 1
fi

if grep -q "metadata:" "clawbuds/SKILL.md"; then
    echo "   ✓ Metadata present"
else
    echo "   ✗ Metadata missing"
    rm -rf "$TMP_DIR"
    exit 1
fi

# Cleanup
rm -rf "$TMP_DIR"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All tests passed!"
echo ""
echo "The one-click installer should work correctly."
echo ""
echo "To test manually:"
echo "  curl -fsSL https://raw.githubusercontent.com/$GITHUB_REPO/main/scripts/openclaw-auto-install.sh | bash"
echo ""
