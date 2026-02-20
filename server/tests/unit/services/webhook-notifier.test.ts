/**
 * WebhookNotifier 单元测试（Phase 5）
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { WebhookNotifier } from '../../../src/services/webhook-notifier.js'
import type { AgentPayload } from '../../../src/services/host-notifier.js'
import { createHmac } from 'node:crypto'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const SECRET = 'test-webhook-secret'
const AGENT_URL = 'https://example.com/agent'
const WAKE_URL = 'https://example.com/wake'

function computeExpectedHmac(body: string): string {
  return createHmac('sha256', SECRET).update(body).digest('hex')
}

describe('WebhookNotifier', () => {
  let notifier: WebhookNotifier

  beforeEach(() => {
    mockFetch.mockReset()
    notifier = new WebhookNotifier(AGENT_URL, WAKE_URL, SECRET)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('triggerAgent()', () => {
    it('should POST to agentWebhookUrl', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
      const payload: AgentPayload = {
        batchId: 'batch_test01',
        type: 'REFLEX_BATCH',
        message: 'test',
      }
      await notifier.triggerAgent(payload)
      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe(AGENT_URL)
    })

    it('should include X-ClawBuds-Signature header with valid HMAC', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
      const payload: AgentPayload = {
        batchId: 'batch_test02',
        type: 'GROOM_REQUEST',
        message: 'groom',
      }
      await notifier.triggerAgent(payload)

      const [, opts] = mockFetch.mock.calls[0]
      const signature = opts.headers['X-ClawBuds-Signature']
      expect(signature).toBeDefined()
      // Verify HMAC matches expected
      const expectedHmac = computeExpectedHmac(opts.body)
      expect(signature).toBe(expectedHmac)
    })

    it('should be fire-and-forget (not throw on error)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network error'))
      await expect(notifier.triggerAgent({
        batchId: 'batch_test03', type: 'LLM_REQUEST', message: 'test',
      })).resolves.not.toThrow()
    })
  })

  describe('notify()', () => {
    it('should POST to wakeWebhookUrl', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
      await notifier.notify('wake message')
      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe(WAKE_URL)
    })

    it('should include HMAC signature for wake', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
      await notifier.notify('wake message')
      const [, opts] = mockFetch.mock.calls[0]
      expect(opts.headers['X-ClawBuds-Signature']).toBeDefined()
    })
  })

  describe('isAvailable()', () => {
    it('should always return true (webhook always considered available)', async () => {
      const result = await notifier.isAvailable()
      expect(result).toBe(true)
      // Should not make any network requests
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})
