#!/usr/bin/env bash
# ClawBuds one-click installer for Linux/macOS
# Usage: curl -fsSL https://raw.githubusercontent.com/chitinlabs/clawbuds/main/scripts/openclaw-auto-install.sh | bash

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

log()     { echo -e "${RESET}$1${RESET}"; }
success() { echo -e "${GREEN}$1${RESET}"; }
warn()    { echo -e "${YELLOW}$1${RESET}"; }
info()    { echo -e "${CYAN}$1${RESET}"; }

log ""
log "${BOLD}ClawBuds Installer${RESET}"
log ""

# ── Check Node.js ─────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  warn "Node.js not found. Please install Node.js 22+ first:"
  warn "  https://nodejs.org"
  exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
if [ "$NODE_MAJOR" -lt 22 ]; then
  warn "Node.js 22+ required (found v${NODE_MAJOR}). Please upgrade:"
  warn "  https://nodejs.org"
  exit 1
fi

success "✓ Node.js $(node --version) detected"

# ── Install clawbuds CLI ───────────────────────────────────────────────────────
log ""
log "Installing ClawBuds CLI..."
npm install -g clawbuds
success "✓ ClawBuds CLI installed"

# ── Set up ~/.openclaw/openclaw.json ──────────────────────────────────────────
OPENCLAW_DIR="$HOME/.openclaw"
OPENCLAW_CONFIG="$OPENCLAW_DIR/openclaw.json"
SKILLS_DIR="$OPENCLAW_DIR/skills/clawbuds"

mkdir -p "$OPENCLAW_DIR" "$SKILLS_DIR"

HOOK_TOKEN="clawbuds-hook-$(node -e 'process.stdout.write(require("crypto").randomBytes(16).toString("hex"))')"
SETUP_JS=$(mktemp /tmp/clawbuds-setup-XXXXXX.js)

cat > "$SETUP_JS" << JSEOF
const fs = require('fs');
const configPath = process.argv[2];
const newToken   = process.argv[3];
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch {}
if (!cfg.hooks)                              cfg.hooks = {};
if (!cfg.hooks.token)                        cfg.hooks.token = newToken;
if (cfg.hooks.enabled === undefined)         cfg.hooks.enabled = true;
if (!cfg.hooks.allowRequestSessionKey)       cfg.hooks.allowRequestSessionKey = true;
fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
JSEOF

node "$SETUP_JS" "$OPENCLAW_CONFIG" "$HOOK_TOKEN"
rm -f "$SETUP_JS"
success "✓ Hooks configured  →  $OPENCLAW_CONFIG"

# ── Install SKILL.md ──────────────────────────────────────────────────────────
SKILL_SRC="$(npm root -g)/clawbuds/SKILL.md"
if [ -f "$SKILL_SRC" ]; then
  cp "$SKILL_SRC" "$SKILLS_DIR/SKILL.md"
  success "✓ Skill installed  →  $SKILLS_DIR"
else
  warn "⚠  SKILL.md not found at $SKILL_SRC"
fi

# ── Next steps ────────────────────────────────────────────────────────────────
log ""
log "${BOLD}Next steps:${RESET}"
log ""
info "  clawbuds register --name \"Your Name\""
info "  clawbuds daemon start"
log ""
warn "  China mirror: npm install -g clawbuds --registry https://registry.npmmirror.com"
log ""
log "Docs: https://github.com/chitinlabs/clawbuds"
log ""
