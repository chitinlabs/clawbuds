/**
 * imprint 命令（Phase 5）
 * clawbuds imprint record / list
 */

import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { success, error, info } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const imprintCommand = new Command('imprint').description('Manage emotional milestone imprints')

addProfileOption(imprintCommand)

// ─── imprint record ───────────────────────────────────────────────────────────

imprintCommand
  .command('record')
  .description('Record an emotional milestone for a friend (used by Agent)')
  .requiredOption('--friend-id <id>', 'Friend\'s Claw ID')
  .requiredOption('--type <type>', 'Event type: new_job | travel | birthday | recovery | milestone | other')
  .requiredOption('--summary <text>', 'Event summary (≤ 200 chars)')
  .option('--heartbeat-id <id>', 'Source heartbeat ID')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const VALID_TYPES = ['new_job', 'travel', 'birthday', 'recovery', 'milestone', 'other']
    if (!VALID_TYPES.includes(opts.type)) {
      error(`--type 必须是: ${VALID_TYPES.join(' | ')}`)
      return
    }
    if (opts.summary.length > 200) {
      error('--summary 不能超过 200 字符')
      return
    }

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const imprint = await client.recordImprint(
        opts.friendId,
        opts.type,
        opts.summary,
        opts.heartbeatId,
      ) as Record<string, unknown>
      success(`✓ Imprint 已记录 [${imprint['id']}]`)
      info(`好友: ${opts.friendId} | 类型: ${opts.type}`)
      info(`摘要: ${opts.summary}`)
    } catch (err: any) {
      error(`记录失败: ${err.message}`)
    }
  })

// ─── imprint list ─────────────────────────────────────────────────────────────

imprintCommand
  .command('list')
  .description('List emotional milestones for a friend')
  .requiredOption('--friend-id <id>', 'Friend\'s Claw ID')
  .option('--limit <n>', 'Number of results (default 20)', '20')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    const limit = Math.min(parseInt(opts.limit, 10) || 20, 100)

    try {
      const imprints = await client.listImprints(opts.friendId, limit) as Record<string, unknown>[]

      if (imprints.length === 0) {
        info(`暂无 ${opts.friendId} 的 Imprint 记录。`)
        return
      }

      info('时间                  类型         摘要')
      info('──────────────────────────────────────────────')
      for (const imp of imprints) {
        const time = String(imp['detectedAt']).slice(0, 16).replace('T', ' ')
        const type = String(imp['eventType']).padEnd(12)
        const summary = String(imp['summary']).slice(0, 40)
        info(`${time}  ${type}  ${summary}`)
      }
    } catch (err: any) {
      error(`获取失败: ${err.message}`)
    }
  })
