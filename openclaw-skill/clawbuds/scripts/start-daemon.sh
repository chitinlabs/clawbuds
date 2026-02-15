#!/usr/bin/env bash
set -euo pipefail

# Start clawbuds-daemon with OpenClaw hooks integration
# Config priority: .env file -> environment -> defaults

CONFIG_DIR="${CLAWBUDS_CONFIG_DIR:-${HOME}/.clawbuds}"
ENV_FILE="${CONFIG_DIR}/.env"
OPENCLAW_CONFIG="${HOME}/.openclaw/openclaw.json"
PID_FILE="${CONFIG_DIR}/daemon.pid"

# Load .env if exists
if [ -f "$ENV_FILE" ]; then
  echo "[daemon] loading config from ${ENV_FILE}"
  set -a
  # shellcheck source=/dev/null
  . "$ENV_FILE"
  set +a
fi

# Kill existing daemon if running
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "[daemon] stopping existing daemon (PID: $(cat "$PID_FILE"))..."
  kill "$(cat "$PID_FILE")" 2>/dev/null || true
  sleep 1
fi

# Read hooks token from openclaw.json (if not already set via .env)
if [ -z "${OPENCLAW_HOOKS_TOKEN:-}" ] && [ -f "$OPENCLAW_CONFIG" ]; then
  OPENCLAW_HOOKS_TOKEN=$(node -e "
    const fs = require('fs');
    try {
      const cfg = JSON.parse(fs.readFileSync('$OPENCLAW_CONFIG', 'utf-8'));
      process.stdout.write(cfg?.hooks?.token || '');
    } catch { }
  " 2>/dev/null || true)
fi

if [ -z "${OPENCLAW_HOOKS_TOKEN:-}" ]; then
  echo ""
  echo "[daemon] OpenClaw hooks not configured — real-time notifications will be disabled."
  echo "[daemon] To enable, either:"
  echo ""
  echo "  1. Add hooks.token to ~/.openclaw/openclaw.json:"
  echo '     "hooks": { "enabled": true, "token": "your-secret" }'
  echo ""
  echo "  2. Or create ${ENV_FILE} with:"
  echo '     OPENCLAW_HOOKS_TOKEN=your-secret'
  echo ""
fi

# Ensure log directory exists
mkdir -p "$CONFIG_DIR"

# Start daemon in background
export OPENCLAW_HOOKS_TOKEN="${OPENCLAW_HOOKS_TOKEN:-}"
export OPENCLAW_HOOKS_URL="${OPENCLAW_HOOKS_URL:-}"
export OPENCLAW_HOOKS_CHANNEL="${OPENCLAW_HOOKS_CHANNEL:-}"
export CLAWBUDS_POLL_DIGEST_MS="${CLAWBUDS_POLL_DIGEST_MS:-}"
export CLAWBUDS_SERVER="${CLAWBUDS_SERVER:-}"
export CLAWBUDS_CONFIG_DIR="${CLAWBUDS_CONFIG_DIR:-}"

nohup clawbuds-daemon > "$CONFIG_DIR/daemon.log" 2>&1 &

DAEMON_PID=$!
echo "$DAEMON_PID" > "$PID_FILE"
echo "[daemon] started (PID: $DAEMON_PID, log: $CONFIG_DIR/daemon.log)"
