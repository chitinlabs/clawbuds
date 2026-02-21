/**
 * carapace 命令（Phase 10）
 * clawbuds carapace history  — 查看 carapace.md 修改历史
 * clawbuds carapace diff <version>  — 查看版本 diff
 * clawbuds carapace restore <version>  — 回滚到指定版本
 */

import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { success, error, info } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const carapaceCommand = new Command('carapace').description('Manage carapace.md evolution')

addProfileOption(carapaceCommand)

// ─── carapace history ────────────────────────────────────────────────────────

carapaceCommand
  .command('history')
  .description('View carapace.md modification history')
  .option('--limit <n>', 'Number of entries to show', '20')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const records = await client.getCarapaceHistory({ limit: parseInt(opts.limit) })
      if (!records || (records as unknown[]).length === 0) {
        info('暂无 carapace.md 修改历史。')
        return
      }

      info(`carapace.md 修改历史（共 ${(records as unknown[]).length} 个版本）`)
      info('─'.repeat(60))
      info('版本  时间                  变更类型      说明')
      info('─'.repeat(60))
      for (const r of records as Array<Record<string, unknown>>) {
        const date = String(r['createdAt']).slice(0, 16).replace('T', ' ')
        const reason = String(r['changeReason'])
        const reasonZh: Record<string, string> = {
          micro_molt: 'Micro-Molt',
          manual_edit: '手动编辑',
          allow: 'Allow 规则',
          escalate: 'Escalate 规则',
          restore: '版本回滚',
        }
        info(`${String(r['version']).padEnd(6)}${date.padEnd(22)}${(reasonZh[reason] ?? reason).padEnd(14)}v${r['version']}`)
      }
      info('')
      info('使用 `clawbuds carapace diff <版本>` 查看变更详情')
      info('使用 `clawbuds carapace restore <版本>` 回滚')
    } catch (err: any) {
      error(`获取历史失败: ${err.message}`)
    }
  })

// ─── carapace diff ───────────────────────────────────────────────────────────

carapaceCommand
  .command('diff <version>')
  .description('Show diff between current and a specific version')
  .action(async (version, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    const versionNum = parseInt(version)
    if (isNaN(versionNum)) {
      error(`Invalid version number: ${version}`)
      return
    }

    try {
      const [records, targetRecord] = await Promise.all([
        client.getCarapaceHistory({ limit: 1 }),
        client.getCarapaceVersion(versionNum),
      ])

      if (!targetRecord) {
        error(`版本 ${versionNum} 不存在`)
        return
      }

      const latest = records[0] as Record<string, unknown> | undefined
      const target = targetRecord as Record<string, unknown>

      info(`carapace.md 版本 ${versionNum} → ${latest ? String(latest['version']) : '(当前)'}`)
      info('')

      const targetLines = String(target['content']).split('\n')
      const latestLines = (latest ? String(latest['content']) : '').split('\n')

      // 简单 diff：找出新增和删除的行
      const targetSet = new Set(targetLines)
      const latestSet = new Set(latestLines)

      let hasDiff = false
      for (const line of latestLines) {
        if (!targetSet.has(line) && line.trim()) {
          info(`+ ${line}`)
          hasDiff = true
        }
      }
      for (const line of targetLines) {
        if (!latestSet.has(line) && line.trim()) {
          info(`- ${line}`)
          hasDiff = true
        }
      }

      if (!hasDiff) {
        info('（无差异）')
      }
    } catch (err: any) {
      error(`获取 diff 失败: ${err.message}`)
    }
  })

// ─── carapace restore ─────────────────────────────────────────────────────────

carapaceCommand
  .command('restore <version>')
  .description('Restore carapace.md to a specific version (current version auto-saved)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (version, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    const versionNum = parseInt(version)
    if (isNaN(versionNum)) {
      error(`Invalid version number: ${version}`)
      return
    }

    if (!opts.yes) {
      const { createInterface } = await import('node:readline')
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      const confirmed = await new Promise<boolean>((resolve) => {
        rl.question(
          `? 确认回滚到版本 ${versionNum}？当前版本将自动备份。[y/N] `,
          (ans) => {
            rl.close()
            resolve(ans.toLowerCase() === 'y')
          },
        )
      })
      if (!confirmed) {
        info('已取消。')
        return
      }
    }

    try {
      const result = await client.restoreCarapaceVersion(versionNum)
      const r = result as { restoredVersion: number; newVersion: number }
      success(`✓ 已回滚到版本 ${r.restoredVersion}（当前版本已保存为版本 ${r.newVersion}）`)
    } catch (err: any) {
      error(`回滚失败: ${err.message}`)
    }
  })
