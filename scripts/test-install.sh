#!/usr/bin/env bash
# =============================================================================
# ClawBuds install verification script
# Tests that the npm package is correctly structured and install artifacts work.
# Does NOT do a real global install — checks package contents and CDN access.
# =============================================================================
# Usage:
#   bash scripts/test-install.sh            # run from repo root
#   bash scripts/test-install.sh --live     # also test CDN URLs (requires internet)
# =============================================================================

set -euo pipefail

LIVE=0
for arg in "$@"; do
  [ "$arg" = "--live" ] && LIVE=1
done

PASS=0
FAIL=0

ok()   { echo "  ✓ $*"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $*"; FAIL=$((FAIL+1)); }
step() { echo ""; echo "── $* ──────────────────────────────────────────"; }

echo ""
echo "🧪 ClawBuds Install Verification"
echo "================================="

# ── Test 1: npm package metadata ─────────────────────────────────────────────
step "Test 1: npm package registry"

if npm view clawbuds version >/dev/null 2>&1; then
  VERSION=$(npm view clawbuds version 2>/dev/null)
  ok "npm package 'clawbuds' exists (version: $VERSION)"
else
  fail "npm package 'clawbuds' not found on registry"
fi

# ── Test 2: Local package.json files field ───────────────────────────────────
step "Test 2: package.json files field (skill/package.json)"

SKILL_PKG="skill/package.json"
if [ ! -f "$SKILL_PKG" ]; then
  fail "skill/package.json not found — run from repo root"
else
  for required in "SKILL.md" "references" "scripts/postinstall.js" "scripts/openclaw-auto-install.sh"; do
    if grep -q "\"$required\"" "$SKILL_PKG"; then
      ok "files includes: $required"
    else
      fail "files is missing: $required (users won't receive it on npm install)"
    fi
  done
fi

# ── Test 3: SKILL.md structure ───────────────────────────────────────────────
step "Test 3: skill/SKILL.md structure"

SKILL_MD="skill/SKILL.md"
if [ ! -f "$SKILL_MD" ]; then
  fail "skill/SKILL.md not found"
else
  grep -q '^name: clawbuds'   "$SKILL_MD" && ok "name: clawbuds" || fail "name field missing"
  grep -q '"openclaw"'         "$SKILL_MD" && ok "metadata.openclaw present" || fail "metadata.openclaw missing"
  grep -q '"kind":"node"'      "$SKILL_MD" && ok "install kind:node present" || fail "install[].kind:node missing"
  grep -q '"bins":\["clawbuds"' "$SKILL_MD" && ok "requires.bins: clawbuds" || fail "requires.bins missing"
  grep -q 'friends'            "$SKILL_MD" && ok "English keyword in description" || fail "English keywords missing"
  grep -q '好友'               "$SKILL_MD" && ok "Chinese keyword in description" || fail "Chinese keywords missing"
fi

# ── Test 4: carapace templates ───────────────────────────────────────────────
step "Test 4: references/ carapace templates"

for lang in en zh; do
  tpl="skill/references/carapace.${lang}.md"
  if [ -f "$tpl" ]; then
    ok "carapace.${lang}.md exists"
  else
    fail "carapace.${lang}.md missing — language fallback will break"
  fi
done

# ── Test 5: postinstall.js logic checks ──────────────────────────────────────
step "Test 5: skill/scripts/postinstall.js sanity"

POSTINSTALL="skill/scripts/postinstall.js"
if [ ! -f "$POSTINSTALL" ]; then
  fail "postinstall.js not found"
else
  grep -q 'SKILL.md'              "$POSTINSTALL" && ok "copies SKILL.md" || fail "does not copy SKILL.md"
  grep -q 'openclaw.json'         "$POSTINSTALL" && ok "writes openclaw.json" || fail "does not write openclaw.json"
  grep -q 'skills/clawbuds'       "$POSTINSTALL" && ok "targets ~/.openclaw/skills/clawbuds/" || fail "target skill dir incorrect"
  grep -q 'allowRequestSessionKey' "$POSTINSTALL" && ok "sets allowRequestSessionKey" || fail "missing allowRequestSessionKey in hooks config"
fi

# ── Test 6: installer scripts ─────────────────────────────────────────────────
step "Test 6: installer scripts sanity"

for script in \
  "scripts/openclaw-auto-install.sh" \
  "scripts/openclaw-auto-install.ps1"; do
  if [ -f "$script" ]; then
    # Must NOT reference the old broken GitHub tar path
    if grep -q 'openclaw-skill' "$script" 2>/dev/null; then
      fail "$script still references deprecated 'openclaw-skill/' path"
    else
      ok "$script: no deprecated paths"
    fi
    # Must use clawbuds daemon start (not nohup clawbuds-daemon directly)
    if grep -qE 'nohup clawbuds-daemon|clawbuds-daemon &' "$script" 2>/dev/null; then
      fail "$script starts daemon directly instead of 'clawbuds daemon start'"
    else
      ok "$script: uses clawbuds daemon start"
    fi
  else
    fail "$script not found"
  fi
done

# ── Test 7: CDN / registry URLs (live, optional) ─────────────────────────────
if [ "$LIVE" -eq 1 ]; then
  step "Test 7: CDN URLs (live)"

  JSDELIVR="https://cdn.jsdelivr.net/npm/clawbuds@latest/scripts/openclaw-auto-install.sh"
  if curl -fsS -I "$JSDELIVR" >/dev/null 2>&1; then
    ok "jsDelivr URL accessible: $JSDELIVR"
  else
    fail "jsDelivr URL not accessible (CDN sync may be delayed)"
  fi

  NPMJS="https://registry.npmjs.org/clawbuds"
  if curl -fsS "$NPMJS" >/dev/null 2>&1; then
    ok "npm registry accessible"
  else
    fail "npm registry not accessible"
  fi

  NPMMIRROR="https://registry.npmmirror.com/clawbuds"
  if curl -fsS "$NPMMIRROR" >/dev/null 2>&1; then
    ok "npmmirror (CN mirror) accessible"
  else
    fail "npmmirror not accessible (may be a network issue)"
  fi
else
  echo ""
  echo "  (skipping live CDN tests — run with --live to include)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FAIL" -eq 0 ]; then
  echo "✅ All $PASS checks passed."
else
  echo "❌ $FAIL check(s) failed, $PASS passed."
  exit 1
fi
echo ""
