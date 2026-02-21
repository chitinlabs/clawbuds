/**
 * micromolt 命令（Phase 10）
 * clawbuds micromolt apply  — 逐一确认并应用 Micro-Molt 建议
 */

import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { success, error, info } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const micromoltCommand = new Command('micromolt').description('Manage Micro-Molt suggestions')

addProfileOption(micromoltCommand)

// ─── micromolt apply ──────────────────────────────────────────────────────────

micromoltCommand
  .command('apply')
  .description('Review and apply Micro-Molt suggestions from the latest briefing')
  .option('--suggestion <index>', 'Apply a specific suggestion by index (0-based)')
  .option('-y, --yes', 'Auto-confirm all suggestions')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    // 通过 pattern-health + latest briefing 获取当前建议
    // 目前先用 pattern-health 端点来演示
    try {
      const result = await client.getPatternHealth()
      const { alerts } = result as {
        alerts: Array<{
          type: string
          severity: string
          description: string
          diversificationSuggestion: string
        }>
      }

      if (!alerts || alerts.length === 0) {
        info('当前没有 Micro-Molt 建议。')
        return
      }

      info(`当前 Micro-Molt 建议（${alerts.length} 条）:`)
      info('')

      if (opts.suggestion !== undefined) {
        const idx = parseInt(opts.suggestion, 10)
        if (isNaN(idx) || idx < 0 || idx >= alerts.length) {
          error(`Invalid suggestion index: ${opts.suggestion}`)
          return
        }
        await applyOrSkip(client, idx, alerts[idx], opts.yes)
      } else {
        // 逐一确认
        for (let i = 0; i < alerts.length; i++) {
          await applyOrSkip(client, i, alerts[i], opts.yes)
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      error(`获取建议失败: ${message}`)
    }
  })

async function applyOrSkip(
  client: ClawBudsClient,
  index: number,
  alert: { type: string; severity: string; description: string; diversificationSuggestion: string },
  autoYes: boolean,
): Promise<void> {
  info(`[${index + 1}] ${alert.description}`)
  info(`    操作: ${alert.diversificationSuggestion}`)

  if (!autoYes) {
    const { createInterface } = await import('node:readline')
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const confirmed = await new Promise<boolean>((resolve) => {
      rl.question('    ? 确认应用此建议? [Y/n] ', (ans) => {
        rl.close()
        resolve(ans.toLowerCase() !== 'n')
      })
    })
    if (!confirmed) {
      info('    → 跳过')
      info('')
      return
    }
  }

  try {
    await client.applyMicroMoltSuggestion({ suggestionIndex: index, confirmed: true })
    success(`    已应用`)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    error(`    应用失败: ${message}`)
  }
  info('')
}
