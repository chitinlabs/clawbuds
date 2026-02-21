/**
 * PatternStalenessDetector — 模式僵化检测（Phase 10）
 * 检测 Reflex 执行的重复模式 + 模板回复的单调性，触发多样化策略
 */

import type { IReflexExecutionRepository } from '../db/repositories/interfaces/reflex.repository.interface.js'
import type { ICarapaceHistoryRepository } from '../db/repositories/interfaces/carapace-history.repository.interface.js'

export type StalenessAlertType =
  | 'reflex_repetition'        // 相同 Reflex 行为高度重复
  | 'emoji_monotony'           // 表情反应过于单调
  | 'carapace_stale'          // carapace.md 长期未更新（> 60 天）
  | 'groom_phrase_repetition'  // 梳理消息用词单调

export interface StalenessAlert {
  type: StalenessAlertType
  severity: 'low' | 'medium' | 'high'
  description: string
  diversificationSuggestion: string
}

export interface PatternHealthScore {
  overall: number            // [0, 1]，0 = 严重僵化，1 = 健康多样
  reflexDiversity: number    // Reflex 执行多样性
  templateDiversity: number  // 模板使用多样性
  carapaceFreshness: number  // carapace.md 更新新鲜度
  lastUpdated: string        // 最近一次更新时间
}

const DAYS_30 = 30 * 24 * 60 * 60 * 1000
const CARAPACE_STALE_DAYS = parseInt(process.env['CLAWBUDS_CARAPACE_STALE_DAYS'] ?? '60', 10)
const EMOJI_MONOTONY_THRESHOLD = parseFloat(
  process.env['CLAWBUDS_MONOTONY_THRESHOLD'] ?? '0.90',
)

export class PatternStalenessDetector {
  constructor(
    private executionRepo: IReflexExecutionRepository,
    private historyRepo: ICarapaceHistoryRepository,
  ) {}

  /**
   * 执行全量僵化检测，返回所有告警
   */
  async detect(clawId: string): Promise<StalenessAlert[]> {
    const [reflexAlert, emojiAlert, staleAlert, groomAlert] = await Promise.all([
      this.detectReflexRepetition(clawId),
      this.detectEmojiMonotony(clawId),
      this.detectCarapaceStaleness(clawId),
      this.detectGroomPhraseRepetition(clawId),
    ])

    return [reflexAlert, emojiAlert, staleAlert, groomAlert].filter(
      (alert): alert is StalenessAlert => alert !== null,
    )
  }

  /**
   * 计算模式健康分
   * 综合 Reflex 多样性 + 模板多样性 + carapace 更新新鲜度
   */
  async computeHealthScore(clawId: string): Promise<PatternHealthScore> {
    const [reflexDiversity, templateDiversity, carapaceFreshness, lastUpdated] =
      await Promise.all([
        this.computeReflexDiversity(clawId),
        this.computeTemplateDiversity(clawId),
        this.computeCarapaceFreshness(clawId),
        this.getLastCarapaceUpdateTime(clawId),
      ])

    const overall = (reflexDiversity + templateDiversity + carapaceFreshness) / 3

    return {
      overall: Math.max(0, Math.min(1, overall)),
      reflexDiversity,
      templateDiversity,
      carapaceFreshness,
      lastUpdated,
    }
  }

  /**
   * 触发多样化策略（检测到僵化后触发）
   */
  async triggerDiversification(clawId: string, alert: StalenessAlert): Promise<void> {
    switch (alert.type) {
      case 'emoji_monotony':
        // 将 emoji 轮换建议记录到日志（实际配置需要通过 reflex update 命令）
        // Phase 10 实现：记录建议，不自动修改 reflex 配置（需人工确认）
        break

      case 'carapace_stale':
        // carapace 长期未更新：不自动修改，只在简报中提醒用户主动审视
        break

      case 'reflex_repetition':
        // 记录重复模式，待 Micro-Molt 建议系统汇总
        break

      case 'groom_phrase_repetition':
        // 梳理用语重复：不自动修改，需人工介入
        break
    }
  }

  // ─── 私有检测方法 ────────────────────────────────────────────────────────

  private async detectReflexRepetition(clawId: string): Promise<StalenessAlert | null> {
    const since = new Date(Date.now() - DAYS_30).toISOString()
    const executions = await this.executionRepo.findByResult(clawId, 'executed', since, 500)
    if (executions.length < 10) return null

    // 统计各 reflex 的执行频率
    const reflexCounts = new Map<string, number>()
    for (const exec of executions) {
      reflexCounts.set(exec.reflexId, (reflexCounts.get(exec.reflexId) ?? 0) + 1)
    }

    // 如果某个 reflex 占总执行次数的 > 80%，则认为存在重复
    const dominantCount = Math.max(...reflexCounts.values())
    const dominantRate = dominantCount / executions.length

    if (dominantRate > 0.8) {
      const dominantReflex = [...reflexCounts.entries()].find(
        ([, count]) => count === dominantCount,
      )?.[0]
      return {
        type: 'reflex_repetition',
        severity: 'medium',
        description: `Reflex "${dominantReflex}" 在过去 30 天占 ${Math.round(dominantRate * 100)}% 的执行次数`,
        diversificationSuggestion: `建议检查 ${dominantReflex} 的触发条件是否过于宽泛`,
      }
    }
    return null
  }

