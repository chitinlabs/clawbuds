/**
 * ReflexBatchProcessor 单元测试（Phase 5）
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ReflexBatchProcessor } from '../../../src/services/reflex-batch-processor.js'
import { NoopNotifier } from '../../../src/services/host-notifier.js'
import type { IReflexExecutionRepository } from '../../../src/db/repositories/interfaces/reflex.repository.interface.js'

function makeMockExecutionRepo(): IReflexExecutionRepository {
  return {
    create: vi.fn().mockResolvedValue({ id: 'exec-1', executionResult: 'queued_for_l1', createdAt: new Date().toISOString() }),
    findRecent: vi.fn().mockResolvedValue([]),
    findByResult: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({ total: 0, executed: 0, blocked: 0, queuedForL1: 0 }),
    findAlerts: vi.fn().mockResolvedValue([]),
    deleteOlderThan: vi.fn().mockResolvedValue(0),
  } as unknown as IReflexExecutionRepository
}

describe('ReflexBatchProcessor', () => {
  let processor: ReflexBatchProcessor
  let mockNotifier: NoopNotifier
  let mockExecRepo: IReflexExecutionRepository

  beforeEach(() => {
    mockExecRepo = makeMockExecutionRepo()
    mockNotifier = new NoopNotifier()
    processor = new ReflexBatchProcessor(mockExecRepo, mockNotifier, {
      batchSize: 3,
      maxWaitMs: 60000,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ─── enqueue ──────────────────────────────────────────────────────────────
  describe('enqueue()', () => {
    it('should add items to queue', () => {
      processor.enqueue({ reflexId: 'ref-1', reflexName: 'sense_life_event', clawId: 'claw-a', eventType: 'heartbeat.received', triggerData: {} })
      expect(processor.queueSize()).toBe(1)
    })

    it('should accumulate multiple items', () => {
      processor.enqueue({ reflexId: 'ref-1', reflexName: 'sense_life_event', clawId: 'claw-a', eventType: 'heartbeat.received', triggerData: {} })
      processor.enqueue({ reflexId: 'ref-2', reflexName: 'route_pearl_by_interest', clawId: 'claw-a', eventType: 'heartbeat.received', triggerData: {} })
      expect(processor.queueSize()).toBe(2)
    })
  })

  // ─── shouldTrigger ────────────────────────────────────────────────────────
  describe('shouldTrigger()', () => {
    it('should return false when queue is empty', async () => {
      expect(await processor.shouldTrigger()).toBe(false)
    })

    it('should return true when queue reaches batchSize', async () => {
      for (let i = 0; i < 3; i++) {
        processor.enqueue({ reflexId: `ref-${i}`, reflexName: 'sense_life_event', clawId: 'claw-a', eventType: 'heartbeat.received', triggerData: {} })
      }
      expect(await processor.shouldTrigger()).toBe(true)
    })

    it('should return false when below batchSize and not timed out', async () => {
      processor.enqueue({ reflexId: 'ref-1', reflexName: 'sense_life_event', clawId: 'claw-a', eventType: 'heartbeat.received', triggerData: {} })
      expect(await processor.shouldTrigger()).toBe(false)
    })

    it('should return true when maxWaitMs exceeded', async () => {
      // Create processor with very short wait time
      const fastProcessor = new ReflexBatchProcessor(mockExecRepo, mockNotifier, {
        batchSize: 100,
        maxWaitMs: 0,  // immediately trigger on any item
      })
      fastProcessor.enqueue({ reflexId: 'ref-1', reflexName: 'sense_life_event', clawId: 'claw-a', eventType: 'heartbeat.received', triggerData: {} })
      expect(await fastProcessor.shouldTrigger()).toBe(true)
    })
  })

  // ─── triggerBatch ─────────────────────────────────────────────────────────
  describe('triggerBatch()', () => {
    it('should clear queue after triggering', async () => {
      vi.spyOn(mockNotifier, 'triggerAgent').mockResolvedValue(undefined)
      processor.enqueue({ reflexId: 'ref-1', reflexName: 'sense_life_event', clawId: 'claw-a', eventType: 'heartbeat.received', triggerData: {} })

      await processor.triggerBatch('claw-a')
      expect(processor.queueSize()).toBe(0)
    })

    it('should return a batchId with batch_ prefix', async () => {
      vi.spyOn(mockNotifier, 'triggerAgent').mockResolvedValue(undefined)
      processor.enqueue({ reflexId: 'ref-1', reflexName: 'sense_life_event', clawId: 'claw-a', eventType: 'heartbeat.received', triggerData: {} })

      const batchId = await processor.triggerBatch('claw-a')
      expect(batchId).toMatch(/^batch_/)
    })

    it('should call hostNotifier.triggerAgent with REFLEX_BATCH type', async () => {
      const triggerSpy = vi.spyOn(mockNotifier, 'triggerAgent').mockResolvedValue(undefined)
      processor.enqueue({ reflexId: 'ref-1', reflexName: 'sense_life_event', clawId: 'claw-a', eventType: 'heartbeat.received', triggerData: {} })

      await processor.triggerBatch('claw-a')
      expect(triggerSpy).toHaveBeenCalledOnce()
      const [payload] = triggerSpy.mock.calls[0]
      expect(payload.type).toBe('REFLEX_BATCH')
      expect(payload.message).toContain('sense_life_event')
    })
  })

  // ─── acknowledgeBatch ─────────────────────────────────────────────────────
  describe('acknowledgeBatch()', () => {
    it('should call executionRepo.findByResult to find dispatched items', async () => {
      const findSpy = vi.spyOn(mockExecRepo, 'findByResult').mockResolvedValue([])
      await processor.acknowledgeBatch('batch_test01')
      expect(findSpy).toHaveBeenCalled()
    })
  })
})
