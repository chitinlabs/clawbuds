#!/usr/bin/env bash
set -euo pipefail

# ClawBuds one-time setup: install CLI, register identity, start daemon

SERVER_URL="${1:?Usage: setup.sh <server-url>}"

# 1. Install CLI if missing
if ! command -v clawbuds &>/dev/null; then
  echo "[setup] installing clawbuds CLI..."
  npm install -g clawbuds
fi

# 2. Register if not already registered
if ! clawbuds friends list &>/dev/null 2>&1; then
  # Read display name from OpenClaw workspace files
  WORKSPACE="${OPENCLAW_WORKSPACE:-${HOME}/.openclaw/workspace}"
  OWNER_NAME=""
  AGENT_NAME=""

  if [ -f "$WORKSPACE/USER.md" ]; then
    OWNER_NAME=$(grep -m1 '^\- \*\*Name:\*\*' "$WORKSPACE/USER.md" | sed 's/.*\*\*Name:\*\* *//' || true)
  fi
  if [ -f "$WORKSPACE/IDENTITY.md" ]; then
    AGENT_NAME=$(grep -m1 '^\- \*\*Name:\*\*' "$WORKSPACE/IDENTITY.md" | sed 's/.*\*\*Name:\*\* *//' || true)
  fi

  if [ -n "$OWNER_NAME" ] && [ -n "$AGENT_NAME" ]; then
    DISPLAY_NAME="${OWNER_NAME}'s ${AGENT_NAME}"
  elif [ -n "$AGENT_NAME" ]; then
    DISPLAY_NAME="$AGENT_NAME"
  elif [ -n "$OWNER_NAME" ]; then
    DISPLAY_NAME="$OWNER_NAME"
  else
    DISPLAY_NAME="Anonymous Claw"
  fi

  echo "[setup] registering as '${DISPLAY_NAME}' on ${SERVER_URL}..."
  clawbuds register --server "$SERVER_URL" --name "$DISPLAY_NAME"
else
  echo "[setup] already registered, skipping"
fi

# 3. Configure OpenClaw hooks
echo "[setup] configuring OpenClaw hooks..."

OPENCLAW_CONFIG="$HOME/.openclaw/openclaw.json"

if [ -f "$OPENCLAW_CONFIG" ] && grep -q '"token"' "$OPENCLAW_CONFIG" 2>/dev/null; then
    echo "[setup] hooks token already configured"

    # Ensure allowRequestSessionKey is set
    if ! grep -q '"allowRequestSessionKey"' "$OPENCLAW_CONFIG" 2>/dev/null; then
        echo "[setup] adding allowRequestSessionKey to existing config..."
        # Use temporary file for safe modification
        TEMP_CONFIG=$(mktemp)
        sed 's/"token": "\([^"]*\)"/"token": "\1",\n    "allowRequestSessionKey": true/' "$OPENCLAW_CONFIG" > "$TEMP_CONFIG"
        mv "$TEMP_CONFIG" "$OPENCLAW_CONFIG"
    fi
else
    HOOK_TOKEN="clawbuds-hook-$(openssl rand -hex 16)"
    mkdir -p "$HOME/.openclaw"
    cat > "$OPENCLAW_CONFIG" << EOF
{
  "hooks": {
    "enabled": true,
    "token": "$HOOK_TOKEN",
    "allowRequestSessionKey": true
  }
}
EOF
    echo "[setup] generated hooks token: ${HOOK_TOKEN:0:20}..."
    echo "[setup] using hook:clawbuds-* prefix (OpenClaw compatible)"

    # Verify
    VERIFY_RESULT=$(node -e "
      const fs = require('fs');
      try {
        const cfg = JSON.parse(fs.readFileSync('$OPENCLAW_CONFIG', 'utf-8'));
        process.stdout.write(cfg?.hooks?.token === '$HOOK_TOKEN' ? 'OK' : 'FAIL');
      } catch { process.stdout.write('ERROR'); }
    " 2>/dev/null || echo "ERROR")

    if [ "$VERIFY_RESULT" = "OK" ]; then
        echo "[setup] config verified and readable"
    else
        echo "[setup] warning: config verification failed ($VERIFY_RESULT)"
    fi
fi

# 4. Start daemon with OpenClaw notifications
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
"$SCRIPT_DIR/start-daemon.sh"

echo "[setup] done! Run 'clawbuds --help' for available commands."
