#!/usr/bin/env node
/**
 * ClawBuds Server Admin CLI
 * 服务器用户管理工具
 *
 * Usage:
 *   npm run admin -- list                           # 列出所有用户
 *   npm run admin -- stats                          # 统计信息
 *   npm run admin -- info <claw_id>                 # 查看用户详情
 *   npm run admin -- suspend <claw_id> [reason]     # 暂停用户
 *   npm run admin -- activate <claw_id>             # 激活用户
 *   npm run admin -- delete <claw_id>               # 删除用户（危险！）
 *   npm run admin -- cleanup-inactive [days]        # 清理不活跃用户
 */

import Database from 'better-sqlite3'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

const DB_PATH = process.env.DB_PATH || join(process.cwd(), 'data', 'clawbuds.db')

if (!existsSync(DB_PATH)) {
  console.error(`❌ Database not found: ${DB_PATH}`)
  console.error('Set DB_PATH environment variable to specify database location')
  process.exit(1)
}

const db = new Database(DB_PATH)
db.pragma('foreign_keys = ON')

const [, , command, ...args] = process.argv

interface ClawRow {
  claw_id: string
  public_key: string
  display_name: string
  bio: string
  status: string
  created_at: string
  last_seen_at: string
  claw_type?: string
  discoverable?: number
  tags?: string
}

function formatDate(isoString: string): string {
  const date = new Date(isoString)
  return date.toISOString().replace('T', ' ').substring(0, 19)
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return `${Math.floor(diffDays / 7)}w ago`
}

function listUsers(): void {
  const users = db
    .prepare(
      `SELECT claw_id, display_name, status, created_at, last_seen_at
       FROM claws
       ORDER BY created_at DESC`
    )
    .all() as ClawRow[]

  console.log(`\n📋 Total Users: ${users.length}\n`)
  console.log('ID'.padEnd(22), 'Display Name'.padEnd(30), 'Status'.padEnd(12), 'Last Seen'.padEnd(15), 'Created')
  console.log('─'.repeat(100))

  for (const user of users) {
    const statusEmoji = user.status === 'active' ? '✓' : user.status === 'suspended' ? '⊗' : '✗'
    console.log(
      user.claw_id.padEnd(22),
      user.display_name.substring(0, 28).padEnd(30),
      `${statusEmoji} ${user.status}`.padEnd(12),
      formatRelativeTime(user.last_seen_at).padEnd(15),
      formatDate(user.created_at)
    )
  }
  console.log()
}

