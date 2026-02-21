/**
 * MicroMoltService — Carapace 调整建议生成（Phase 6 + Phase 10）
 * Phase 6: 维度 2（Reflex 拒绝模式）、维度 3（简报阅读时间）
 * Phase 10: 维度 1（草稿审批率）、维度 4（Pearl 路由效果）、维度 5（梳理消息效果）、维度 6（Dunbar 层级策略）
 */

import type { IReflexExecutionRepository } from '../db/repositories/interfaces/reflex.repository.interface.js'
import type { IBriefingRepository } from '../db/repositories/interfaces/briefing.repository.interface.js'
import type { PearlService } from './pearl.service.js'
import type { RelationshipService } from './relationship.service.js'
import type { CarapaceEditor } from './carapace-editor.js'

export interface MicroMoltSuggestion {
  type: 'allow' | 'escalate' | 'timing' | 'disable'
  description: string       // 自然语言建议
  cliCommand: string        // 实现该建议的 CLI 命令
  confidence: number        // Agent 对建议的置信度 [0, 1]
  // allow 类型专用字段
  friendId?: string         // 好友 ID（allow 时使用）
  scope?: string            // 授权范围描述（allow 时使用）
  // escalate 类型专用字段
  condition?: string        // 触发升级的条件描述（escalate 时使用）
  action?: string           // 升级后的处理方式（escalate 时使用）
}

const MAX_SUGGESTIONS = parseInt(process.env['CLAWBUDS_MICROMOLT_MAX'] ?? '3', 10)
const DAYS_7 = 7 * 24 * 60 * 60 * 1000
const DAYS_30 = 30 * 24 * 60 * 60 * 1000
const CORE_LAYER_THRESHOLD = 5   // core 层好友数 ≥ 5 时触发建议
const CASUAL_LAYER_THRESHOLD = 100  // casual 层好友数 > 100 时触发建议
const PEARL_ENDORSEMENT_THRESHOLD = 0.7  // Pearl 背书率 ≥ 70% 时触发建议
const PEARL_MIN_SAMPLE = 3         // Pearl 路由最小样本量

export class MicroMoltService {
  constructor(
    private executionRepo: IReflexExecutionRepository,
    private briefingRepo: IBriefingRepository,
    private pearlService?: PearlService,            // Phase 10 新增（可选，向后兼容）
    private relationshipService?: RelationshipService,  // Phase 10 新增（可选）
    private carapaceEditor?: CarapaceEditor,            // Phase 10 新增（可选）
  ) {}

