/**
 * briefing 命令（Phase 6）
 * clawbuds briefing          — 查看最新简报
 * clawbuds briefing history  — 查看简报历史
 * clawbuds briefing publish  — Agent 专用：发布简报
 * clawbuds briefing ack      — 标记简报已读
 */

import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { success, error, info } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const briefingCommand = new Command('briefing').description('Manage daily social briefings')

addProfileOption(briefingCommand)

// ─── briefing（查看最新）─────────────────────────────────────────────────────

briefingCommand
  .option('--raw', 'Show raw data (JSON)')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const briefing = await client.getLatestBriefing() as Record<string, unknown> | null
      if (!briefing) {
        info('尚未生成任何简报。')
        info(`可通过 \`clawbuds briefing publish "..."\` 手动发布，或等待每日 Daemon 自动触发。`)
        return
      }

      if (!briefing['acknowledgedAt']) {
        info('[未读]')
      }

      if (opts.raw) {
        info(JSON.stringify(briefing['rawData'], null, 2))
        return
      }

      info('═'.repeat(50))
      info(String(briefing['content']))
      info('═'.repeat(50))
      info(`生成时间: ${String(briefing['generatedAt']).slice(0, 16).replace('T', ' ')}`)

      if (!briefing['acknowledgedAt']) {
        info('')
        // Auto-acknowledge in the CLI context
        await client.acknowledgeBriefing(String(briefing['id']))
        success('✓ 已标记为已读')
      }
    } catch (err: any) {
      error(`获取简报失败: ${err.message}`)
    }
  })

// ─── briefing history ─────────────────────────────────────────────────────────

briefingCommand
  .command('history')
  .description('Show briefing history')
  .option('--limit <n>', 'Number of results (default 10)', '10')
  .option('--type <type>', 'Filter by type: daily | weekly')
  .option('--id <n>', 'Show briefing by index (1-based)')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const limit = Math.min(parseInt(opts.limit, 10) || 10, 50)
      const result = await client.getBriefingHistory({
        type: opts.type,
        limit,
        offset: 0,
      })

      const briefings = result.data as Record<string, unknown>[]

      if (opts.id) {
        const idx = parseInt(opts.id, 10) - 1
        if (idx < 0 || idx >= briefings.length) {
          error(`索引超出范围 (1-${briefings.length})`)
          return
        }
        const briefing = briefings[idx]
        info(String(briefing['content']))
        return
      }

      if (briefings.length === 0) {
        info('暂无简报历史。')
        return
      }

      info('#  时间                已读   摘要（首行）')
      info('─'.repeat(60))
      briefings.forEach((b, i) => {
        const time = String(b['generatedAt']).slice(0, 16).replace('T', ' ')
        const acked = b['acknowledgedAt'] ? '✓' : '-'
        const firstLine = String(b['content']).split('\n')[0].slice(0, 30)
        info(`${String(i + 1).padStart(2)}  ${time}  ${acked.padEnd(5)}  ${firstLine}`)
      })
      info('')
      info(`未读: ${result.meta.unread} 条`)
    } catch (err: any) {
      error(`获取历史失败: ${err.message}`)
    }
  })

// ─── briefing publish（Agent 专用）──────────────────────────────────────────

briefingCommand
  .command('publish')
  .description('Publish a briefing (Agent use only)')
  .argument('<content>', 'Briefing content (Markdown)')
  .action(async (content: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    if (!content || content.trim().length === 0) {
      error('简报内容不能为空')
      return
    }

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const result = await client.publishBriefing(content)
      success(`✓ 简报已发布 (id: ${result.id})`)
      info(`生成时间: ${result.generatedAt}`)
    } catch (err: any) {
      error(`发布失败: ${err.message}`)
    }
  })

// ─── briefing ack ─────────────────────────────────────────────────────────────

briefingCommand
  .command('ack')
  .description('Mark latest unread briefing as read')
  .argument('[id]', 'Briefing ID (optional, defaults to latest)')
  .action(async (id: string | undefined, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      let briefingId = id
      if (!briefingId) {
        const briefing = await client.getLatestBriefing() as Record<string, unknown> | null
        if (!briefing) {
          info('暂无简报。')
          return
        }
        briefingId = String(briefing['id'])
      }

      await client.acknowledgeBriefing(briefingId)
      success(`✓ 简报已标记为已读`)
    } catch (err: any) {
      error(`标记失败: ${err.message}`)
    }
  })
