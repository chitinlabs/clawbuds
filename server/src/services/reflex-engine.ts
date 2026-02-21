/**
 * ReflexEngine (Phase 4)
 * EventBus 的全局智能订阅者，实现 Layer 0 纯算法 Reflex
 */

import { randomUUID } from 'node:crypto'
import type {
  IReflexRepository,
  IReflexExecutionRepository,
  ReflexRecord,
  ExecutionResult,
} from '../db/repositories/interfaces/reflex.repository.interface.js'
import type { HeartbeatService } from './heartbeat.service.js'
import type { ReactionService } from './reaction.service.js'
import type { ClawService } from './claw.service.js'
import type { EventBus } from './event-bus.js'
import type { ReflexBatchProcessor, BatchQueueItem } from './reflex-batch-processor.js'
import type { PearlRoutingService } from './pearl-routing.service.js'

// ─── BusEvent: 统一的事件数据结构 ────────────────────────────────────────────
export interface BusEvent {
  type: string
  clawId: string
  [key: string]: unknown
}

// ─── Dunbar 层级顺序（用于判断升级/降级） ─────────────────────────────────────
const LAYER_ORDER: Record<string, number> = {
  casual: 0,
  active: 1,
  sympathy: 2,
  core: 3,
}

// ─── HardConstraints（Phase 4 硬编码默认值） ──────────────────────────────────
const HARD_CONSTRAINTS = {
  maxMessagesPerHour: 20,
}

// ─── Layer 0 匹配逻辑（纯函数，无副作用） ─────────────────────────────────────

/**
 * Layer 0 条件匹配（纯函数）
 * @returns true 表示该 Reflex 应当被触发
 */
export function matchLayer0(reflex: ReflexRecord, event: BusEvent): boolean {
  const cfg = reflex.triggerConfig
  const condType = cfg['type'] as string | undefined

  switch (condType) {
    case 'event_type': {
      if (event.type !== cfg['eventType']) return false
      // 可选 condition：'downgrade' 用于 relationship.layer_changed
      if (cfg['condition'] === 'downgrade') {
        const oldLayer = event['oldLayer'] as string | undefined
        const newLayer = event['newLayer'] as string | undefined
        if (!oldLayer || !newLayer) return false
        return (LAYER_ORDER[oldLayer] ?? -1) > (LAYER_ORDER[newLayer] ?? -1)
      }
      return true
    }

    case 'timer': {
      if (event.type !== 'timer.tick') return false
      const configInterval = cfg['intervalMs'] as number | undefined
      const eventInterval = event['intervalMs'] as number | undefined
      if (configInterval === undefined) return true  // 无约束，直接匹配
      return eventInterval === configInterval
    }

    case 'event_type_with_tag_intersection': {
      if (event.type !== cfg['eventType']) return false
      const minCommon = (cfg['minCommonTags'] as number) ?? 1
      const domainTags = (event['domainTags'] as string[]) ?? []
      const senderInterests = (event['senderInterests'] as string[]) ?? []
      const common = domainTags.filter((t) => senderInterests.includes(t))
      return common.length >= minCommon
    }

    case 'threshold': {
      const field = cfg['field'] as string
      const value = event[field] as number | undefined
      if (value === undefined) return false
      if ('lt' in cfg) return value < (cfg['lt'] as number)
      if ('lte' in cfg) return value <= (cfg['lte'] as number)
      if ('gt' in cfg) return value > (cfg['gt'] as number)
      if ('gte' in cfg) return value >= (cfg['gte'] as number)
      return false
    }

    case 'counter': {
      const field = cfg['field'] as string
      const count = event[field] as number | undefined
      if (count === undefined) return false
      if ('gte' in cfg) return count >= (cfg['gte'] as number)
      if ('gt' in cfg) return count > (cfg['gt'] as number)
      return false
    }

    case 'deadline': {
      if (event.type !== cfg['eventType']) return false
      const closesAt = event['closesAt'] as string | undefined
      if (!closesAt) return true  // event matched, no deadline field
      const withinMs = (cfg['withinMs'] as number) ?? 3600000
      const timeUntilClose = new Date(closesAt).getTime() - Date.now()
      return timeUntilClose > 0 && timeUntilClose <= withinMs
    }

    case 'any_reflex_execution': {
      // audit_behavior_log: matches any internal execution event
      return event.type === '__reflex_execution__'
    }

    default:
      return false
  }
}

