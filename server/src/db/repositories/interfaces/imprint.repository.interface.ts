/**
 * IImprintRepository — 情感里程碑持久化接口（Phase 5）
 * 记录 sense_life_event Reflex 检测到的好友生活事件
 */

export type ImprintEventType =
  | 'new_job'
  | 'travel'
  | 'birthday'
  | 'recovery'
  | 'milestone'
  | 'other'

export interface Imprint {
  id: string               // 'imp_' + nanoid(10)
  clawId: string
  friendId: string
  eventType: ImprintEventType
  summary: string          // ≤ 200 chars
  sourceHeartbeatId?: string
  detectedAt: string       // ISO 8601
}

export interface IImprintRepository {
  /**
   * 创建一条 Imprint 记录
   */
  create(data: Omit<Imprint, 'id'>): Promise<Imprint>

  /**
   * 按 Claw + 好友查询历史 Imprint（时序降序）
   */
  findByClawAndFriend(clawId: string, friendId: string, limit?: number): Promise<Imprint[]>

  /**
   * 按 Claw 查询最近的 Imprint（跨好友，供 Briefing Engine 消费）
   */
  findRecentByClaw(clawId: string, since: string): Promise<Imprint[]>
}
