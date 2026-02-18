/**
 * HeartbeatService Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../src/db/database.js'
import { SQLiteHeartbeatRepository } from '../../src/db/repositories/sqlite/heartbeat.repository.js'
import { SQLiteFriendshipRepository } from '../../src/db/repositories/sqlite/friendship.repository.js'
import { SQLiteClawRepository } from '../../src/db/repositories/sqlite/claw.repository.js'
import { HeartbeatService } from '../../src/services/heartbeat.service.js'
import { HeartbeatDataCollector } from '../../src/services/heartbeat-data-collector.js'
import { SqliteCircleRepository } from '../../src/db/repositories/sqlite/circle.repository.js'
import { EventBus } from '../../src/services/event-bus.js'

describe('HeartbeatService', () => {
  let db: Database.Database
  let heartbeatRepo: SQLiteHeartbeatRepository
  let friendshipRepo: SQLiteFriendshipRepository
  let clawRepo: SQLiteClawRepository
  let circleRepo: SqliteCircleRepository
  let collector: HeartbeatDataCollector
  let eventBus: EventBus
  let service: HeartbeatService
  let clawAId: string
  let clawBId: string

  beforeEach(async () => {
    db = createTestDatabase()
    heartbeatRepo = new SQLiteHeartbeatRepository(db)
    friendshipRepo = new SQLiteFriendshipRepository(db)
    clawRepo = new SQLiteClawRepository(db)
    circleRepo = new SqliteCircleRepository(db)
    collector = new HeartbeatDataCollector(clawRepo, circleRepo)
    eventBus = new EventBus()
    service = new HeartbeatService(heartbeatRepo, friendshipRepo, collector, eventBus)

    const a = await clawRepo.register({ publicKey: 'pk-a', displayName: 'Claw A' })
    const b = await clawRepo.register({ publicKey: 'pk-b', displayName: 'Claw B' })
    clawAId = a.clawId
    clawBId = b.clawId

    // 建立好友关系
    await friendshipRepo.sendFriendRequest(clawAId, clawBId)
    await friendshipRepo.acceptFriendRequest(clawBId, clawAId)
  })

  afterEach(() => {
    db.close()
    eventBus.removeAllListeners()
  })

  // ─────────────────────────────────────────────
  // receiveHeartbeat
  // ─────────────────────────────────────────────
  describe('receiveHeartbeat', () => {
    it('should store heartbeat and emit event', async () => {
      const events: any[] = []
      eventBus.on('heartbeat.received', (data) => events.push(data))

      await service.receiveHeartbeat(clawAId, clawBId, {
        interests: ['tech'],
        availability: '工作日',
        recentTopics: 'Rust',
        isKeepalive: false,
      })

      const latest = await heartbeatRepo.getLatest(clawAId, clawBId)
      expect(latest).not.toBeNull()
      expect(latest!.interests).toEqual(['tech'])
      expect(events).toHaveLength(1)
      expect(events[0].fromClawId).toBe(clawAId)
    })

    it('should store keepalive heartbeat', async () => {
      await service.receiveHeartbeat(clawAId, clawBId, { isKeepalive: true })

      const latest = await heartbeatRepo.getLatest(clawAId, clawBId)
      expect(latest!.isKeepalive).toBe(true)
    })
  })

  // ─────────────────────────────────────────────
  // getLatestFrom + getAllLatest
  // ─────────────────────────────────────────────
  describe('getLatestFrom', () => {
    it('should return null when no heartbeat from friend', async () => {
      const result = await service.getLatestFrom(clawBId, clawAId)
      expect(result).toBeNull()
    })

    it('should return latest heartbeat from friend', async () => {
      await service.receiveHeartbeat(clawAId, clawBId, {
        recentTopics: 'hello',
        isKeepalive: false,
      })

      const result = await service.getLatestFrom(clawBId, clawAId)
      expect(result).not.toBeNull()
      expect(result!.recentTopics).toBe('hello')
    })
  })

  describe('getAllLatest', () => {
    it('should return empty when no heartbeats', async () => {
      const results = await service.getAllLatest(clawBId)
      expect(results).toEqual([])
    })

    it('should return all latest heartbeats for claw', async () => {
      await service.receiveHeartbeat(clawAId, clawBId, {
        recentTopics: 'hello',
        isKeepalive: false,
      })

      const results = await service.getAllLatest(clawBId)
      expect(results).toHaveLength(1)
    })
  })

  // ─────────────────────────────────────────────
  // sendHeartbeats（差异心跳）
  // ─────────────────────────────────────────────
  describe('sendHeartbeats', () => {
    it('should send heartbeat to all friends', async () => {
      await service.sendHeartbeats(clawAId)

      const latest = await heartbeatRepo.getLatest(clawAId, clawBId)
      expect(latest).not.toBeNull()
    })

    it('should send keepalive when payload has not changed', async () => {
      // 第一次发送（完整心跳）
      await service.sendHeartbeats(clawAId)
      // 小延迟确保时间戳不同（SQLite 毫秒精度）
      await new Promise((r) => setTimeout(r, 10))

      // 第二次发送（无变化 → keepalive）
      await service.sendHeartbeats(clawAId)

      const latest = await heartbeatRepo.getLatest(clawAId, clawBId)
      expect(latest!.isKeepalive).toBe(true)
    })

    it('should send full payload on first heartbeat (no previous)', async () => {
      // 设置 status_text
      await clawRepo.updateStatusText(clawAId, '正在研究 Rust')

      await service.sendHeartbeats(clawAId)

      const latest = await heartbeatRepo.getLatest(clawAId, clawBId)
      expect(latest!.isKeepalive).toBe(false)
      expect(latest!.recentTopics).toBe('正在研究 Rust')
    })

    it('should send no heartbeats when claw has no friends', async () => {
      const loner = await clawRepo.register({ publicKey: 'pk-loner', displayName: 'Loner' })
      await service.sendHeartbeats(loner.clawId)

      // 无好友，不应有任何心跳记录
      const results = await heartbeatRepo.getLatestForClaw(loner.clawId)
      expect(results).toHaveLength(0)
    })

    it('should send partial diff when only topics changed', async () => {
      // 第一次发送：有 statusText → full payload (recentTopics = 'hello')
      await clawRepo.updateStatusText(clawAId, 'hello')
      await service.sendHeartbeats(clawAId)
      await new Promise((r) => setTimeout(r, 10)) // 确保时间戳不同

      // 修改 statusText → 只有 recentTopics 变化
      await clawRepo.updateStatusText(clawAId, 'world')
      await service.sendHeartbeats(clawAId)

      const latest = await heartbeatRepo.getLatest(clawAId, clawBId)
      expect(latest!.isKeepalive).toBe(false)
      expect(latest!.recentTopics).toBe('world')
      // interests 没有变化，不应该包含在 diff 中
      expect(latest!.interests).toBeUndefined()
    })

    it('should include recentTopics in diff when topics changed from undefined', async () => {
      // 第一次：无 statusText → recentTopics = undefined
      await service.sendHeartbeats(clawAId)
      await new Promise((r) => setTimeout(r, 10)) // 确保时间戳不同

      // 设置 statusText → recentTopics 从 undefined 变为 'new topic'
      await clawRepo.updateStatusText(clawAId, 'new topic')
      await service.sendHeartbeats(clawAId)

      const latest = await heartbeatRepo.getLatest(clawAId, clawBId)
      expect(latest!.isKeepalive).toBe(false)
      // recentTopics 从 undefined 变为 'new topic'
      expect(latest!.recentTopics).toBe('new topic')
      // interests 无变化，不应包含
      expect(latest!.interests).toBeUndefined()
    })
  })

  // ─────────────────────────────────────────────
  // cleanup
  // ─────────────────────────────────────────────
  describe('cleanup', () => {
    it('should return 0 when no old records', async () => {
      const deleted = await service.cleanup()
      expect(deleted).toBe(0)
    })

    it('should delete heartbeats older than retention period', async () => {
      // 手动插入一条老记录（通过 repo 直接插入旧时间戳）
      db.prepare(
        `INSERT INTO heartbeats (id, from_claw_id, to_claw_id, is_keepalive, created_at)
         VALUES ('hb-old', ?, ?, 0, '2020-01-01T00:00:00.000Z')`,
      ).run(clawAId, clawBId)

      const deleted = await service.cleanup()
      expect(deleted).toBe(1)
    })
  })
})
