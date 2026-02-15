#!/usr/bin/env bash
set -e

PID_DIR=".dev-pids"
SERVER_PID_FILE="$PID_DIR/server.pid"
WEB_PID_FILE="$PID_DIR/web.pid"
SERVER_LOG="$PID_DIR/server.log"
WEB_LOG="$PID_DIR/web.log"

echo "🚀 启动 ClawBuds 开发环境..."
echo ""

# 检查是否已经在运行
if [ -f "$SERVER_PID_FILE" ] || [ -f "$WEB_PID_FILE" ]; then
  echo "⚠️  检测到服务可能正在运行"
  echo "   如需重启，请先运行: ./dev-stop.sh"
  echo ""
  if [ -f "$SERVER_PID_FILE" ]; then
    SERVER_PID=$(cat "$SERVER_PID_FILE")
    if ps -p "$SERVER_PID" > /dev/null 2>&1; then
      echo "   ✓ 后端服务运行中 (PID: $SERVER_PID)"
    fi
  fi
  if [ -f "$WEB_PID_FILE" ]; then
    WEB_PID=$(cat "$WEB_PID_FILE")
    if ps -p "$WEB_PID" > /dev/null 2>&1; then
      echo "   ✓ 前端服务运行中 (PID: $WEB_PID)"
    fi
  fi
  echo ""
  exit 1
fi

# 创建 PID 目录
mkdir -p "$PID_DIR"

# 检查依赖是否已安装
if [ ! -d "node_modules" ]; then
  echo "📦 安装依赖..."
  npm install
fi

# 检查 shared 包是否已构建
if [ ! -d "packages/shared/dist" ]; then
  echo "🔨 构建 shared 包..."
  npm run build -w shared
fi

# 检查 .env 文件
if [ ! -f ".env" ]; then
  echo "📝 创建 .env 文件..."
  cp .env.example .env
fi

echo ""
echo "📌 开发服务器端口配置："
echo "   - 后端: http://0.0.0.0:8765"
echo "   - 前端: http://0.0.0.0:5432"
echo ""

# 启动后端服务
echo "🔧 启动后端服务..."
nohup npm run dev -w server > "$SERVER_LOG" 2>&1 &
SERVER_PID=$!
echo $SERVER_PID > "$SERVER_PID_FILE"
echo "   ✓ 后端已启动 (PID: $SERVER_PID)"
echo "   日志: $SERVER_LOG"

# 等待后端启动
sleep 2

# 启动前端服务
echo ""
echo "🎨 启动前端服务..."
nohup npm run dev -w web > "$WEB_LOG" 2>&1 &
WEB_PID=$!
echo $WEB_PID > "$WEB_PID_FILE"
echo "   ✓ 前端已启动 (PID: $WEB_PID)"
echo "   日志: $WEB_LOG"

echo ""
echo "✅ 服务启动成功！"
echo ""
echo "📍 访问地址："
echo "   - 前端 Web UI: http://localhost:5432"
echo "   - 后端 API:    http://localhost:8765"
echo "   - 健康检查:    http://localhost:8765/health"
echo ""
echo "📋 管理命令："
echo "   - 查看日志:    tail -f $SERVER_LOG"
echo "   - 查看日志:    tail -f $WEB_LOG"
echo "   - 停止服务:    ./dev-stop.sh"
echo ""
echo "💡 提示："
echo "   - 日志文件保存在 $PID_DIR/ 目录"
echo "   - 服务在后台运行，关闭终端不会停止服务"
echo "   - 修改代码后会自动热重载"
echo ""
