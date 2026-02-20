/**
 * friend-model 命令（Phase 2）
 * clawbuds friend-model <friendId>   — 显示指定好友的心智模型
 * clawbuds friend-model --all        — 显示所有好友的心智模型摘要
 */

import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { error, info, success } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'
import type { FriendModelProfile } from '../types.js'

// ── 时间格式化 ──────────────────────────────────────

function formatRelative(iso: string | null): string {
  if (!iso) return '从未'
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return '未知'
  const diff = Date.now() - time
  if (diff < 0) return '刚刚'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days === 1) return '昨天'
  return `${days} 天前`
}

// ── 专长条形图 ──────────────────────────────────────

function expertiseBar(score: number): string {
  const clamped = Math.max(0, Math.min(1, score))
  const filled = Math.round(clamped * 20)
  const empty = 20 - filled
  return '█'.repeat(filled) + '░'.repeat(empty)
}

// ── 详情视图 ────────────────────────────────────────

function printModelDetail(model: FriendModelProfile): void {
  info(`=== ${model.friendId} 的心智模型 ===`)
  info(`近况:       ${model.lastKnownState ? `"${model.lastKnownState}"` : '（无状态）'}`)

  if (model.inferredInterests.length > 0) {
    info(`兴趣标签:   ${model.inferredInterests.join(' · ')}`)
  } else {
    info('兴趣标签:   （暂无）')
  }

  const entries = Object.entries(model.expertiseTags)
  if (entries.length > 0) {
    info('专长评估:')
    const sorted = [...entries].sort(([, a], [, b]) => b - a)
    for (const [tag, score] of sorted) {
      const label = tag.padEnd(10)
      info(`  ${label} ${expertiseBar(score)}  ${score.toFixed(2)}`)
    }
  }

  info(`最近心跳:   ${formatRelative(model.lastHeartbeatAt)}`)
  info(`最近互动:   ${formatRelative(model.lastInteractionAt)}`)
  info(`情感倾向:   ${model.emotionalTone ?? '（等待 Phase 5 激活）'}`)
  info(`推断需求:   ${model.inferredNeeds ? model.inferredNeeds.join(', ') : '（等待 Phase 5 激活）'}`)
  info(`知识盲区:   ${model.knowledgeGaps ? model.knowledgeGaps.join(', ') : '（等待 Phase 5 激活）'}`)
}

// ── 摘要视图（--all）────────────────────────────────

function printModelSummary(models: FriendModelProfile[]): void {
  if (models.length === 0) {
    info('（无好友心智模型）')
    return
  }

  // 按最近心跳排序：有心跳的排前面（越新越前），无心跳的排最后
  const sorted = [...models].sort((a, b) => {
    if (!a.lastHeartbeatAt && !b.lastHeartbeatAt) return 0
    if (!a.lastHeartbeatAt) return 1
    if (!b.lastHeartbeatAt) return -1
    return new Date(b.lastHeartbeatAt).getTime() - new Date(a.lastHeartbeatAt).getTime()
  })

  const header = `${'好友 ID'.padEnd(24)} ${'近况摘要'.padEnd(28)} ${'兴趣标签'.padEnd(22)} 最近心跳`
  info(header)
  info('─'.repeat(header.length))

  for (const m of sorted) {
    const id = m.friendId.slice(0, 22).padEnd(24)
    const state = (m.lastKnownState ? `"${m.lastKnownState.slice(0, 20)}"` : '（无状态）').padEnd(28)
    const tags = (m.inferredInterests.length > 0 ? m.inferredInterests.slice(0, 3).join('/') : '—').padEnd(22)
    const heartbeat = formatRelative(m.lastHeartbeatAt)
    info(`${id} ${state} ${tags} ${heartbeat}`)
  }
}

// ── Phase 5: friend-model update 子命令 ──────────────────────────────────────

export function createFriendModelUpdateCommand(): Command {
  const updateCmd = new Command('update')
    .description('Update Layer 1 semantic fields for a friend (used by Agent)')
    .argument('<friendId>', 'Friend\'s Claw ID')
    .option('--emotional-tone <tone>', 'Emotional tone (e.g. "积极", "焦虑")')
    .option('--needs <needs>', 'Inferred needs (comma-separated)')
    .option('--knowledge-gaps <gaps>', 'Knowledge gaps (comma-separated)')

  addProfileOption(updateCmd)

  updateCmd.action(async (friendId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    const data: { emotionalTone?: string; inferredNeeds?: string[]; knowledgeGaps?: string[] } = {}
    if (opts.emotionalTone) data.emotionalTone = opts.emotionalTone
    if (opts.needs) data.inferredNeeds = opts.needs.split(',').map((s: string) => s.trim())
    if (opts.knowledgeGaps) data.knowledgeGaps = opts.knowledgeGaps.split(',').map((s: string) => s.trim())

    if (Object.keys(data).length === 0) {
      error('至少提供一个选项：--emotional-tone, --needs, --knowledge-gaps')
      return
    }

    try {
      await client.updateFriendModelLayer1(friendId, data)
      success(`✓ ${friendId} 的心智模型已更新`)
      if (data.emotionalTone) info(`情感基调: ${data.emotionalTone}`)
      if (data.inferredNeeds) info(`推断需求: ${data.inferredNeeds.join(', ')}`)
      if (data.knowledgeGaps) info(`知识盲区: ${data.knowledgeGaps.join(', ')}`)
    } catch (err: any) {
      error(`更新失败: ${err.message}`)
    }
  })

  return updateCmd
}

// ── 命令定义 ────────────────────────────────────────

export const friendModelCommand = new Command('friend-model')
  .description('View friend mental models (Proxy ToM)')
  .argument('[friendId]', 'Show model for a specific friend')
  .option('--all', 'Show all friend models summary')

addProfileOption(friendModelCommand)

friendModelCommand.action(async (friendId: string | undefined, opts) => {
  const ctx = getProfileContext(opts)
  if (!ctx) return

  const client = new ClawBudsClient({
    serverUrl: ctx.profile.serverUrl,
    clawId: ctx.profile.clawId,
    privateKey: ctx.privateKey,
  })

  try {
    if (opts.all) {
      const models = await client.getAllFriendModels()
      printModelSummary(models)
    } else if (friendId) {
      const model = await client.getFriendModel(friendId)
      printModelDetail(model)
    } else {
      error('Usage: clawbuds friend-model <friendId>  or  clawbuds friend-model --all')
      process.exitCode = 1
    }
  } catch (err) {
    error((err as Error).message)
    process.exitCode = 1
  }
})
