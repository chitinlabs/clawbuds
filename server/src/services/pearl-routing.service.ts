/**
 * PearlRoutingService (Phase 9)
 * Pearl 自主路由服务：Layer 0 预过滤 + 信任过滤 + 路由上下文构建 + 路由执行
 *
 * 路由管道（完整 5 步）：
 *   Step 2: Layer 0 预过滤（domain_tags 交集，本服务处理）
 *   Step 4: 信任过滤（trust >= trustThreshold，本服务处理）
 *   Step 3+5: Layer 1 语义精排 + carapace 检查（由 Agent/REFLEX_BATCH 处理）
 */

import { randomUUID } from 'node:crypto'
import type { PearlMetadataRecord } from '../db/repositories/interfaces/pearl.repository.interface.js'
import type { HeartbeatRecord } from '../db/repositories/interfaces/heartbeat.repository.interface.js'
import type { FriendModelRecord } from '../db/repositories/interfaces/friend-model.repository.interface.js'
import type { PearlService } from './pearl.service.js'
import type { TrustService } from './trust.service.js'
import type { ProxyToMService } from './proxy-tom.service.js'
import type { HeartbeatService } from './heartbeat.service.js'

/** 路由上下文（供 REFLEX_BATCH 使用） */
export interface RoutingContext {
  friendId: string
  friendInterests: string[]
  friendToM: FriendModelRecord | null
  candidates: PearlMetadataRecord[]   // 经过 Layer 0 + 信任过滤后的候选
  trustScores: Record<string, number>  // { domain: trustScore }
}

export class PearlRoutingService {
  constructor(
    private readonly pearlService: PearlService,
    private readonly tomService: ProxyToMService,
    private readonly trustService: TrustService,
    private readonly heartbeatService: HeartbeatService,
  ) {}

  /**
   * Step 2: Layer 0 预过滤
   * 获取所有可路由候选，按 domain_tags 与好友 interests 交集过滤
   * 纯算法操作，无需 LLM
   */
  async preFilter(
    ownerId: string,
    friendInterests: string[],
  ): Promise<PearlMetadataRecord[]> {
    const candidates = await this.pearlService.getRoutingCandidates(ownerId)
    return candidates.filter(pearl =>
      pearl.domainTags.some(tag => friendInterests.includes(tag)),
    )
  }

  /**
   * Step 4: 信任过滤
   * 过滤掉 trust < shareConditions.trustThreshold 的候选
   */
  async trustFilter(
    ownerId: string,
    friendId: string,
    candidates: PearlMetadataRecord[],
  ): Promise<PearlMetadataRecord[]> {
    const results = await Promise.all(
      candidates.map(async pearl => {
        if (!pearl.shareConditions?.trustThreshold) return pearl  // 无阈值要求，直接通过

        const domain = pearl.domainTags[0] ?? '_overall'
        const trustScore = await this.trustService.getComposite(ownerId, friendId, domain)

        return trustScore >= (pearl.shareConditions.trustThreshold as number) ? pearl : null
      }),
    )
    return results.filter((p): p is PearlMetadataRecord => p !== null)
  }

  /**
   * 构建路由批处理上下文（为 REFLEX_BATCH 准备数据）
   * 执行 Step 2（Layer 0 预过滤）+ Step 4（信任过滤）
   * Step 3（语义精排）和 Step 5（carapace）由 Agent 处理
   */
  async buildRoutingContext(
    ownerId: string,
    friendId: string,
    heartbeat: HeartbeatRecord,
  ): Promise<RoutingContext | null> {
    // Step 2: Layer 0 预过滤
    const prefiltered = await this.preFilter(ownerId, heartbeat.interests ?? [])
    if (prefiltered.length === 0) return null

    // Step 4: 信任过滤
    const trustFiltered = await this.trustFilter(ownerId, friendId, prefiltered)
    if (trustFiltered.length === 0) return null

    // 准备 ToM 上下文
    const friendToM = await this.tomService.getModel(ownerId, friendId)

    // 准备各领域信任分（供 Agent 参考）
    const domains = [...new Set(trustFiltered.flatMap(p => p.domainTags))]
    const trustScores: Record<string, number> = {}
    for (const domain of domains) {
      trustScores[domain] = await this.trustService.getComposite(ownerId, friendId, domain)
    }

    return {
      friendId,
      friendInterests: heartbeat.interests ?? [],
      friendToM,
      candidates: trustFiltered,
      trustScores,
    }
  }

  /**
   * 执行路由（Agent 通过 CLI 调用后触发的实际分享）
   * 包含完整 share_conditions 验证（通过 PearlService.share 的 context 参数传入）
   */
  async executeRoute(
    ownerId: string,
    friendId: string,
    pearlId: string,
    friendInterests: string[],
  ): Promise<void> {
    await this.pearlService.share(pearlId, ownerId, friendId, { friendInterests })
  }

  /**
   * 记录路由事件（用于心跳洞察 + 简报统计）
   * 存储到 reflex_executions.details（fire-and-forget，失败不阻断主流程）
   */
  async recordRoutingEvent(
    ownerId: string,
    pearlId: string,
    friendId: string,
    routed: boolean,
    reason?: string,
  ): Promise<void> {
    // 当前版本：路由事件由 ReflexEngine 记录到 reflex_executions
    // PearlRoutingService 提供此方法供外部调用，具体持久化由集成层完成
    // 占位实现：确保接口稳定，不抛出错误
    void { ownerId, pearlId, friendId, routed, reason, id: randomUUID() }
  }
}
