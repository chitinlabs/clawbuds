#!/usr/bin/env bash
set -euo pipefail

echo "ClawBuds OpenClaw Hooks Auto-Fix"
echo "================================="
echo ""

# 1. Check OpenClaw
if [ ! -d ~/.openclaw ]; then
  echo "ERROR: OpenClaw not installed (~/.openclaw does not exist)"
  exit 1
fi
echo "[OK] OpenClaw installed"

# 2. Check ClawBuds CLI
if ! command -v clawbuds &>/dev/null; then
  echo "ERROR: ClawBuds CLI not installed"
  echo "   Run: npm install -g clawbuds"
  exit 1
fi
echo "[OK] ClawBuds CLI installed"

# 3. Generate or read token
CONFIG_FILE=~/.openclaw/openclaw.json
if [ -f "$CONFIG_FILE" ] && command -v jq &>/dev/null && jq -e '.hooks.token' "$CONFIG_FILE" &>/dev/null; then
  TOKEN=$(jq -r '.hooks.token' "$CONFIG_FILE")
  echo "[OK] Using existing token: ${TOKEN:0:16}..."
else
  TOKEN="clawbuds-hook-$(openssl rand -hex 16)"
  mkdir -p ~/.openclaw
  cat > "$CONFIG_FILE" << EOF
{
  "hooks": {
    "enabled": true,
    "token": "$TOKEN"
  }
}
EOF
  echo "[OK] Generated new token: ${TOKEN:0:16}..."
fi

# 4. Stop existing daemon
if [ -f ~/.clawbuds/daemon.pid ]; then
  PID=$(cat ~/.clawbuds/daemon.pid)
  if kill -0 "$PID" 2>/dev/null; then
    echo "[INFO] Stopping existing daemon (PID: $PID)..."
    kill "$PID" 2>/dev/null || true
    sleep 1
  fi
fi

# 5. Start daemon
echo "[INFO] Starting daemon..."
mkdir -p ~/.clawbuds
nohup clawbuds-daemon > ~/.clawbuds/daemon.log 2>&1 &
DAEMON_PID=$!
echo $DAEMON_PID > ~/.clawbuds/daemon.pid
echo "[OK] Daemon started (PID: $DAEMON_PID)"

# 6. Verify
sleep 2
if [ -f ~/.clawbuds/daemon.log ]; then
  echo ""
  echo "Daemon log (last 10 lines):"
  echo "----------------------------"
  tail -10 ~/.clawbuds/daemon.log
fi

echo ""
echo "Configuration complete!"
echo ""
echo "Next steps:"
echo "  1. View real-time log: tail -f ~/.clawbuds/daemon.log"
echo "  2. Check status: clawbuds daemon status"
echo "  3. Test message notifications"
