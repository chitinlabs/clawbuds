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

# 3. Start daemon with OpenClaw notifications
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
"$SCRIPT_DIR/start-daemon.sh"

echo "[setup] done! Run 'clawbuds --help' for available commands."
