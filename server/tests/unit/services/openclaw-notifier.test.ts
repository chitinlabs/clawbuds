/**
 * OpenClawNotifier 单元测试（Phase 5）
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { OpenClawNotifier } from '../../../src/services/openclaw-notifier.js'
import type { AgentPayload } from '../../../src/services/host-notifier.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('OpenClawNotifier', () => {
  let notifier: OpenClawNotifier

  beforeEach(() => {
    mockFetch.mockReset()
    notifier = new OpenClawNotifier('http://localhost:41241', 'test-api-key')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('triggerAgent()', () => {
    it('should POST to /hooks/agent with correct headers', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
      const payload: AgentPayload = {
        batchId: 'batch_test01',
        type: 'REFLEX_BATCH',
        message: 'test batch message',
      }
      await notifier.triggerAgent(payload)

      expect(mockFetch).toHaveBeenCalledOnce()
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('http://localhost:41241/hooks/agent')
      expect(opts.method).toBe('POST')
      expect(opts.headers['X-Api-Key']).toBe('test-api-key')
      expect(opts.headers['Content-Type']).toBe('application/json')
    })

    it('should be fire-and-forget (not throw on non-ok response)', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 })
      const payload: AgentPayload = {
        batchId: 'batch_test02',
        type: 'BRIEFING_REQUEST',
        message: 'briefing',
      }
      await expect(notifier.triggerAgent(payload)).resolves.not.toThrow()
    })

    it('should include batchId and type in request body', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
      const payload: AgentPayload = {
        batchId: 'batch_abc123',
        type: 'GROOM_REQUEST',
        message: 'groom message',
        metadata: { friendId: 'friend-1' },
      }
      await notifier.triggerAgent(payload)

      const [, opts] = mockFetch.mock.calls[0]
      const body = JSON.parse(opts.body)
      expect(body.metadata.batchId).toBe('batch_abc123')
      expect(body.metadata.type).toBe('GROOM_REQUEST')
    })
  })

  describe('notify()', () => {
    it('should POST to /hooks/wake', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
      await notifier.notify('test notification')

      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('http://localhost:41241/hooks/wake')
      expect(opts.method).toBe('POST')
      expect(opts.headers['X-Api-Key']).toBe('test-api-key')
    })
  })

  describe('isAvailable()', () => {
    it('should return true when health check succeeds', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
      const result = await notifier.isAvailable()
      expect(result).toBe(true)
      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:41241/health')
    })

    it('should return false when health check fails', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 })
      const result = await notifier.isAvailable()
      expect(result).toBe(false)
    })

    it('should return false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network error'))
      const result = await notifier.isAvailable()
      expect(result).toBe(false)
    })
  })
})
