#!/usr/bin/env bash

PID_DIR=".dev-pids"
SERVER_PID_FILE="$PID_DIR/server.pid"
WEB_PID_FILE="$PID_DIR/web.pid"

echo "🛑 停止 ClawBuds 开发环境..."
echo ""

STOPPED=0

# 停止后端服务
if [ -f "$SERVER_PID_FILE" ]; then
  SERVER_PID=$(cat "$SERVER_PID_FILE")
  if ps -p "$SERVER_PID" > /dev/null 2>&1; then
    echo "🔧 停止后端服务 (PID: $SERVER_PID)..."
    kill "$SERVER_PID" 2>/dev/null || true

    # 等待进程结束（最多 5 秒）
    for i in {1..10}; do
      if ! ps -p "$SERVER_PID" > /dev/null 2>&1; then
        break
      fi
      sleep 0.5
    done

    # 如果还在运行，强制结束
    if ps -p "$SERVER_PID" > /dev/null 2>&1; then
      echo "   ⚠️  进程未响应，强制结束..."
      kill -9 "$SERVER_PID" 2>/dev/null || true
    fi

    echo "   ✓ 后端服务已停止"
    STOPPED=1
  else
    echo "   ℹ️  后端服务未运行"
  fi
  rm -f "$SERVER_PID_FILE"
else
  echo "   ℹ️  未找到后端 PID 文件"
fi

echo ""

# 停止前端服务
if [ -f "$WEB_PID_FILE" ]; then
  WEB_PID=$(cat "$WEB_PID_FILE")
  if ps -p "$WEB_PID" > /dev/null 2>&1; then
    echo "🎨 停止前端服务 (PID: $WEB_PID)..."
    kill "$WEB_PID" 2>/dev/null || true

    # 等待进程结束（最多 5 秒）
    for i in {1..10}; do
      if ! ps -p "$WEB_PID" > /dev/null 2>&1; then
        break
      fi
      sleep 0.5
    done

    # 如果还在运行，强制结束
    if ps -p "$WEB_PID" > /dev/null 2>&1; then
      echo "   ⚠️  进程未响应，强制结束..."
      kill -9 "$WEB_PID" 2>/dev/null || true
    fi

    echo "   ✓ 前端服务已停止"
    STOPPED=1
  else
    echo "   ℹ️  前端服务未运行"
  fi
  rm -f "$WEB_PID_FILE"
else
  echo "   ℹ️  未找到前端 PID 文件"
fi

echo ""

if [ $STOPPED -eq 1 ]; then
  echo "✅ 所有服务已停止"
else
  echo "ℹ️  没有运行中的服务"
fi

# 清理可能残留的 node 进程（可选，谨慎使用）
# echo ""
# echo "🧹 清理残留进程..."
# pkill -f "vite" || true
# pkill -f "tsx.*server" || true

echo ""
echo "💡 提示："
echo "   - 如需重新启动，运行: ./dev-start.sh"
echo "   - 日志文件仍保留在 $PID_DIR/ 目录"
echo ""
