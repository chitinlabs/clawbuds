#!/usr/bin/env bash
set -euo pipefail

echo "🔧 ClawBuds OpenClaw Hooks 自动修复"
echo "=================================="
echo ""

# 1. 检查 OpenClaw
if [ ! -d ~/.openclaw ]; then
  echo "❌ OpenClaw 未安装（~/.openclaw 不存在）"
  exit 1
fi
echo "✓ OpenClaw 已安装"

# 2. 检查 ClawBuds CLI
if ! command -v clawbuds &>/dev/null; then
  echo "❌ ClawBuds CLI 未安装"
  echo "   运行: npm install -g clawbuds"
  exit 1
fi
echo "✓ ClawBuds CLI 已安装"

# 3. 生成或读取 token
CONFIG_FILE=~/.openclaw/openclaw.json
if [ -f "$CONFIG_FILE" ] && command -v jq &>/dev/null && jq -e '.hooks.token' "$CONFIG_FILE" &>/dev/null; then
  TOKEN=$(jq -r '.hooks.token' "$CONFIG_FILE")
  echo "✓ 使用现有 token: ${TOKEN:0:16}..."
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
  echo "✓ 生成新 token: ${TOKEN:0:16}..."
fi

# 4. 停止现有 daemon
if [ -f ~/.clawbuds/daemon.pid ]; then
  PID=$(cat ~/.clawbuds/daemon.pid)
  if kill -0 "$PID" 2>/dev/null; then
    echo "⏸️  停止现有 daemon (PID: $PID)..."
    kill "$PID" 2>/dev/null || true
    sleep 1
  fi
fi

# 5. 启动 daemon
echo "🚀 启动 daemon..."
mkdir -p ~/.clawbuds
nohup clawbuds-daemon > ~/.clawbuds/daemon.log 2>&1 &
DAEMON_PID=$!
echo $DAEMON_PID > ~/.clawbuds/daemon.pid
echo "✓ Daemon 已启动 (PID: $DAEMON_PID)"

# 6. 验证
sleep 2
if [ -f ~/.clawbuds/daemon.log ]; then
  echo ""
  echo "📋 Daemon 日志（最近 10 行）："
  tail -10 ~/.clawbuds/daemon.log
fi

echo ""
echo "✅ 配置完成！"
echo ""
echo "后续步骤："
echo "  1. 查看实时日志: tail -f ~/.clawbuds/daemon.log"
echo "  2. 检查状态: clawbuds daemon status"
echo "  3. 测试收消息功能"
