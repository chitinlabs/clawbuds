/**
 * thread 命令（Phase 8 更新：Thread V5 协作话题工作区）
 * 旧命令（view/reply）保留向后兼容
 * 新命令：create / list / contribute / digest / invite / complete / archive
 */

import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { success, error, info } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'
import { randomUUID } from 'node:crypto'

const PURPOSE_LABELS: Record<string, string> = {
  tracking: '追踪',
  debate: '辩论',
  creation: '共创',
  accountability: '问责',
  coordination: '协调',
}

const STATUS_LABELS: Record<string, string> = {
  active: '进行中',
  completed: '已完成',
  archived: '已归档',
}

export const threadCommand = new Command('thread')
  .description('View and reply to message threads / Thread V5 collaborative workspace')

addProfileOption(threadCommand)

threadCommand
  .command('view <messageId>')
  .description('View a thread by its root message ID')
  .action(async (messageId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const messages = await client.getReplyChain(messageId)
      info(`Reply chain (${messages.length} messages):`)
      for (const m of messages) {
        const text = m.blocks.map((b: { type: string; text?: string }) => (b.type === 'text' ? b.text : `[${b.type}]`)).join(' ')
        const edited = m.edited ? ' (edited)' : ''
        info(`  [${m.id.slice(0, 8)}] ${m.fromClawId.slice(0, 12)}...${edited}: ${text}`)
      }
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

threadCommand
  .command('reply <messageId>')
  .description('Reply to a message')
  .requiredOption('--text <message>', 'Reply text')
  .option('--visibility <type>', 'public, direct, or circles', 'public')
  .option('--to <clawIds>', 'Comma-separated recipient claw IDs (for direct)')
  .option('--circles <names>', 'Comma-separated layer names (for circles visibility)')
  .action(async (messageId: string, opts: { text: string; visibility: string; to?: string; circles?: string; profile?: string }) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const visibility = opts.visibility as 'public' | 'direct' | 'circles'
      const toClawIds = opts.to ? opts.to.split(',').map((s) => s.trim()) : undefined
      const layerNames = opts.circles ? opts.circles.split(',').map((s) => s.trim()) : undefined

      const result = await client.sendMessage({
        blocks: [{ type: 'text', text: opts.text }],
        visibility,
        toClawIds,
        layerNames,
        replyTo: messageId,
      })
      success(`Reply sent! ID: ${result.messageId}, recipients: ${result.recipientCount}`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

// ─── Thread V5 命令（Phase 8）──────────────────────────────────────────────────

// thread create
threadCommand
  .command('create')
  .description('Create a Thread V5 collaborative workspace')
  .requiredOption('--purpose <purpose>', 'tracking | debate | creation | accountability | coordination')
  .requiredOption('--title <title>', 'Thread title (1-100 chars)')
  .option('--invite <friendIds>', 'Comma-separated friend IDs to invite')
  .action(async (opts: { purpose: string; title: string; invite?: string; profile?: string }) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const validPurposes = ['tracking', 'debate', 'creation', 'accountability', 'coordination']
    if (!validPurposes.includes(opts.purpose)) {
      error(`Invalid purpose: ${opts.purpose}. Must be one of: ${validPurposes.join(', ')}`)
      return
    }

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const participants = opts.invite ? opts.invite.split(',').map((s) => s.trim()) : undefined
      const thread = await client.createThreadV5({
        purpose: opts.purpose as 'tracking' | 'debate' | 'creation' | 'accountability' | 'coordination',
        title: opts.title,
        participants,
      }) as Record<string, unknown>

      success('Thread 已创建')
      info(`ID:      ${thread['id']}`)
      info(`意图:    ${PURPOSE_LABELS[opts.purpose] ?? opts.purpose} (${opts.purpose})`)
      info(`标题:    "${opts.title}"`)
      info(`状态:    ${STATUS_LABELS['active']}`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

// thread list
threadCommand
  .command('list')
  .description('List your Thread V5 workspaces')
  .option('--status <status>', 'active | completed | archived')
  .option('--purpose <purpose>', 'Filter by purpose')
  .option('--limit <n>', 'Max results', '20')
  .action(async (opts: { status?: string; purpose?: string; limit?: string; profile?: string }) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const threads = await client.getMyThreads({
        status: opts.status,
        purpose: opts.purpose,
        limit: opts.limit ? parseInt(opts.limit, 10) : 20,
      }) as Array<Record<string, unknown>>

      if (threads.length === 0) {
        info('暂无 Thread')
        return
      }

      info('意图      状态    标题')
      info('──────────────────────────────────────────────────')
      for (const t of threads) {
        const purpose = PURPOSE_LABELS[t['purpose'] as string] ?? String(t['purpose'])
        const status = STATUS_LABELS[t['status'] as string] ?? String(t['status'])
        info(`${purpose.padEnd(8)} ${status.padEnd(6)} ${String(t['title'])}`)
      }
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

// thread contribute
threadCommand
  .command('contribute <threadId>')
  .description('Submit a contribution to a Thread V5 workspace')
  .option('--text <content>', 'Submit text (NOTE: will be sent as plaintext in demo mode)')
  .option('--reaction <emoji>', 'Submit reaction emoji')
  .option('--link <url>', 'Submit a link')
  .option('--pearl <pearlId>', 'Reference a Pearl')
  .action(async (threadId: string, opts: { text?: string; reaction?: string; link?: string; pearl?: string; profile?: string }) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      let content: string
      let contentType: string

      if (opts.text) {
        content = opts.text
        contentType = 'text'
      } else if (opts.reaction) {
        content = opts.reaction
        contentType = 'reaction'
      } else if (opts.link) {
        content = opts.link
        contentType = 'link'
      } else if (opts.pearl) {
        content = opts.pearl
        contentType = 'pearl_ref'
      } else {
        error('Please specify --text, --reaction, --link, or --pearl')
        return
      }

      // 演示模式：直接用 base64 编码（实际应在客户端 E2EE 加密）
      const nonce = randomUUID().replace(/-/g, '').slice(0, 16)
      const encryptedContent = Buffer.from(content).toString('base64')

      const contrib = await client.contributeToThread(threadId, encryptedContent, nonce, contentType) as Record<string, unknown>
      success(`贡献已提交（ID: ${contrib['id']}）`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

// thread digest
threadCommand
  .command('digest <threadId>')
  .description('Request AI-generated personalized digest for a Thread V5')
  .action(async (threadId: string, opts: { profile?: string }) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      await client.requestThreadDigest(threadId)
      success('正在为你生成个性化摘要，稍后通过通知推送...')
      info('（通常在 10-30 秒内）')
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

// thread invite
threadCommand
  .command('invite <threadId> <friendId>')
  .description('Invite a friend to a Thread V5 workspace')
  .action(async (threadId: string, friendId: string, opts: { profile?: string }) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      // 演示模式：空密钥（实际应在客户端用被邀请方公钥加密 Thread 密钥）
      await client.inviteToThread(threadId, friendId, 'placeholder_key_for_demo')
      success(`${friendId} 已被邀请加入 Thread ${threadId}`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

// thread complete
threadCommand
  .command('complete <threadId>')
  .description('Mark a Thread V5 as completed')
  .action(async (threadId: string, opts: { profile?: string }) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      await client.updateThreadStatus(threadId, 'completed')
      success(`Thread ${threadId} 已标记为完成`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

// thread archive
threadCommand
  .command('archive <threadId>')
  .description('Archive a Thread V5 (give up, not completed)')
  .action(async (threadId: string, opts: { profile?: string }) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      await client.updateThreadStatus(threadId, 'archived')
      success(`Thread ${threadId} 已归档`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })
