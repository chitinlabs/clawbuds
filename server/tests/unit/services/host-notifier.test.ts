/**
 * HostNotifier 接口 + NoopNotifier 单元测试（Phase 5）
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { HostNotifier, AgentPayload } from '../../../src/services/host-notifier.js'
import { NoopNotifier, createHostNotifier } from '../../../src/services/host-notifier.js'

describe('NoopNotifier', () => {
  let notifier: NoopNotifier

  beforeEach(() => {
    notifier = new NoopNotifier()
  })

  it('should implement HostNotifier interface', () => {
    expect(typeof notifier.notify).toBe('function')
    expect(typeof notifier.triggerAgent).toBe('function')
    expect(typeof notifier.isAvailable).toBe('function')
  })

  it('notify() should resolve without error', async () => {
    await expect(notifier.notify('test message')).resolves.not.toThrow()
  })

  it('triggerAgent() should resolve without error', async () => {
    const payload: AgentPayload = {
      batchId: 'batch_test',
      type: 'REFLEX_BATCH',
      message: 'test message',
    }
    await expect(notifier.triggerAgent(payload)).resolves.not.toThrow()
  })

  it('isAvailable() should always return true for noop', async () => {
    const result = await notifier.isAvailable()
    expect(result).toBe(true)
  })
})

describe('createHostNotifier', () => {
  it('should return NoopNotifier for type=noop', () => {
    const notifier = createHostNotifier({ type: 'noop' })
    expect(notifier).toBeInstanceOf(NoopNotifier)
  })

  it('should throw for unknown type', () => {
    expect(() => createHostNotifier({ type: 'unknown' as any })).toThrow()
  })
})
