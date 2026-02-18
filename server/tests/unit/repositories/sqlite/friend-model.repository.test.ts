/**
 * SQLite FriendModelRepository Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../../../src/db/database.js'
import { SQLiteFriendModelRepository } from '../../../../src/db/repositories/sqlite/friend-model.repository.js'
import { SQLiteClawRepository } from '../../../../src/db/repositories/sqlite/claw.repository.js'

describe('SQLiteFriendModelRepository', () => {
  let db: Database.Database
  let repo: SQLiteFriendModelRepository
  let clawRepo: SQLiteClawRepository
  let clawAId: string
  let clawBId: string
  let clawCId: string

  beforeEach(async () => {
    db = createTestDatabase()
    repo = new SQLiteFriendModelRepository(db)
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
    it('should create an empty friend model record', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId })
      const record = await repo.get(clawAId, clawBId)
      expect(record).not.toBeNull()
      expect(record!.clawId).toBe(clawAId)
      expect(record!.friendId).toBe(clawBId)
      expect(record!.lastKnownState).toBeNull()
      expect(record!.inferredInterests).toEqual([])
      expect(record!.expertiseTags).toEqual({})
      expect(record!.lastHeartbeatAt).toBeNull()
      expect(record!.lastInteractionAt).toBeNull()
      expect(record!.inferredNeeds).toBeNull()
      expect(record!.emotionalTone).toBeNull()
      expect(record!.knowledgeGaps).toBeNull()
    })

    it('should be idempotent (no error on duplicate create)', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId })
      await expect(repo.create({ clawId: clawAId, friendId: clawBId })).resolves.not.toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // get
  // ─────────────────────────────────────────────
  describe('get', () => {
    it('should return null when no model exists', async () => {
      const result = await repo.get(clawAId, clawBId)
      expect(result).toBeNull()
    })

    it('should return the correct record for given claw/friend pair', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId })
      await repo.create({ clawId: clawAId, friendId: clawCId })
      const result = await repo.get(clawAId, clawBId)
      expect(result!.friendId).toBe(clawBId)
    })
  })

  // ─────────────────────────────────────────────
  // getAll
  // ─────────────────────────────────────────────
  describe('getAll', () => {
    it('should return empty array when no models exist', async () => {
      const results = await repo.getAll(clawAId)
      expect(results).toEqual([])
    })

    it('should return all friend models for a given claw', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId })
      await repo.create({ clawId: clawAId, friendId: clawCId })
      const results = await repo.getAll(clawAId)
      expect(results).toHaveLength(2)
      const friendIds = results.map((r) => r.friendId).sort()
      expect(friendIds).toContain(clawBId)
      expect(friendIds).toContain(clawCId)
    })

    it('should not return models belonging to other claws', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId })
      await repo.create({ clawId: clawBId, friendId: clawAId })
      const results = await repo.getAll(clawAId)
      expect(results).toHaveLength(1)
      expect(results[0].friendId).toBe(clawBId)
    })
  })

  // ─────────────────────────────────────────────
  // updateFromHeartbeat
  // ─────────────────────────────────────────────
  describe('updateFromHeartbeat', () => {
    beforeEach(async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId })
    })

    it('should update inferredInterests', async () => {
      await repo.updateFromHeartbeat(clawAId, clawBId, {
        inferredInterests: ['AI', 'Design'],
        expertiseTags: { AI: 0.3 },
        lastHeartbeatAt: '2026-02-18T10:00:00Z',
      })
      const record = await repo.get(clawAId, clawBId)
      expect(record!.inferredInterests).toEqual(['AI', 'Design'])
    })

    it('should update expertiseTags', async () => {
      await repo.updateFromHeartbeat(clawAId, clawBId, {
        inferredInterests: [],
        expertiseTags: { AI: 0.35, Design: 0.3 },
        lastHeartbeatAt: '2026-02-18T10:00:00Z',
      })
      const record = await repo.get(clawAId, clawBId)
      expect(record!.expertiseTags['AI']).toBeCloseTo(0.35)
      expect(record!.expertiseTags['Design']).toBeCloseTo(0.3)
    })

    it('should update lastKnownState when provided', async () => {
      await repo.updateFromHeartbeat(clawAId, clawBId, {
        inferredInterests: [],
        expertiseTags: {},
        lastKnownState: '最近在研究 Rust',
        lastHeartbeatAt: '2026-02-18T10:00:00Z',
      })
      const record = await repo.get(clawAId, clawBId)
      expect(record!.lastKnownState).toBe('最近在研究 Rust')
    })

    it('should NOT update lastKnownState when not provided (keep existing)', async () => {
      // 先设置初始 lastKnownState
      await repo.updateFromHeartbeat(clawAId, clawBId, {
        inferredInterests: [],
        expertiseTags: {},
        lastKnownState: '初始状态',
        lastHeartbeatAt: '2026-02-18T09:00:00Z',
      })

      // 再次更新，不传 lastKnownState
      await repo.updateFromHeartbeat(clawAId, clawBId, {
        inferredInterests: ['AI'],
        expertiseTags: {},
        lastHeartbeatAt: '2026-02-18T10:00:00Z',
      })

      const record = await repo.get(clawAId, clawBId)
      expect(record!.lastKnownState).toBe('初始状态')
    })

    it('should update lastHeartbeatAt', async () => {
      const ts = '2026-02-18T10:00:00.000Z'
      await repo.updateFromHeartbeat(clawAId, clawBId, {
        inferredInterests: [],
        expertiseTags: {},
        lastHeartbeatAt: ts,
      })
      const record = await repo.get(clawAId, clawBId)
      expect(record!.lastHeartbeatAt).toBe(ts)
    })
  })

  // ─────────────────────────────────────────────
  // touchInteraction
  // ─────────────────────────────────────────────
  describe('touchInteraction', () => {
    beforeEach(async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId })
    })

    it('should update lastInteractionAt', async () => {
      const before = await repo.get(clawAId, clawBId)
      expect(before!.lastInteractionAt).toBeNull()

      await repo.touchInteraction(clawAId, clawBId)

      const after = await repo.get(clawAId, clawBId)
      expect(after!.lastInteractionAt).not.toBeNull()
    })
  })

  // ─────────────────────────────────────────────
  // updateLayer1Fields
  // ─────────────────────────────────────────────
  describe('updateLayer1Fields', () => {
    beforeEach(async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId })
    })

    it('should update emotionalTone', async () => {
      await repo.updateLayer1Fields(clawAId, clawBId, { emotionalTone: 'positive' })
      const record = await repo.get(clawAId, clawBId)
      expect(record!.emotionalTone).toBe('positive')
    })

    it('should update inferredNeeds', async () => {
      await repo.updateLayer1Fields(clawAId, clawBId, { inferredNeeds: ['collaboration', 'mentoring'] })
      const record = await repo.get(clawAId, clawBId)
      expect(record!.inferredNeeds).toEqual(['collaboration', 'mentoring'])
    })

    it('should update knowledgeGaps', async () => {
      await repo.updateLayer1Fields(clawAId, clawBId, { knowledgeGaps: ['systems design'] })
      const record = await repo.get(clawAId, clawBId)
      expect(record!.knowledgeGaps).toEqual(['systems design'])
    })
  })

  // ─────────────────────────────────────────────
  // delete
  // ─────────────────────────────────────────────
  describe('delete', () => {
    it('should delete the friend model', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId })
      await repo.delete(clawAId, clawBId)
      const record = await repo.get(clawAId, clawBId)
      expect(record).toBeNull()
    })

    it('should be idempotent (no error on deleting non-existent)', async () => {
      await expect(repo.delete(clawAId, clawBId)).resolves.not.toThrow()
    })

    it('should only delete the specified pair, not others', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId })
      await repo.create({ clawId: clawAId, friendId: clawCId })
      await repo.delete(clawAId, clawBId)
      const remaining = await repo.getAll(clawAId)
      expect(remaining).toHaveLength(1)
      expect(remaining[0].friendId).toBe(clawCId)
    })
  })
})
