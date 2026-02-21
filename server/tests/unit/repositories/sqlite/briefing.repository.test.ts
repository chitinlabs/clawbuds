/**
 * SQLite BriefingRepository Unit Tests（Phase 6）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../../../src/db/database.js'
import { SQLiteBriefingRepository } from '../../../../src/db/repositories/sqlite/briefing.repository.js'
import { SQLiteClawRepository } from '../../../../src/db/repositories/sqlite/claw.repository.js'

describe('SQLiteBriefingRepository', () => {
  let db: Database.Database
  let repo: SQLiteBriefingRepository
  let clawId: string

  beforeEach(async () => {
    db = createTestDatabase()
    repo = new SQLiteBriefingRepository(db)
    const clawRepo = new SQLiteClawRepository(db)
    const claw = await clawRepo.register({ publicKey: 'pk-brieftest', displayName: 'BriefTester' })
    clawId = claw.clawId
  })

  afterEach(() => db.close())

  // ─── create ──────────────────────────────────────────────────────────────
  describe('create', () => {
    it('should create a briefing with brief_ prefix id', async () => {
      const result = await repo.create({
        id: 'brief_test001',
        clawId,
        type: 'daily',
        content: '# Today Briefing\n\nQ1: Nothing critical.',
        rawData: { messages: [] },
      })
      expect(result.id).toBe('brief_test001')
      expect(result.clawId).toBe(clawId)
      expect(result.type).toBe('daily')
      expect(result.content).toContain('Today Briefing')
      expect(result.acknowledgedAt).toBeNull()
    })

    it('should store rawData as JSON', async () => {
      const rawData = { messages: [{ senderId: 'friend1', count: 2 }] }
      const result = await repo.create({
        id: 'brief_test002',
        clawId,
        type: 'daily',
        content: '# Test',
        rawData,
      })
      expect(result.rawData).toMatchObject(rawData)
    })

    it('should accept weekly type', async () => {
      const result = await repo.create({
        id: 'brief_weekly001',
        clawId,
        type: 'weekly',
        content: '# Weekly Briefing',
        rawData: {},
      })
      expect(result.type).toBe('weekly')
    })
  })

  // ─── findLatest ───────────────────────────────────────────────────────────
  describe('findLatest', () => {
    it('should return null when no briefings', async () => {
      const result = await repo.findLatest(clawId)
      expect(result).toBeNull()
    })

    it('should return the most recent briefing', async () => {
      // Insert old briefing with explicit past timestamp
      db.prepare(`INSERT INTO briefings (id, claw_id, type, content, raw_data, generated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
        'brief_old', clawId, 'daily', '# Old', '{}', '2020-01-01T00:00:00Z'
      )
      // Insert newer briefing with explicit future timestamp
      db.prepare(`INSERT INTO briefings (id, claw_id, type, content, raw_data, generated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
        'brief_new', clawId, 'daily', '# New', '{}', '2099-12-31T23:00:00Z'
      )
      const result = await repo.findLatest(clawId)
      expect(result?.id).toBe('brief_new')
    })
  })

  // ─── findHistory ──────────────────────────────────────────────────────────
  describe('findHistory', () => {
    it('should return briefings in descending order', async () => {
      db.prepare(`INSERT INTO briefings (id, claw_id, type, content, raw_data, generated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
        'brief_h1', clawId, 'daily', '# H1', '{}', '2026-02-18T20:00:00Z'
      )
      db.prepare(`INSERT INTO briefings (id, claw_id, type, content, raw_data, generated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
        'brief_h2', clawId, 'daily', '# H2', '{}', '2026-02-19T20:00:00Z'
      )
      const results = await repo.findHistory(clawId)
      expect(results[0].id).toBe('brief_h2')
      expect(results[1].id).toBe('brief_h1')
    })

    it('should filter by type', async () => {
      await repo.create({ id: 'brief_d1', clawId, type: 'daily', content: '# Daily', rawData: {} })
      await repo.create({ id: 'brief_w1', clawId, type: 'weekly', content: '# Weekly', rawData: {} })
      const dailyOnly = await repo.findHistory(clawId, { type: 'daily' })
      expect(dailyOnly).toHaveLength(1)
      expect(dailyOnly[0].type).toBe('daily')
    })

    it('should apply limit and offset', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.create({ id: `brief_p${i}`, clawId, type: 'daily', content: `# Briefing ${i}`, rawData: {} })
      }
      const page1 = await repo.findHistory(clawId, { limit: 2, offset: 0 })
      expect(page1).toHaveLength(2)
      const page2 = await repo.findHistory(clawId, { limit: 2, offset: 2 })
      expect(page2).toHaveLength(2)
      expect(page1[0].id).not.toBe(page2[0].id)
    })
  })

  // ─── acknowledge ──────────────────────────────────────────────────────────
  describe('acknowledge', () => {
    it('should set acknowledgedAt', async () => {
      await repo.create({ id: 'brief_ack1', clawId, type: 'daily', content: '# Test', rawData: {} })
      const ts = '2026-02-20T09:00:00Z'
      await repo.acknowledge('brief_ack1', ts)
      const result = await repo.findLatest(clawId)
      expect(result?.acknowledgedAt).toBe(ts)
    })
  })

  // ─── getUnreadCount ───────────────────────────────────────────────────────
  describe('getUnreadCount', () => {
    it('should count unread briefings', async () => {
      await repo.create({ id: 'brief_u1', clawId, type: 'daily', content: '# U1', rawData: {} })
      await repo.create({ id: 'brief_u2', clawId, type: 'daily', content: '# U2', rawData: {} })
      const count = await repo.getUnreadCount(clawId)
      expect(count).toBe(2)
    })

    it('should not count acknowledged briefings', async () => {
      await repo.create({ id: 'brief_r1', clawId, type: 'daily', content: '# R1', rawData: {} })
      await repo.acknowledge('brief_r1', new Date().toISOString())
      const count = await repo.getUnreadCount(clawId)
      expect(count).toBe(0)
    })
  })

  // ─── deleteOlderThan ─────────────────────────────────────────────────────
  describe('deleteOlderThan', () => {
    it('should delete old briefings and return count', async () => {
      db.prepare(`INSERT INTO briefings (id, claw_id, type, content, raw_data, generated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
        'brief_old1', clawId, 'daily', '# Old', '{}', '2025-01-01T00:00:00Z'
      )
      await repo.create({ id: 'brief_new1', clawId, type: 'daily', content: '# New', rawData: {} })
      const cutoff = '2026-01-01T00:00:00Z'
      const deleted = await repo.deleteOlderThan(clawId, cutoff)
      expect(deleted).toBe(1)
      const remaining = await repo.findHistory(clawId)
      expect(remaining).toHaveLength(1)
      expect(remaining[0].id).toBe('brief_new1')
    })
  })
})
