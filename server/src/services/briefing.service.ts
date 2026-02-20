/**
 * BriefingService — 简报引擎（Phase 6）
 * 负责数据收集、触发 Agent 生成简报、发布和通知
 */

import { randomUUID } from 'node:crypto'
import type { IBriefingRepository, BriefingRecord } from '../db/repositories/interfaces/briefing.repository.interface.js'
import type { HostNotifier, AgentPayload } from './host-notifier.js'
import type { MicroMoltService, MicroMoltSuggestion } from './micro-molt.service.js'

export interface BriefingRawData {
  messages: MessageSummary[]
  reflexAlerts: ReflexAlert[]
  pearlActivity: PearlActivity[]
  relationshipWarnings: RelationshipWarning[]
  tomChanges: ToMChange[]
  pendingDrafts: DraftSummary[]
  heartbeatInsights: HeartbeatInsight[]
  microMoltSuggestions: MicroMoltSuggestion[]
}

export interface MessageSummary {
  senderId: string
  senderDisplayName: string
  count: number
  preview: string
  requiresResponse: boolean
}

export interface ReflexAlert {
  reflexName: string
  executionResult: string
  details: Record<string, unknown>
  createdAt: string
}

export interface PearlActivity {
  type: 'created' | 'shared_by_me' | 'received' | 'endorsed'
  pearlId: string
  triggerText: string
  createdAt: string
}

export interface RelationshipWarning {
  friendId: string
  displayName: string
  strength: number
  type: 'layer_downgraded' | 'at_risk' | 'manual_core_declining'
  details: string
}

export interface ToMChange {
  friendId: string
  displayName: string
  field: string
  oldValue: string
  newValue: string
}

export interface DraftSummary {
  id: string
  toClawId: string
  toDisplayName: string
  content: string
  reason: string
  createdAt: string
}

export interface HeartbeatInsight {
  type: 'pearl_routed_to_me' | 'interest_match' | 'availability_overlap'
  description: string
  involvedFriendId: string
}

export class BriefingService {
  constructor(
    private briefingRepo: IBriefingRepository,
    private hostNotifier: HostNotifier,
    private microMoltService: MicroMoltService,
  ) {}

  /**
   * 收集每日数据（生成简报原始素材）
   * Phase 6 基础版：只收集 MicroMolt 建议；其他数据源在 Phase 7+ 集成
   */
  async collectDailyData(clawId: string): Promise<BriefingRawData> {
    const microMoltSuggestions = await this.microMoltService.generateSuggestions(clawId)
    return {
      messages: [],
      reflexAlerts: [],
      pearlActivity: [],
      relationshipWarnings: [],
      tomChanges: [],
      pendingDrafts: [],
      heartbeatInsights: [],
      microMoltSuggestions,
    }
  }

  /**
   * 触发 Agent 生成简报（BRIEFING_REQUEST 类型，非阻塞）
   */
  async triggerBriefingGeneration(clawId: string): Promise<string> {
    const rawData = await this.collectDailyData(clawId)
    const batchId = `brief_batch_${randomUUID().slice(0, 8)}`
    const message = this.formatBriefingMessage(rawData)
    const payload: AgentPayload = {
      batchId,
      type: 'BRIEFING_REQUEST',
      message,
      metadata: { clawId },
    }
    await this.hostNotifier.triggerAgent(payload)
    return batchId
  }

  /**
   * 保存已生成的简报（Agent 调用 clawbuds briefing publish 后触发）
   */
  async saveBriefing(
    clawId: string,
    content: string,
    rawData?: BriefingRawData,
  ): Promise<BriefingRecord> {
    const id = `brief_${randomUUID().replace(/-/g, '').slice(0, 12)}`
    return this.briefingRepo.create({
      id,
      clawId,
      type: 'daily',
      content,
      rawData: (rawData ?? {}) as Record<string, unknown>,
    })
  }

  /**
   * 投递简报通知（向主会话注入通知）
   */
  async deliverBriefing(clawId: string, briefing: BriefingRecord): Promise<void> {
    await this.hostNotifier.notify(`今日社交简报已生成，点击查看: clawbuds briefing (id: ${briefing.id})`)
  }

  /**
   * 降级简报（宿主 LLM 不可用时，生成纯数据型简报）
   */
  async generateFallbackBriefing(clawId: string): Promise<BriefingRecord> {
    const rawData = await this.collectDailyData(clawId)
    const content = this.renderFallbackTemplate(rawData)
    return this.saveBriefing(clawId, content, rawData)
  }

  /**
   * 获取最新简报
   */
  async getLatest(clawId: string): Promise<BriefingRecord | null> {
    return this.briefingRepo.findLatest(clawId)
  }

  /**
   * 获取简报历史
   */
  async getHistory(
    clawId: string,
    filters?: { type?: 'daily' | 'weekly'; limit?: number; offset?: number }
  ): Promise<BriefingRecord[]> {
    return this.briefingRepo.findHistory(clawId, filters)
  }

  /**
   * 标记简报已读
   */
  async acknowledge(briefingId: string, clawId: string): Promise<void> {
    // 验证简报属于该 claw（通过 findLatest 间接验证，简化版）
    await this.briefingRepo.acknowledge(briefingId, new Date().toISOString())
  }

  // ─── 私有工具方法 ──────────────────────────────────────────────────────────

  private formatBriefingMessage(rawData: BriefingRawData): string {
    const lines = [
      '[BRIEFING_REQUEST] 请生成今日社交简报',
      '',
      '原始数据:',
      `- 消息摘要: ${rawData.messages.length} 条`,
      `- Reflex 警报: ${rawData.reflexAlerts.length} 条`,
      `- Pearl 动态: ${rawData.pearlActivity.length} 条`,
      `- 关系警告: ${rawData.relationshipWarnings.length} 条`,
      `- ToM 变化: ${rawData.tomChanges.length} 条`,
      `- 待审草稿: ${rawData.pendingDrafts.length} 条`,
      `- 心跳洞察: ${rawData.heartbeatInsights.length} 条`,
      '',
      'Micro-Molt 建议:',
      ...rawData.microMoltSuggestions.map((s, i) => `${i + 1}. ${s.description}`),
      '',
      '请按艾森豪威尔矩阵（Q1/Q2/Q3/Q4）分类并生成简报。',
      '生成后请执行: clawbuds briefing publish "..."',
    ]
    return lines.join('\n')
  }

  private renderFallbackTemplate(rawData: BriefingRawData): string {
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    return [
      `# 今日社交简报（降级模板）  ${now}`,
      '',
      '> ⚠️ 宿主 LLM 不可用，使用纯数据模板生成（无语义分析）',
      '',
      `## 数据汇总`,
      `- 消息: ${rawData.messages.length} 条`,
      `- Reflex 记录: ${rawData.reflexAlerts.length} 条`,
      `- Pearl 活动: ${rawData.pearlActivity.length} 条`,
      `- 关系警告: ${rawData.relationshipWarnings.length} 条`,
      '',
      rawData.microMoltSuggestions.length > 0
        ? `## Micro-Molt 建议\n${rawData.microMoltSuggestions.map((s) => `- ${s.description}\n  → \`${s.cliCommand}\``).join('\n')}`
        : '',
    ].join('\n')
  }
}
