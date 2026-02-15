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
  # Try to read token from config
  READ_RESULT=$(node -e "
    const fs = require('fs');
    try {
      const cfg = JSON.parse(fs.readFileSync('$OPENCLAW_CONFIG', 'utf-8'));
      if (cfg?.hooks?.token) {
        process.stdout.write('OK:' + cfg.hooks.token);
      } else {
        process.stdout.write('NO_TOKEN');
      }
    } catch (err) {
      process.stdout.write('ERROR:' + err.message);
    }
  " 2>&1)

  case "$READ_RESULT" in
    OK:*)
      OPENCLAW_HOOKS_TOKEN="${READ_RESULT#OK:}"
      echo "[daemon] Loaded hooks token from $OPENCLAW_CONFIG"
      ;;
    NO_TOKEN)
      echo "[daemon] Warning: $OPENCLAW_CONFIG exists but hooks.token not found"
      ;;
    ERROR:*)
      echo "[daemon] Warning: Failed to parse $OPENCLAW_CONFIG: ${READ_RESULT#ERROR:}"
      echo "[daemon] Config content preview:"
      head -5 "$OPENCLAW_CONFIG" 2>/dev/null | sed 's/^/  /'
      ;;
  esac
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