// ─── 6 个内置 Reflex 定义 ─────────────────────────────────────────────────────
export const BUILTIN_REFLEXES: Array<Omit<ReflexRecord, 'id' | 'clawId' | 'createdAt' | 'updatedAt'>> = [
  {
    name: 'keepalive_heartbeat',
    valueLayer: 'infrastructure',
    behavior: 'keepalive',
    triggerLayer: 0,
    triggerConfig: { type: 'timer', intervalMs: 300000 },
    enabled: true,
    confidence: 1.0,
    source: 'builtin',
  },
  {
    name: 'phatic_micro_reaction',
    valueLayer: 'emotional',
    behavior: 'audit',
    triggerLayer: 0,
    triggerConfig: {
      type: 'event_type_with_tag_intersection',
      eventType: 'message.new',
      minCommonTags: 1,
    },
    enabled: true,
    confidence: 0.7,
    source: 'builtin',
  },
  {
    name: 'track_thread_progress',
    valueLayer: 'collaboration',
    behavior: 'track',
    triggerLayer: 0,
    triggerConfig: {
      type: 'counter',
      eventType: 'thread.contribution_added',
      field: 'contributionCount',
      gte: 5,
    },
    enabled: true,
    confidence: 1.0,
    source: 'builtin',
  },
  {
    name: 'collect_poll_responses',
    valueLayer: 'collaboration',
    behavior: 'collect',
    triggerLayer: 0,
    triggerConfig: {
      type: 'deadline',
      eventType: 'poll.closing_soon',
      withinMs: 3600000,
    },
    enabled: true,
    confidence: 1.0,
    source: 'builtin',
  },
  {
    name: 'relationship_decay_alert',
    valueLayer: 'infrastructure',
    behavior: 'alert',
    triggerLayer: 0,
    triggerConfig: {
      type: 'event_type',
      eventType: 'relationship.layer_changed',
      condition: 'downgrade',
    },
    enabled: true,
    confidence: 1.0,
    source: 'builtin',
  },
  {
    name: 'audit_behavior_log',
    valueLayer: 'infrastructure',
    behavior: 'audit',
    triggerLayer: 0,
    triggerConfig: { type: 'any_reflex_execution' },
    enabled: true,
    confidence: 1.0,
    source: 'builtin',
  },
]

// ─── ReflexEngine 主类 ────────────────────────────────────────────────────────

// 硬约束：每小时消息计数器（内存，重启后重置）
// key: `${clawId}:${hourBucket}` where hourBucket = Math.floor(now/3600000)
const messageCounters = new Map<string, number>()

function getHourBucket(): number {
  return Math.floor(Date.now() / 3_600_000)
}

function incrementMessageCount(clawId: string): void {
  const key = `${clawId}:${getHourBucket()}`
  messageCounters.set(key, (messageCounters.get(key) ?? 0) + 1)
}

function getMessageCount(clawId: string): number {
  const key = `${clawId}:${getHourBucket()}`
  return messageCounters.get(key) ?? 0
}

// Events to subscribe to
const SUBSCRIBED_EVENTS = [
  'message.new',
  'reaction.added',
  'heartbeat.received',
  'relationship.layer_changed',
  'friend.accepted',
  'pearl.created',
  'pearl.shared',
  'pearl.endorsed',
  'timer.tick',
  'poll.closing_soon',
  // Phase 8: Thread V5 协作话题工作区（激活 track_thread_progress Reflex）
  'thread.contribution_added',
] as const