  private async detectEmojiMonotony(clawId: string): Promise<StalenessAlert | null> {
    const since = new Date(Date.now() - DAYS_30).toISOString()
    const executions = await this.executionRepo.findByResult(clawId, 'executed', since, 500)

    // 筛选包含 emoji 的 phatic_micro_reaction 执行
    const emojiExecutions = executions.filter((exec) => {
      const details = exec.details as Record<string, unknown>
      return details?.['emoji'] !== undefined
    })

    if (emojiExecutions.length < 10) return null

    // 统计 emoji 分布
    const emojiCounts = new Map<string, number>()
    for (const exec of emojiExecutions) {
      const emoji = (exec.details as Record<string, unknown>)?.['emoji'] as string
      if (emoji) emojiCounts.set(emoji, (emojiCounts.get(emoji) ?? 0) + 1)
    }

    const total = emojiExecutions.length
    const maxEmojiCount = Math.max(...emojiCounts.values())
    const maxEmojiRate = maxEmojiCount / total

    if (maxEmojiRate >= EMOJI_MONOTONY_THRESHOLD) {
      const dominantEmoji = [...emojiCounts.entries()].find(
        ([, count]) => count === maxEmojiCount,
      )?.[0]
      return {
        type: 'emoji_monotony',
        severity: 'medium',
        description: `表情反应 ${dominantEmoji} 在过去 30 天占 ${Math.round(maxEmojiRate * 100)}%（单调）`,
        diversificationSuggestion: `建议开启表情轮换：clawbuds reflex update phatic_micro_reaction --enable-emoji-rotation`,
      }
    }
    return null
  }

  private async detectCarapaceStaleness(clawId: string): Promise<StalenessAlert | null> {
    const history = await this.historyRepo.findByOwner(clawId, { limit: 1 })
    if (history.length === 0) return null

    const lastUpdate = new Date(history[0].createdAt)
    const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (24 * 60 * 60 * 1000)

    if (daysSinceUpdate > CARAPACE_STALE_DAYS) {
      return {
        type: 'carapace_stale',
        severity: 'low',
        description: `carapace.md 已 ${Math.round(daysSinceUpdate)} 天未更新`,
        diversificationSuggestion: `建议检查并更新 carapace.md 的策略规则：clawbuds carapace history`,
      }
    }
    return null
  }

  private async detectGroomPhraseRepetition(clawId: string): Promise<StalenessAlert | null> {
    const since = new Date(Date.now() - DAYS_30).toISOString()
    const executions = await this.executionRepo.findByResult(clawId, 'executed', since, 200)

    // 筛选包含 groomPhrase 的执行
    const groomExecutions = executions.filter((exec) => {
      const details = exec.details as Record<string, unknown>
      return details?.['groomPhrase'] !== undefined
    })

    if (groomExecutions.length < 5) return null

    // 统计短语分布
    const phraseCounts = new Map<string, number>()
    for (const exec of groomExecutions) {
      const phrase = (exec.details as Record<string, unknown>)?.['groomPhrase'] as string
      if (phrase) phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1)
    }

    const total = groomExecutions.length
    const maxPhraseCount = Math.max(...phraseCounts.values())
    const maxPhraseRate = maxPhraseCount / total

    if (maxPhraseRate >= EMOJI_MONOTONY_THRESHOLD) {
      return {
        type: 'groom_phrase_repetition',
        severity: 'medium',
        description: `梳理消息用语重复率 ${Math.round(maxPhraseRate * 100)}%（过于单调）`,
        diversificationSuggestion: `建议扩展梳理消息模板库`,
      }
    }
    return null
  }

  // ─── 健康评分计算辅助方法 ────────────────────────────────────────────────

  private async computeReflexDiversity(clawId: string): Promise<number> {
    const since = new Date(Date.now() - DAYS_30).toISOString()
    const executions = await this.executionRepo.findByResult(clawId, 'executed', since, 500)
    if (executions.length === 0) return 1.0  // 无执行 = 无僵化

    const uniqueReflexes = new Set(executions.map((e) => e.reflexId)).size
    const totalReflexes = executions.length
    // 多样性 = unique / total（最高为 1，但超过 0.3 就算健康）
    return Math.min(1, uniqueReflexes / Math.max(1, totalReflexes * 0.3))
  }

  private async computeTemplateDiversity(clawId: string): Promise<number> {
    const since = new Date(Date.now() - DAYS_30).toISOString()
    const executions = await this.executionRepo.findByResult(clawId, 'executed', since, 200)

    const emojiExecutions = executions.filter((e) => {
      const details = e.details as Record<string, unknown>
      return details?.['emoji'] !== undefined
    })

    if (emojiExecutions.length < 5) return 1.0  // 数据不足 = 假设健康

    const emojiCounts = new Map<string, number>()
    for (const exec of emojiExecutions) {
      const emoji = (exec.details as Record<string, unknown>)?.['emoji'] as string
      if (emoji) emojiCounts.set(emoji, (emojiCounts.get(emoji) ?? 0) + 1)
    }

    const maxRate = Math.max(...emojiCounts.values()) / emojiExecutions.length
    // 最主导的 emoji 占比越低，多样性越高
    return Math.max(0, 1 - maxRate)
  }

  private async computeCarapaceFreshness(clawId: string): Promise<number> {
    const history = await this.historyRepo.findByOwner(clawId, { limit: 1 })
    if (history.length === 0) return 0.5  // 无历史 = 中等分

    const lastUpdate = new Date(history[0].createdAt)
    const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (24 * 60 * 60 * 1000)

    // 0 天 = 1.0，60 天 = 0.0，线性衰减
    return Math.max(0, 1 - daysSinceUpdate / CARAPACE_STALE_DAYS)
  }

  private async getLastCarapaceUpdateTime(clawId: string): Promise<string> {
    const history = await this.historyRepo.findByOwner(clawId, { limit: 1 })
    if (history.length === 0) return new Date(0).toISOString()
    return history[0].createdAt
  }
}
