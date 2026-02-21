/**
 * PatternStalenessDetector — 模式僵化检测（Phase 10）
 * 检测 Reflex 执行的重复模式 + 模板回复的单调性，触发多样化策略
 */

import type { IReflexExecutionRepository, ReflexExecutionRecord } from '../db/repositories/interfaces/reflex.repository.interface.js'
import type { ICarapaceHistoryRepository, CarapaceHistoryRecord } from '../db/repositories/interfaces/carapace-history.repository.interface.js'

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
// MEDIUM-6: 梳理用语重复使用独立阈值（默认 0.85，比 emoji 略低）
const GROOM_REPETITION_THRESHOLD = parseFloat(
  process.env['CLAWBUDS_GROOM_REPETITION_THRESHOLD'] ?? '0.85',
)

/** MEDIUM-1: 内部共享执行数据缓存，避免同一请求内重复 DB 查询 */
interface ExecutionDataCache {
  executions500: ReflexExecutionRecord[]
  historyTop1: CarapaceHistoryRecord[]
}

export class PatternStalenessDetector {
  constructor(
    private executionRepo: IReflexExecutionRepository,
    private historyRepo: ICarapaceHistoryRepository,
  ) {}

  /**
   * 执行全量僵化检测，返回所有告警
   * MEDIUM-1: 一次性获取执行数据，传给各子检测方法
   */
  async detect(clawId: string): Promise<StalenessAlert[]> {
    const cache = await this.fetchData(clawId)

    const [reflexAlert, emojiAlert, staleAlert, groomAlert] = await Promise.all([
      this.detectReflexRepetition(cache.executions500),
      this.detectEmojiMonotony(cache.executions500),
      this.detectCarapaceStaleness(cache.historyTop1),
      this.detectGroomPhraseRepetition(cache.executions500),
    ])

    return [reflexAlert, emojiAlert, staleAlert, groomAlert].filter(
      (alert): alert is StalenessAlert => alert !== null,
    )
  }

