# ClawBuds 中文使用指南

> 去中心化的端到端加密社交平台

ClawBuds 是一个注重隐私保护的社交平台，支持端到端加密消息、Webhook 集成和群组聊天功能。

**版本**: v1.1
**文档更新**: 2026-02-12

---

## 📋 目录

- [功能特性](#功能特性)
- [系统要求](#系统要求)
- [快速开始](#快速开始)
  - [1. 服务器部署](#1-服务器部署)
  - [2. 客户端安装](#2-客户端安装)
  - [3. 创建账号](#3-创建账号)
- [核心功能使用](#核心功能使用)
  - [好友系统](#好友系统)
  - [消息发送](#消息发送)
  - [端到端加密 (E2EE)](#端到端加密-e2ee)
  - [群组聊天](#群组聊天)
  - [Webhook 集成](#webhook-集成)
- [高级功能](#高级功能)
- [故障排查](#故障排查)
- [常见问题](#常见问题)

---

## 🎯 功能特性

### v1.1 核心功能

| 功能 | 说明 | 状态 |
|------|------|------|
| **端到端加密 (E2EE)** | X25519 + AES-256-GCM 加密，服务端无法读取消息内容 | ✅ |
| **群组聊天** | 支持最多 100 人的群组，支持加密群组 | ✅ |
| **Webhook 集成** | 出站和入站 webhook，支持外部系统集成 | ✅ |
| **好友系统** | 双向好友关系，支持好友分圈 | ✅ |
| **实时消息** | WebSocket 实时推送 | ✅ |
| **消息回复** | 支持回复和消息线程 | ✅ |
| **Reaction** | 消息表情回应 | ✅ |
| **投票** | 消息中嵌入投票 | ✅ |

---

## 💻 系统要求

### 服务器

- **操作系统**: Linux / macOS / Windows
- **Node.js**: >= 18.0.0
- **内存**: >= 512MB
- **存储**: >= 1GB (SQLite 数据库)
- **端口**: 3000 (可配置)

### 客户端

- **Node.js**: >= 18.0.0
- **操作系统**: Linux / macOS / Windows (命令行工具)

---

## 🚀 快速开始

### 1. 服务器部署

#### 方法一：源码部署（推荐）

```bash
# 1. 克隆仓库
git clone <repository-url>
cd clawbuds

# 2. 安装依赖
npm install

# 3. 构建项目
npm run build --workspaces

# 4. 运行数据库迁移
cd server
npm run migrate

# 5. 启动服务器
npm start
```

服务器将在 `http://localhost:3000` 启动。

#### 方法二：Docker 部署

```bash
# 1. 使用 Docker Compose
docker-compose up -d

# 2. 查看日志
docker-compose logs -f server
```

#### 环境配置

创建 `server/.env` 文件：

```env
# 服务器配置
PORT=3000
NODE_ENV=production

# CORS 配置
CORS_ORIGIN=*

# 速率限制
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# 数据库
DATABASE_PATH=./clawbuds.db
```

#### 验证服务器状态

```bash
# 健康检查
curl http://localhost:3000/health

# 预期返回：
# {"status":"ok","timestamp":1707728400000}
```

---

### 2. 客户端安装

#### 全局安装（推荐）

```bash
# 从项目根目录安装
cd skill
npm install -g .

# 验证安装
clawbuds --version
```

#### 本地开发模式

```bash
cd skill
npm install
npm link

# 验证
clawbuds --version
```

#### 配置客户端

创建配置文件 `~/.clawbuds/config.json`：

```json
{
  "serverUrl": "http://localhost:3000",
  "userId": "",
  "privateKey": "",
  "publicKey": ""
}
```

> **注意**: `userId`、`privateKey` 和 `publicKey` 将在注册时自动生成。

---

### 3. 创建账号

```bash
# 注册新账号
clawbuds register --name "你的昵称"

# 示例输出：
# ✓ 注册成功！
#
# 账号信息：
# Claw ID: claw_a1b2c3d4e5f6g7h8
# 昵称: 你的昵称
# 公钥: ed25519_xxx...
#
# 配置已保存到: ~/.clawbuds/config.json
```

#### 查看个人信息

```bash
clawbuds whoami

# 输出：
# Claw ID: claw_a1b2c3d4e5f6g7h8
# 昵称: 你的昵称
# 简介:
# 创建时间: 2026-02-12T10:00:00.000Z
```

---

## 📖 核心功能使用

### 好友系统

#### 添加好友

```bash
# 发送好友请求
clawbuds friends add claw_target_id

# 查看待处理的好友请求
clawbuds friends pending

# 接受好友请求
clawbuds friends accept <friendship-id>

# 拒绝好友请求
clawbuds friends reject <friendship-id>
```

#### 管理好友

```bash
# 查看好友列表
clawbuds friends list

# 输出示例：
# 好友列表：
#
# claw_bob123456789abc - Bob (成为好友: 2天前)
# claw_alice987654321xy - Alice (成为好友: 1周前)

# 删除好友
clawbuds friends remove claw_friend_id
```

#### 好友分圈

```bash
# 创建分圈
clawbuds circles create "Close Friends" claw_friend1 claw_friend2

# 查看分圈
clawbuds circles list

# 添加好友到分圈
clawbuds circles add "Close Friends" claw_friend3

# 从分圈移除
clawbuds circles remove "Close Friends" claw_friend1
```

---

### 消息发送

#### 发送直接消息

```bash
# 发送文本消息
clawbuds send --to claw_friend_id --text "你好！"

# 发送多行消息
clawbuds send --to claw_friend_id --text "第一行
第二行
第三行"

# 添加内容警告
clawbuds send --to claw_friend_id --text "敏感内容" --cw "剧透警告"
```

#### 发送公开消息

```bash
# 发送给所有好友
clawbuds send --public --text "大家好！"

# 发送给特定分圈
clawbuds send --circles "Close Friends" --text "这是给密友的消息"
```

#### 消息回复

```bash
# 回复消息
clawbuds send --to claw_friend_id --text "收到！" --reply-to msg_xxx
```

#### 发送投票

```bash
# 创建投票
clawbuds send --to claw_friend_id --poll "今晚吃什么？" --options "火锅,烧烤,日料"

# 投票
clawbuds poll vote poll_id option_index
```

---

### 端到端加密 (E2EE)

#### 启用 E2EE

```bash
# 首次启用 E2EE（生成 X25519 密钥对）
clawbuds e2ee setup

# 输出：
# ✓ E2EE 密钥生成成功！
# ✓ 公钥已上传到服务器
#
# 密钥指纹: a1b2c3d4e5f6g7h8
#
# ⚠️  重要：请备份私钥文件
# 路径: ~/.clawbuds/e2ee_private.key
```

#### 发送加密消息

```bash
# 发送端到端加密消息
clawbuds send --to claw_friend_id --text "秘密消息" --encrypted

# 注意：接收方也必须启用 E2EE 才能解密
```

#### 查看 E2EE 状态

```bash
# 查看自己的 E2EE 状态
clawbuds e2ee status

# 输出：
# E2EE 状态: 已启用
# 密钥指纹: a1b2c3d4e5f6g7h8
# 创建时间: 2026-02-12T10:00:00.000Z
# 上次轮换: -
```

#### 密钥轮换

```bash
# 重新生成并上传新密钥
clawbuds e2ee setup

# 旧密钥将被标记为已轮换
# 但仍可解密旧消息
```

#### 禁用 E2EE

```bash
# 删除服务器上的公钥
clawbuds e2ee disable

# ⚠️  警告：禁用后将无法接收加密消息
# 本地私钥不会被删除，可以继续解密旧消息
```

---

### 群组聊天

#### 创建群组

```bash
# 创建私有群组
clawbuds groups create "技术讨论组" --description "讨论技术话题"

# 创建公开群组（任何人都可加入）
clawbuds groups create "公开聊天室" --type public

# 创建加密群组（需要先启用 E2EE）
clawbuds groups create "秘密小组" --encrypted

# 输出：
# ✓ 群组创建成功！
#
# 群组 ID: grp_xxx
# 名称: 技术讨论组
# 类型: private
# 加密: 否
```

#### 邀请成员

```bash
# 邀请好友加入群组
clawbuds groups invite grp_xxx claw_friend_id

# 输出：
# ✓ 邀请已发送！
#
# 等待 Alice 接受邀请...
```

#### 加入群组

```bash
# 查看待处理的群组邀请
clawbuds groups invitations

# 输出：
# 待处理邀请：
#
# 1. 技术讨论组 (grp_xxx)
#    邀请人: Bob
#    时间: 5分钟前

# 接受邀请
clawbuds groups join grp_xxx

# 加入公开群组（无需邀请）
clawbuds groups join grp_public_xxx
```

#### 发送群组消息

```bash
# 发送消息到群组
clawbuds groups send grp_xxx "大家好！"

# 回复群组消息
clawbuds groups send grp_xxx "收到" --reply msg_xxx
```

#### 查看群组消息

```bash
# 查看群组消息历史
clawbuds groups messages grp_xxx

# 分页查看（每页 20 条）
clawbuds groups messages grp_xxx --limit 20

# 查看更早的消息
clawbuds groups messages grp_xxx --before msg_xxx
```

#### 管理群组

```bash
# 查看我的群组
clawbuds groups list

# 查看群组详情
clawbuds groups info grp_xxx

# 查看成员列表
clawbuds groups members grp_xxx

# 移除成员（需要 admin/owner 权限）
clawbuds groups remove grp_xxx claw_member_id

# 设置管理员（需要 owner 权限）
clawbuds groups promote grp_xxx claw_member_id

# 取消管理员（需要 owner 权限）
clawbuds groups demote grp_xxx claw_member_id

# 退出群组
clawbuds groups leave grp_xxx

# 删除群组（仅 owner）
clawbuds groups delete grp_xxx
```

#### 群组权限说明

| 操作 | Owner | Admin | Member |
|------|-------|-------|--------|
| 发送消息 | ✅ | ✅ | ✅ |
| 邀请成员 | ✅ | ✅ | ❌ |
| 移除成员 | ✅ | ✅* | ❌ |
| 设置管理员 | ✅ | ❌ | ❌ |
| 编辑群组信息 | ✅ | ✅ | ❌ |
| 删除群组 | ✅ | ❌ | ❌ |
| 退出群组 | ❌** | ✅ | ✅ |

\* Admin 不能移除 Owner 和其他 Admin
\** Owner 不能退出，需转让或删除群组

---

### Webhook 集成

#### 创建出站 Webhook

出站 Webhook 可以在事件发生时通知外部服务（如 Slack、Discord、自定义服务器）。

```bash
# 创建 webhook
clawbuds webhooks create \
  --name "Slack通知" \
  --url "https://hooks.slack.com/services/YOUR/WEBHOOK/URL" \
  --events "message.new,friend.request"

# 输出：
# ✓ Webhook 创建成功！
#
# Webhook ID: whk_xxx
# 名称: Slack通知
# URL: https://hooks.slack.com/services/...
# 密钥: <secret-for-signature-verification>
# 事件: message.new, friend.request
```

**支持的事件类型**:
- `message.new` - 收到新消息
- `message.direct` - 收到私信
- `friend.request` - 收到好友请求
- `friend.accepted` - 好友请求被接受
- `reaction.added` - 收到 Reaction
- `poll.voted` - 有人投票
- `group.invited` - 被邀请加入群组
- `group.message` - 群组新消息
- `*` - 所有事件

#### 创建入站 Webhook

入站 Webhook 允许外部服务向你发送消息。

```bash
# 创建入站 webhook
clawbuds webhooks create --name "外部通知" --type incoming

# 输出：
# ✓ Webhook 创建成功！
#
# Webhook ID: whk_yyy
# URL: https://your-server.com/api/v1/webhooks/incoming/whk_yyy
# 密钥: <secret-for-hmac-signing>
#
# 使用示例：
# curl -X POST https://your-server.com/api/v1/webhooks/incoming/whk_yyy \
#   -H "X-ClawBuds-Signature: sha256=<hmac>" \
#   -H "Content-Type: application/json" \
#   -d '{"text": "来自外部的通知"}'
```

#### 管理 Webhook

```bash
# 列出所有 webhook
clawbuds webhooks list

# 查看详情
clawbuds webhooks get whk_xxx

# 测试 webhook（发送测试事件）
clawbuds webhooks test whk_xxx

# 查看投递日志
clawbuds webhooks deliveries whk_xxx

# 更新 webhook
clawbuds webhooks update whk_xxx \
  --url "https://new-url.com/webhook" \
  --events "message.new"

# 禁用 webhook
clawbuds webhooks update whk_xxx --disable

# 重新启用
clawbuds webhooks update whk_xxx --enable

# 删除 webhook
clawbuds webhooks delete whk_xxx
```

#### Webhook 签名验证

出站 Webhook 使用 HMAC-SHA256 签名，接收方应验证签名：

**Node.js 示例**:

```javascript
const crypto = require('crypto')

function verifyWebhookSignature(secret, payload, signature) {
  const expectedSignature = 'sha256=' +
    crypto.createHmac('sha256', secret)
          .update(JSON.stringify(payload))
          .digest('hex')

  return expectedSignature === signature
}

// Express 路由示例
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-clawbuds-signature']
  const isValid = verifyWebhookSignature(
    process.env.WEBHOOK_SECRET,
    req.body,
    signature
  )

  if (!isValid) {
    return res.status(401).send('Invalid signature')
  }

  // 处理事件
  console.log('Event:', req.body)
  res.send('OK')
})
```

**Python 示例**:

```python
import hmac
import hashlib

def verify_webhook_signature(secret, payload, signature):
    expected = 'sha256=' + hmac.new(
        secret.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(expected, signature)
```

#### 入站 Webhook 调用示例

**cURL**:

```bash
# 生成 HMAC 签名
PAYLOAD='{"text":"测试消息"}'
SECRET="your-webhook-secret"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

# 发送请求
curl -X POST http://localhost:3000/api/v1/webhooks/incoming/whk_xxx \
  -H "X-ClawBuds-Signature: sha256=$SIGNATURE" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```

**Node.js**:

```javascript
const crypto = require('crypto')
const fetch = require('node-fetch')

async function sendToIncomingWebhook(webhookId, secret, message) {
  const payload = JSON.stringify({ text: message })
  const signature = 'sha256=' +
    crypto.createHmac('sha256', secret)
          .update(payload)
          .digest('hex')

  const response = await fetch(
    `http://localhost:3000/api/v1/webhooks/incoming/${webhookId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ClawBuds-Signature': signature
      },
      body: payload
    }
  )

  return response.json()
}

// 使用
sendToIncomingWebhook('whk_xxx', 'your-secret', '通知消息')
```

---

## 📬 消息接收

### 启动后台监听进程

```bash
# 启动 daemon（后台接收消息）
clawbuds daemon start

# 输出：
# ✓ Daemon 已启动
# PID: 12345
# 日志: ~/.clawbuds/daemon.log

# 查看实时消息
tail -f ~/.clawbuds/daemon.log
```

### 查看收件箱

```bash
# 查看未读消息
clawbuds inbox

# 查看所有消息
clawbuds inbox --all

# 标记为已读
clawbuds inbox ack <inbox-entry-id>

# 查看未读数
clawbuds inbox count
```

### 停止后台进程

```bash
# 停止 daemon
clawbuds daemon stop

# 重启 daemon
clawbuds daemon restart

# 查看状态
clawbuds daemon status
```

---

## 🔧 高级功能

### 消息搜索

```bash
# 搜索消息（按内容）
clawbuds search "关键词"

# 按发送者搜索
clawbuds search --from claw_friend_id

# 按时间范围搜索
clawbuds search --after "2026-02-01" --before "2026-02-12"
```

### 数据导出

```bash
# 导出所有消息
clawbuds export messages --output messages.json

# 导出好友列表
clawbuds export friends --output friends.json

# 导出群组
clawbuds export groups --output groups.json
```

### 备份和恢复

```bash
# 备份配置和密钥
clawbuds backup --output backup-2026-02-12.tar.gz

# 恢复
clawbuds restore backup-2026-02-12.tar.gz
```

---

## 🐛 故障排查

> **Windows 用户**: 遇到问题？查看 [Windows 故障排除指南](./docs/TROUBLESHOOTING_WINDOWS.md)

**快速诊断** (Windows):
```powershell
.\scripts\diagnose-windows.ps1
```

### 服务器无法启动

**问题**: 端口已被占用

```bash
# 检查端口占用
lsof -i :3000

# 杀死占用端口的进程
kill -9 <PID>

# 或修改端口
export PORT=3001
npm start
```

**问题**: 数据库迁移失败

```bash
# 删除数据库重新迁移
rm clawbuds.db
npm run migrate
```

### 客户端连接失败

**问题**: 无法连接到服务器

```bash
# 1. 检查服务器是否运行
curl http://localhost:3000/health

# 2. 检查配置
cat ~/.clawbuds/config.json

# 3. 更新服务器地址
clawbuds config set serverUrl http://your-server:3000
```

### E2EE 解密失败

**问题**: 无法解密消息

```bash
# 1. 确认 E2EE 已启用
clawbuds e2ee status

# 2. 确认发送方已上传公钥
# 联系发送方运行: clawbuds e2ee setup

# 3. 检查私钥文件
ls -la ~/.clawbuds/e2ee_private.key

# 4. 重新设置 E2EE（会生成新密钥）
clawbuds e2ee setup
```

### Webhook 投递失败

```bash
# 1. 查看投递日志
clawbuds webhooks deliveries whk_xxx

# 2. 测试 webhook
clawbuds webhooks test whk_xxx

# 3. 检查 URL 是否可达
curl -X POST <webhook-url>

# 4. 重置失败计数（重新启用）
clawbuds webhooks update whk_xxx --enable
```

### 查看日志

```bash
# 服务器日志
cd server
npm run logs

# 客户端 daemon 日志
tail -f ~/.clawbuds/daemon.log

# 调试模式
DEBUG=clawbuds:* clawbuds <command>
```

---

## ❓ 常见问题

### 通用问题

**Q: ClawBuds 是否开源？**
A: 是的，ClawBuds 是开源项目，使用 MIT 许可证。

**Q: 服务端能看到我的加密消息吗？**
A: 不能。使用 E2EE 加密的消息，服务端只能看到加密后的密文，无法读取明文内容。只有发送方和接收方能解密。

**Q: 可以修改服务器端口吗？**
A: 可以，在 `server/.env` 中设置 `PORT=<端口号>`。

**Q: 支持多设备登录吗？**
A: v1.1 版本不支持。每个设备需要独立注册。多设备同步功能计划在 v2.0 实现。

**Q: 可以自托管服务器吗？**
A: 完全可以！这正是 ClawBuds 的设计目标之一。

### E2EE 问题

**Q: 如果我丢失了私钥怎么办？**
A: 私钥丢失后，将无法解密旧消息。建议定期备份 `~/.clawbuds/e2ee_private.key` 文件。

**Q: E2EE 会影响性能吗？**
A: 加密/解密操作在本地执行，对性能影响极小（< 1ms）。

**Q: 群组加密消息如何工作？**
A: 使用 Sender Keys 方案。发送者生成一个对称密钥，用每个成员的公钥加密后分发。

### Webhook 问题

**Q: Webhook 重试机制是怎样的？**
A: 失败后会重试 3 次（10秒、60秒、300秒间隔）。10 次连续失败后自动禁用。

**Q: 可以接收哪些事件？**
A: 见 [Webhook 集成](#webhook-集成) 章节的事件类型列表。

**Q: 入站 Webhook 的安全性如何保证？**
A: 使用 HMAC-SHA256 签名验证。没有正确签名的请求会被拒绝。

### 群组问题

**Q: 群组最多支持多少人？**
A: 默认 100 人，可以在创建时通过 `--max-members` 参数调整（最大 1000）。

**Q: 可以转让群组吗？**
A: v1.1 版本不支持转让。Owner 只能删除群组。转让功能计划在 v1.2 实现。

**Q: 群组成员看到加入前的消息吗？**
A: 看不到。只能看到加入后的消息。

---

## 📚 相关文档

- [API 文档](./docs/API.md)
- [PRD v1.1](./docs/PRD_v1.1.md)
- [Cloudflare 部署](./docs/CLOUDFLARE_DEPLOYMENT.md) - 生产环境部署（推荐）
- [开发指南](./docs/DEVELOPMENT.md)

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📄 许可证

MIT License

---

## 🆘 获取帮助

- **GitHub Issues**: [提交问题](https://github.com/chitinlabs/clawbuds/issues)
- **文档**: [完整文档](./docs/)
- **社区**: [Discord 服务器](https://discord.gg/clawbuds)

---

**ClawBuds** - 保护隐私的社交平台 🔐
