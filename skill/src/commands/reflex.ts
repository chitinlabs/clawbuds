/**
 * reflex 命令（Phase 4+5）
 * clawbuds reflex list / enable / disable / log / ack / pending
 */

import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { success, error, info } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const reflexCommand = new Command('reflex').description('Manage ReflexEngine behaviors')

addProfileOption(reflexCommand)

/** 相对时间显示（如 "5 分钟前"）*/
function timeAgo(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime()
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

// ─── reflex list ──────────────────────────────────────────────────────────────

reflexCommand
  .command('list')
  .description('List Reflexes (default: enabled only)')
  .option('--layer <n>', 'Filter by trigger layer: 0 (algorithm) or 1 (LLM)')
  .option('--all', 'Show all reflexes including disabled')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    const filters: { layer?: 0 | 1; enabled?: boolean } = {}
    if (opts.layer !== undefined) {
      const l = parseInt(opts.layer, 10)
      if (l !== 0 && l !== 1) { error('--layer 必须是 0 或 1'); return }
      filters.layer = l as 0 | 1
    }
    if (opts.all) filters.enabled = false

    try {
      const reflexes = await client.listReflexes(filters) as Record<string, unknown>[]

      if (reflexes.length === 0) {
        info('暂无 Reflex。')
        return
      }

      const valueLayerMap: Record<string, string> = {
        infrastructure: '基础设施',
        emotional: '情感',
        collaboration: '协作',
        cognitive: '认知',
        expression: '表达',
      }

      info('名称                        层级  价值层    状态     置信度')
      info('────────────────────────────────────────────────────────────')
      for (const r of reflexes) {
        const name = String(r['name']).padEnd(28)
        const layer = `L${r['triggerLayer']}`
        const vl = (valueLayerMap[r['valueLayer'] as string] ?? String(r['valueLayer'])).padEnd(6)
        const enabled = r['enabled'] ? '✓ 启用' : '✗ 禁用'
        const conf = Number(r['confidence']).toFixed(1)
        const noDisable = r['name'] === 'audit_behavior_log' ? '  [不可禁用]' : ''
        info(`${name}  ${layer}    ${vl}  ${enabled}   ${conf}${noDisable}`)
      }
    } catch (err: any) {
      error(`获取失败: ${err.message}`)
    }
  })

// ─── reflex enable ────────────────────────────────────────────────────────────

reflexCommand
  .command('enable <name>')
  .description('Enable a Reflex')
  .action(async (name: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      await client.enableReflex(name)
      success(`✓ ${name} 已启用`)
    } catch (err: any) {
      if (err.message?.includes('not found') || err.message?.includes('NOT_FOUND')) {
        error(`Reflex 未找到: ${name}`)
      } else {
        error(`启用失败: ${err.message}`)
      }
    }
  })

// ─── reflex disable ───────────────────────────────────────────────────────────

reflexCommand
  .command('disable <name>')
  .description('Disable a Reflex (audit_behavior_log cannot be disabled)')
  .action(async (name: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      await client.disableReflex(name)
      success(`✓ ${name} 已禁用`)
    } catch (err: any) {
      if (err.message?.includes('FORBIDDEN') || err.message?.includes('Cannot disable')) {
        error(`✗ ${name} 不可禁用（必须保留审计日志）`)
      } else if (err.message?.includes('not found') || err.message?.includes('NOT_FOUND')) {
        error(`Reflex 未找到: ${name}`)
      } else {
        error(`禁用失败: ${err.message}`)
      }
    }
  })

// ─── reflex log ───────────────────────────────────────────────────────────────

reflexCommand
  .command('log')
  .description('Show recent Reflex execution log')
  .option('--limit <n>', 'Number of records (default 20, max 200)', '20')
  .option('--result <r>', 'Filter by result: executed | blocked')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    const limit = Math.min(parseInt(opts.limit, 10) || 20, 200)
    const validResults = ['executed', 'blocked']
    if (opts.result && !validResults.includes(opts.result)) {
      error(`--result 必须是: ${validResults.join(' | ')}`)
      return
    }

    try {
      // Fetch reflex list to build id→name map for display
      const reflexList = await client.listReflexes({ enabled: false }) as Record<string, unknown>[]
      const reflexNameMap = new Map<string, string>()
      for (const r of reflexList) {
        reflexNameMap.set(String(r['id']), String(r['name']))
      }

      const resp = await client.getReflexExecutions({
        limit,
        result: opts.result as 'executed' | 'blocked' | undefined,
      })
      const executions = resp.data ?? []

      if (executions.length === 0) {
        info('暂无执行记录。')
        return
      }

      const resultMap: Record<string, string> = {
        executed: '执行',
        recommended: '推荐',
        blocked: '拦截',
        queued_for_l1: 'L1队列',
      }

      info('时间          Reflex                    结果     详情')
      info('────────────────────────────────────────────────────────────')
      for (const e of executions) {
        const time = timeAgo(String(e['createdAt'])).padEnd(12)
        const reflexName = (reflexNameMap.get(String(e['reflexId'])) ?? String(e['reflexId']).slice(-8)).padEnd(26)
        const result = (resultMap[e['executionResult'] as string] ?? String(e['executionResult'])).padEnd(6)
        const details = e['details'] as Record<string, unknown>
        const detailStr = details?.['action']
          ? String(details['action'])
          : details?.['reason']
            ? `原因: ${details['reason']}`
            : details?.['alertType']
              ? String(details['alertType'])
              : ''
        info(`${time}  ${reflexName}  ${result}  ${detailStr}`)
      }
      info(`\n共 ${resp.meta?.total ?? executions.length} 条`)
    } catch (err: any) {
      error(`获取失败: ${err.message}`)
    }
  })

// ─── reflex ack (Phase 5) ─────────────────────────────────────────────────────

reflexCommand
  .command('ack')
  .description('Acknowledge a Layer 1 batch as processed (Agent command)')
  .requiredOption('--batch-id <id>', 'Batch ID to acknowledge')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const result = await client.acknowledgeReflexBatch(opts.batchId)
      success(`✓ Batch ${opts.batchId} 已确认（${result.acknowledgedCount} 条 Reflex 已处理）`)
    } catch (err: any) {
      if (err.message?.includes('not found') || err.message?.includes('NOT_FOUND')) {
        error(`Batch 未找到: ${opts.batchId}`)
      } else {
        error(`确认失败: ${err.message}`)
      }
    }
  })

// ─── reflex pending (Phase 5) ─────────────────────────────────────────────────

reflexCommand
  .command('pending')
  .description('Show Layer 1 pending queue status')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const status = await client.getPendingL1Status()
      info(`Layer 1 待处理队列: ${status.queueSize} 条`)
      info(`宿主状态: ${status.hostAvailable ? '✓ 已激活' : '✗ 未激活（NoopNotifier）'}`)
      if (status.oldestEntry) {
        info(`最早条目: ${status.oldestEntry}`)
      }
    } catch (err: any) {
      error(`获取失败: ${err.message}`)
    }
  })
