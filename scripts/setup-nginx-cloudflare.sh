#!/bin/bash
# Nginx + Cloudflare 自动配置脚本
# Usage: bash setup-nginx-cloudflare.sh [domain]

set -e

# 配置
DOMAIN="${1:-clawbuds.com}"
APP_DIR="${APP_DIR:-/home/wyh/apps/clawbuds}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
NGINX_TEMPLATE="$PROJECT_DIR/config/nginx-cloudflare.conf"
NGINX_AVAILABLE="/etc/nginx/sites-available/$DOMAIN"
NGINX_ENABLED="/etc/nginx/sites-enabled/$DOMAIN"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

success() { echo -e "${GREEN}✓${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }

echo "🔧 ClawBuds Nginx + Cloudflare 配置"
echo "===================================="
echo ""
echo "域名: $DOMAIN"
echo "应用目录: $APP_DIR"
echo "配置模板: $NGINX_TEMPLATE"
echo ""

# 检查权限
if [[ $EUID -ne 0 ]]; then
   error "此脚本需要 sudo 权限。请使用: sudo bash $0 $DOMAIN"
fi

# 检查 Nginx 是否安装
if ! command -v nginx &> /dev/null; then
    error "Nginx 未安装。请先安装: sudo apt install nginx"
fi

# 检查模板文件是否存在
if [ ! -f "$NGINX_TEMPLATE" ]; then
    error "找不到 Nginx 配置模板: $NGINX_TEMPLATE"
fi

# 检查应用目录是否存在
if [ ! -d "$APP_DIR" ]; then
    error "应用目录不存在: $APP_DIR"
fi

# 检查前端构建文件
if [ ! -d "$APP_DIR/web/dist" ]; then
    warning "前端构建文件不存在: $APP_DIR/web/dist"
    echo "请先运行: npm run build --workspace=@clawbuds/web"
    read -p "是否继续? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 备份现有配置（如果存在）
if [ -f "$NGINX_AVAILABLE" ]; then
    BACKUP_FILE="${NGINX_AVAILABLE}.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$NGINX_AVAILABLE" "$BACKUP_FILE"
    success "已备份现有配置到: $BACKUP_FILE"
fi

# 复制并替换配置文件
echo "创建 Nginx 配置..."
cp "$NGINX_TEMPLATE" "$NGINX_AVAILABLE"

# 替换占位符
sed -i "s|DOMAIN_PLACEHOLDER|$DOMAIN|g" "$NGINX_AVAILABLE"
sed -i "s|APP_DIR_PLACEHOLDER|$APP_DIR|g" "$NGINX_AVAILABLE"

success "配置文件已创建: $NGINX_AVAILABLE"

# 创建符号链接
if [ -L "$NGINX_ENABLED" ]; then
    rm "$NGINX_ENABLED"
    warning "已删除旧的符号链接"
fi

ln -s "$NGINX_AVAILABLE" "$NGINX_ENABLED"
success "已创建符号链接: $NGINX_ENABLED"

# 删除默认配置（如果存在）
if [ -f "/etc/nginx/sites-enabled/default" ]; then
    rm "/etc/nginx/sites-enabled/default"
    success "已删除默认配置"
fi

# 测试配置
echo ""
echo "测试 Nginx 配置..."
if nginx -t; then
    success "Nginx 配置测试通过"
else
    error "Nginx 配置测试失败。请检查配置文件: $NGINX_AVAILABLE"
fi

# 重启 Nginx
echo ""
echo "重启 Nginx..."
systemctl restart nginx

if systemctl is-active --quiet nginx; then
    success "Nginx 已成功重启"
else
    error "Nginx 启动失败。请检查日志: sudo journalctl -u nginx -n 50"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
success "Nginx 配置完成！"
echo ""
echo "下一步："
echo ""
echo "1. 验证本地访问:"
echo "   curl http://localhost/health"
echo "   curl http://localhost/api/v1/health"
echo ""
echo "2. 配置 Cloudflare DNS:"
echo "   登录: https://dash.cloudflare.com/"
echo "   添加 A 记录:"
echo "   - 类型: A, 名称: @, 值: $(curl -s ifconfig.me), 代理: 启用 ✓"
echo "   - 类型: A, 名称: www, 值: $(curl -s ifconfig.me), 代理: 启用 ✓"
echo ""
echo "3. 配置 Cloudflare SSL:"
echo "   SSL/TLS → Overview → 加密模式: Flexible"
echo "   SSL/TLS → Edge Certificates → Always Use HTTPS: 启用 ✓"
echo ""
echo "4. 启用 WebSocket:"
echo "   Network → WebSockets: On"
echo ""
echo "5. DNS 生效后验证:"
echo "   curl https://$DOMAIN/health"
echo "   curl https://$DOMAIN/api/v1/health"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📚 完整文档: docs/CLOUDFLARE_DEPLOYMENT.md"
echo ""
