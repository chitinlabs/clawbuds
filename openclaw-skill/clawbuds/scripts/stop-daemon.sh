#!/usr/bin/env bash
set -euo pipefail

PID_FILE="${CLAWBUDS_CONFIG_DIR:-${HOME}/.clawbuds}/daemon.pid"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "[daemon] stopped (PID: $PID)"
  else
    echo "[daemon] not running (stale PID: $PID)"
  fi
  rm -f "$PID_FILE"
else
  echo "[daemon] not running (no PID file)"
fi
