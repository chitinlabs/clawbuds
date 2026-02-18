/**
 * HeartbeatService
 * 心跳收发 + 差异心跳 + 清理（Phase 1）
 */

import { randomUUID } from 'node:crypto'
import type { IHeartbeatRepository, HeartbeatRecord } from '../db/repositories/interfaces/heartbeat.repository.interface.js'
import type { IFriendshipRepository } from '../db/repositories/interfaces/friendship.repository.interface.js'
import type { HeartbeatDataCollector } from './heartbeat-data-collector.js'
import type { EventBus, HeartbeatPayload } from './event-bus.js'

const HEARTBEAT_RETENTION_DAYS = parseInt(process.env.CLAWBUDS_HEARTBEAT_RETENTION_DAYS ?? '7')

export class HeartbeatService {
  constructor(
    private heartbeatRepo: IHeartbeatRepository,
    private friendshipRepo: IFriendshipRepository,
    private collector: HeartbeatDataCollector,
    private eventBus: EventBus,
  ) {}

  /**
   * 构建并发送心跳给所有好友（差异心跳）
   */
  async sendHeartbeats(clawId: string): Promise<void> {
    const friends = await this.friendshipRepo.listFriends(clawId)
    if (friends.length === 0) return

    const currentPayload = await this.collector.collect(clawId)

    for (const friend of friends) {
      const friendId = friend.clawId
      const lastHb = await this.heartbeatRepo.getLatest(clawId, friendId)

      const diff = this.computeDiff(currentPayload, lastHb)

      await this.heartbeatRepo.create({
        id: randomUUID(),
        fromClawId: clawId,
        toClawId: friendId,
        ...diff,
      })
    }
  }

  /**
   * 接收心跳（Server 端被 API 端点调用）
   */
  async receiveHeartbeat(
    fromClawId: string,
    toClawId: string,
    payload: HeartbeatPayload,
  ): Promise<void> {
    await this.heartbeatRepo.create({
      id: randomUUID(),
      fromClawId,
      toClawId,
      interests: payload.interests,
      availability: payload.availability,
      recentTopics: payload.recentTopics,
      isKeepalive: payload.isKeepalive,
    })

    this.eventBus.emit('heartbeat.received', { fromClawId, toClawId, payload })
  }

  /**
   * 获取某好友发来的最新心跳
   */
  async getLatestFrom(clawId: string, friendId: string): Promise<HeartbeatRecord | null> {
    return this.heartbeatRepo.getLatest(friendId, clawId)
  }

  /**
   * 获取所有好友的最新心跳
   */
  async getAllLatest(clawId: string): Promise<HeartbeatRecord[]> {
    return this.heartbeatRepo.getLatestForClaw(clawId)
  }

  /**
   * 清理过期记录（定时任务调用）
   */
  async cleanup(): Promise<number> {
    const cutoff = new Date(
      Date.now() - HEARTBEAT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()
    return this.heartbeatRepo.deleteOlderThan(cutoff)
  }

  /**
   * 计算差异心跳：与上一次心跳对比，只返回变化部分
   * 全部无变化时返回 isKeepalive=true
   */
  private computeDiff(
    current: HeartbeatPayload,
    lastHb: HeartbeatRecord | null,
  ): {
    interests?: string[]
    availability?: string
    recentTopics?: string
    isKeepalive: boolean
  } {
    if (!lastHb) {
      // 首次心跳：发送完整 payload
      return {
        interests: current.interests,
        availability: current.availability,
        recentTopics: current.recentTopics,
        isKeepalive: false,
      }
    }

    const interestsChanged =
      JSON.stringify(current.interests ?? []) !== JSON.stringify(lastHb.interests ?? [])
    const availabilityChanged = current.availability !== lastHb.availability
    const topicsChanged = current.recentTopics !== lastHb.recentTopics

    if (!interestsChanged && !availabilityChanged && !topicsChanged) {
      // 无变化：只发 keepalive
      return { isKeepalive: true }
    }

    return {
      interests: interestsChanged ? current.interests : undefined,
      availability: availabilityChanged ? current.availability : undefined,
      recentTopics: topicsChanged ? current.recentTopics : undefined,
      isKeepalive: false,
    }
  }
}
