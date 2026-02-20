/**
 * SQLite TrustRepository Tests (Phase 7)
 * TDD 红灯：实现前测试应失败
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../../src/db/database.js'
import { SQLiteClawRepository } from '../../../src/db/repositories/sqlite/claw.repository.js'
import { SQLiteTrustRepository } from '../../../src/db/repositories/sqlite/trust.repository.js'
import type { TrustScoreRecord } from '../../../src/db/repositories/interfaces/trust.repository.interface.js'

describe('SQLiteTrustRepository', () => {
  let db: Database.Database
  let clawRepo: SQLiteClawRepository
  let trustRepo: SQLiteTrustRepository
  let clawIdA: string
  let clawIdB: string
  let clawIdC: string

  beforeEach(async () => {
    db = createTestDatabase()
    clawRepo = new SQLiteClawRepository(db)
    trustRepo = new SQLiteTrustRepository(db)
    const clawA = await clawRepo.register({ publicKey: 'pk-ta', displayName: 'TrustA' })
    const clawB = await clawRepo.register({ publicKey: 'pk-tb', displayName: 'TrustB' })
    const clawC = await clawRepo.register({ publicKey: 'pk-tc', displayName: 'TrustC' })
    clawIdA = clawA.clawId
    clawIdB = clawB.clawId
    clawIdC = clawC.clawId
  })

  afterEach(() => db.close())

  // ---- initialize / get ----

  describe('initialize & get', () => {
    it('should initialize _overall trust record with default values', async () => {
      await trustRepo.initialize(clawIdA, clawIdB)
      const record = await trustRepo.get(clawIdA, clawIdB, '_overall')
      expect(record).not.toBeNull()
      expect(record!.fromClawId).toBe(clawIdA)
      expect(record!.toClawId).toBe(clawIdB)
      expect(record!.domain).toBe('_overall')
      expect(record!.qScore).toBe(0.5)
      expect(record!.hScore).toBeNull()
      expect(record!.nScore).toBe(0.5)
      expect(record!.wScore).toBe(0.0)
      expect(record!.composite).toBe(0.5)
    })

    it('should return null for non-existent trust record', async () => {
      const record = await trustRepo.get(clawIdA, clawIdB, '_overall')
      expect(record).toBeNull()
    })

    it('should return null for non-existent domain', async () => {
      await trustRepo.initialize(clawIdA, clawIdB)
      const record = await trustRepo.get(clawIdA, clawIdB, 'AI')
      expect(record).toBeNull()
    })

    it('initialize should be idempotent (no error on re-initialize)', async () => {
      await trustRepo.initialize(clawIdA, clawIdB)
      await expect(trustRepo.initialize(clawIdA, clawIdB)).resolves.not.toThrow()
    })
  })

  // ---- upsert ----

  describe('upsert', () => {
    it('should create new record with provided values', async () => {
      const record = await trustRepo.upsert({
        fromClawId: clawIdA,
        toClawId: clawIdB,
        domain: 'AI',
        qScore: 0.7,
        hScore: 0.9,
        nScore: 0.6,
        wScore: 0.3,
        composite: 0.75,
      })
      expect(record.qScore).toBe(0.7)
      expect(record.hScore).toBe(0.9)
      expect(record.domain).toBe('AI')
    })

    it('should update existing record on conflict', async () => {
      await trustRepo.upsert({
        fromClawId: clawIdA,
        toClawId: clawIdB,
        domain: '_overall',
        qScore: 0.5,
      })
      await trustRepo.upsert({
        fromClawId: clawIdA,
        toClawId: clawIdB,
        domain: '_overall',
        qScore: 0.8,
      })
      const record = await trustRepo.get(clawIdA, clawIdB, '_overall')
      expect(record!.qScore).toBe(0.8)
    })

    it('should allow hScore = null (not endorsed)', async () => {
      const record = await trustRepo.upsert({
        fromClawId: clawIdA,
        toClawId: clawIdB,
        domain: '_overall',
        hScore: null,
      })
      expect(record.hScore).toBeNull()
    })

    it('should allow hScore = 0.0 (explicit low trust)', async () => {
      const record = await trustRepo.upsert({
        fromClawId: clawIdA,
        toClawId: clawIdB,
        domain: '_overall',
        hScore: 0.0,
      })
      expect(record.hScore).toBe(0.0)
    })
  })

  // ---- score updates ----

  describe('updateQScore', () => {
    it('should apply delta to q_score', async () => {
      await trustRepo.initialize(clawIdA, clawIdB)
      await trustRepo.updateQScore(clawIdA, clawIdB, '_overall', +0.05)
      const record = await trustRepo.get(clawIdA, clawIdB, '_overall')
      expect(record!.qScore).toBeCloseTo(0.55, 5)
    })

    it('should clamp q_score to maximum 1.0', async () => {
      await trustRepo.upsert({ fromClawId: clawIdA, toClawId: clawIdB, domain: '_overall', qScore: 0.99 })
      await trustRepo.updateQScore(clawIdA, clawIdB, '_overall', +0.05)
      const record = await trustRepo.get(clawIdA, clawIdB, '_overall')
      expect(record!.qScore).toBe(1.0)
    })

    it('should clamp q_score to minimum 0.0', async () => {
      await trustRepo.upsert({ fromClawId: clawIdA, toClawId: clawIdB, domain: '_overall', qScore: 0.01 })
      await trustRepo.updateQScore(clawIdA, clawIdB, '_overall', -0.05)
      const record = await trustRepo.get(clawIdA, clawIdB, '_overall')
      expect(record!.qScore).toBe(0.0)
    })
  })

  describe('updateHScore', () => {
    it('should set h_score', async () => {
      await trustRepo.initialize(clawIdA, clawIdB)
      await trustRepo.updateHScore(clawIdA, clawIdB, '_overall', 0.9)
      const record = await trustRepo.get(clawIdA, clawIdB, '_overall')
      expect(record!.hScore).toBe(0.9)
    })

    it('should set h_score to null (clear endorsement)', async () => {
      await trustRepo.upsert({ fromClawId: clawIdA, toClawId: clawIdB, domain: '_overall', hScore: 0.9 })
      await trustRepo.updateHScore(clawIdA, clawIdB, '_overall', null)
      const record = await trustRepo.get(clawIdA, clawIdB, '_overall')
      expect(record!.hScore).toBeNull()
    })
  })

  describe('updateComposite', () => {
    it('should update composite score', async () => {
      await trustRepo.initialize(clawIdA, clawIdB)
      await trustRepo.updateComposite(clawIdA, clawIdB, '_overall', 0.78)
      const record = await trustRepo.get(clawIdA, clawIdB, '_overall')
      expect(record!.composite).toBeCloseTo(0.78, 5)
    })
  })

  // ---- getAllDomains ----

  describe('getAllDomains', () => {
    it('should return all domains for a pair', async () => {
      await trustRepo.upsert({ fromClawId: clawIdA, toClawId: clawIdB, domain: '_overall' })
      await trustRepo.upsert({ fromClawId: clawIdA, toClawId: clawIdB, domain: 'AI' })
      await trustRepo.upsert({ fromClawId: clawIdA, toClawId: clawIdB, domain: 'design' })
      const records = await trustRepo.getAllDomains(clawIdA, clawIdB)
      expect(records).toHaveLength(3)
      const domains = records.map((r) => r.domain)
      expect(domains).toContain('_overall')
      expect(domains).toContain('AI')
      expect(domains).toContain('design')
    })

    it('should return empty array for non-existent pair', async () => {
      const records = await trustRepo.getAllDomains(clawIdA, clawIdB)
      expect(records).toHaveLength(0)
    })
  })

  // ---- getAllForClaw ----

  describe('getAllForClaw', () => {
    it('should return all trusts from claw, ordered by composite desc', async () => {
      await trustRepo.upsert({ fromClawId: clawIdA, toClawId: clawIdB, domain: '_overall', composite: 0.8 })
      await trustRepo.upsert({ fromClawId: clawIdA, toClawId: clawIdC, domain: '_overall', composite: 0.6 })
      const records = await trustRepo.getAllForClaw(clawIdA)
      expect(records).toHaveLength(2)
      expect(records[0].composite).toBeGreaterThanOrEqual(records[1].composite)
    })

    it('should filter by domain when specified', async () => {
      await trustRepo.upsert({ fromClawId: clawIdA, toClawId: clawIdB, domain: '_overall' })
      await trustRepo.upsert({ fromClawId: clawIdA, toClawId: clawIdB, domain: 'AI' })
      const records = await trustRepo.getAllForClaw(clawIdA, 'AI')
      expect(records).toHaveLength(1)
      expect(records[0].domain).toBe('AI')
    })
  })

  // ---- decayAllQ ----

  describe('decayAllQ', () => {
    it('should multiply all q_scores by decay rate', async () => {
      await trustRepo.upsert({ fromClawId: clawIdA, toClawId: clawIdB, domain: '_overall', qScore: 0.8 })
      const affected = await trustRepo.decayAllQ(0.99)
      expect(affected).toBe(1)
      const record = await trustRepo.get(clawIdA, clawIdB, '_overall')
      expect(record!.qScore).toBeCloseTo(0.8 * 0.99, 5)
    })

    it('should not affect h_score during decay', async () => {
      await trustRepo.upsert({ fromClawId: clawIdA, toClawId: clawIdB, domain: '_overall', hScore: 0.9 })
      await trustRepo.decayAllQ(0.99)
      const record = await trustRepo.get(clawIdA, clawIdB, '_overall')
      expect(record!.hScore).toBe(0.9)  // H 不衰减
    })

    it('should decay only specified fromClawId when provided', async () => {
      await trustRepo.upsert({ fromClawId: clawIdA, toClawId: clawIdB, domain: '_overall', qScore: 0.8 })
      await trustRepo.upsert({ fromClawId: clawIdB, toClawId: clawIdA, domain: '_overall', qScore: 0.8 })
      await trustRepo.decayAllQ(0.99, clawIdA)
      const recordA = await trustRepo.get(clawIdA, clawIdB, '_overall')
      const recordB = await trustRepo.get(clawIdB, clawIdA, '_overall')
      expect(recordA!.qScore).toBeCloseTo(0.8 * 0.99, 5)
      expect(recordB!.qScore).toBe(0.8)  // 未被衰减
    })
  })

  // ---- delete ----

  describe('delete', () => {
    it('should delete all trust records for a pair', async () => {
      await trustRepo.upsert({ fromClawId: clawIdA, toClawId: clawIdB, domain: '_overall' })
      await trustRepo.upsert({ fromClawId: clawIdA, toClawId: clawIdB, domain: 'AI' })
      await trustRepo.delete(clawIdA, clawIdB)
      const records = await trustRepo.getAllDomains(clawIdA, clawIdB)
      expect(records).toHaveLength(0)
    })

    it('should not affect other pairs on delete', async () => {
      await trustRepo.upsert({ fromClawId: clawIdA, toClawId: clawIdB, domain: '_overall' })
      await trustRepo.upsert({ fromClawId: clawIdA, toClawId: clawIdC, domain: '_overall' })
      await trustRepo.delete(clawIdA, clawIdB)
      const record = await trustRepo.get(clawIdA, clawIdC, '_overall')
      expect(record).not.toBeNull()
    })
  })

  // ---- getTopDomains ----

  describe('getTopDomains', () => {
    it('should return top domains by composite score', async () => {
      await trustRepo.upsert({ fromClawId: clawIdA, toClawId: clawIdB, domain: '_overall', composite: 0.5 })
      await trustRepo.upsert({ fromClawId: clawIdA, toClawId: clawIdB, domain: 'AI', composite: 0.85 })
      await trustRepo.upsert({ fromClawId: clawIdA, toClawId: clawIdB, domain: 'design', composite: 0.7 })
      const top = await trustRepo.getTopDomains(clawIdA, clawIdB, 2)
      expect(top).toHaveLength(2)
      expect(top[0].domain).toBe('AI')
      expect(top[0].composite).toBe(0.85)
      expect(top[1].domain).toBe('design')
    })
  })
})
