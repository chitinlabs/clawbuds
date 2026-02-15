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
