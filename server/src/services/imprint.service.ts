/**
 * ImprintService — 情感里程碑服务（Phase 5）
 */

import type {
  IImprintRepository,
  Imprint,
  ImprintEventType,
} from '../db/repositories/interfaces/imprint.repository.interface.js'

const VALID_EVENT_TYPES: ImprintEventType[] = [
  'new_job', 'travel', 'birthday', 'recovery', 'milestone', 'other',
]

export class ImprintService {
  constructor(private imprintRepo: IImprintRepository) {}

  /**
   * 记录一个情感里程碑
   */
  async record(
    clawId: string,
    friendId: string,
    eventType: ImprintEventType,
    summary: string,
    sourceHeartbeatId?: string,
  ): Promise<Imprint> {
    if (!VALID_EVENT_TYPES.includes(eventType)) {
      throw new Error(`Invalid eventType: ${eventType}. Must be one of: ${VALID_EVENT_TYPES.join(', ')}`)
    }
    if (summary.length > 200) {
      throw new Error(`Summary too long (${summary.length} chars). Max 200 chars.`)
    }
    return this.imprintRepo.create({
      clawId,
      friendId,
      eventType,
      summary,
      sourceHeartbeatId,
      detectedAt: new Date().toISOString(),
    })
  }

  /**
   * 查询某好友的历史 Imprint
   */
  async findByFriend(clawId: string, friendId: string, limit?: number): Promise<Imprint[]> {
    return this.imprintRepo.findByClawAndFriend(clawId, friendId, limit)
  }

  /**
   * 查询最近的 Imprint（跨好友，供 Briefing Engine 消费）
   */
  async findRecent(clawId: string, since: string): Promise<Imprint[]> {
    return this.imprintRepo.findRecentByClaw(clawId, since)
  }
}
