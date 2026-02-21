/**
 * draft 命令（Phase 11 T4d）
 * clawbuds draft save    — 保存草稿（Agent 生成，等待审批）
 * clawbuds draft list    — 查看草稿列表
 * clawbuds draft approve — 批准草稿并发送
 * clawbuds draft reject  — 拒绝草稿
 */

import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { success, error, info } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const draftCommand = new Command('draft').description('Manage message drafts')

addProfileOption(draftCommand)

// ─── draft save ───────────────────────────────────────────────────────────────

draftCommand
  .command('save')
  .description('Save a draft message for later approval')
  .requiredOption('--to <claw-id>', 'Recipient claw ID')
  .requiredOption('--text <content>', 'Draft message content')
  .option('--reason <reason>', 'Reason for this draft (e.g. "groom_request")', 'manual')
  .option('--expires <iso-date>', 'Optional expiration date (ISO 8601)')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const draft = await client.createDraft({
        toClawId: opts.to,
        content: opts.text,
        reason: opts.reason,
        expiresAt: opts.expires,
      })
      success(`草稿已保存（ID: ${(draft as Record<string, unknown>)['id']}）`)
      info(`收件人: ${opts.to}`)
      info(`原因:   ${opts.reason}`)
      info('使用 `clawbuds draft list --pending` 查看所有待审批草稿')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      error(`保存草稿失败: ${message}`)
    }
  })

// ─── draft list ───────────────────────────────────────────────────────────────

draftCommand
  .command('list')
  .description('List drafts (optionally filter by status)')
  .option('--pending', 'Only show pending drafts')
  .option('--status <status>', 'Filter by status: pending | approved | rejected | expired')
  .option('--limit <n>', 'Number of drafts to show', '20')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    // --pending 是 --status pending 的简写
    const status: string | undefined = opts.pending ? 'pending' : opts.status

    try {
      const drafts = (await client.listDrafts({ status, limit: parseInt(opts.limit, 10) })) as Array<Record<string, unknown>>

      if (drafts.length === 0) {
        info(status ? `没有${status === 'pending' ? '待审批' : ''}草稿。` : '没有草稿。')
        return
      }

      const statusLabel: Record<string, string> = {
        pending: '⏳ 待审批',
        approved: '✓ 已发送',
        rejected: '✗ 已拒绝',
        expired: '⌛ 已过期',
      }

      info(`草稿列表（共 ${drafts.length} 条${status ? `，过滤: ${status}` : ''}）`)
      info('─'.repeat(70))
      for (const d of drafts) {
        const statusStr = statusLabel[String(d['status'])] ?? String(d['status'])
        const date = String(d['createdAt']).slice(0, 16).replace('T', ' ')
        info(`${String(d['id']).padEnd(24)} ${statusStr.padEnd(10)} → ${d['toClawId']}`)
        info(`  ${date}  原因: ${d['reason']}`)
        info(`  内容: ${String(d['content']).slice(0, 60)}${String(d['content']).length > 60 ? '...' : ''}`)
        info('')
      }
      if (status !== 'pending') {
        info('使用 `clawbuds draft approve <id>` 批准草稿并发送')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      error(`获取草稿列表失败: ${message}`)
    }
  })

// ─── draft approve ────────────────────────────────────────────────────────────

draftCommand
  .command('approve <draft-id>')
  .description('Approve a draft and send the message')
  .action(async (draftId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const result = (await client.approveDraft(draftId)) as { draft: Record<string, unknown>; messageId: string }
      success(`草稿已批准，消息已发送`)
      info(`消息 ID: ${result.messageId}`)
      info(`收件人:  ${result.draft['toClawId']}`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      error(`批准草稿失败: ${message}`)
    }
  })

// ─── draft reject ─────────────────────────────────────────────────────────────

draftCommand
  .command('reject <draft-id>')
  .description('Reject a draft (message will not be sent)')
  .action(async (draftId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const draft = (await client.rejectDraft(draftId)) as Record<string, unknown>
      success(`草稿已拒绝`)
      info(`ID: ${draft['id']}  →  状态: rejected`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      error(`拒绝草稿失败: ${message}`)
    }
  })
