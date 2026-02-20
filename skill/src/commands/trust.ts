/**
 * trust 命令（Phase 7）
 * clawbuds trust <friendId>           — 查看信任评分
 * clawbuds trust endorse <friendId>   — 手动背书
 * clawbuds trust list                 — 信任排名（TODO: Phase 9 添加 getAllForClaw API 后实现）
 */

import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { success, error, info } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const trustCommand = new Command('trust').description('Manage trust scores for friends')

addProfileOption(trustCommand)

// ─── trust <friendId> ─────────────────────────────────────────────────────────

trustCommand
  .arguments('<friendId>')
  .description('View trust scores for a friend (all domains or specified domain)')
  .option('--domain, -d <domain>', 'Filter by specific domain')
  .action(async (friendId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const records = await client.getTrustScores(friendId, opts.domain)

      if (records.length === 0) {
        info(`还没有对 ${friendId} 的信任评分记录`)
        info('提示：好友建立关系后会自动初始化 _overall 域的评分')
        return
      }

      const pad = (s: string, n: number) => s.padEnd(n)
      const fmt = (n: number | null) => n === null ? '  -  ' : n.toFixed(2)

      info(`${friendId} 的信任评分`)
      info('──────────────────────────────────────────────')
      info(`${pad('领域', 14)}  ${pad('Q', 6)} ${pad('H', 6)} ${pad('N', 6)} ${pad('W', 6)}  合成`)
      info('──────────────────────────────────────────────')

      for (const r of records as Record<string, unknown>[]) {
        const domain = String(r['domain'] ?? '_overall')
        const q = typeof r['qScore'] === 'number' ? r['qScore'] : 0.5
        const h = typeof r['hScore'] === 'number' ? r['hScore'] : null
        const n = typeof r['nScore'] === 'number' ? r['nScore'] : 0.5
        const w = typeof r['wScore'] === 'number' ? r['wScore'] : 0.0
        const composite = typeof r['composite'] === 'number' ? r['composite'] : 0.5

        const endorsedMark = h !== null ? '' : ''  // H 有值时显示标记
        info(`${pad(domain, 14)}  ${fmt(q)}  ${fmt(h)}  ${fmt(n)}  ${fmt(w)}  ${composite.toFixed(2)}${endorsedMark}`)
      }

      info('──────────────────────────────────────────────')
      info('Q=代理互动  H=人工背书  N=网络位置  W=见证信誉  "-"=未设置')
    } catch (err: any) {
      error(`查询失败: ${err.message}`)
    }
  })

// ─── trust endorse <friendId> ─────────────────────────────────────────────────

trustCommand
  .command('endorse <friendId>')
  .description('Manually endorse a friend (set H dimension)')
  .requiredOption('--score <n>', '信任分数 (0.0-1.0)')
  .option('--domain <domain>', '领域（默认 _overall）')
  .option('--note <text>', '备注（最多 200 字符）')
  .action(async (friendId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    const score = parseFloat(opts.score)
    if (isNaN(score) || score < 0 || score > 1) {
      error('--score 必须是 0.0 到 1.0 之间的数值')
      return
    }

    const domain = opts.domain ?? '_overall'

    try {
      const result = await client.endorseTrust(friendId, score, domain, opts.note)
      const domainLabel = domain === '_overall' ? '总体' : domain

      success(`已背书 ${friendId} [${domainLabel} 领域]`)

      const oldC = result.oldComposite.toFixed(2)
      const newC = result.newComposite.toFixed(2)
      const delta = result.newComposite - result.oldComposite
      const arrow = delta > 0 ? `↑ ${delta.toFixed(2)}` : delta < 0 ? `↓ ${Math.abs(delta).toFixed(2)}` : '→ 不变'

      info(`合成信任: ${oldC} → ${newC} (${arrow})`)
      if (delta > 0.1) {
        info('说明: H 维度的高分显著提升了合成评分')
      } else if (score < 0.3) {
        info('⚠ 注意: 低信任分会降低 Pearl 自动路由频率')
      }
    } catch (err: any) {
      error(`背书失败: ${err.message}`)
    }
  })
