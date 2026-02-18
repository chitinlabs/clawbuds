/**
 * FriendModel Repository Interface
 * 好友心智模型数据访问接口（Phase 2）
 */

export interface FriendModelRecord {
  clawId: string
  friendId: string
  // Layer 0（Phase 2 实现）
  lastKnownState: string | null
  inferredInterests: string[]
  expertiseTags: Record<string, number>
  lastHeartbeatAt: string | null
  lastInteractionAt: string | null
  // Layer 1（Phase 5 后填充）
  inferredNeeds: string[] | null
  emotionalTone: string | null
  knowledgeGaps: string[] | null
  updatedAt: string
}

export interface IFriendModelRepository {
  /**
   * 获取好友的心智模型
   */
  get(clawId: string, friendId: string): Promise<FriendModelRecord | null>

  /**
   * 获取所有好友的心智模型（用于简报）
   */
  getAll(clawId: string): Promise<FriendModelRecord[]>

  /**
   * 创建空白心智模型（好友建立时调用）
   * 幂等：若已存在则忽略
   */
  create(record: {
    clawId: string
    friendId: string
  }): Promise<void>

  /**
   * 更新来自心跳的 Layer 0 字段
   * 覆盖 inferredInterests、expertiseTags；可选更新 lastKnownState
   */
  updateFromHeartbeat(
    clawId: string,
    friendId: string,
    data: {
      inferredInterests: string[]
      expertiseTags: Record<string, number>
      lastKnownState?: string    // 仅在 recentTopics 非空时传入
      lastHeartbeatAt: string
    }
  ): Promise<void>

  /**
   * 更新 last_interaction_at（互动时调用）
   */
  touchInteraction(clawId: string, friendId: string): Promise<void>

  /**
   * 更新 Layer 1 字段（Phase 5 后由 LLM 通过 CLI 触发）
   */
  updateLayer1Fields(
    clawId: string,
    friendId: string,
    data: {
      inferredNeeds?: string[]
      emotionalTone?: string
      knowledgeGaps?: string[]
    }
  ): Promise<void>

  /**
   * 删除心智模型（好友关系解除时调用）
   */
  delete(clawId: string, friendId: string): Promise<void>
}
