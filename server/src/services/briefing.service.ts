/**
 * BriefingService — 简报引擎（Phase 6）
 * 负责数据收集、触发 Agent 生成简报、发布和通知
 */

import { randomUUID } from 'node:crypto'
import type { IBriefingRepository, BriefingRecord } from '../db/repositories/interfaces/briefing.repository.interface.js'
import type { HostNotifier, AgentPayload } from './host-notifier.js'
import type { MicroMoltService, MicroMoltSuggestion } from './micro-molt.service.js'
import type { IThreadRepository, ThreadPurpose } from '../db/repositories/interfaces/thread.repository.interface.js'
import type { IThreadContributionRepository } from '../db/repositories/interfaces/thread.repository.interface.js'
import type { PatternStalenessDetector, StalenessAlert, PatternHealthScore } from './pattern-staleness-detector.js'
import type { ICarapaceHistoryRepository, CarapaceHistoryRecord } from '../db/repositories/interfaces/carapace-history.repository.interface.js'

// Phase 8: Thread 更新摘要（用于简报）
export interface ThreadUpdate {
  threadId: string
  title: string
  purpose: ThreadPurpose
  newContributions: number    // 过去 24 小时新增贡献数
  lastContributorId: string
  hasDigestPending: boolean   // 是否有 AI 摘要待生成
}

/** Phase 9: Pearl 路由活跃度统计 */
export interface PearlRoutingStats {
  routedByMe: number       // 今天主动路由给好友的 Pearl 数
  routedToMe: number       // 今天收到自动路由的 Pearl 数
  citationsCount: number   // 今天 Pearl 被 Thread 引用次数
}

export interface BriefingRawData {
  messages: MessageSummary[]
  reflexAlerts: ReflexAlert[]
  pearlActivity: PearlActivity[]
  relationshipWarnings: RelationshipWarning[]
  tomChanges: ToMChange[]
  pendingDrafts: DraftSummary[]
  heartbeatInsights: HeartbeatInsight[]
  microMoltSuggestions: MicroMoltSuggestion[]
  threadUpdates: ThreadUpdate[]              // Phase 8: Thread 活动汇总
  routingStats: PearlRoutingStats            // Phase 9: Pearl 路由活跃度
  // Phase 10: 周报专有字段（日报时为 undefined）
  patternHealth?: PatternHealthScore         // 模式健康评分
  carapaceHistory?: CarapaceHistoryRecord[]  // carapace.md 演化历史
  stalenessAlerts?: StalenessAlert[]         // 模式僵化告警
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
  private stalenessDetector?: PatternStalenessDetector    // Phase 10: 可选
  private carapaceHistoryRepo?: ICarapaceHistoryRepository  // Phase 10: 可选

  constructor(
    private briefingRepo: IBriefingRepository,
    private hostNotifier: HostNotifier,
    private microMoltService: MicroMoltService,
    private threadRepo?: IThreadRepository,               // Phase 8: 可选，Thread 更新
    private threadContribRepo?: IThreadContributionRepository,  // Phase 8: 可选
  ) {}

  /**
   * 延迟注入 Thread Repositories（Phase 8，避免循环依赖）
   */
  injectThreadRepos(
    threadRepo: IThreadRepository,
    threadContribRepo: IThreadContributionRepository,
  ): void {
    this.threadRepo = threadRepo
    this.threadContribRepo = threadContribRepo
  }

  /**
   * 延迟注入 Phase 10 服务（模式健康 + 历史记录 + 完整 MicroMoltService）
   * HIGH-2: microMoltService 参数用完整版替换构造函数注入的基础版
   */
  injectPhase10Services(
    stalenessDetector: PatternStalenessDetector,
    carapaceHistoryRepo: ICarapaceHistoryRepository,
    microMoltService?: MicroMoltService,
  ): void {
    this.stalenessDetector = stalenessDetector
    this.carapaceHistoryRepo = carapaceHistoryRepo
    if (microMoltService) {
      this.microMoltService = microMoltService
    }
  }

  /**
   * 收集周报数据（Phase 10：在日报基础上增加模式健康 + carapace 演化历史）
   */
  async collectWeeklyData(clawId: string): Promise<BriefingRawData> {
    const dailyData = await this.collectDailyData(clawId)

    if (!this.stalenessDetector || !this.carapaceHistoryRepo) {
      return dailyData
    }

    const [patternHealth, carapaceHistory, stalenessAlerts] = await Promise.all([
      this.stalenessDetector.computeHealthScore(clawId),
      this.carapaceHistoryRepo.findByOwner(clawId, { limit: 5 }),
      this.stalenessDetector.detect(clawId),
    ])

    // 完整版 microMoltSuggestions 覆盖日报中的简化版
    const microMoltSuggestions = await this.microMoltService.generateSuggestions(clawId)

    return {
      ...dailyData,
      patternHealth,
      carapaceHistory,
      stalenessAlerts,
      microMoltSuggestions,
    }
  }

