import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { generateKeyPair, generateClawId, buildSignMessage, verify } from '@clawbuds/shared'
import { ClawBudsClient, ClawBudsApiError } from '../src/client.js'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function apiOk<T>(data: T) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, data }),
  }
}

function apiCreated<T>(data: T) {
  return {
    ok: true,
    status: 201,
    json: async () => ({ success: true, data }),
  }
}

function apiErr(status: number, code: string, message: string) {
  return {
    ok: false,
    status,
    json: async () => ({ success: false, error: { code, message } }),
  }
}

describe('ClawBudsClient', () => {
  const keys = generateKeyPair()
  const clawId = generateClawId(keys.publicKey)
  let client: ClawBudsClient

  beforeEach(() => {
    mockFetch.mockReset()
    client = new ClawBudsClient({
      serverUrl: 'http://localhost:3000',
      clawId,
      privateKey: keys.privateKey,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('register', () => {
    it('sends POST without auth headers', async () => {
      mockFetch.mockResolvedValueOnce(
        apiCreated({ clawId, publicKey: keys.publicKey, displayName: 'Alice', bio: '' }),
      )
      const result = await client.register(keys.publicKey, 'Alice')
      expect(result.clawId).toBe(clawId)

      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('http://localhost:3000/api/v1/register')
      expect(opts.method).toBe('POST')
      expect(opts.headers['X-Claw-Id']).toBeUndefined()
    })
  })

  describe('authenticated requests', () => {
    it('includes correct signature headers', async () => {
      mockFetch.mockResolvedValueOnce(apiOk([]))
      await client.listFriends()

      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('http://localhost:3000/api/v1/friends')
      expect(opts.headers['X-Claw-Id']).toBe(clawId)
      expect(opts.headers['X-Claw-Timestamp']).toBeDefined()
      expect(opts.headers['X-Claw-Signature']).toBeDefined()

      // Verify signature is valid
      const timestamp = opts.headers['X-Claw-Timestamp']
      const signature = opts.headers['X-Claw-Signature']
      const msg = buildSignMessage('GET', '/api/v1/friends', timestamp, '')
      expect(verify(signature, msg, keys.publicKey)).toBe(true)
    })

    it('signs POST body correctly', async () => {
      mockFetch.mockResolvedValueOnce(apiCreated({ id: '1', requesterId: clawId }))
      await client.sendFriendRequest('claw_1234567890abcdef')

      const [, opts] = mockFetch.mock.calls[0]
      const body = opts.body
      const timestamp = opts.headers['X-Claw-Timestamp']
      const signature = opts.headers['X-Claw-Signature']
      const msg = buildSignMessage('POST', '/api/v1/friends/request', timestamp, body)
      expect(verify(signature, msg, keys.publicKey)).toBe(true)
    })
  })

  describe('error handling', () => {
    it('throws ClawBudsApiError on failure', async () => {
      mockFetch.mockResolvedValueOnce(apiErr(409, 'CONFLICT', 'Already exists'))
      await expect(client.register(keys.publicKey, 'Alice')).rejects.toThrow(ClawBudsApiError)
    })

    it('error contains code and status', async () => {
      mockFetch.mockResolvedValueOnce(apiErr(403, 'NOT_FRIENDS', 'Not friends'))
      try {
        await client.sendMessage({
          blocks: [{ type: 'text', text: 'hi' }],
          visibility: 'direct',
          toClawIds: ['claw_1234567890abcdef'],
        })
      } catch (err) {
        expect(err).toBeInstanceOf(ClawBudsApiError)
        expect((err as ClawBudsApiError).code).toBe('NOT_FRIENDS')
        expect((err as ClawBudsApiError).statusCode).toBe(403)
      }
    })

    it('throws if not authenticated', async () => {
      const unauthed = new ClawBudsClient({ serverUrl: 'http://localhost:3000' })
      await expect(unauthed.listFriends()).rejects.toThrow('Not authenticated')
    })
  })

  describe('inbox', () => {
    it('passes query params', async () => {
      mockFetch.mockResolvedValueOnce(apiOk([]))
      await client.getInbox({ status: 'all', limit: 10, afterSeq: 5 })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('status=all')
      expect(url).toContain('limit=10')
      expect(url).toContain('afterSeq=5')
    })

    it('unread count', async () => {
      mockFetch.mockResolvedValueOnce(apiOk({ unread: 7 }))
      const result = await client.getUnreadCount()
      expect(result.unread).toBe(7)
    })

    it('ack entries', async () => {
      mockFetch.mockResolvedValueOnce(apiOk({ acknowledged: 3 }))
      const result = await client.ackInbox(['id1', 'id2', 'id3'])
      expect(result.acknowledged).toBe(3)
    })
  })

  // ─── Pearl methods (Phase 3) ────────────────────────────────────────────
  describe('pearl', () => {
    const mockPearl = {
      id: 'pearl-uuid-1',
      ownerId: clawId,
      type: 'insight',
      triggerText: 'test trigger',
      domainTags: ['AI'],
      luster: 0.5,
      shareability: 'friends_only',
      shareConditions: null,
      createdAt: '2026-02-19T00:00:00Z',
      updatedAt: '2026-02-19T00:00:00Z',
      body: null,
      context: null,
      originType: 'manual',
    }

    it('createPearl - creates a pearl', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ success: true, data: mockPearl }) })
      const result = await client.createPearl({ type: 'insight', triggerText: 'test trigger' })
      expect(result.id).toBe('pearl-uuid-1')
      expect(result.luster).toBe(0.5)
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/pearls')
      expect(opts.method).toBe('POST')
    })

    it('listPearls - returns pearl list', async () => {
      mockFetch.mockResolvedValueOnce(apiOk([mockPearl]))
      const result = await client.listPearls()
      expect(Array.isArray(result)).toBe(true)
      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/pearls')
    })

    it('viewPearl - gets pearl by id', async () => {
      mockFetch.mockResolvedValueOnce(apiOk(mockPearl))
      const result = await client.viewPearl('pearl-uuid-1')
      expect(result.id).toBe('pearl-uuid-1')
      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/pearls/pearl-uuid-1')
    })

    it('updatePearl - updates pearl fields', async () => {
      const updated = { ...mockPearl, triggerText: 'updated' }
      mockFetch.mockResolvedValueOnce(apiOk(updated))
      const result = await client.updatePearl('pearl-uuid-1', { triggerText: 'updated' })
      expect(result.triggerText).toBe('updated')
    })

    it('deletePearl - deletes pearl', async () => {
      mockFetch.mockResolvedValueOnce(apiOk(null))
      await expect(client.deletePearl('pearl-uuid-1')).resolves.not.toThrow()
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/pearls/pearl-uuid-1')
      expect(opts.method).toBe('DELETE')
    })

    it('sharePearl - shares pearl with friend', async () => {
      mockFetch.mockResolvedValueOnce(apiOk(null))
      await expect(client.sharePearl('pearl-uuid-1', 'friend-1')).resolves.not.toThrow()
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/pearls/pearl-uuid-1/share')
      expect(opts.method).toBe('POST')
    })

    it('endorsePearl - endorses pearl', async () => {
      const endorsement = { id: 'end-1', pearlId: 'pearl-uuid-1', endorserClawId: clawId, score: 0.8, comment: null, createdAt: '', updatedAt: '' }
      mockFetch.mockResolvedValueOnce(apiOk({ endorsement, newLuster: 0.7 }))
      const result = await client.endorsePearl('pearl-uuid-1', 0.8)
      expect(result.newLuster).toBeCloseTo(0.7, 2)
    })

    it('getReceivedPearls - gets received pearls', async () => {
      mockFetch.mockResolvedValueOnce(apiOk([]))
      const result = await client.getReceivedPearls()
      expect(Array.isArray(result)).toBe(true)
      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/pearls/received')
    })
  })

  // ─── Reflex methods (Phase 4) ────────────────────────────────────────────
  describe('reflex', () => {
    const mockReflex = {
      id: 'reflex-uuid-1',
      clawId,
      name: 'keepalive_heartbeat',
      valueLayer: 'infrastructure',
      behavior: 'keepalive',
      triggerLayer: 0,
      triggerConfig: { type: 'timer', intervalMs: 300000 },
      enabled: true,
      confidence: 1.0,
      source: 'builtin',
      createdAt: '2026-02-19T00:00:00Z',
      updatedAt: '2026-02-19T00:00:00Z',
    }

    it('listReflexes - calls GET /api/v1/reflexes', async () => {
      mockFetch.mockResolvedValueOnce(apiOk([mockReflex]))
      const result = await client.listReflexes()
      expect(Array.isArray(result)).toBe(true)
      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/reflexes')
      expect(url).not.toContain('/executions')
    })

    it('listReflexes - passes layer and enabled filters', async () => {
      mockFetch.mockResolvedValueOnce(apiOk([mockReflex]))
      await client.listReflexes({ layer: 0, enabled: false })
      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('layer=0')
      expect(url).toContain('enabled=false')
    })

    it('enableReflex - calls PATCH /:name/enable', async () => {
      mockFetch.mockResolvedValueOnce(apiOk(null))
      await expect(client.enableReflex('phatic_micro_reaction')).resolves.not.toThrow()
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/reflexes/phatic_micro_reaction/enable')
      expect(opts.method).toBe('PATCH')
    })

    it('disableReflex - calls PATCH /:name/disable', async () => {
      mockFetch.mockResolvedValueOnce(apiOk(null))
      await expect(client.disableReflex('phatic_micro_reaction')).resolves.not.toThrow()
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/reflexes/phatic_micro_reaction/disable')
      expect(opts.method).toBe('PATCH')
    })

    it('getReflexExecutions - calls GET /api/v1/reflexes/executions', async () => {
      mockFetch.mockResolvedValueOnce(apiOk({ data: [], meta: { total: 0, limit: 50 } }))
      const result = await client.getReflexExecutions()
      expect(result).toBeDefined()
      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/reflexes/executions')
    })

    it('getReflexExecutions - passes filters as query params', async () => {
      mockFetch.mockResolvedValueOnce(apiOk({ data: [], meta: { total: 0, limit: 10 } }))
      await client.getReflexExecutions({ limit: 10, result: 'blocked', since: '2026-02-01T00:00:00Z' })
      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('limit=10')
      expect(url).toContain('result=blocked')
      expect(url).toContain('since=')
    })
  })

  describe('messages', () => {
    it('sends message', async () => {
      mockFetch.mockResolvedValueOnce(
        apiCreated({ messageId: 'abc123', recipientCount: 2, recipients: ['a', 'b'], createdAt: 'now' }),
      )
      const result = await client.sendMessage({
        blocks: [{ type: 'text', text: 'Hello!' }],
        visibility: 'public',
      })
      expect(result.messageId).toBe('abc123')
      expect(result.recipientCount).toBe(2)
    })
  })
})
