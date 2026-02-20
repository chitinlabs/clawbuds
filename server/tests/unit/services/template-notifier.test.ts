/**
 * TemplateNotifier 降级策略单元测试（Phase 5）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TemplateNotifier } from '../../../src/services/template-notifier.js'
import type { AgentPayload } from '../../../src/services/host-notifier.js'

describe('TemplateNotifier', () => {
  let notifier: TemplateNotifier

  beforeEach(() => {
    notifier = new TemplateNotifier()
  })

  it('should implement HostNotifier interface', () => {
    expect(typeof notifier.notify).toBe('function')
    expect(typeof notifier.triggerAgent).toBe('function')
    expect(typeof notifier.isAvailable).toBe('function')
  })

  it('isAvailable() should return false (template = host unavailable)', async () => {
    const result = await notifier.isAvailable()
    expect(result).toBe(false)
  })

  it('triggerAgent() with REFLEX_BATCH should resolve without error', async () => {
    const payload: AgentPayload = {
      batchId: 'batch_test',
      type: 'REFLEX_BATCH',
      message: 'test batch',
    }
    await expect(notifier.triggerAgent(payload)).resolves.not.toThrow()
  })

  it('triggerAgent() with GROOM_REQUEST should resolve without error', async () => {
    const payload: AgentPayload = {
      batchId: 'batch_groom',
      type: 'GROOM_REQUEST',
      message: 'groom message',
    }
    await expect(notifier.triggerAgent(payload)).resolves.not.toThrow()
  })

  it('notify() should resolve without error', async () => {
    await expect(notifier.notify('test notification')).resolves.not.toThrow()
  })
})
