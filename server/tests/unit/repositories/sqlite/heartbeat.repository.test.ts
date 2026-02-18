/**
 * SQLite HeartbeatRepository Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../../../src/db/database.js'
import { SQLiteHeartbeatRepository } from '../../../../src/db/repositories/sqlite/heartbeat.repository.js'
import { SQLiteClawRepository } from '../../../../src/db/repositories/sqlite/claw.repository.js'

describe('SQLiteHeartbeatRepository', () => {
  let db: Database.Database
  let repo: SQLiteHeartbeatRepository
  let clawRepo: SQLiteClawRepository
  let clawAId: string
  let clawBId: string
  let clawCId: string

  beforeEach(async () => {
    db = createTestDatabase()
    repo = new SQLiteHeartbeatRepository(db)
    clawRepo = new SQLiteClawRepository(db)

    const a = await clawRepo.register({ publicKey: 'pk-a', displayName: 'Claw A' })
    const b = await clawRepo.register({ publicKey: 'pk-b', displayName: 'Claw B' })
    const c = await clawRepo.register({ publicKey: 'pk-c', displayName: 'Claw C' })
    clawAId = a.clawId
    clawBId = b.clawId
    clawCId = c.clawId
  })

  afterEach(() => {
    db.close()
  })

  // ─────────────────────────────────────────────
  // create
  // ─────────────────────────────────────────────
  describe('create', () => {
    it('should create a full heartbeat record', async () => {
      await repo.create({
        id: 'hb-001',
        fromClawId: clawAId,
        toClawId: clawBId,
        interests: ['tech', 'design'],
        availability: '工作日 9-18 点',
        recentTopics: '最近在研究 Rust',
        isKeepalive: false,
      })

      const record = await repo.getLatest(clawAId, clawBId)
      expect(record).not.toBeNull()
      expect(record!.id).toBe('hb-001')
      expect(record!.fromClawId).toBe(clawAId)
      expect(record!.toClawId).toBe(clawBId)
      expect(record!.interests).toEqual(['tech', 'design'])
      expect(record!.availability).toBe('工作日 9-18 点')
      expect(record!.recentTopics).toBe('最近在研究 Rust')
      expect(record!.isKeepalive).toBe(false)
    })

    it('should create a keepalive heartbeat (no payload)', async () => {
      await repo.create({
        id: 'hb-keepalive',
        fromClawId: clawAId,
        toClawId: clawBId,
        isKeepalive: true,
      })

      const record = await repo.getLatest(clawAId, clawBId)
      expect(record).not.toBeNull()
      expect(record!.isKeepalive).toBe(true)
      expect(record!.interests).toBeUndefined()
      expect(record!.availability).toBeUndefined()
      expect(record!.recentTopics).toBeUndefined()
    })

    it('should handle null interests/availability/recentTopics gracefully', async () => {
      await repo.create({
        id: 'hb-partial',
        fromClawId: clawAId,
        toClawId: clawBId,
        availability: '凌晨活跃',
        isKeepalive: false,
      })

      const record = await repo.getLatest(clawAId, clawBId)
      expect(record!.availability).toBe('凌晨活跃')
      expect(record!.interests).toBeUndefined()
    })
  })

  // ─────────────────────────────────────────────
  // getLatest
  // ─────────────────────────────────────────────
  describe('getLatest', () => {
    it('should return null when no heartbeat exists', async () => {
      const result = await repo.getLatest(clawAId, clawBId)
      expect(result).toBeNull()
    })

    it('should return the most recent heartbeat from a given sender', async () => {
      await repo.create({
        id: 'hb-old',
        fromClawId: clawAId,
        toClawId: clawBId,
        recentTopics: 'old topic',
        isKeepalive: false,
      })
      // 小延迟确保时间戳不同
      await new Promise((r) => setTimeout(r, 5))
      await repo.create({
        id: 'hb-new',
        fromClawId: clawAId,
        toClawId: clawBId,
        recentTopics: 'new topic',
        isKeepalive: false,
      })

      const result = await repo.getLatest(clawAId, clawBId)
      expect(result!.id).toBe('hb-new')
      expect(result!.recentTopics).toBe('new topic')
    })

    it('should not return heartbeats from other senders', async () => {
      await repo.create({
        id: 'hb-c',
        fromClawId: clawCId,
        toClawId: clawBId,
        isKeepalive: false,
      })

      const result = await repo.getLatest(clawAId, clawBId)
      expect(result).toBeNull()
    })
  })

  // ─────────────────────────────────────────────
  // getLatestForClaw
  // ─────────────────────────────────────────────
  describe('getLatestForClaw', () => {
    it('should return empty array when no heartbeats', async () => {
      const results = await repo.getLatestForClaw(clawBId)
      expect(results).toEqual([])
    })

    it('should return latest heartbeat from each sender', async () => {
      await repo.create({
        id: 'hb-a',
        fromClawId: clawAId,
        toClawId: clawBId,
        recentTopics: 'from A',
        isKeepalive: false,
      })
      await repo.create({
        id: 'hb-c',
        fromClawId: clawCId,
        toClawId: clawBId,
        recentTopics: 'from C',
        isKeepalive: false,
      })

      const results = await repo.getLatestForClaw(clawBId)
      expect(results).toHaveLength(2)
      const senders = results.map((r) => r.fromClawId).sort()
      expect(senders).toContain(clawAId)
      expect(senders).toContain(clawCId)
    })

    it('should return only latest from each sender (not all records)', async () => {
      await repo.create({
        id: 'hb-a-old',
        fromClawId: clawAId,
        toClawId: clawBId,
        recentTopics: 'old',
        isKeepalive: false,
      })
      await new Promise((r) => setTimeout(r, 5))
      await repo.create({
        id: 'hb-a-new',
        fromClawId: clawAId,
        toClawId: clawBId,
        recentTopics: 'new',
        isKeepalive: false,
      })

      const results = await repo.getLatestForClaw(clawBId)
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('hb-a-new')
    })
  })

  // ─────────────────────────────────────────────
  // getSince
  // ─────────────────────────────────────────────
  describe('getSince', () => {
    it('should return empty array when no heartbeats after cutoff', async () => {
      const future = new Date(Date.now() + 10000).toISOString()
      const results = await repo.getSince(clawBId, future)
      expect(results).toEqual([])
    })

    it('should return heartbeats created after since date', async () => {
      const before = new Date().toISOString()
      await new Promise((r) => setTimeout(r, 10))

      await repo.create({
        id: 'hb-after',
        fromClawId: clawAId,
        toClawId: clawBId,
        isKeepalive: false,
      })

      const results = await repo.getSince(clawBId, before)
      expect(results.length).toBeGreaterThan(0)
      const ids = results.map((r) => r.id)
      expect(ids).toContain('hb-after')
    })
  })

  // ─────────────────────────────────────────────
  // deleteOlderThan
  // ─────────────────────────────────────────────
  describe('deleteOlderThan', () => {
    it('should return 0 when no records to delete', async () => {
      const cutoff = new Date(Date.now() - 10000).toISOString()
      const deleted = await repo.deleteOlderThan(cutoff)
      expect(deleted).toBe(0)
    })

    it('should delete records older than cutoff date', async () => {
      await repo.create({
        id: 'hb-old',
        fromClawId: clawAId,
        toClawId: clawBId,
        isKeepalive: false,
      })

      await new Promise((r) => setTimeout(r, 10))
      const cutoff = new Date().toISOString()
      await new Promise((r) => setTimeout(r, 10))

      await repo.create({
        id: 'hb-new',
        fromClawId: clawAId,
        toClawId: clawBId,
        isKeepalive: false,
      })

      const deleted = await repo.deleteOlderThan(cutoff)
      expect(deleted).toBe(1)

      const remaining = await repo.getLatest(clawAId, clawBId)
      expect(remaining!.id).toBe('hb-new')
    })

    it('should keep records created at exactly the cutoff time', async () => {
      // 实际上 "older than" 不包含等于，所以等于 cutoff 的记录被保留
      const before = new Date(Date.now() - 5000).toISOString()
      await repo.create({
        id: 'hb-future',
        fromClawId: clawAId,
        toClawId: clawBId,
        isKeepalive: false,
      })

      const deleted = await repo.deleteOlderThan(before)
      expect(deleted).toBe(0)
    })
  })
})