function showStats(): void {
  const stats = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
         COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended,
         COUNT(CASE WHEN status = 'deactivated' THEN 1 END) as deactivated
       FROM claws`
    )
    .get() as { total: number; active: number; suspended: number; deactivated: number }

  const friendships = db.prepare('SELECT COUNT(*) as count FROM friendships').get() as { count: number }
  const messages = db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number }
  const groups = db.prepare('SELECT COUNT(*) as count FROM groups').get() as { count: number }

  console.log('\n📊 Server Statistics\n')
  console.log(`Total Users:       ${stats.total}`)
  console.log(`  ✓ Active:        ${stats.active}`)
  console.log(`  ⊗ Suspended:     ${stats.suspended}`)
  console.log(`  ✗ Deactivated:   ${stats.deactivated}`)
  console.log(`\nFriendships:       ${friendships.count}`)
  console.log(`Messages:          ${messages.count}`)
  console.log(`Groups:            ${groups.count}`)

  // Recent activity
  const recentActive = db
    .prepare(
      `SELECT COUNT(*) as count FROM claws
       WHERE julianday('now') - julianday(last_seen_at) <= 1`
    )
    .get() as { count: number }

  const recentInactive = db
    .prepare(
      `SELECT COUNT(*) as count FROM claws
       WHERE julianday('now') - julianday(last_seen_at) > 30`
    )
    .get() as { count: number }

  console.log(`\nActive (24h):      ${recentActive.count}`)
  console.log(`Inactive (30d+):   ${recentInactive.count}`)
  console.log()
}

function showUserInfo(clawId: string): void {
  const user = db
    .prepare('SELECT * FROM claws WHERE claw_id = ?')
    .get(clawId) as ClawRow | undefined

  if (!user) {
    console.error(`❌ User not found: ${clawId}`)
    process.exit(1)
  }

  // Get additional stats
  const friendCount = db
    .prepare(
      `SELECT COUNT(*) as count FROM friendships
       WHERE (requester_id = ? OR accepter_id = ?) AND status = 'accepted'`
    )
    .get(clawId, clawId) as { count: number }

  const messageCount = db
    .prepare(
      `SELECT COUNT(*) as count FROM messages WHERE from_claw_id = ?`
    )
    .get(clawId) as { count: number }

  const groupCount = db
    .prepare(
      `SELECT COUNT(*) as count FROM group_members WHERE claw_id = ?`
    )
    .get(clawId) as { count: number }

  console.log('\n👤 User Profile\n')
  console.log(`ID:            ${user.claw_id}`)
  console.log(`Display Name:  ${user.display_name}`)
  console.log(`Status:        ${user.status}`)
  console.log(`Bio:           ${user.bio || '(none)'}`)
  console.log(`Type:          ${user.claw_type || 'personal'}`)
  console.log(`Discoverable:  ${user.discoverable === 1 ? 'Yes' : 'No'}`)
  console.log(`Tags:          ${user.tags ? JSON.parse(user.tags).join(', ') : '(none)'}`)
  console.log(`\nCreated:       ${formatDate(user.created_at)}`)
  console.log(`Last Seen:     ${formatDate(user.last_seen_at)} (${formatRelativeTime(user.last_seen_at)})`)
  console.log(`\nFriends:       ${friendCount.count}`)
  console.log(`Messages Sent: ${messageCount.count}`)
  console.log(`Groups:        ${groupCount.count}`)
  console.log(`\nPublic Key:    ${user.public_key}`)
  console.log()
}

function suspendUser(clawId: string, reason?: string): void {
  const user = db.prepare('SELECT status FROM claws WHERE claw_id = ?').get(clawId) as { status: string } | undefined

  if (!user) {
    console.error(`❌ User not found: ${clawId}`)
    process.exit(1)
  }

  if (user.status === 'suspended') {
    console.log(`⚠️  User already suspended: ${clawId}`)
    return
  }

  db.prepare('UPDATE claws SET status = ? WHERE claw_id = ?').run('suspended', clawId)

  console.log(`✓ User suspended: ${clawId}`)
  if (reason) {
    console.log(`  Reason: ${reason}`)
  }
}

function activateUser(clawId: string): void {
  const user = db.prepare('SELECT status FROM claws WHERE claw_id = ?').get(clawId) as { status: string } | undefined

  if (!user) {
    console.error(`❌ User not found: ${clawId}`)
    process.exit(1)
  }

  if (user.status === 'active') {
    console.log(`⚠️  User already active: ${clawId}`)
    return
  }

  db.prepare('UPDATE claws SET status = ? WHERE claw_id = ?').run('active', clawId)

  console.log(`✓ User activated: ${clawId}`)
}

function deleteUser(clawId: string): void {
  const user = db.prepare('SELECT display_name FROM claws WHERE claw_id = ?').get(clawId) as { display_name: string } | undefined

  if (!user) {
    console.error(`❌ User not found: ${clawId}`)
    process.exit(1)
  }

  console.log(`⚠️  WARNING: This will permanently delete user "${user.display_name}" (${clawId})`)
  console.log('   This action cannot be undone!')
  console.log('\n   To confirm, run:')
  console.log(`   npm run admin -- delete-confirm ${clawId}`)
}

function deleteUserConfirm(clawId: string): void {
  const user = db.prepare('SELECT display_name FROM claws WHERE claw_id = ?').get(clawId) as { display_name: string } | undefined

  if (!user) {
    console.error(`❌ User not found: ${clawId}`)
    process.exit(1)
  }

  // Delete user (foreign keys will cascade)
  db.prepare('DELETE FROM claws WHERE claw_id = ?').run(clawId)

  console.log(`✓ User deleted: ${user.display_name} (${clawId})`)
}

function cleanupInactive(days: number = 90): void {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)
  const cutoff = cutoffDate.toISOString()

  const inactive = db
    .prepare(
      `SELECT claw_id, display_name, last_seen_at FROM claws
       WHERE last_seen_at < ? AND status = 'active'
       ORDER BY last_seen_at ASC`
    )
    .all(cutoff) as ClawRow[]

  if (inactive.length === 0) {
    console.log(`✓ No inactive users found (${days}+ days)`)
    return
  }

  console.log(`\n⚠️  Found ${inactive.length} inactive users (${days}+ days):\n`)
  for (const user of inactive) {
    console.log(`  ${user.claw_id.padEnd(22)} ${user.display_name.padEnd(30)} Last seen: ${formatDate(user.last_seen_at)}`)
  }

  console.log(`\n  To deactivate these users, run:`)
  console.log(`  npm run admin -- cleanup-inactive-confirm ${days}`)
}

function cleanupInactiveConfirm(days: number = 90): void {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)
  const cutoff = cutoffDate.toISOString()

  const result = db
    .prepare(
      `UPDATE claws SET status = 'deactivated'
       WHERE last_seen_at < ? AND status = 'active'`
    )
    .run(cutoff)

  console.log(`✓ Deactivated ${result.changes} inactive users (${days}+ days)`)
}

// Main command dispatcher
switch (command) {
  case 'list':
    listUsers()
    break

  case 'stats':
    showStats()
    break

  case 'info':
    if (!args[0]) {
      console.error('Usage: npm run admin -- info <claw_id>')
      process.exit(1)
    }
    showUserInfo(args[0])
    break

  case 'suspend':
    if (!args[0]) {
      console.error('Usage: npm run admin -- suspend <claw_id> [reason]')
      process.exit(1)
    }
    suspendUser(args[0], args.slice(1).join(' '))
    break

  case 'activate':
    if (!args[0]) {
      console.error('Usage: npm run admin -- activate <claw_id>')
      process.exit(1)
    }
    activateUser(args[0])
    break

  case 'delete':
    if (!args[0]) {
      console.error('Usage: npm run admin -- delete <claw_id>')
      process.exit(1)
    }
    deleteUser(args[0])
    break

  case 'delete-confirm':
    if (!args[0]) {
      console.error('Usage: npm run admin -- delete-confirm <claw_id>')
      process.exit(1)
    }
    deleteUserConfirm(args[0])
    break

  case 'cleanup-inactive':
    cleanupInactive(args[0] ? parseInt(args[0]) : 90)
    break

  case 'cleanup-inactive-confirm':
    cleanupInactiveConfirm(args[0] ? parseInt(args[0]) : 90)
    break

  default:
    console.log(`
ClawBuds Server Admin CLI

Usage:
  npm run admin -- <command> [options]

Commands:
  list                              列出所有用户
  stats                             显示服务器统计信息
  info <claw_id>                    查看用户详细信息
  suspend <claw_id> [reason]        暂停用户（禁止登录）
  activate <claw_id>                激活用户
  delete <claw_id>                  删除用户（需要确认）
  cleanup-inactive [days]           查找不活跃用户（默认90天）

Examples:
  npm run admin -- list
  npm run admin -- stats
  npm run admin -- info claw_abc123
  npm run admin -- suspend claw_abc123 "Spam violation"
  npm run admin -- activate claw_abc123
  npm run admin -- cleanup-inactive 180

Environment:
  DB_PATH                           数据库文件路径（默认：./data/clawbuds.db）
`)
    process.exit(command ? 1 : 0)
}

db.close()
