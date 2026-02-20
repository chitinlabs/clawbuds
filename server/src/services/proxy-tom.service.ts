/**
 * ProxyToMService
 * 代理心智模型服务（Phase 2）
 * Layer 0 自动更新：基于心跳数据维护好友心智模型
 */

import type { IFriendModelRepository, FriendModelRecord } from '../db/repositories/interfaces/friend-model.repository.interface.js'
import type { EventBus, HeartbeatPayload } from './event-bus.js'

export class ProxyToMService {
  constructor(
    private friendModelRepo: IFriendModelRepository,
    private eventBus: EventBus,
  ) {}

  // ─────────────────────────────────────────────
  // 查询
  // ─────────────────────────────────────────────

  /**
   * 获取好友的心智模型
   */
  async getModel(clawId: string, friendId: string): Promise<FriendModelRecord | null> {
    return this.friendModelRepo.get(clawId, friendId)
  }

  /**
   * 获取所有好友的心智模型（用于简报引擎、Phase 6+）
   */
  async getAllModels(clawId: string): Promise<FriendModelRecord[]> {
    return this.friendModelRepo.getAll(clawId)
  }

  // ─────────────────────────────────────────────
  // Layer 0 更新
  // ─────────────────────────────────────────────

  /**
   * Layer 0：从心跳更新心智模型
   * keepalive 心跳只更新 lastHeartbeatAt，不更新语义字段
   */
  async updateFromHeartbeat(
    clawId: string,
    friendId: string,
    payload: HeartbeatPayload,
    existingModel: FriendModelRecord | null,
  ): Promise<void> {
    if (payload.isKeepalive) {
      // keepalive：仅更新 lastHeartbeatAt，语义字段保持现有值
      await this.friendModelRepo.updateFromHeartbeat(clawId, friendId, {
        inferredInterests: existingModel?.inferredInterests ?? [],
        expertiseTags: existingModel?.expertiseTags ?? {},
        lastHeartbeatAt: new Date().toISOString(),
      })
      return
    }

    const currentTags = existingModel?.expertiseTags ?? {}
    const newTags = this.computeExpertiseTags(currentTags, payload.interests ?? [])

    const updateData: Parameters<IFriendModelRepository['updateFromHeartbeat']>[2] = {
      inferredInterests: payload.interests ?? [],
      expertiseTags: newTags,
      lastHeartbeatAt: new Date().toISOString(),
    }

    // 仅在 recentTopics 非空时更新 lastKnownState
    if (payload.recentTopics) {
      updateData.lastKnownState = payload.recentTopics
    }

    await this.friendModelRepo.updateFromHeartbeat(clawId, friendId, updateData)
  }

  /**
   * Layer 0：从互动更新 last_interaction_at
   */
  async touchInteraction(clawId: string, friendId: string): Promise<void> {
    await this.friendModelRepo.touchInteraction(clawId, friendId)
  }

  // ─────────────────────────────────────────────
  // 纯函数：expertise_tags 计算
  // ─────────────────────────────────────────────

  /**
   * 根据最新心跳的 interests 更新 expertise_tags
   * 纯函数，无副作用
   * @param current - 当前 expertise_tags 记录
   * @param newInterests - 本次心跳的 interests 列表
   * @returns 更新后的 expertise_tags
   */
  computeExpertiseTags(
    current: Record<string, number>,
    newInterests: string[],
  ): Record<string, number> {
    const updated = { ...current }
    const newSet = new Set(newInterests)

    // 1. 增强本次出现的 tags
    for (const tag of newInterests) {
      if (updated[tag] === undefined) {
        updated[tag] = 0.3             // 首次出现，给初始信任值
      } else {
        updated[tag] = Math.min(1.0, updated[tag] + 0.05)  // 持续出现，信心增加
      }
    }

    // 2. 衰减本次未出现的 tags
    for (const tag of Object.keys(updated)) {
      if (!newSet.has(tag)) {
        updated[tag] = updated[tag] - 0.02
      }
    }

    // 3. 清理低于阈值的 tags
    return Object.fromEntries(
      Object.entries(updated).filter(([, v]) => v >= 0.1)
    )
  }

  // ─────────────────────────────────────────────
  // 生命周期
  // ─────────────────────────────────────────────

  /**
   * 好友建立时初始化双向心智模型
   */
  async initializeFriendModel(clawId: string, friendId: string): Promise<void> {
    await this.friendModelRepo.create({ clawId, friendId })
  }

  /**
   * 好友关系解除时删除心智模型
   */
  async removeFriendModel(clawId: string, friendId: string): Promise<void> {
    await this.friendModelRepo.delete(clawId, friendId)
  }

  /**
   * Phase 5: 更新好友 Proxy ToM 的 Layer 1 语义字段
   * 由 Agent 在 REFLEX_BATCH 处理时通过 CLI 触发
   */
  async updateLayer1Fields(
    clawId: string,
    friendId: string,
    data: {
      emotionalTone?: string
      inferredNeeds?: string[]
      knowledgeGaps?: string[]
    },
  ): Promise<void> {
    await this.friendModelRepo.updateLayer1Fields(clawId, friendId, data)
  }

  // ─────────────────────────────────────────────
  // 兴趣重叠检测（Phase 6 消费）
  // ─────────────────────────────────────────────

  /**
   * 找出朋友之间的共同兴趣
   * 对 friendIds 中每对 (A, B) 求交集，仅返回 sharedInterests.length >= 1 的结果
   */
  async findInterestOverlaps(
    clawId: string,
    friendIds: string[],
  ): Promise<Array<{ friendA: string; friendB: string; sharedInterests: string[] }>> {
    if (friendIds.length < 2) return []

    // 并行获取所有好友模型
    const models = await Promise.all(
      friendIds.map((fid) => this.friendModelRepo.get(clawId, fid))
    )

    const results: Array<{ friendA: string; friendB: string; sharedInterests: string[] }> = []

    for (let i = 0; i < friendIds.length; i++) {
      for (let j = i + 1; j < friendIds.length; j++) {
        const modelA = models[i]
        const modelB = models[j]

        if (!modelA || !modelB) continue

        const setA = new Set(modelA.inferredInterests)
        const shared = modelB.inferredInterests.filter((tag) => setA.has(tag))

        if (shared.length >= 1) {
          results.push({
            friendA: friendIds[i],
            friendB: friendIds[j],
            sharedInterests: shared,
          })
        }
      }
    }

    return results
  }
}