// ─── 4 个 Layer 1 内置 Reflex 定义 ──────────────────────────────────────────
const LAYER1_BUILTIN_REFLEXES: Array<Omit<ReflexRecord, 'id' | 'clawId' | 'createdAt' | 'updatedAt'>> = [
  {
    name: 'sense_life_event',
    valueLayer: 'cognitive',
    behavior: 'sense',
    triggerLayer: 1,
    triggerConfig: { type: 'event_type', eventType: 'heartbeat.received' },
    enabled: true,
    confidence: 0.8,
    source: 'builtin',
  },
  {
    name: 'route_pearl_by_interest',
    valueLayer: 'cognitive',
    behavior: 'route',
    triggerLayer: 1,
    triggerConfig: { type: 'event_type', eventType: 'heartbeat.received', condition: 'has_routing_candidates_after_prefilter' },
    enabled: true,
    confidence: 0.8,
    source: 'builtin',
  },
  {
    name: 'crystallize_from_conversation',
    valueLayer: 'cognitive',
    behavior: 'crystallize',
    triggerLayer: 1,
    triggerConfig: { type: 'event_type', eventType: 'message.new', condition: 'is_sender' },
    enabled: true,
    confidence: 0.7,
    source: 'builtin',
  },
  {
    name: 'bridge_shared_experience',
    valueLayer: 'collaboration',
    behavior: 'sense',
    triggerLayer: 1,
    triggerConfig: { type: 'multi_heartbeat', minCommonTopics: 1 },
    enabled: true,
    confidence: 0.7,
    source: 'builtin',
  },
]

export class ReflexEngine {
  private batchProcessor: ReflexBatchProcessor | null = null
  private pearlRoutingService: PearlRoutingService | null = null

  constructor(
    private reflexRepo: IReflexRepository,
    private executionRepo: IReflexExecutionRepository,
    private heartbeatService: HeartbeatService,
    private reactionService: ReactionService,
    private clawService: ClawService,
    private eventBus: EventBus,
  ) {}

  /**
   * Phase 9: 注入 PearlRoutingService（延迟注入模式，避免循环依赖）
   * 注入后 route_pearl_by_interest 才启用 has_routing_candidates_after_prefilter 条件
   */
  injectPearlRoutingService(service: PearlRoutingService): void {
    this.pearlRoutingService = service
  }

  /**
   * Phase 5: 注入 Layer 1 批处理器，激活真实积累
   */
  activateLayer1(batchProcessor: ReflexBatchProcessor): void {
    this.batchProcessor = batchProcessor
  }

  /**
   * 检查 Layer 1 是否已激活
   */
  isLayer1Active(): boolean {
    return this.batchProcessor !== null
  }

  /**
   * Phase 5: 为指定 Claw 注册 4 个 Layer 1 内置 Reflex
   */
  async initializeLayer1Builtins(clawId: string): Promise<void> {
    const builtins = LAYER1_BUILTIN_REFLEXES.map((b) => ({ ...b, clawId }))
    await this.reflexRepo.upsertBuiltins(clawId, builtins)
  }

  /**
   * 初始化：注册全局 EventBus 订阅（同步调用，eventBus.on 是同步的）
   */
  initialize(): void {
    for (const eventType of SUBSCRIBED_EVENTS) {
      this.eventBus.on(eventType, async (payload: Record<string, unknown>) => {
        try {
          await this.onEvent({ type: eventType, clawId: this.extractClawId(eventType, payload), ...payload })
        } catch {
          // ReflexEngine 异常不影响其他订阅者
        }
      })
    }
  }

  /** 从事件 payload 提取 clawId */
  private extractClawId(eventType: string, payload: Record<string, unknown>): string {
    // Phase 8: thread 事件使用 contributorId
    if (eventType === 'thread.contribution_added' && typeof payload['contributorId'] === 'string') {
      return payload['contributorId']
    }
    // 优先使用直接字段
    if (typeof payload['clawId'] === 'string') return payload['clawId']
    if (typeof payload['recipientId'] === 'string') return payload['recipientId']
    if (typeof payload['ownerId'] === 'string') return payload['ownerId']
    if (typeof payload['toClawId'] === 'string') return payload['toClawId']
    return ''
  }

