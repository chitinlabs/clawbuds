/**
 * HostNotifier + ReflexBatchProcessor 集成测试（Phase 5）
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { NoopNotifier } from '../../../src/services/host-notifier.js'
import { ReflexBatchProcessor } from '../../../src/services/reflex-batch-processor.js'
import { ReflexEngine } from '../../../src/services/reflex-engine.js'
import { vi } from 'vitest'

describe('HostNotifier + ReflexBatchProcessor integration', () => {
  it('NoopNotifier isAvailable() returns true', async () => {
    const notifier = new NoopNotifier()
    expect(await notifier.isAvailable()).toBe(true)
  })

  it('ReflexBatchProcessor can be injected into ReflexEngine via activateLayer1', () => {
    const mockExecRepo = {
      create: vi.fn(), findRecent: vi.fn(), findByResult: vi.fn(),
      getStats: vi.fn(), findAlerts: vi.fn(), deleteOlderThan: vi.fn(),
    } as any
    const notifier = new NoopNotifier()
    const processor = new ReflexBatchProcessor(mockExecRepo, notifier, { batchSize: 10, maxWaitMs: 600000 })

    const engine = new ReflexEngine(
      {} as any, mockExecRepo, {} as any, {} as any, {} as any,
      { on: vi.fn(), emit: vi.fn() } as any,
    )

    expect(engine.isLayer1Active()).toBe(false)
    engine.activateLayer1(processor)
    expect(engine.isLayer1Active()).toBe(true)
  })

  it('getPendingL1Status returns correct structure after activateLayer1', () => {
    const mockExecRepo = {
      create: vi.fn(), findRecent: vi.fn(), findByResult: vi.fn(),
      getStats: vi.fn(), findAlerts: vi.fn(), deleteOlderThan: vi.fn(),
    } as any
    const notifier = new NoopNotifier()
    const processor = new ReflexBatchProcessor(mockExecRepo, notifier)

    const engine = new ReflexEngine(
      {} as any, mockExecRepo, {} as any, {} as any, {} as any,
      { on: vi.fn(), emit: vi.fn() } as any,
    )
    engine.activateLayer1(processor)

    const status = engine.getPendingL1Status('claw-a')
    expect(status.queueSize).toBe(0)
    expect(status.hostAvailable).toBe(true)
  })
})
