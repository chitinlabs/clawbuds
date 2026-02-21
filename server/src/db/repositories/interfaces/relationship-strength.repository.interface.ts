/**
 * RelationshipStrength Repository Interface
 * 关系强度数据访问接口（Phase 1）
 */

export type DunbarLayer = 'core' | 'sympathy' | 'active' | 'casual'

export interface RelationshipStrengthRecord {
  clawId: string
  friendId: string
  strength: number
  dunbarLayer: DunbarLayer
  manualOverride: boolean
  lastInteractionAt: string | null
  updatedAt: string
}

export interface IRelationshipStrengthRepository {
  /**
   * 获取两人之间的关系强度记录
   */
  get(clawId: string, friendId: string): Promise<RelationshipStrengthRecord | null>

  /**
   * 获取某 Claw 的所有关系强度记录，按 strength 降序
   */
  getAllForClaw(clawId: string): Promise<RelationshipStrengthRecord[]>

  /**
   * 创建关系强度记录（好友建立时）
   */
  create(record: {
    clawId: string
    friendId: string
    strength: number
    dunbarLayer: DunbarLayer
  }): Promise<void>

  /**
   * 更新 strength 值
   */
  updateStrength(clawId: string, friendId: string, strength: number): Promise<void>

  /**
   * 更新 dunbar_layer 值
   */
  updateLayer(clawId: string, friendId: string, layer: DunbarLayer, manualOverride: boolean): Promise<void>

  /**
   * 更新 last_interaction_at 为当前时间
   */
  touchInteraction(clawId: string, friendId: string): Promise<void>

  /**
   * 批量衰减所有记录，返回受影响的行数
   * 实现者内部执行: strength = max(0.01, strength * computeDecayRate(strength))
   * computeDecayRate 函数由调用方（RelationshipService）提供
   */
  decayAll(computeDecayRate: (strength: number) => number): Promise<number>

  /**
   * 获取 at-risk 关系（strength 距离下一层阈值 ≤ margin 且最近 inactiveDays 天无互动）
   */
  getAtRisk(clawId: string, margin: number, inactiveDays: number): Promise<RelationshipStrengthRecord[]>

  /**
   * 删除关系强度记录（好友关系解除时）
   */
  delete(clawId: string, friendId: string): Promise<void>

  /**
   * 获取所有有关系强度记录的 clawId 列表（用于 decayAll 遍历）
   * Phase 11B T11
   */
  findAllOwners(): Promise<string[]>
}
