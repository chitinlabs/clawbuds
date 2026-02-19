/**
 * pearl 命令（Phase 3）
 * clawbuds pearl create / list / view / update / delete / share / endorse / received
 */

import { Command } from 'commander'
import * as readline from 'node:readline'
import { ClawBudsClient } from '../client.js'
import { success, error, info } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const pearlCommand = new Command('pearl').description('Manage Pearl cognitive assets')

addProfileOption(pearlCommand)

// ─── pearl create ─────────────────────────────────────────────────────────────

pearlCommand
  .command('create')
  .description('Create a new Pearl (manual crystallization)')
  .requiredOption('--type <type>', 'Pearl type: insight | framework | experience')
  .requiredOption('--trigger, -t <text>', 'Semantic trigger (≤100 chars)')
  .option('--body, -b <text>', 'Pearl body content')
  .option('--context <text>', 'Origin context')
  .option('--tags <tags>', 'Domain tags (comma-separated, e.g. "AI,LLM,产品设计")')
  .option('--shareability <s>', 'Visibility: private | friends_only (default) | public')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    const type = opts.type as 'insight' | 'framework' | 'experience'
    if (!['insight', 'framework', 'experience'].includes(type)) {
      error(`Invalid type: ${type}. Must be insight, framework, or experience.`)
      return
    }

    try {
      const pearl = await client.createPearl({
        type,
        triggerText: opts.trigger,
        body: opts.body,
        context: opts.context,
        domainTags: opts.tags ? opts.tags.split(',').map((t: string) => t.trim()) : undefined,
        shareability: opts.shareability as 'private' | 'friends_only' | 'public' | undefined,
      })
      const p = pearl as Record<string, unknown>
      success('Pearl 已创建')
      info(`ID:        ${p['id']}`)
      info(`类型:      ${p['type']}`)
      info(`触发:      "${p['triggerText']}"`)
      const tags = p['domainTags'] as string[]
      if (tags && tags.length > 0) info(`标签:      ${tags.join(' · ')}`)
      info(`Luster:    ${p['luster']}（待背书）`)
      const shareMap: Record<string, string> = { private: '私有', friends_only: '好友可见', public: '公开' }
      info(`可见性:    ${shareMap[p['shareability'] as string] ?? p['shareability']}`)
    } catch (err: any) {
      error(`创建失败: ${err.message}`)
    }
  })

// ─── pearl list ───────────────────────────────────────────────────────────────

pearlCommand
  .command('list')
  .description('List your Pearls (Level 0)')
  .option('--type <type>', 'Filter by type: insight | framework | experience')
  .option('--domain, -d <domain>', 'Filter by domain tag')
  .option('--shareability <s>', 'Filter by shareability')
  .option('--limit <n>', 'Number of results (default 20)', '20')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const pearls = await client.listPearls({
        type: opts.type,
        domain: opts.domain,
        shareability: opts.shareability,
        limit: parseInt(opts.limit, 10),
      }) as Record<string, unknown>[]

      if (pearls.length === 0) {
        info('暂无 Pearl。使用 `clawbuds pearl create` 创建第一个。')
        return
      }

      // Table header
      const typeMap: Record<string, string> = { insight: 'insight  ', framework: 'framework', experience: 'experience' }
      info('类型        Luster  标签                    触发（节选）')
      info('─────────────────────────────────────────────────────────')
      for (const p of pearls) {
        const typeName = typeMap[p['type'] as string] ?? String(p['type'])
        const luster = Number(p['luster']).toFixed(2)
        const tags = (p['domainTags'] as string[]).join(' · ').slice(0, 20)
        const trigger = String(p['triggerText']).slice(0, 30)
        info(`${typeName}   ${luster}    ${tags.padEnd(22, ' ')}  "${trigger}"`)
      }
    } catch (err: any) {
      error(`获取失败: ${err.message}`)
    }
  })

// ─── pearl view ───────────────────────────────────────────────────────────────

pearlCommand
  .command('view <id>')
  .description('View a Pearl (default level=1)')
  .option('--level <n>', 'Loading level: 0 | 1 | 2 (default 1)', '1')
  .action(async (id: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const level = parseInt(opts.level, 10) as 0 | 1 | 2
      const p = await client.viewPearl(id, level) as Record<string, unknown>
      const tags = (p['domainTags'] as string[]).join(' · ')
      const shareMap: Record<string, string> = { private: '私有', friends_only: '好友可见', public: '公开' }

      info(`=== Pearl ===`)
      info(`类型:      ${p['type']}`)
      info(`触发:      "${p['triggerText']}"`)
      info(`标签:      ${tags || '（无）'}`)
      info(`Luster:    ${Number(p['luster']).toFixed(2)}`)
      info(`可见性:    ${shareMap[p['shareability'] as string] ?? p['shareability']}`)

      if (level >= 1 && p['body']) {
        info(`正文:`)
        info(`  ${String(p['body'])}`)
      }
      if (level >= 1 && p['context']) {
        info(`来源:      ${p['context']}`)
      }
      if (level >= 2) {
        const refs = p['references'] as Record<string, unknown>[]
        if (refs && refs.length > 0) {
          info(`引用 (${refs.length}):`)
          refs.forEach((ref) => info(`  [${ref['type']}] ${ref['content']}`))
        }
      }
      info(`创建:      ${p['createdAt']} | 更新: ${p['updatedAt']}`)
    } catch (err: any) {
      error(`查看失败: ${err.message}`)
    }
  })

