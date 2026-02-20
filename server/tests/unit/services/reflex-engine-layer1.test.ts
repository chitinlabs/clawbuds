/**
 * ReflexEngine Layer 1 激活测试（Phase 5）
 * T23-T25: activateLayer1 / queueForLayer1 真实积累 / 4 个 Layer 1 内置 Reflex
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ReflexEngine } from '../../../src/services/reflex-engine.js'
import { ReflexBatchProcessor } from '../../../src/services/reflex-batch-processor.js'
import { NoopNotifier } from '../../../src/services/host-notifier.js'
import type {
  IReflexRepository,
  IReflexExecutionRepository,
  ReflexRecord,
  ReflexExecutionRecord,
} from '../../../src/db/repositories/interfaces/reflex.repository.interface.js'

function makeLayer1Reflex(name: string): ReflexRecord {
  return {
    id: `r-${name}`,
    clawId: 'claw-a',
    name,
    valueLayer: 'cognitive',
    behavior: 'sense',
    triggerLayer: 1,
    triggerConfig: { type: 'event_type', eventType: 'heartbeat.received' },
    enabled: true,
    confidence: 0.8,
    source: 'builtin',
    createdAt: '2026-02-20T00:00:00Z',
    updatedAt: '2026-02-20T00:00:00Z',
  }
}

function makeMockReflexRepo(reflexes: ReflexRecord[] = []): IReflexRepository {
  return {
    create: vi.fn(),
    findByName: vi.fn().mockResolvedValue(null),
    findEnabled: vi.fn().mockResolvedValue(reflexes),
    findAll: vi.fn().mockResolvedValue(reflexes),
    setEnabled: vi.fn(),
    updateConfidence: vi.fn(),
    updateConfig: vi.fn(),
    upsertBuiltins: vi.fn().mockResolvedValue(undefined),
  } as unknown as IReflexRepository
}

function makeMockExecRepo(): IReflexExecutionRepository {
  return {
    create: vi.fn().mockResolvedValue({ id: 'exec-1', executionResult: 'queued_for_l1', createdAt: new Date().toISOString() }),
    findRecent: vi.fn().mockResolvedValue([]),
    findByResult: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({ total: 0, executed: 0, blocked: 0, queuedForL1: 0 }),
    findAlerts: vi.fn().mockResolvedValue([]),
    deleteOlderThan: vi.fn().mockResolvedValue(0),
  } as unknown as IReflexExecutionRepository
}

describe('ReflexEngine Layer 1 (Phase 5)', () => {
  let engine: ReflexEngine
  let batchProcessor: ReflexBatchProcessor
  let reflexRepo: IReflexRepository
  let execRepo: IReflexExecutionRepository

  beforeEach(() => {
    reflexRepo = makeMockReflexRepo()
    execRepo = makeMockExecRepo()
    const notifier = new NoopNotifier()
    batchProcessor = new ReflexBatchProcessor(execRepo, notifier, { batchSize: 10, maxWaitMs: 600000 })

    engine = new ReflexEngine(
      reflexRepo,
      execRepo,
      {} as any,  // heartbeatService
      {} as any,  // reactionService
      {} as any,  // clawService
      { on: vi.fn(), emit: vi.fn() } as any,  // eventBus
    )
  })

  // ─── activateLayer1 ──────────────────────────────────────────────────────
  describe('activateLayer1()', () => {
    it('should set batchProcessor on engine', () => {
      engine.activateLayer1(batchProcessor)
      expect(engine.isLayer1Active()).toBe(true)
    })

    it('should be inactive before activateLayer1 is called', () => {
      expect(engine.isLayer1Active()).toBe(false)
    })
  })

  // ─── queueForLayer1 with batchProcessor ─────────────────────────────────
  describe('queueForLayer1 with active batchProcessor', () => {
    it('should enqueue into batchProcessor when Layer 1 is active', async () => {
      engine.activateLayer1(batchProcessor)
      const enqueueSpy = vi.spyOn(batchProcessor, 'enqueue')

      const l1Reflex = makeLayer1Reflex('sense_life_event')
      ;(reflexRepo.findEnabled as ReturnType<typeof vi.fn>).mockResolvedValue([l1Reflex])

      await engine.onEvent({
        type: 'heartbeat.received',
        clawId: 'claw-a',
        fromClawId: 'friend-1',
        toClawId: 'claw-a',
      })

      expect(enqueueSpy).toHaveBeenCalledOnce()
    })

    it('should NOT enqueue when Layer 1 is not active', async () => {
      const enqueueSpy = vi.spyOn(batchProcessor, 'enqueue')

      const l1Reflex = makeLayer1Reflex('sense_life_event')
      ;(reflexRepo.findEnabled as ReturnType<typeof vi.fn>).mockResolvedValue([l1Reflex])

      await engine.onEvent({
        type: 'heartbeat.received',
        clawId: 'claw-a',
        fromClawId: 'friend-1',
      })

      expect(enqueueSpy).not.toHaveBeenCalled()
    })
  })

  // ─── Layer 1 内置 Reflex ─────────────────────────────────────────────────
  describe('initializeLayer1Builtins()', () => {
    it('should call upsertBuiltins with 4 Layer 1 reflexes', async () => {
      const upsertSpy = reflexRepo.upsertBuiltins as ReturnType<typeof vi.fn>
      await engine.initializeLayer1Builtins('claw-a')
      expect(upsertSpy).toHaveBeenCalledOnce()
      const [clawId, builtins] = upsertSpy.mock.calls[0]
      expect(clawId).toBe('claw-a')
      expect(builtins).toHaveLength(4)
      const names = builtins.map((b: { name: string }) => b.name)
      expect(names).toContain('sense_life_event')
      expect(names).toContain('route_pearl_by_interest')
      expect(names).toContain('crystallize_from_conversation')
      expect(names).toContain('bridge_shared_experience')
      // All should be Layer 1
      builtins.forEach((b: { triggerLayer: number }) => {
        expect(b.triggerLayer).toBe(1)
      })
    })
  })
})
