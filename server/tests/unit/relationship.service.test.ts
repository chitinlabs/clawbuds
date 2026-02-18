/**
 * RelationshipService Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../src/db/database.js'
import { SQLiteRelationshipStrengthRepository } from '../../src/db/repositories/sqlite/relationship-strength.repository.js'
import { SQLiteClawRepository } from '../../src/db/repositories/sqlite/claw.repository.js'
import { RelationshipService } from '../../src/services/relationship.service.js'
import { EventBus } from '../../src/services/event-bus.js'

describe('RelationshipService', () => {
  let db: Database.Database
  let repo: SQLiteRelationshipStrengthRepository
  let clawRepo: SQLiteClawRepository
  let service: RelationshipService
  let eventBus: EventBus
  let clawAId: string
  let clawBId: string
  let clawCId: string

  beforeEach(async () => {
    db = createTestDatabase()
    repo = new SQLiteRelationshipStrengthRepository(db)
    clawRepo = new SQLiteClawRepository(db)
    eventBus = new EventBus()
    service = new RelationshipService(repo, eventBus)

    const a = await clawRepo.register({ publicKey: 'pk-a', displayName: 'Claw A' })
    const b = await clawRepo.register({ publicKey: 'pk-b', displayName: 'Claw B' })
    const c = await clawRepo.register({ publicKey: 'pk-c', displayName: 'Claw C' })
    clawAId = a.clawId
    clawBId = b.clawId
    clawCId = c.clawId
  })

  afterEach(() => {
    db.close()
    eventBus.removeAllListeners()
  })

  // ─────────────────────────────────────────────
  // initializeRelationship
  // ─────────────────────────────────────────────
  describe('initializeRelationship', () => {
    it('should create relationship with strength=0.5 and layer=casual', async () => {
      await service.initializeRelationship(clawAId, clawBId)

      const record = await repo.get(clawAId, clawBId)
      expect(record).not.toBeNull()
      expect(record!.strength).toBe(0.5)
      expect(record!.dunbarLayer).toBe('casual')
      expect(record!.manualOverride).toBe(false)
    })

    it('should not create duplicate if relationship already exists', async () => {
      await service.initializeRelationship(clawAId, clawBId)
      await service.initializeRelationship(clawAId, clawBId) // 重复调用

      const records = await repo.getAllForClaw(clawAId)
      expect(records).toHaveLength(1)
    })
  })

  // ─────────────────────────────────────────────
  // removeRelationship
  // ─────────────────────────────────────────────
  describe('removeRelationship', () => {
    it('should delete relationship record', async () => {
      await service.initializeRelationship(clawAId, clawBId)
      await service.removeRelationship(clawAId, clawBId)

      const record = await repo.get(clawAId, clawBId)
      expect(record).toBeNull()
    })
  })

  // ─────────────────────────────────────────────
  // boostStrength
  // ─────────────────────────────────────────────
  describe('boostStrength', () => {
    it('should increase strength on message interaction', async () => {
      await service.initializeRelationship(clawAId, clawBId)
      const before = (await repo.get(clawAId, clawBId))!.strength

      await service.boostStrength(clawAId, clawBId, 'message')

      const after = (await repo.get(clawAId, clawBId))!.strength
      expect(after).toBeGreaterThan(before)
    })

    it('should not exceed strength 1.0', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.99, dunbarLayer: 'core' })

      await service.boostStrength(clawAId, clawBId, 'message')

      const after = (await repo.get(clawAId, clawBId))!.strength
      expect(after).toBeLessThanOrEqual(1.0)
    })

    it('should respect daily boost cap (0.15)', async () => {
      await service.initializeRelationship(clawAId, clawBId)
      const initial = (await repo.get(clawAId, clawBId))!.strength

      // 发多次 message boost，每次 0.05，日上限 0.15
      // 应该在三次 message 后不再继续累加
      for (let i = 0; i < 10; i++) {
        await service.boostStrength(clawAId, clawBId, 'message')
      }

      const final = (await repo.get(clawAId, clawBId))!.strength
      // boost 总增量不超过 DAILY_BOOST_CAP = 0.15（加上自然衰减，约为 initial + 0.15）
      expect(final).toBeLessThanOrEqual(initial + 0.16) // small tolerance
    })

    it('should not boost non-existent relationship', async () => {
      // No-op, no error
      await expect(service.boostStrength(clawAId, clawBId, 'heartbeat')).resolves.toBeUndefined()
    })

    it('should set last_interaction_at when boost applied', async () => {
      await service.initializeRelationship(clawAId, clawBId)
      expect((await repo.get(clawAId, clawBId))!.lastInteractionAt).toBeNull()

      await service.boostStrength(clawAId, clawBId, 'reaction')

      expect((await repo.get(clawAId, clawBId))!.lastInteractionAt).not.toBeNull()
    })
  })

  // ─────────────────────────────────────────────
  // reclassifyLayers
  // ─────────────────────────────────────────────
  describe('reclassifyLayers', () => {
    it('should classify friend with strength ≥ 0.8 and top 5 as core', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.85, dunbarLayer: 'casual' })

      const changes = await service.reclassifyLayers(clawAId)

      expect(changes).toHaveLength(1)
      expect(changes[0].newLayer).toBe('core')

      const record = await repo.get(clawAId, clawBId)
      expect(record!.dunbarLayer).toBe('core')
    })

    it('should keep friend in casual when strength < 0.3', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.25, dunbarLayer: 'casual' })

      const changes = await service.reclassifyLayers(clawAId)
      expect(changes).toHaveLength(0)
    })

    it('should emit relationship.layer_changed event when layer changes', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.85, dunbarLayer: 'casual' })

      const events: any[] = []
      eventBus.on('relationship.layer_changed', (data) => events.push(data))

      await service.reclassifyLayers(clawAId)

      expect(events).toHaveLength(1)
      expect(events[0].newLayer).toBe('core')
      expect(events[0].oldLayer).toBe('casual')
    })

    it('should not emit event when layer did not change', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.85, dunbarLayer: 'core' })

      const events: any[] = []
      eventBus.on('relationship.layer_changed', (data) => events.push(data))

      await service.reclassifyLayers(clawAId)

      expect(events).toHaveLength(0)
    })

    it('should skip manual_override records', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.85, dunbarLayer: 'casual' })
      await repo.updateLayer(clawAId, clawBId, 'core', true) // manual override

      const changes = await service.reclassifyLayers(clawAId)
      // Should skip the manually overridden record
      expect(changes).toHaveLength(0)
    })

    it('should respect layer size limits (top 5 for core)', async () => {
      // 创建 6 个 strength ≥ 0.8 的好友
      const extraClaws = []
      for (let i = 0; i < 6; i++) {
        const claw = await clawRepo.register({ publicKey: `pk-extra-${i}`, displayName: `Extra ${i}` })
        extraClaws.push(claw.clawId)
        await repo.create({
          clawId: clawAId,
          friendId: claw.clawId,
          strength: 0.9 - i * 0.01,
          dunbarLayer: 'casual',
        })
      }

      await service.reclassifyLayers(clawAId)

      const allRecords = await repo.getAllForClaw(clawAId)
      const coreCount = allRecords.filter((r) => r.dunbarLayer === 'core').length
      expect(coreCount).toBeLessThanOrEqual(5)
    })
  })

  // ─────────────────────────────────────────────
  // getAtRiskRelationships
  // ─────────────────────────────────────────────
  describe('getAtRiskRelationships', () => {
    it('should return at-risk relationships close to threshold with no recent interaction', async () => {
      // active 层下界 = 0.3，strength = 0.32
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.32, dunbarLayer: 'active' })
      // 不设置互动时间（null = 无互动）

      const results = await service.getAtRiskRelationships(clawAId)
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].friendId).toBe(clawBId)
      expect(results[0].nextLayerThreshold).toBe(0.3)
    })

    it('should not return healthy relationships', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.9, dunbarLayer: 'core' })
      await repo.touchInteraction(clawAId, clawBId)

      const results = await service.getAtRiskRelationships(clawAId)
      expect(results).toHaveLength(0)
    })
  })

  // ─────────────────────────────────────────────
  // setManualLayer
  // ─────────────────────────────────────────────
  describe('setManualLayer', () => {
    it('should set manual_override = true and update layer', async () => {
      await service.initializeRelationship(clawAId, clawBId)
      await service.setManualLayer(clawAId, clawBId, 'core')

      const record = await repo.get(clawAId, clawBId)
      expect(record!.dunbarLayer).toBe('core')
      expect(record!.manualOverride).toBe(true)
    })
  })

  // ─────────────────────────────────────────────
  // getFriendsByLayer
  // ─────────────────────────────────────────────
  describe('getFriendsByLayer', () => {
    it('should group friends by dunbar layer', async () => {
      await repo.create({ clawId: clawAId, friendId: clawBId, strength: 0.9, dunbarLayer: 'core' })
      await repo.create({ clawId: clawAId, friendId: clawCId, strength: 0.4, dunbarLayer: 'active' })

      const grouped = await service.getFriendsByLayer(clawAId)
      expect(grouped.core).toHaveLength(1)
      expect(grouped.core[0].friendId).toBe(clawBId)
      expect(grouped.active).toHaveLength(1)
      expect(grouped.active[0].friendId).toBe(clawCId)
      expect(grouped.sympathy).toHaveLength(0)
      expect(grouped.casual).toHaveLength(0)
    })
  })
})
