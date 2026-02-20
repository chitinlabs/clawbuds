/**
 * SQLite ImprintRepository Unit Tests（Phase 5）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../../../src/db/database.js'
import { SQLiteImprintRepository } from '../../../../src/db/repositories/sqlite/imprint.repository.js'
import { SQLiteClawRepository } from '../../../../src/db/repositories/sqlite/claw.repository.js'

describe('SQLiteImprintRepository', () => {
  let db: Database.Database
  let repo: SQLiteImprintRepository
  let clawId: string
  const friendId = 'friend_test_001'

  beforeEach(async () => {
    db = createTestDatabase()
    repo = new SQLiteImprintRepository(db)
    const clawRepo = new SQLiteClawRepository(db)
    const claw = await clawRepo.register({ publicKey: 'pk-a', displayName: 'Alice' })
    clawId = claw.clawId
  })

  afterEach(() => db.close())

  // ─── create ──────────────────────────────────────────────────────────────
  describe('create', () => {
    it('should create an imprint with imp_ prefix id', async () => {
      const result = await repo.create({
        clawId,
        friendId,
        eventType: 'new_job',
        summary: 'Alice got a new job',
        detectedAt: new Date().toISOString(),
      })
      expect(result.id).toMatch(/^imp_/)
      expect(result.clawId).toBe(clawId)
      expect(result.friendId).toBe(friendId)
      expect(result.eventType).toBe('new_job')
      expect(result.summary).toBe('Alice got a new job')
    })

    it('should store sourceHeartbeatId when provided', async () => {
      const result = await repo.create({
        clawId,
        friendId,
        eventType: 'travel',
        summary: 'Bob is traveling',
        sourceHeartbeatId: 'hb_test_001',
        detectedAt: new Date().toISOString(),
      })
      expect(result.sourceHeartbeatId).toBe('hb_test_001')
    })

    it('should allow sourceHeartbeatId to be undefined', async () => {
      const result = await repo.create({
        clawId,
        friendId,
        eventType: 'birthday',
        summary: 'Birthday today',
        detectedAt: new Date().toISOString(),
      })
      expect(result.sourceHeartbeatId).toBeUndefined()
    })

    it('should accept all valid eventType values', async () => {
      const types = ['new_job', 'travel', 'birthday', 'recovery', 'milestone', 'other'] as const
      for (const eventType of types) {
        const result = await repo.create({
          clawId,
          friendId: `friend_${eventType}`,
          eventType,
          summary: `test ${eventType}`,
          detectedAt: new Date().toISOString(),
        })
        expect(result.eventType).toBe(eventType)
      }
    })
  })

  // ─── findByClawAndFriend ─────────────────────────────────────────────────
  describe('findByClawAndFriend', () => {
    it('should return imprints for a specific friend in descending order', async () => {
      await repo.create({
        clawId, friendId,
        eventType: 'new_job', summary: 'First',
        detectedAt: '2026-02-18T10:00:00Z',
      })
      await repo.create({
        clawId, friendId,
        eventType: 'travel', summary: 'Second',
        detectedAt: '2026-02-19T10:00:00Z',
      })

      const results = await repo.findByClawAndFriend(clawId, friendId)
      expect(results).toHaveLength(2)
      // Descending: most recent first
      expect(results[0].summary).toBe('Second')
      expect(results[1].summary).toBe('First')
    })

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.create({
          clawId, friendId,
          eventType: 'other', summary: `event ${i}`,
          detectedAt: new Date().toISOString(),
        })
      }
      const results = await repo.findByClawAndFriend(clawId, friendId, 3)
      expect(results).toHaveLength(3)
    })

    it('should return empty array when no imprints exist', async () => {
      const results = await repo.findByClawAndFriend(clawId, 'nonexistent_friend')
      expect(results).toHaveLength(0)
    })

    it('should not return imprints for other friends', async () => {
      await repo.create({
        clawId, friendId: 'other_friend',
        eventType: 'milestone', summary: 'Other friend event',
        detectedAt: new Date().toISOString(),
      })
      const results = await repo.findByClawAndFriend(clawId, friendId)
      expect(results).toHaveLength(0)
    })
  })

  // ─── findRecentByClaw ─────────────────────────────────────────────────────
  describe('findRecentByClaw', () => {
    it('should return imprints across all friends since a date', async () => {
      await repo.create({
        clawId, friendId: 'friend_a',
        eventType: 'new_job', summary: 'Old event',
        detectedAt: '2026-02-01T00:00:00Z',
      })
      await repo.create({
        clawId, friendId: 'friend_b',
        eventType: 'travel', summary: 'Recent event',
        detectedAt: '2026-02-19T00:00:00Z',
      })

      const results = await repo.findRecentByClaw(clawId, '2026-02-10T00:00:00Z')
      expect(results).toHaveLength(1)
      expect(results[0].summary).toBe('Recent event')
    })

    it('should return empty array when no recent imprints', async () => {
      const results = await repo.findRecentByClaw(clawId, new Date().toISOString())
      expect(results).toHaveLength(0)
    })
  })
})