  /**
   * 生成 carapace.md 调整建议（汇总所有分析维度，最多 MAX_SUGGESTIONS 条）
   */
  async generateSuggestions(clawId: string): Promise<MicroMoltSuggestion[]> {
    const [rejection, reading, pearlRouting, grooming, dunbar] = await Promise.all([
      this.analyzeRejectionPatterns(clawId),
      this.analyzeReadingPatterns(clawId),
      this.analyzePearlRoutingEffectiveness(clawId),
      this.analyzeGroomingEffectiveness(clawId),
      this.analyzeDunbarLayerStrategy(clawId),
    ])
    const all = [...rejection, ...reading, ...pearlRouting, ...grooming, ...dunbar]
    // 按置信度降序，最多返回 MAX_SUGGESTIONS 条
    return all
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_SUGGESTIONS)
  }

  /**
   * 确认并应用 Micro-Molt 建议（Phase 10）
   * 调用 CarapaceEditor 执行实际的 carapace.md 修改
   */
  async applySuggestion(clawId: string, suggestion: MicroMoltSuggestion): Promise<void> {
    if (!this.carapaceEditor) {
      throw new Error('CarapaceEditor 未注入，无法应用建议。请在 app.ts 中初始化后注入。')
    }
    await this.carapaceEditor.applyMicroMolt(suggestion)
  }

  // ─── 维度 2: Reflex 拒绝模式（Phase 6 已有）──────────────────────────────

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
      if (total < 5) continue
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

  // ─── 维度 3: 简报阅读时间（Phase 6 已有）────────────────────────────────

  /**
   * 分析简报阅读时间模式
   * 用户总在固定时间标记已读 → 建议调整生成时间
   */
  private async analyzeReadingPatterns(clawId: string): Promise<MicroMoltSuggestion[]> {
    const history = await this.briefingRepo.findHistory(clawId, { limit: 14, type: 'daily' })
    const acked = history.filter((b) => b.acknowledgedAt != null)
    if (acked.length < 5) return []

    const hourCounts = new Map<number, number>()
    for (const b of acked) {
      const hour = new Date(b.acknowledgedAt!).getHours()
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1)
    }

    let maxHour = -1
    let maxCount = 0
    for (const [hour, count] of hourCounts.entries()) {
      if (count > maxCount) {
        maxCount = count
        maxHour = hour
      }
    }

    if (maxHour < 0 || maxCount < 3) return []

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

  // ─── 维度 4: Pearl 路由效果（Phase 10 新增）─────────────────────────────

  /**
   * 分析 Pearl 路由效果
   * 背书率 ≥ 70% 且样本量 ≥ 3 → 建议扩大 share_conditions
   * 背书率 < 20% 且样本量 ≥ 3 → 建议提高 trustThreshold
   */
  private async analyzePearlRoutingEffectiveness(clawId: string): Promise<MicroMoltSuggestion[]> {
    if (!this.pearlService) return []

    const pearls = await this.pearlService.findByOwner(clawId)
    if (pearls.length < PEARL_MIN_SAMPLE) return []

    const totalPearls = pearls.length
    // 用 luster > 0.6 作为"被背书"的代理指标（Phase 10 简化实现，完整实现需 endorsement repo）
    const endorsedPearls = pearls.filter((p) => p.luster > 0.6).length

    if (totalPearls < PEARL_MIN_SAMPLE) return []

    const endorsementRate = endorsedPearls / totalPearls

    if (endorsementRate >= PEARL_ENDORSEMENT_THRESHOLD) {
      return [{
        type: 'allow',
        description: `你分享的 Pearl 有 ${Math.round(endorsementRate * 100)}% 被背书（共 ${totalPearls} 个），路由效果良好`,
        cliCommand: `clawbuds pearl routing --expand-threshold`,
        confidence: Math.min(0.85, endorsementRate),
        scope: 'Pearl 自动路由',
      }]
    }

    if (endorsementRate < 0.2) {
      return [{
        type: 'escalate',
        description: `你分享的 Pearl 仅有 ${Math.round(endorsementRate * 100)}% 被背书（共 ${totalPearls} 个），路由效果较差`,
        cliCommand: `clawbuds pearl routing --raise-threshold`,
        confidence: Math.min(0.8, 1 - endorsementRate),
        condition: 'Pearl 被忽略率过高',
        action: '提高 trustThreshold 或暂停自动路由',
      }]
    }

    return []
  }

  // ─── 维度 5: 梳理消息效果（Phase 10 新增）──────────────────────────────

  /**
   * 分析梳理消息效果
   * 过去 30 天对某好友无回复 → 建议降低梳理频率
   */
  private async analyzeGroomingEffectiveness(clawId: string): Promise<MicroMoltSuggestion[]> {
    const since = new Date(Date.now() - DAYS_30).toISOString()
    const groomExecutions = await this.executionRepo.findByResult(clawId, 'executed', since, 500)

    // 筛选梳理相关的 reflex（通过 details.friendId 分组统计回复率）
    const friendGroomStats = new Map<string, { sent: number; replied: number }>()
    for (const exec of groomExecutions) {
      const details = exec.details as Record<string, unknown>
      const friendId = details?.['friendId'] as string | undefined
      if (!friendId) continue

      const existing = friendGroomStats.get(friendId) ?? { sent: 0, replied: 0 }
      existing.sent++
      if (Number(details?.['replyCount'] ?? 0) > 0) existing.replied++
      friendGroomStats.set(friendId, existing)
    }

    const suggestions: MicroMoltSuggestion[] = []
    for (const [friendId, stats] of friendGroomStats.entries()) {
      if (stats.sent < 5) continue  // 样本量不足

      const replyRate = stats.replied / stats.sent

      if (replyRate === 0) {
        suggestions.push({
          type: 'escalate',
          description: `对好友 ${friendId} 的梳理消息在过去 30 天无一回复（共发送 ${stats.sent} 条）`,
          cliCommand: `clawbuds carapace escalate --when "向 ${friendId} 发梳理消息" --action "降低频率"`,
          confidence: 0.75,
          friendId,
          condition: `向 ${friendId} 发梳理消息`,
          action: '降低梳理频率或换一种互动方式',
        })
      } else if (replyRate >= 0.6) {
        suggestions.push({
          type: 'allow',
          description: `对好友 ${friendId} 的梳理消息有 ${Math.round(replyRate * 100)}% 回复率，建议扩大授权范围`,
          cliCommand: `clawbuds carapace allow --friend ${friendId} --scope "梳理消息"`,
          confidence: Math.min(0.85, replyRate),
          friendId,
          scope: '梳理消息',
        })
      }
    }

    return suggestions
  }

  // ─── 维度 6: Dunbar 层级对应策略（Phase 10 新增）────────────────────────

  /**
   * 分析 Dunbar 层级策略覆盖
   * core ≥ 5 个且无专属策略 → 建议添加 core 层策略
   * casual > 100 个且无批量策略 → 建议添加 casual 层策略
   */
  private async analyzeDunbarLayerStrategy(clawId: string): Promise<MicroMoltSuggestion[]> {
    if (!this.relationshipService) return []

    const friendsByLayer = await this.relationshipService.getFriendsByLayer(clawId)
    const suggestions: MicroMoltSuggestion[] = []

    const coreCount = friendsByLayer.core?.length ?? 0
    if (coreCount >= CORE_LAYER_THRESHOLD) {
      suggestions.push({
        type: 'allow',
        description: `你有 ${coreCount} 个 core 层好友，建议为他们设置更积极的梳理策略`,
        cliCommand: `clawbuds carapace allow --layer core --scope "更积极的梳理"`,
        confidence: 0.7,
        scope: 'core 层好友的梳理策略',
      })
    }

    const casualCount = friendsByLayer.casual?.length ?? 0
    if (casualCount > CASUAL_LAYER_THRESHOLD) {
      suggestions.push({
        type: 'allow',
        description: `你有 ${casualCount} 个 casual 层好友，建议添加轻量自动维护策略`,
        cliCommand: `clawbuds carapace allow --layer casual --scope "轻量自动维护"`,
        confidence: 0.65,
        scope: 'casual 层轻量自动维护',
      })
    }

    return suggestions
  }
}