// ─── pearl update ─────────────────────────────────────────────────────────────

pearlCommand
  .command('update <id>')
  .description('Update a Pearl')
  .option('--trigger <text>', 'New trigger text')
  .option('--body <text>', 'New body content (pass "" to clear)')
  .option('--context <text>', 'New context')
  .option('--tags <tags>', 'New domain tags (comma-separated, replaces existing)')
  .option('--shareability <s>', 'New shareability: private | friends_only | public')
  .action(async (id: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    const data: Record<string, unknown> = {}
    if (opts.trigger !== undefined) data['triggerText'] = opts.trigger
    if (opts.body !== undefined) data['body'] = opts.body === '' ? null : opts.body
    if (opts.context !== undefined) data['context'] = opts.context
    if (opts.tags !== undefined) data['domainTags'] = opts.tags.split(',').map((t: string) => t.trim())
    if (opts.shareability !== undefined) data['shareability'] = opts.shareability

    try {
      await client.updatePearl(id, data as any)
      success('Pearl 已更新')
    } catch (err: any) {
      error(`更新失败: ${err.message}`)
    }
  })

// ─── pearl delete ─────────────────────────────────────────────────────────────

pearlCommand
  .command('delete <id>')
  .description('Delete a Pearl (with confirmation)')
  .action(async (id: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    // Confirmation prompt
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const confirmed = await new Promise<boolean>((resolve) => {
      rl.question(
        '? 确认删除此 Pearl？此操作不可撤销，分享记录和背书将一并删除。[y/N] ',
        (ans) => {
          rl.close()
          resolve(ans.toLowerCase() === 'y')
        },
      )
    })

    if (!confirmed) {
      info('已取消')
      return
    }

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      await client.deletePearl(id)
      success('Pearl 已删除')
    } catch (err: any) {
      error(`删除失败: ${err.message}`)
    }
  })

// ─── pearl share ──────────────────────────────────────────────────────────────

pearlCommand
  .command('share <id> <friendId>')
  .description('Share a Pearl with a friend')
  .action(async (id: string, friendId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      await client.sharePearl(id, friendId)
      success(`Pearl 已分享给 ${friendId}`)
    } catch (err: any) {
      if (err.message?.includes('already')) {
        success('已分享过此 Pearl')
      } else {
        error(`分享失败: ${err.message}`)
      }
    }
  })

// ─── pearl endorse ────────────────────────────────────────────────────────────

pearlCommand
  .command('endorse <id>')
  .description('Endorse a Pearl')
  .requiredOption('--score, -s <score>', '背书分数 0.0-1.0')
  .option('--comment, -c <comment>', '评论（可选）')
  .action(async (id: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const score = parseFloat(opts.score)
    if (isNaN(score) || score < 0 || score > 1) {
      error('score 必须在 0.0-1.0 之间')
      return
    }

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const result = await client.endorsePearl(id, score, opts.comment)
      success('背书已提交')
      info(`新 Luster:  ${Number(result.newLuster).toFixed(2)}`)
    } catch (err: any) {
      error(`背书失败: ${err.message}`)
    }
  })

// ─── pearl received ───────────────────────────────────────────────────────────

pearlCommand
  .command('received')
  .description('List received Pearls (shared to you by friends)')
  .option('--limit <n>', 'Number of results (default 20)', '20')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const received = await client.getReceivedPearls({ limit: parseInt(opts.limit, 10) })

      if (received.length === 0) {
        info('暂未收到任何 Pearl。')
        return
      }

      info('来自          时间                类型        触发（节选）')
      info('──────────────────────────────────────────────────────')
      for (const item of received) {
        const share = item.share as Record<string, unknown>
        const pearl = item.pearl as Record<string, unknown>
        const fromId = String(share['fromClawId']).slice(-8)
        const time = String(share['createdAt']).slice(0, 16)
        const trigger = String(pearl['triggerText']).slice(0, 30)
        info(`${fromId}   ${time}   ${pearl['type']}      "${trigger}"`)
      }
    } catch (err: any) {
      error(`获取失败: ${err.message}`)
    }
  })
