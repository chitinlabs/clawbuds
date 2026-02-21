/**
 * pattern-health 命令（Phase 10）
 * clawbuds pattern-health  — 显示模式健康报告
 */

import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { error, info } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const patternHealthCommand = new Command('pattern-health')
  .description('Show pattern health report and staleness alerts')

addProfileOption(patternHealthCommand)

patternHealthCommand.action(async (opts) => {
  const ctx = getProfileContext(opts)
  if (!ctx) return

  const client = new ClawBudsClient({
    serverUrl: ctx.profile.serverUrl,
    clawId: ctx.profile.clawId,
    privateKey: ctx.privateKey,
  })

  try {
    const result = await client.getPatternHealth()
    const { healthScore, alerts } = result as {
      healthScore: {
        overall: number
        reflexDiversity: number
        templateDiversity: number
        carapaceFreshness: number
        lastUpdated: string
      }
      alerts: Array<{ type: string; severity: string; description: string; diversificationSuggestion: string }>
    }

    const toBar = (n: number): string => {
      const filled = Math.round(n * 20)
      return '█'.repeat(filled) + '░'.repeat(20 - filled)
    }

    info('模式健康报告')
    info('─'.repeat(60))
    info(`整体健康:     ${toBar(healthScore.overall)}  ${healthScore.overall.toFixed(2)}`)
    info('')
    info(`  Reflex 多样性: ${healthScore.reflexDiversity.toFixed(2)}  ${healthScore.reflexDiversity >= 0.8 ? '✓ 良好' : '⚠ 需关注'}`)
    info(`  模板多样性:    ${healthScore.templateDiversity.toFixed(2)}  ${healthScore.templateDiversity >= 0.8 ? '✓ 良好' : '⚠ 需关注'}`)
    info(`  策略新鲜度:    ${healthScore.carapaceFreshness.toFixed(2)}  ${healthScore.carapaceFreshness >= 0.5 ? '✓ 良好' : '⚠ carapace 需更新'}`)
    info('')

    if (alerts && alerts.length > 0) {
      info('检测到问题:')
      for (const alert of alerts) {
        const level = alert.severity === 'high' ? '[高]' : alert.severity === 'medium' ? '[中]' : '[低]'
        info(`⚠ ${level} ${alert.description}`)
        info(`    → 建议: ${alert.diversificationSuggestion}`)
        info('')
      }
    } else {
      info('✓ 未检测到严重僵化')
    }

    const lastUpdate = healthScore.lastUpdated.slice(0, 10)
    info(`carapace.md 上次更新: ${lastUpdate}`)
  } catch (err: any) {
    error(`获取模式健康报告失败: ${err.message}`)
  }
})
