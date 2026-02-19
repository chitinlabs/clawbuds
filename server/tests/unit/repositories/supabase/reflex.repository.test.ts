/**
 * Supabase ReflexRepository + ReflexExecutionRepository Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SupabaseReflexRepository } from '../../../../src/db/repositories/supabase/reflex.repository.js'
import { SupabaseReflexExecutionRepository } from '../../../../src/db/repositories/supabase/reflex-execution.repository.js'
import {
  createMockSupabaseClient,
  successBuilder,
  notFoundBuilder,
  errorBuilder,
} from './mock-supabase-client.js'

const reflexRow = {
  id: 'uuid-reflex-1',
  claw_id: 'claw-a',
  name: 'keepalive_heartbeat',
  value_layer: 'infrastructure',
  behavior: 'keepalive',
  trigger_layer: 0,
  trigger_config: { type: 'timer', intervalMs: 300000 },
  enabled: true,
  confidence: 1.0,
  source: 'builtin',
  created_at: '2026-02-19T00:00:00Z',
  updated_at: '2026-02-19T00:00:00Z',
}

const executionRow = {
  id: 'uuid-exec-1',
  reflex_id: 'uuid-reflex-1',
  claw_id: 'claw-a',
  event_type: 'timer.tick',
  trigger_data: { intervalMs: 300000 },
  execution_result: 'executed',
  details: { action: 'heartbeat_sent' },
  created_at: '2026-02-19T00:00:00Z',
}

describe('SupabaseReflexRepository', () => {
  let repo: SupabaseReflexRepository
  let mockFrom: ReturnType<typeof createMockSupabaseClient>['mockFrom']
  let client: any

  beforeEach(() => {
    const mock = createMockSupabaseClient()
    client = mock.client
    mockFrom = mock.mockFrom
    repo = new SupabaseReflexRepository(client)
  })

  describe('create', () => {
    it('should create and return reflex record', async () => {
      mockFrom('reflexes', successBuilder(reflexRow))
      const result = await repo.create({
        id: 'uuid-reflex-1',
        clawId: 'claw-a',
        name: 'keepalive_heartbeat',
        valueLayer: 'infrastructure',
        behavior: 'keepalive',
        triggerLayer: 0,
        triggerConfig: { type: 'timer', intervalMs: 300000 },
        enabled: true,
        confidence: 1.0,
        source: 'builtin',
      })
      expect(result.id).toBe('uuid-reflex-1')
      expect(result.clawId).toBe('claw-a')
      expect(result.triggerConfig).toEqual({ type: 'timer', intervalMs: 300000 })
      expect(result.enabled).toBe(true)
    })

    it('should throw on error', async () => {
      mockFrom('reflexes', errorBuilder('insert failed'))
      await expect(repo.create({
        id: 'x', clawId: 'c', name: 'n', valueLayer: 'infrastructure',
        behavior: 'keepalive', triggerLayer: 0, triggerConfig: {},
        enabled: true, confidence: 1.0, source: 'builtin',
      })).rejects.toThrow()
    })
  })

  describe('findByName', () => {
    it('should return null when not found', async () => {
      mockFrom('reflexes', notFoundBuilder())
      const result = await repo.findByName('claw-a', 'non_existent')
      expect(result).toBeNull()
    })

    it('should return record when found', async () => {
      mockFrom('reflexes', successBuilder(reflexRow))
      const result = await repo.findByName('claw-a', 'keepalive_heartbeat')
      expect(result).not.toBeNull()
      expect(result!.name).toBe('keepalive_heartbeat')
    })
  })

  describe('findEnabled', () => {
    it('should return enabled reflexes', async () => {
      mockFrom('reflexes', successBuilder([reflexRow]))
      const result = await repo.findEnabled('claw-a')
      expect(result).toHaveLength(1)
      expect(result[0].enabled).toBe(true)
    })

    it('should return empty array when none', async () => {
      mockFrom('reflexes', successBuilder([]))
      const result = await repo.findEnabled('claw-a')
      expect(result).toEqual([])
    })
  })

  describe('findAll', () => {
    it('should return all reflexes', async () => {
      mockFrom('reflexes', successBuilder([reflexRow]))
      const result = await repo.findAll('claw-a')
      expect(result).toHaveLength(1)
    })
  })

  describe('setEnabled', () => {
    it('should not throw on success', async () => {
      mockFrom('reflexes', successBuilder(null))
      await expect(repo.setEnabled('claw-a', 'keepalive_heartbeat', false)).resolves.not.toThrow()
    })
  })

  describe('updateConfidence', () => {
    it('should not throw on success', async () => {
      mockFrom('reflexes', successBuilder(null))
      await expect(repo.updateConfidence('claw-a', 'keepalive_heartbeat', 0.75)).resolves.not.toThrow()
    })
  })

  describe('updateConfig', () => {
    it('should not throw on success', async () => {
      mockFrom('reflexes', successBuilder(null))
      await expect(repo.updateConfig('claw-a', 'keepalive_heartbeat', { type: 'timer' })).resolves.not.toThrow()
    })
  })

  describe('upsertBuiltins', () => {
    it('should not throw on success', async () => {
      mockFrom('reflexes', successBuilder(null))
      await expect(repo.upsertBuiltins('claw-a', [{
        clawId: 'claw-a', name: 'r1', valueLayer: 'infrastructure',
        behavior: 'keepalive', triggerLayer: 0, triggerConfig: {},
        enabled: true, confidence: 1.0, source: 'builtin',
      }])).resolves.not.toThrow()
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('SupabaseReflexExecutionRepository', () => {
  let repo: SupabaseReflexExecutionRepository
  let mockFrom: ReturnType<typeof createMockSupabaseClient>['mockFrom']
  let client: any

  beforeEach(() => {
    const mock = createMockSupabaseClient()
    client = mock.client
    mockFrom = mock.mockFrom
    repo = new SupabaseReflexExecutionRepository(client)
  })

  describe('create', () => {
    it('should create and return execution record', async () => {
      mockFrom('reflex_executions', successBuilder(executionRow))
      const result = await repo.create({
        id: 'uuid-exec-1',
        reflexId: 'uuid-reflex-1',
        clawId: 'claw-a',
        eventType: 'timer.tick',
        triggerData: {},
        executionResult: 'executed',
        details: {},
      })
      expect(result.id).toBe('uuid-exec-1')
      expect(result.executionResult).toBe('executed')
    })
  })

  describe('findRecent', () => {
    it('should return recent executions', async () => {
      mockFrom('reflex_executions', successBuilder([executionRow]))
      const result = await repo.findRecent('claw-a', 10)
      expect(result).toHaveLength(1)
    })

    it('should return empty when none', async () => {
      mockFrom('reflex_executions', successBuilder([]))
      const result = await repo.findRecent('claw-a', 10)
      expect(result).toEqual([])
    })
  })

  describe('findByResult', () => {
    it('should filter by execution result', async () => {
      mockFrom('reflex_executions', successBuilder([executionRow]))
      const result = await repo.findByResult('claw-a', 'executed')
      expect(result).toHaveLength(1)
    })
  })

  describe('getStats', () => {
    it('should return stats', async () => {
      mockFrom('reflex_executions', successBuilder([
        { execution_result: 'executed' },
        { execution_result: 'executed' },
        { execution_result: 'blocked' },
      ]))
      const stats = await repo.getStats('uuid-reflex-1')
      expect(stats.total).toBe(3)
      expect(stats.executed).toBe(2)
      expect(stats.blocked).toBe(1)
      expect(stats.queuedForL1).toBe(0)
    })
  })

  describe('findAlerts', () => {
    it('should return alert executions', async () => {
      mockFrom('reflex_executions', successBuilder([executionRow]))
      const result = await repo.findAlerts('claw-a')
      expect(result).toBeDefined()
    })
  })

  describe('deleteOlderThan', () => {
    it('should return count of deleted records', async () => {
      mockFrom('reflex_executions', successBuilder([{}, {}]))
      const count = await repo.deleteOlderThan('2026-01-01T00:00:00Z')
      expect(typeof count).toBe('number')
    })
  })
})