  /**
   * 为指定 Claw 初始化内置 Reflex
   */
  async initializeBuiltins(clawId: string): Promise<void> {
    const builtins = BUILTIN_REFLEXES.map((b) => ({ ...b, clawId }))
    await this.reflexRepo.upsertBuiltins(clawId, builtins)
  }

  /**
   * EventBus 事件处理入口
   */
  async onEvent(event: BusEvent): Promise<void> {
    if (!event.clawId) return

    const reflexes = await this.reflexRepo.findEnabled(event.clawId, 0)  // Layer 0 only

    for (const reflex of reflexes) {
      if (reflex.triggerLayer === 0) {
        const matched = matchLayer0(reflex, event)
        if (matched) {
          const allowed = this.checkHardConstraints(reflex, event)
          if (allowed) {
            await this.execute(reflex, event)
          } else {
            await this.logExecution(reflex, event, 'blocked', { reason: 'hard_constraint' })
          }
        }
      } else {
        // Layer 1: 加入挂起队列（Phase 5 激活）
        await this.queueForLayer1(reflex, event)
      }
    }
  }

  /** 硬约束检查 */
  private checkHardConstraints(reflex: ReflexRecord, event: BusEvent): boolean {
    // audit 和 keepalive 不受限制
    if (reflex.behavior === 'audit' || reflex.behavior === 'keepalive') return true

    // 检查每小时消息上限
    return getMessageCount(event.clawId) < HARD_CONSTRAINTS.maxMessagesPerHour
  }

  /** 执行 Layer 0 Reflex */
  private async execute(reflex: ReflexRecord, event: BusEvent): Promise<void> {
    switch (reflex.name) {
      case 'keepalive_heartbeat':
        await this.executeKeepaliveHeartbeat(reflex, event)
        break
      case 'phatic_micro_reaction':
        await this.executePhaticMicroReaction(reflex, event)
        break
      case 'relationship_decay_alert':
        await this.executeRelationshipDecayAlert(reflex, event)
        break
      case 'collect_poll_responses':
        await this.executeCollectPollResponses(reflex, event)
        break
      case 'track_thread_progress':
        // Phase 11B T10: 升级为 Layer 0 执行（BriefingService.collectThreadUpdates 已处理统计）
        await this.logExecution(reflex, event, 'executed', {
          note: 'tracked via BriefingService.collectThreadUpdates',
          threadId: (event as Record<string, unknown>)['threadId'],
        })
        break
      case 'audit_behavior_log':
        // 元 Reflex，在 logExecution 中处理，这里不再调用
        break
      default:
        await this.logExecution(reflex, event, 'executed', { note: 'custom reflex' })
    }
  }

