#!/bin/bash
# ClawBuds 生产环境快速部署脚本
# Usage: bash deploy-production.sh [domain] [email]

set -e

# 配置
DOMAIN="${1:-clawbuds.com}"
EMAIL="${2:-admin@${DOMAIN}}"
APP_DIR="$HOME/apps/clawbuds"
REPO_URL="git@github.com:chitinlabs/clawbuds.git"

echo "🚀 ClawBuds Production Deployment"
echo "===================================="
echo ""
echo "Domain: $DOMAIN"
echo "Email: $EMAIL"
echo "App Dir: $APP_DIR"
echo ""

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

success() { echo -e "${GREEN}✓${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }

# 检查是否为 root
if [[ $EUID -eq 0 ]]; then
   error "请不要使用 root 用户运行此脚本"
fi

# 步骤 1: 检查系统环境
echo "Step 1/8: 检查系统环境..."

# 检查 Node.js
if ! command -v node &> /dev/null; then
    error "Node.js 未安装。请先安装 Node.js 22+"
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
    error "Node.js 版本过低 (当前: v$NODE_VERSION)。需要 v22+"
fi
success "Node.js $(node --version)"

# 检查 npm
if ! command -v npm &> /dev/null; then
    error "npm 未安装"
fi
success "npm $(npm --version)"

# 检查 Nginx
if ! command -v nginx &> /dev/null; then
    warning "Nginx 未安装。需要手动安装: sudo apt install nginx"
else
    success "Nginx $(nginx -v 2>&1 | cut -d'/' -f2)"
fi

echo ""

# 步骤 2: 克隆代码
echo "Step 2/8: 克隆代码仓库..."

if [ -d "$APP_DIR" ]; then
    warning "目录已存在: $APP_DIR"
    read -p "是否删除并重新克隆? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$APP_DIR"
    else
        cd "$APP_DIR"
        git pull origin main
        success "代码已更新"
    fi
fi

if [ ! -d "$APP_DIR" ]; then
    mkdir -p $(dirname "$APP_DIR")
    git clone "$REPO_URL" "$APP_DIR"
    success "代码克隆完成"
fi

cd "$APP_DIR"
echo ""

# 步骤 3: 安装依赖
echo "Step 3/8: 安装依赖..."
npm install
success "依赖安装完成"
echo ""

# 步骤 4: 构建项目
echo "Step 4/8: 构建项目..."
npm run build --workspaces
success "项目构建完成"
echo ""

# 步骤 5: 配置环境变量
echo "Step 5/8: 配置环境变量..."

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        success ".env 文件已创建"

        # 生成随机密钥
        JWT_SECRET=$(openssl rand -base64 32)
        SESSION_SECRET=$(openssl rand -base64 32)

        # 更新 .env
        sed -i "s|SERVER_URL=.*|SERVER_URL=https://${DOMAIN}|g" .env
        sed -i "s|CORS_ORIGIN=.*|CORS_ORIGIN=https://${DOMAIN}|g" .env
        echo "JWT_SECRET=$JWT_SECRET" >> .env
        echo "SESSION_SECRET=$SESSION_SECRET" >> .env

        success "环境变量已配置"
    else
        warning ".env.example 不存在，请手动创建 .env"
    fi
else
    success ".env 文件已存在"
fi
echo ""

# 步骤 6: 初始化数据库
echo "Step 6/8: 初始化数据库..."

mkdir -p data uploads

# 运行数据库迁移
echo "运行数据库迁移..."
cd server
npm run migrate:prod
success "数据库迁移完成"
cd ..
echo ""

# 步骤 7: 配置 PM2
echo "Step 7/8: 配置 PM2..."

if ! command -v pm2 &> /dev/null; then
    echo "安装 PM2..."
    npm install -g pm2
    success "PM2 已安装"
else
    success "PM2 已存在"
fi

# 创建 PM2 配置
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'clawbuds-api',
      cwd: './server',
      script: 'dist/index.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 8765
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '1G'
    }
  ]
}
EOF

mkdir -p logs

success "PM2 配置已创建"
echo ""

# 步骤 8: 启动服务
echo "Step 8/8: 启动服务..."

pm2 start ecosystem.config.js
pm2 save
success "服务已启动"

# 设置开机自启
echo ""
echo "设置 PM2 开机自启..."
pm2 startup | grep "sudo" | bash || warning "PM2 开机自启设置失败，请手动运行: pm2 startup"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
success "部署完成！"
echo ""
echo "接下来的步骤："
echo ""
echo "1. 配置 Nginx（需要 sudo 权限）:"
echo ""
echo "   # 方式 1: 使用自动配置脚本（推荐）"
echo "   bash scripts/setup-nginx-cloudflare.sh $DOMAIN"
echo ""
echo "   # 方式 2: 手动配置"
echo "   sudo cp config/nginx-cloudflare.conf /etc/nginx/sites-available/$DOMAIN"
echo "   # 编辑配置文件，替换 DOMAIN_PLACEHOLDER 和 APP_DIR_PLACEHOLDER"
echo "   sudo nano /etc/nginx/sites-available/$DOMAIN"
echo "   sudo ln -s /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/"
echo "   sudo nginx -t && sudo systemctl restart nginx"
echo ""
echo "2. 配置 Cloudflare:"
echo "   a) 添加域名到 Cloudflare: https://dash.cloudflare.com/"
echo "   b) DNS 记录:"
echo "      - 类型: A, 名称: @, 值: $(curl -s ifconfig.me), 代理: 启用"
echo "      - 类型: A, 名称: www, 值: $(curl -s ifconfig.me), 代理: 启用"
echo "   c) SSL/TLS 设置:"
echo "      - 加密模式: Flexible"
echo "      - Always Use HTTPS: 启用"
echo "   d) 网络设置:"
echo "      - WebSockets: 启用"
echo "      - HTTP/2: 启用"
echo "      - HTTP/3 (QUIC): 启用"
echo ""
echo "3. 验证部署:"
echo "   curl http://localhost:8765/health"
echo "   curl https://$DOMAIN/health"
echo "   pm2 status"
echo "   pm2 logs clawbuds-api"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📚 完整文档:"
echo "   - Cloudflare 部署: docs/CLOUDFLARE_DEPLOYMENT.md"
echo "   - 数据库迁移: docs/DATABASE_MIGRATION.md"
echo "   - 端口配置: docs/PORTS.md"
echo ""
