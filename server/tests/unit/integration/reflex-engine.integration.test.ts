/**
 * ReflexEngine 集成联通性测试
 * 验证 timer.tick 事件 → keepalive_heartbeat Reflex → heartbeatService.sendHeartbeats
 */

import { describe, it, expect, vi } from 'vitest'
import { EventBus } from '../../../src/services/event-bus.js'
import { ReflexEngine, BUILTIN_REFLEXES } from '../../../src/services/reflex-engine.js'
import type { IReflexRepository, IReflexExecutionRepository } from '../../../src/db/repositories/interfaces/reflex.repository.interface.js'

describe('ReflexEngine 集成联通性', () => {
  it('timer.tick → keepalive_heartbeat → sendHeartbeats', async () => {
    const eventBus = new EventBus()
    const sendHeartbeats = vi.fn().mockResolvedValue(undefined)

    const keepaliveReflex = {
      ...BUILTIN_REFLEXES.find((r) => r.name === 'keepalive_heartbeat')!,
      id: 'r-1',
      clawId: 'claw-a',
      createdAt: '2026-02-19T00:00:00Z',
      updatedAt: '2026-02-19T00:00:00Z',
    }

    const reflexRepo: IReflexRepository = {
      create: vi.fn(),
      findByName: vi.fn(),
      findEnabled: vi.fn().mockResolvedValue([keepaliveReflex]),
      findAll: vi.fn(),
      setEnabled: vi.fn(),
      updateConfidence: vi.fn(),
      updateConfig: vi.fn(),
      upsertBuiltins: vi.fn(),
    }

    const execRepo: IReflexExecutionRepository = {
      create: vi.fn().mockResolvedValue({}),
      findRecent: vi.fn(),
      findByResult: vi.fn(),
      getStats: vi.fn(),
      findAlerts: vi.fn(),
      deleteOlderThan: vi.fn(),
    }

    const engine = new ReflexEngine(
      reflexRepo,
      execRepo,
      { sendHeartbeats } as any,
      {} as any,
      {} as any,
      eventBus,
    )

    engine.initialize()

    // Emit timer.tick event
    eventBus.emit('timer.tick', { clawId: 'claw-a', intervalMs: 300000, timestamp: '2026-02-19T00:00:00Z' })

    // Allow async handlers to complete
    await new Promise((r) => setTimeout(r, 20))

    expect(sendHeartbeats).toHaveBeenCalledWith('claw-a')
  })

  it('relationship.layer_changed downgrade → alert execution record created', async () => {
    const eventBus = new EventBus()
    const alertReflex = {
      ...BUILTIN_REFLEXES.find((r) => r.name === 'relationship_decay_alert')!,
      id: 'r-2',
      clawId: 'claw-b',
      createdAt: '2026-02-19T00:00:00Z',
      updatedAt: '2026-02-19T00:00:00Z',
    }

    const reflexRepo: IReflexRepository = {
      create: vi.fn(),
      findByName: vi.fn(),
      findEnabled: vi.fn().mockResolvedValue([alertReflex]),
      findAll: vi.fn(),
      setEnabled: vi.fn(),
      updateConfidence: vi.fn(),
      updateConfig: vi.fn(),
      upsertBuiltins: vi.fn(),
    }

    const createdRecord = vi.fn().mockResolvedValue({})
    const execRepo: IReflexExecutionRepository = {
      create: createdRecord,
      findRecent: vi.fn(),
      findByResult: vi.fn(),
      getStats: vi.fn(),
      findAlerts: vi.fn(),
      deleteOlderThan: vi.fn(),
    }

    const engine = new ReflexEngine(reflexRepo, execRepo, {} as any, {} as any, {} as any, eventBus)
    engine.initialize()

    eventBus.emit('relationship.layer_changed', {
      clawId: 'claw-b',
      friendId: 'friend-x',
      oldLayer: 'active',
      newLayer: 'casual',
      strength: 0.25,
    })

    await new Promise((r) => setTimeout(r, 20))

    expect(createdRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        executionResult: 'executed',
        details: expect.objectContaining({ alertType: 'relationship_downgrade' }),
      }),
    )
  })
})
