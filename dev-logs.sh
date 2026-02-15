#!/usr/bin/env bash

PID_DIR=".dev-pids"
SERVER_LOG="$PID_DIR/server.log"
WEB_LOG="$PID_DIR/web.log"

# 检查日志文件是否存在
if [ ! -f "$SERVER_LOG" ] && [ ! -f "$WEB_LOG" ]; then
  echo "❌ 未找到日志文件"
  echo "   请先运行 ./dev-start.sh 启动服务"
  exit 1
fi

echo "📋 ClawBuds 开发日志"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 提示："
echo "   - 按 Ctrl+C 退出日志查看（不会停止服务）"
echo "   - 只查看后端: tail -f $SERVER_LOG"
echo "   - 只查看前端: tail -f $WEB_LOG"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 同时显示两个日志文件
tail -f "$SERVER_LOG" "$WEB_LOG"
