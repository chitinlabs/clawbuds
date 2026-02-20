/**
 * MicroMoltService — Carapace 调整建议生成（Phase 6）
 * 通过分析 Reflex 执行历史和简报阅读模式，提供行为策略调整建议
 */

import type { IReflexExecutionRepository } from '../db/repositories/interfaces/reflex.repository.interface.js'
import type { IBriefingRepository } from '../db/repositories/interfaces/briefing.repository.interface.js'

export interface MicroMoltSuggestion {
  type: 'allow' | 'escalate' | 'timing' | 'disable'
  description: string       // 自然语言建议
  cliCommand: string        // 实现该建议的 CLI 命令
  confidence: number        // Agent 对建议的置信度 [0, 1]
}

const MAX_SUGGESTIONS = parseInt(process.env['CLAWBUDS_MICROMOLT_MAX'] ?? '3', 10)
const DAYS_7 = 7 * 24 * 60 * 60 * 1000

export class MicroMoltService {
  constructor(
    private executionRepo: IReflexExecutionRepository,
    private briefingRepo: IBriefingRepository,
  ) {}

  /**
   * 生成 carapace.md 调整建议（汇总所有分析维度，最多 MAX_SUGGESTIONS 条）
   */
  async generateSuggestions(clawId: string): Promise<MicroMoltSuggestion[]> {
    const [rejection, reading] = await Promise.all([
      this.analyzeRejectionPatterns(clawId),
      this.analyzeReadingPatterns(clawId),
    ])
    const all = [...rejection, ...reading]
    // 按置信度降序，最多返回 MAX_SUGGESTIONS 条
    return all
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_SUGGESTIONS)
  }

  /**
   * 分析 Reflex 拒绝模式
   * 某 Reflex 被 blocked 频率 > 80% → 建议降低置信度或禁用
   */
  private async analyzeRejectionPatterns(clawId: string): Promise<MicroMoltSuggestion[]> {
    const since = new Date(Date.now() - DAYS_7).toISOString()
    const [blocked, executed] = await Promise.all([
      this.executionRepo.findByResult(clawId, 'blocked', since, 200),
      this.executionRepo.findByResult(clawId, 'executed', since, 200),
    ])

    // 按 reflexId 统计
    const blockedByReflex = new Map<string, number>()
    const executedByReflex = new Map<string, number>()
    for (const r of blocked) {
      blockedByReflex.set(r.reflexId, (blockedByReflex.get(r.reflexId) ?? 0) + 1)
    }
    for (const r of executed) {
      executedByReflex.set(r.reflexId, (executedByReflex.get(r.reflexId) ?? 0) + 1)
    }

    const suggestions: MicroMoltSuggestion[] = []
    for (const [reflexId, blockedCount] of blockedByReflex.entries()) {
      const executedCount = executedByReflex.get(reflexId) ?? 0
      const total = blockedCount + executedCount
      if (total < 5) continue   // 数据不足，跳过
      const blockedRate = blockedCount / total
      if (blockedRate > 0.8) {
        suggestions.push({
          type: 'disable',
          description: `Reflex "${reflexId}" 的触发在过去 7 天有 ${Math.round(blockedRate * 100)}% 被拦截（共 ${total} 次）`,
          cliCommand: `clawbuds reflex disable --id ${reflexId}`,
          confidence: Math.min(0.9, blockedRate),
        })
      }
    }
    return suggestions
  }

  /**
   * 分析简报阅读时间模式
   * 用户总在固定时间标记已读 → 建议调整生成时间
   */
  private async analyzeReadingPatterns(clawId: string): Promise<MicroMoltSuggestion[]> {
    const history = await this.briefingRepo.findHistory(clawId, { limit: 14, type: 'daily' })
    const acked = history.filter((b) => b.acknowledgedAt != null)
    if (acked.length < 5) return []  // 数据不足

    // 统计阅读小时分布
    const hourCounts = new Map<number, number>()
    for (const b of acked) {
      const hour = new Date(b.acknowledgedAt!).getHours()
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1)
    }

    // 找到最高频的小时
    let maxHour = -1
    let maxCount = 0
    for (const [hour, count] of hourCounts.entries()) {
      if (count > maxCount) {
        maxCount = count
        maxHour = hour
      }
    }

    if (maxHour < 0 || maxCount < 3) return []

    // 如果用户阅读时间与默认时间（20:00）差异 > 1 小时，建议调整
    if (Math.abs(maxHour - 20) > 1) {
      return [{
        type: 'timing',
        description: `你通常在 ${maxHour}:00 阅读简报（过去 ${acked.length} 次均如此）`,
        cliCommand: `CLAWBUDS_BRIEFING_CRON="0 ${maxHour} * * *"`,
        confidence: Math.min(0.85, maxCount / acked.length),
      }]
    }
    return []
  }
}