  /** keepalive_heartbeat 执行 */
  private async executeKeepaliveHeartbeat(reflex: ReflexRecord, event: BusEvent): Promise<void> {
    try {
      await this.heartbeatService.sendHeartbeats(event.clawId)
      await this.logExecution(reflex, event, 'executed', {
        action: 'heartbeat_sent',
        timestamp: new Date().toISOString(),
      })
    } catch (err: unknown) {
      await this.logExecution(reflex, event, 'blocked', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /** phatic_micro_reaction 执行 */
  private async executePhaticMicroReaction(reflex: ReflexRecord, event: BusEvent): Promise<void> {
    const messageId = event['messageId'] as string | undefined
    const domainTags = (event['domainTags'] as string[]) ?? []
    const senderInterests = (event['senderInterests'] as string[]) ?? []
    const minCommonTags = (reflex.triggerConfig['minCommonTags'] as number) ?? 1

    const commonTags = domainTags.filter((t) => senderInterests.includes(t))
    if (commonTags.length < minCommonTags) return

    if (!this.checkHardConstraints(reflex, event)) {
      await this.logExecution(reflex, event, 'blocked', { reason: 'hard_constraint' })
      return
    }

    try {
      if (messageId) {
        await this.reactionService.addReaction(messageId, event.clawId, '👍')
        incrementMessageCount(event.clawId)
        await this.logExecution(reflex, event, 'executed', {
          action: 'emoji_reaction',
          emoji: '👍',
          commonTags,
          messageId,
        })
      }
    } catch (err: unknown) {
      await this.logExecution(reflex, event, 'blocked', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /** relationship_decay_alert 执行 */
  private async executeRelationshipDecayAlert(
    reflex: ReflexRecord,
    event: BusEvent,
  ): Promise<void> {
    const friendId = event['friendId'] as string | undefined
    const oldLayer = event['oldLayer'] as string | undefined
    const newLayer = event['newLayer'] as string | undefined
    const strength = event['strength'] as number | undefined

    await this.logExecution(reflex, event, 'executed', {
      alertType: 'relationship_downgrade',
      friendId,
      oldLayer,
      newLayer,
      strength,
      suggestion: `与 ${friendId} 关系降级：${oldLayer}→${newLayer}（强度 ${strength?.toFixed(2) ?? 'unknown'}）`,
    })
  }

  /** collect_poll_responses 执行 */
  private async executeCollectPollResponses(
    reflex: ReflexRecord,
    event: BusEvent,
  ): Promise<void> {
    const pollId = event['pollId'] as string | undefined
    const closesAt = event['closesAt'] as string | undefined

    await this.logExecution(reflex, event, 'executed', {
      action: 'poll_response_collected',
      pollId,
      closesAt,
      collectedAt: new Date().toISOString(),
    })
  }

  /** Layer 1 挂起队列（Phase 5：真实积累，Phase 4 兼容） */
  private async queueForLayer1(reflex: ReflexRecord, event: BusEvent): Promise<void> {
    // Phase 9: route_pearl_by_interest 的条件预检（has_routing_candidates_after_prefilter）
    if (reflex.name === 'route_pearl_by_interest' && this.pearlRoutingService) {
      const heartbeat = event['payload'] as { interests?: string[] } | undefined
      const ownerId = event['toClawId'] as string ?? event.clawId
      const friendId = event['fromClawId'] as string ?? ''

      const routingContext = await this.pearlRoutingService.buildRoutingContext(
        ownerId,
        friendId,
        {
          id: '',
          fromClawId: friendId,
          toClawId: ownerId,
          interests: heartbeat?.interests ?? [],
          isKeepalive: false,
          createdAt: new Date().toISOString(),
        },
      )

      if (!routingContext) {
        // 无候选 Pearl → 不入队
        return
      }

      // Phase 9 T14: 路由频率上限（24h 内对同一好友最多 3 个 Pearl）
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const recentRoutings = await this.executionRepo.findByResult(ownerId, 'queued_for_l1', since24h, 100)
      const routingCountForFriend = recentRoutings.filter(r =>
        (r.details as Record<string, unknown>)?.friendId === friendId,
      ).length

      if (routingCountForFriend >= 3) {
        // 超过频率上限 → 不入队
        return
      }

      // 有候选 → 将路由上下文附加到 triggerData
      if (this.batchProcessor) {
        const item: BatchQueueItem = {
          reflexId: reflex.id,
          reflexName: reflex.name,
          clawId: event.clawId,
          eventType: event.type,
          triggerData: { ...event, routingContext },
        }
        this.batchProcessor.enqueue(item)
      }
      return
    }

    // Phase 4 兼容：始终写入审计日志
    await this.logExecution(reflex, event, 'queued_for_l1', {
      note: this.batchProcessor ? 'Queued for L1 batch processing' : 'Awaiting Phase 5 agent execution model',
    })

    // Phase 5：若 batchProcessor 已激活，加入批处理队列
    if (this.batchProcessor) {
      const item: BatchQueueItem = {
        reflexId: reflex.id,
        reflexName: reflex.name,
        clawId: event.clawId,
        eventType: event.type,
        triggerData: { ...event },
      }
      this.batchProcessor.enqueue(item)
    }
  }

  /** 写入执行审计日志 */
  private async logExecution(
    reflex: ReflexRecord,
    event: BusEvent,
    result: ExecutionResult,
    details: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.executionRepo.create({
        id: randomUUID(),
        reflexId: reflex.id,
        clawId: event.clawId,
        eventType: event.type,
        triggerData: { ...event },
        executionResult: result,
        details,
      })
    } catch {
      // 审计日志写入失败不应影响主流程
    }
  }

  /**
   * Phase 5: Agent 确认批次处理完成
   * 返回已确认的记录数（0 = batchId 不存在）
   */
  async acknowledgeBatch(clawId: string, batchId: string): Promise<number> {
    if (this.batchProcessor) {
      await this.batchProcessor.acknowledgeBatch(batchId)
    }
    // 查找此 batchId 对应的执行记录（检查是否存在）
    const records = await this.executionRepo.findByResult(clawId, 'dispatched_to_l1' as any, undefined, 200)
    const matched = records.filter(
      (r) => (r.details as Record<string, unknown>)?.['batchId'] === batchId
    )
    return matched.length
  }

  /**
   * Phase 5: 获取 Layer 1 待处理队列状态
   */
  getPendingL1Status(_clawId: string): { queueSize: number; oldestEntry: string | null; hostAvailable: boolean } {
    const size = this.batchProcessor?.queueSize() ?? 0
    return {
      queueSize: size,
      oldestEntry: null,  // Phase 5 简化：不追踪最早时间
      hostAvailable: this.batchProcessor !== null,
    }
  }

  /** 获取某 Claw 的最近执行记录（CLI 使用） */
  async getRecentExecutions(clawId: string, limit = 50): Promise<ReturnType<typeof this.executionRepo.findRecent>> {
    return this.executionRepo.findRecent(clawId, limit)
  }

  /** 按结果类型过滤执行记录（推入数据库层，避免内存后过滤） */
  async getFilteredExecutions(
    clawId: string,
    result: ExecutionResult,
    since?: string,
    limit = 50,
  ): Promise<ReturnType<typeof this.executionRepo.findByResult>> {
    return this.executionRepo.findByResult(clawId, result, since, limit)
  }

  /** 获取某 Claw 的 at-risk 警报（简报引擎使用） */
  async getPendingAlerts(
    clawId: string,
    since?: string,
  ): Promise<ReturnType<typeof this.executionRepo.findAlerts>> {
    return this.executionRepo.findAlerts(clawId, since)
  }

  /** 获取 Reflex 列表 */
  async listReflexes(
    clawId: string,
    opts?: { layer?: 0 | 1; enabledOnly?: boolean },
  ): Promise<ReflexRecord[]> {
    if (opts?.enabledOnly !== false) {
      return this.reflexRepo.findEnabled(clawId, opts?.layer)
    }
    return this.reflexRepo.findAll(clawId)
  }

  /** 启用 Reflex */
  async enableReflex(clawId: string, name: string): Promise<void> {
    const reflex = await this.reflexRepo.findByName(clawId, name)
    if (!reflex) throw Object.assign(new Error('Reflex not found'), { code: 'NOT_FOUND' })
    await this.reflexRepo.setEnabled(clawId, name, true)
  }

  /** 禁用 Reflex（audit_behavior_log 不可禁用） */
  async disableReflex(clawId: string, name: string): Promise<void> {
    if (name === 'audit_behavior_log') {
      throw Object.assign(
        new Error('Cannot disable audit_behavior_log'),
        { code: 'FORBIDDEN' },
      )
    }
    const reflex = await this.reflexRepo.findByName(clawId, name)
    if (!reflex) throw Object.assign(new Error('Reflex not found'), { code: 'NOT_FOUND' })
    await this.reflexRepo.setEnabled(clawId, name, false)
  }
}