  /**
   * 计算模式健康分
   * 综合 Reflex 多样性 + 模板多样性 + carapace 更新新鲜度
   * MEDIUM-1: 一次性获取执行数据，传给各子计算方法
   */
  async computeHealthScore(clawId: string): Promise<PatternHealthScore> {
    const cache = await this.fetchData(clawId)

    const reflexDiversity = this.computeReflexDiversitySync(cache.executions500)
    const templateDiversity = this.computeTemplateDiversitySync(cache.executions500)
    const carapaceFreshness = this.computeCarapaceFreshnessSync(cache.historyTop1)
    const lastUpdated = cache.historyTop1.length > 0
      ? cache.historyTop1[0].createdAt
      : new Date(0).toISOString()

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
   * MEDIUM-2: 记录结构化日志，明确说明当前为"建议型"触发（不自动修改配置）
   */
  async triggerDiversification(clawId: string, alert: StalenessAlert): Promise<void> {
    const prefix = `[PatternStaleness clawId=${clawId}]`
    switch (alert.type) {
      case 'emoji_monotony':
        // Phase 10 设计决策：不自动修改 reflex 配置，需人工通过 micromolt apply 确认
        // 建议命令：clawbuds reflex update phatic_micro_reaction --enable-emoji-rotation
        process.env['NODE_ENV'] !== 'test' &&
          process.stdout.write(`${prefix} emoji_monotony: ${alert.diversificationSuggestion}\n`)
        break

      case 'carapace_stale':
        // Phase 10 设计决策：不自动修改 carapace.md，仅在简报中提醒用户
        // 建议命令：clawbuds carapace history
        process.env['NODE_ENV'] !== 'test' &&
          process.stdout.write(`${prefix} carapace_stale: ${alert.diversificationSuggestion}\n`)
        break

      case 'reflex_repetition':
        // 记录重复模式，待 Micro-Molt 建议系统（维度 2）自动汇总
        process.env['NODE_ENV'] !== 'test' &&
          process.stdout.write(`${prefix} reflex_repetition: ${alert.description}\n`)
        break

      case 'groom_phrase_repetition':
        // Phase 10 设计决策：不自动修改模板库，需人工介入扩展
        process.env['NODE_ENV'] !== 'test' &&
          process.stdout.write(`${prefix} groom_phrase_repetition: ${alert.diversificationSuggestion}\n`)
        break
    }
  }

  // ─── 私有：共享数据获取（MEDIUM-1 核心修复）──────────────────────────────

  private async fetchData(clawId: string): Promise<ExecutionDataCache> {
    const since = new Date(Date.now() - DAYS_30).toISOString()
    const [executions500, historyTop1] = await Promise.all([
      this.executionRepo.findByResult(clawId, 'executed', since, 500),
      this.historyRepo.findByOwner(clawId, { limit: 1 }),
    ])
    return { executions500, historyTop1 }
  }

  // ─── 私有检测方法（接受已获取的数据）────────────────────────────────────

  private detectReflexRepetition(executions: ReflexExecutionRecord[]): StalenessAlert | null {
    if (executions.length < 10) return null

    const reflexCounts = new Map<string, number>()
    for (const exec of executions) {
      reflexCounts.set(exec.reflexId, (reflexCounts.get(exec.reflexId) ?? 0) + 1)
    }

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

  private detectEmojiMonotony(executions: ReflexExecutionRecord[]): StalenessAlert | null {
    const emojiExecutions = executions.filter((exec) => {
      const details = exec.details as Record<string, unknown>
      return details?.['emoji'] !== undefined
    })

    if (emojiExecutions.length < 10) return null

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

  private detectCarapaceStaleness(historyTop1: CarapaceHistoryRecord[]): StalenessAlert | null {
    if (historyTop1.length === 0) return null

    const lastUpdate = new Date(historyTop1[0].createdAt)
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

  private detectGroomPhraseRepetition(executions: ReflexExecutionRecord[]): StalenessAlert | null {
    const groomExecutions = executions.filter((exec) => {
      const details = exec.details as Record<string, unknown>
      return details?.['groomPhrase'] !== undefined
    })

    if (groomExecutions.length < 5) return null

    const phraseCounts = new Map<string, number>()
    for (const exec of groomExecutions) {
      const phrase = (exec.details as Record<string, unknown>)?.['groomPhrase'] as string
      if (phrase) phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1)
    }

    const total = groomExecutions.length
    const maxPhraseCount = Math.max(...phraseCounts.values())
    const maxPhraseRate = maxPhraseCount / total

    // MEDIUM-6: 使用独立阈值 GROOM_REPETITION_THRESHOLD，而非 emoji 阈值
    if (maxPhraseRate >= GROOM_REPETITION_THRESHOLD) {
      return {
        type: 'groom_phrase_repetition',
        severity: 'medium',
        description: `梳理消息用语重复率 ${Math.round(maxPhraseRate * 100)}%（过于单调）`,
        diversificationSuggestion: `建议扩展梳理消息模板库`,
      }
    }
    return null
  }

  // ─── 健康评分计算辅助（同步，接受已获取数据）────────────────────────────

  private computeReflexDiversitySync(executions: ReflexExecutionRecord[]): number {
    if (executions.length === 0) return 1.0

    const uniqueReflexes = new Set(executions.map((e) => e.reflexId)).size
    const totalReflexes = executions.length
    return Math.min(1, uniqueReflexes / Math.max(1, totalReflexes * 0.3))
  }

  private computeTemplateDiversitySync(executions: ReflexExecutionRecord[]): number {
    const emojiExecutions = executions.filter((e) => {
      const details = e.details as Record<string, unknown>
      return details?.['emoji'] !== undefined
    })

    if (emojiExecutions.length < 5) return 1.0

    const emojiCounts = new Map<string, number>()
    for (const exec of emojiExecutions) {
      const emoji = (exec.details as Record<string, unknown>)?.['emoji'] as string
      if (emoji) emojiCounts.set(emoji, (emojiCounts.get(emoji) ?? 0) + 1)
    }

    const maxRate = Math.max(...emojiCounts.values()) / emojiExecutions.length
    return Math.max(0, 1 - maxRate)
  }

  private computeCarapaceFreshnessSync(historyTop1: CarapaceHistoryRecord[]): number {
    if (historyTop1.length === 0) return 0.5

    const lastUpdate = new Date(historyTop1[0].createdAt)
    const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (24 * 60 * 60 * 1000)
    return Math.max(0, 1 - daysSinceUpdate / CARAPACE_STALE_DAYS)
  }
}
