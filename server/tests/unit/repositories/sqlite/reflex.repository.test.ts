/**
 * SQLite ReflexRepository + ReflexExecutionRepository Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../../../src/db/database.js'
import { SQLiteReflexRepository } from '../../../../src/db/repositories/sqlite/reflex.repository.js'
import { SQLiteReflexExecutionRepository } from '../../../../src/db/repositories/sqlite/reflex-execution.repository.js'
import { SQLiteClawRepository } from '../../../../src/db/repositories/sqlite/claw.repository.js'
import { randomUUID } from 'node:crypto'

const makeReflexData = (clawId: string, overrides: Partial<{
  name: string
  valueLayer: 'cognitive' | 'emotional' | 'expression' | 'collaboration' | 'infrastructure'
  behavior: 'keepalive' | 'sense' | 'route' | 'crystallize' | 'track' | 'collect' | 'alert' | 'audit'
  triggerLayer: 0 | 1
  triggerConfig: Record<string, unknown>
  enabled: boolean
  confidence: number
  source: 'builtin' | 'user' | 'micro_molt'
}> = {}) => ({
  id: randomUUID(),
  clawId,
  name: 'keepalive_heartbeat',
  valueLayer: 'infrastructure' as const,
  behavior: 'keepalive' as const,
  triggerLayer: 0 as const,
  triggerConfig: { type: 'timer', intervalMs: 300000 },
  enabled: true,
  confidence: 1.0,
  source: 'builtin' as const,
  ...overrides,
})

describe('SQLiteReflexRepository', () => {
  let db: Database.Database
  let repo: SQLiteReflexRepository
  let clawRepo: SQLiteClawRepository
  let clawId: string

  beforeEach(async () => {
    db = createTestDatabase()
    repo = new SQLiteReflexRepository(db)
    clawRepo = new SQLiteClawRepository(db)
    const claw = await clawRepo.register({ publicKey: 'pk-a', displayName: 'Alice' })
    clawId = claw.clawId
  })

  afterEach(() => db.close())

  // ─── create ─────────────────────────────────────────────────────────────
  describe('create', () => {
    it('should create a reflex record', async () => {
      const data = makeReflexData(clawId)
      const result = await repo.create(data)
      expect(result.id).toBe(data.id)
      expect(result.clawId).toBe(clawId)
      expect(result.name).toBe('keepalive_heartbeat')
      expect(result.triggerConfig).toEqual({ type: 'timer', intervalMs: 300000 })
      expect(result.enabled).toBe(true)
      expect(result.confidence).toBe(1.0)
      expect(result.source).toBe('builtin')
      expect(result.createdAt).toBeTruthy()
    })
  })

  // ─── findByName ──────────────────────────────────────────────────────────
  describe('findByName', () => {
    it('should return null for non-existent reflex', async () => {
      const result = await repo.findByName(clawId, 'non_existent')
      expect(result).toBeNull()
    })

    it('should find reflex by name', async () => {
      await repo.create(makeReflexData(clawId))
      const result = await repo.findByName(clawId, 'keepalive_heartbeat')
      expect(result).not.toBeNull()
      expect(result!.name).toBe('keepalive_heartbeat')
    })
  })

  // ─── findEnabled ─────────────────────────────────────────────────────────
  describe('findEnabled', () => {
    it('should return only enabled reflexes', async () => {
      await repo.create(makeReflexData(clawId, { name: 'reflex_a', enabled: true }))
      await repo.create(makeReflexData(clawId, { name: 'reflex_b', enabled: false }))
      const result = await repo.findEnabled(clawId)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('reflex_a')
    })

    it('should filter by triggerLayer', async () => {
      await repo.create(makeReflexData(clawId, { name: 'layer0', triggerLayer: 0 }))
      await repo.create(makeReflexData(clawId, { name: 'layer1', triggerLayer: 1, behavior: 'sense' }))
      const layer0 = await repo.findEnabled(clawId, 0)
      expect(layer0).toHaveLength(1)
      expect(layer0[0].name).toBe('layer0')
    })
  })

  // ─── findAll ─────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('should return all reflexes including disabled', async () => {
      await repo.create(makeReflexData(clawId, { name: 'reflex_a', enabled: true }))
      await repo.create(makeReflexData(clawId, { name: 'reflex_b', enabled: false }))
      const result = await repo.findAll(clawId)
      expect(result).toHaveLength(2)
    })

    it('should return empty array when no reflexes', async () => {
      const result = await repo.findAll(clawId)
      expect(result).toHaveLength(0)
    })
  })

  // ─── setEnabled ──────────────────────────────────────────────────────────
  describe('setEnabled', () => {
    it('should disable an enabled reflex', async () => {
      await repo.create(makeReflexData(clawId))
      await repo.setEnabled(clawId, 'keepalive_heartbeat', false)
      const result = await repo.findByName(clawId, 'keepalive_heartbeat')
      expect(result!.enabled).toBe(false)
    })

    it('should enable a disabled reflex', async () => {
      await repo.create(makeReflexData(clawId, { enabled: false }))
      await repo.setEnabled(clawId, 'keepalive_heartbeat', true)
      const result = await repo.findByName(clawId, 'keepalive_heartbeat')
      expect(result!.enabled).toBe(true)
    })
  })

  // ─── updateConfidence ────────────────────────────────────────────────────
  describe('updateConfidence', () => {
    it('should update confidence value', async () => {
      await repo.create(makeReflexData(clawId))
      await repo.updateConfidence(clawId, 'keepalive_heartbeat', 0.75)
      const result = await repo.findByName(clawId, 'keepalive_heartbeat')
      expect(result!.confidence).toBe(0.75)
    })
  })

  // ─── updateConfig ────────────────────────────────────────────────────────
  describe('updateConfig', () => {
    it('should update trigger config', async () => {
      await repo.create(makeReflexData(clawId))
      const newConfig = { type: 'timer', intervalMs: 600000 }
      await repo.updateConfig(clawId, 'keepalive_heartbeat', newConfig)
      const result = await repo.findByName(clawId, 'keepalive_heartbeat')
      expect(result!.triggerConfig).toEqual(newConfig)
    })
  })

  // ─── upsertBuiltins ──────────────────────────────────────────────────────
  describe('upsertBuiltins', () => {
    it('should create builtin reflexes', async () => {
      const builtins = [
        { clawId, name: 'r1', valueLayer: 'infrastructure' as const, behavior: 'keepalive' as const, triggerLayer: 0 as const, triggerConfig: {}, enabled: true, confidence: 1.0, source: 'builtin' as const },
        { clawId, name: 'r2', valueLayer: 'emotional' as const, behavior: 'audit' as const, triggerLayer: 0 as const, triggerConfig: {}, enabled: true, confidence: 0.7, source: 'builtin' as const },
      ]
      await repo.upsertBuiltins(clawId, builtins)
      const all = await repo.findAll(clawId)
      expect(all).toHaveLength(2)
    })

    it('should be idempotent (upsert on duplicate name)', async () => {
      const builtin = { clawId, name: 'r1', valueLayer: 'infrastructure' as const, behavior: 'keepalive' as const, triggerLayer: 0 as const, triggerConfig: {}, enabled: true, confidence: 1.0, source: 'builtin' as const }
      await repo.upsertBuiltins(clawId, [builtin])
      await expect(repo.upsertBuiltins(clawId, [builtin])).resolves.not.toThrow()
      const all = await repo.findAll(clawId)
      expect(all).toHaveLength(1)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('SQLiteReflexExecutionRepository', () => {
  let db: Database.Database
  let repo: SQLiteReflexExecutionRepository
  let reflexRepo: SQLiteReflexRepository
  let clawRepo: SQLiteClawRepository
  let clawId: string
  let reflexId: string

  beforeEach(async () => {
    db = createTestDatabase()
    repo = new SQLiteReflexExecutionRepository(db)
    reflexRepo = new SQLiteReflexRepository(db)
    clawRepo = new SQLiteClawRepository(db)
    const claw = await clawRepo.register({ publicKey: 'pk-a', displayName: 'Alice' })
    clawId = claw.clawId
    const reflex = await reflexRepo.create({
      id: randomUUID(),
      clawId,
      name: 'keepalive_heartbeat',
      valueLayer: 'infrastructure',
      behavior: 'keepalive',
      triggerLayer: 0,
      triggerConfig: {},
      enabled: true,
      confidence: 1.0,
      source: 'builtin',
    })
    reflexId = reflex.id
  })

  afterEach(() => db.close())

  // ─── create ───────────────────────────────────────────────────────────────
  describe('create', () => {
    it('should create an execution record', async () => {
      const result = await repo.create({
        id: randomUUID(),
        reflexId,
        clawId,
        eventType: 'timer.tick',
        triggerData: { intervalMs: 300000 },
        executionResult: 'executed',
        details: { action: 'heartbeat_sent' },
      })
      expect(result.reflexId).toBe(reflexId)
      expect(result.clawId).toBe(clawId)
      expect(result.eventType).toBe('timer.tick')
      expect(result.executionResult).toBe('executed')
      expect(result.details).toEqual({ action: 'heartbeat_sent' })
      expect(result.createdAt).toBeTruthy()
    })
  })

  // ─── findRecent ───────────────────────────────────────────────────────────
  describe('findRecent', () => {
    it('should return recent executions', async () => {
      await repo.create({ id: randomUUID(), reflexId, clawId, eventType: 'test', triggerData: {}, executionResult: 'executed', details: {} })
      await repo.create({ id: randomUUID(), reflexId, clawId, eventType: 'test', triggerData: {}, executionResult: 'blocked', details: {} })
      const result = await repo.findRecent(clawId, 10)
      expect(result).toHaveLength(2)
    })

    it('should respect limit', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.create({ id: randomUUID(), reflexId, clawId, eventType: 'test', triggerData: {}, executionResult: 'executed', details: {} })
      }
      const result = await repo.findRecent(clawId, 3)
      expect(result).toHaveLength(3)
    })
  })

  // ─── findByResult ─────────────────────────────────────────────────────────
  describe('findByResult', () => {
    it('should filter by execution result', async () => {
      await repo.create({ id: randomUUID(), reflexId, clawId, eventType: 'test', triggerData: {}, executionResult: 'executed', details: {} })
      await repo.create({ id: randomUUID(), reflexId, clawId, eventType: 'test', triggerData: {}, executionResult: 'blocked', details: {} })
      const blocked = await repo.findByResult(clawId, 'blocked')
      expect(blocked).toHaveLength(1)
      expect(blocked[0].executionResult).toBe('blocked')
    })
  })

  // ─── getStats ─────────────────────────────────────────────────────────────
  describe('getStats', () => {
    it('should return correct stats', async () => {
      await repo.create({ id: randomUUID(), reflexId, clawId, eventType: 'test', triggerData: {}, executionResult: 'executed', details: {} })
      await repo.create({ id: randomUUID(), reflexId, clawId, eventType: 'test', triggerData: {}, executionResult: 'executed', details: {} })
      await repo.create({ id: randomUUID(), reflexId, clawId, eventType: 'test', triggerData: {}, executionResult: 'blocked', details: {} })
      await repo.create({ id: randomUUID(), reflexId, clawId, eventType: 'test', triggerData: {}, executionResult: 'queued_for_l1', details: {} })
      const stats = await repo.getStats(reflexId)
      expect(stats.total).toBe(4)
      expect(stats.executed).toBe(2)
      expect(stats.blocked).toBe(1)
      expect(stats.queuedForL1).toBe(1)
    })
  })

  // ─── findAlerts ───────────────────────────────────────────────────────────
  describe('findAlerts', () => {
    it('should return alert type executions', async () => {
      const alertReflex = await reflexRepo.create({
        id: randomUUID(), clawId, name: 'relationship_decay_alert',
        valueLayer: 'infrastructure', behavior: 'alert',
        triggerLayer: 0, triggerConfig: {}, enabled: true, confidence: 1.0, source: 'builtin',
      })
      await repo.create({ id: randomUUID(), reflexId: alertReflex.id, clawId, eventType: 'relationship.layer_changed', triggerData: {}, executionResult: 'executed', details: { alertType: 'relationship_downgrade' } })
      await repo.create({ id: randomUUID(), reflexId, clawId, eventType: 'timer.tick', triggerData: {}, executionResult: 'executed', details: {} })

      const alerts = await repo.findAlerts(clawId)
      // Should only return executions from alert behavior reflex
      expect(alerts.some(a => a.details['alertType'] === 'relationship_downgrade')).toBe(true)
    })
  })

  // ─── deleteOlderThan ─────────────────────────────────────────────────────
  describe('deleteOlderThan', () => {
    it('should delete old records and return count', async () => {
      await repo.create({ id: randomUUID(), reflexId, clawId, eventType: 'test', triggerData: {}, executionResult: 'executed', details: {} })
      // Delete records older than far future date (deletes all)
      const futureDate = new Date(Date.now() + 86400000).toISOString()
      const deleted = await repo.deleteOlderThan(futureDate)
      expect(deleted).toBe(1)
    })

    it('should not delete records newer than cutoff', async () => {
      await repo.create({ id: randomUUID(), reflexId, clawId, eventType: 'test', triggerData: {}, executionResult: 'executed', details: {} })
      const pastDate = new Date(Date.now() - 86400000).toISOString()
      const deleted = await repo.deleteOlderThan(pastDate)
      expect(deleted).toBe(0)
    })
  })
})
