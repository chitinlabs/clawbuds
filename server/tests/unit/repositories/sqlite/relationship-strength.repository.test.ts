/**
 * SQLite RelationshipStrengthRepository Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../../../src/db/database.js'
import { SQLiteRelationshipStrengthRepository } from '../../../../src/db/repositories/sqlite/relationship-strength.repository.js'
import { SQLiteClawRepository } from '../../../../src/db/repositories/sqlite/claw.repository.js'

// 简单线性衰减率，用于测试
const testDecayRate = (strength: number) => 0.99

describe('SQLiteRelationshipStrengthRepository', () => {
  let db: Database.Database
  let repo: SQLiteRelationshipStrengthRepository
  let clawRepo: SQLiteClawRepository
  let clawAId: string
  let clawBId: string
  let clawCId: string

  beforeEach(async () => {
    db = createTestDatabase()
    repo = new SQLiteRelationshipStrengthRepository(db)
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
  // create + get
  // ─────────────────────────────────────────────
  describe('create and get', () => {
    it('should create a relationship strength record', async () => {
      await repo.create({
        clawId: clawAId,
        friendId: clawBId,
        strength: 0.5,
        dunbarLayer: 'casual',
      })

      const record = await repo.get(clawAId, clawBId)
      expect(record).not.toBeNull()
      expect(record!.clawId).toBe(clawAId)
      expect(record!.friendId).toBe(clawBId)
      expect(record!.strength).toBe(0.5)
      expect(record!.dunbarLayer).toBe('casual')
      expect(record!.manualOverride).toBe(false)
      expect(record!.lastInteractionAt).toBeNull()
    })

    it('should return null when record does not exist', async () => {
      const result = await repo.get(clawAId, clawBId)
      expect(result).toBeNull()
    })

    it('should create records with different layers', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.9, dunbarLayer: 'core' })
      const rec = await repo.get(clawAId, clawBId)
      expect(rec!.dunbarLayer).toBe('core')
    })
  })

  // ─────────────────────────────────────────────
  // getAllForClaw
  // ─────────────────────────────────────────────
  describe('getAllForClaw', () => {
    it('should return empty array when no records', async () => {
      const results = await repo.getAllForClaw(clawAId)
      expect(results).toEqual([])
    })

    it('should return all records for a claw sorted by strength desc', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.3, dunbarLayer: 'casual' })
      await repo.create({ clawId: clawAId, friendId: clawCId, strength: 0.8, dunbarLayer: 'core' })

      const results = await repo.getAllForClaw(clawAId)
      expect(results).toHaveLength(2)
      expect(results[0].strength).toBe(0.8) // highest first
      expect(results[1].strength).toBe(0.3)
    })

    it('should not return records for other claws', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.5, dunbarLayer: 'casual' })

      const results = await repo.getAllForClaw(clawBId)
      expect(results).toEqual([])
    })
  })

  // ─────────────────────────────────────────────
  // updateStrength
  // ─────────────────────────────────────────────
  describe('updateStrength', () => {
    it('should update strength value', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.5, dunbarLayer: 'casual' })
      await repo.updateStrength(clawAId, clawBId, 0.75)

      const record = await repo.get(clawAId, clawBId)
      expect(record!.strength).toBeCloseTo(0.75)
    })

    it('should update updated_at when strength changes', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.5, dunbarLayer: 'casual' })
      const before = await repo.get(clawAId, clawBId)
      await new Promise((r) => setTimeout(r, 10))
      await repo.updateStrength(clawAId, clawBId, 0.8)
      const after = await repo.get(clawAId, clawBId)
      expect(after!.updatedAt >= before!.updatedAt).toBe(true)
    })
  })

  // ─────────────────────────────────────────────
  // updateLayer
  // ─────────────────────────────────────────────
  describe('updateLayer', () => {
    it('should update dunbar_layer and manual_override', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.5, dunbarLayer: 'casual' })
      await repo.updateLayer(clawAId, clawBId, 'core', true)

      const record = await repo.get(clawAId, clawBId)
      expect(record!.dunbarLayer).toBe('core')
      expect(record!.manualOverride).toBe(true)
    })
  })

  // ─────────────────────────────────────────────
  // touchInteraction
  // ─────────────────────────────────────────────
  describe('touchInteraction', () => {
    it('should set last_interaction_at to current time', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.5, dunbarLayer: 'casual' })
      expect((await repo.get(clawAId, clawBId))!.lastInteractionAt).toBeNull()

      await repo.touchInteraction(clawAId, clawBId)

      const record = await repo.get(clawAId, clawBId)
      expect(record!.lastInteractionAt).not.toBeNull()
    })
  })

  // ─────────────────────────────────────────────
  // decayAll
  // ─────────────────────────────────────────────
  describe('decayAll', () => {
    it('should decay all records and return affected count', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.5, dunbarLayer: 'casual' })
      await repo.create({ clawId: clawAId, friendId: clawCId, strength: 0.8, dunbarLayer: 'core' })

      const affected = await repo.decayAll(testDecayRate)
      expect(affected).toBe(2)
    })

    it('should reduce strength according to decay rate', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.5, dunbarLayer: 'casual' })
      await repo.decayAll(testDecayRate)

      const record = await repo.get(clawAId, clawBId)
      expect(record!.strength).toBeCloseTo(0.5 * 0.99)
    })

    it('should not let strength fall below 0.01', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.005, dunbarLayer: 'casual' })
      await repo.decayAll((_) => 0.5) // extremely aggressive decay

      const record = await repo.get(clawAId, clawBId)
      expect(record!.strength).toBeGreaterThanOrEqual(0.01)
    })
  })

  // ─────────────────────────────────────────────
  // getAtRisk
  // ─────────────────────────────────────────────
  describe('getAtRisk', () => {
    it('should return empty array when no at-risk relationships', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.9, dunbarLayer: 'core' })
      await repo.touchInteraction(clawAId, clawBId)

      const results = await repo.getAtRisk(clawAId, 0.05, 7)
      expect(results).toEqual([])
    })

    it('should return relationships close to next layer threshold with no recent interaction', async () => {
      // active 层下界 = 0.3，strength = 0.32，距离 margin = 0.02 < 0.05
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.32, dunbarLayer: 'active' })
      // 不设置 last_interaction_at，默认为 null（≥ inactiveDays 天无互动）

      const results = await repo.getAtRisk(clawAId, 0.05, 7)
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].friendId).toBe(clawBId)
    })

    it('should not flag relationships with recent interaction', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.32, dunbarLayer: 'active' })
      await repo.touchInteraction(clawAId, clawBId) // recent interaction

      const results = await repo.getAtRisk(clawAId, 0.05, 7)
      expect(results).toEqual([])
    })
  })

  // ─────────────────────────────────────────────
  // delete
  // ─────────────────────────────────────────────
  describe('delete', () => {
    it('should delete a relationship strength record', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.5, dunbarLayer: 'casual' })
      await repo.delete(clawAId, clawBId)

      const result = await repo.get(clawAId, clawBId)
      expect(result).toBeNull()
    })

    it('should not throw when deleting non-existent record', async () => {
      await expect(repo.delete(clawAId, clawBId)).resolves.toBeUndefined()
    })
  })
})