  /**
   * 触发每周简报生成（Phase 10，每周日 20:00 由 Cron 调用）
   */
  async triggerWeeklyBriefing(clawId: string): Promise<string> {
    const rawData = await this.collectWeeklyData(clawId)
    const id = `brief_${randomUUID().replace(/-/g, '').slice(0, 12)}`
    await this.briefingRepo.create({
      id,
      clawId,
      type: 'weekly',
      content: this.renderWeeklyFallbackTemplate(rawData),
      rawData: rawData as unknown as Record<string, unknown>,
    })
    return id
  }

  /**
   * 收集每日数据（生成简报原始素材）
   * Phase 6 基础版：只收集 MicroMolt 建议；其他数据源在 Phase 7+ 集成
   * Phase 8 新增：Thread 更新汇总
   */
  async collectDailyData(clawId: string): Promise<BriefingRawData> {
    const microMoltSuggestions = await this.microMoltService.generateSuggestions(clawId)
    const threadUpdates = await this.collectThreadUpdates(clawId)
    return {
      messages: [],
      reflexAlerts: [],
      pearlActivity: [],
      relationshipWarnings: [],
      tomChanges: [],
      pendingDrafts: [],
      heartbeatInsights: [],
      microMoltSuggestions,
      threadUpdates,
      routingStats: { routedByMe: 0, routedToMe: 0, citationsCount: 0 },  // Phase 9: 占位，T20 注入 repos 后填充
    }
  }

  /**
   * 收集 Thread 更新数据（Phase 8）
   * 返回过去 24 小时有新贡献的 Thread 摘要
   */
  async collectThreadUpdates(clawId: string): Promise<ThreadUpdate[]> {
    if (!this.threadRepo || !this.threadContribRepo) return []

    const threads = await this.threadRepo.findByParticipant(clawId, {
      status: 'active',
      limit: 50,
    })

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const updates: ThreadUpdate[] = []

    for (const thread of threads) {
      const recentContribs = await this.threadContribRepo.findByThread(thread.id, {
        since: since24h,
        limit: 100,
      })

      if (recentContribs.length === 0) continue

      const lastContrib = recentContribs[recentContribs.length - 1]
      updates.push({
        threadId: thread.id,
        title: thread.title,
        purpose: thread.purpose,
        newContributions: recentContribs.length,
        lastContributorId: lastContrib.contributorId,
        hasDigestPending: false,  // 简化：暂不追踪摘要状态
      })
    }

    return updates
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

  private renderWeeklyFallbackTemplate(rawData: BriefingRawData): string {
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    const health = rawData.patternHealth
    const healthBar = health
      ? `整体健康: ${Math.round(health.overall * 100)}% (Reflex: ${Math.round(health.reflexDiversity * 100)}% / 模板: ${Math.round(health.templateDiversity * 100)}% / 策略: ${Math.round(health.carapaceFreshness * 100)}%)`
      : '（模式健康数据不可用）'
    const alertsText = rawData.stalenessAlerts?.length
      ? rawData.stalenessAlerts.map((a) => `⚠️ [${a.severity}] ${a.description}`).join('\n')
      : '✓ 未检测到严重僵化'
    const historyText = rawData.carapaceHistory?.length
      ? rawData.carapaceHistory.map((h) => `${h.createdAt.slice(0, 10)}  [${h.changeReason}] 版本 ${h.version}`).join('\n')
      : '（无修改历史）'
    return [
      `# 本周模式健康报告  ${now}`,
      '',
      `## 模式健康评分`,
      healthBar,
      '',
      `## 僵化检测`,
      alertsText,
      '',
      `## carapace.md 演化历史（最近 5 次）`,
      historyText,
      '',
      rawData.microMoltSuggestions.length > 0
        ? `## Micro-Molt 建议（${rawData.microMoltSuggestions.length} 条）\n${rawData.microMoltSuggestions.map((s) => `- ${s.description}\n  → \`${s.cliCommand}\``).join('\n')}`
        : '',
    ].join('\n')
  }
}
