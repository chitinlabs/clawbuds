import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setCredentials, clearCredentials, register, getMe, getStats, getInbox } from '../lib/api-client'
import { generateKeyPair, generateClawId } from '../lib/sign-protocol.js'

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

function mockSuccess<T>(data: T) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ success: true, data }),
  })
}

function mockError(code: string, message: string, status = 400) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({ success: false, error: { code, message } }),
  })
}

describe('api-client', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    clearCredentials()
  })

  describe('register', () => {
    it('should send POST without auth headers', async () => {
      const profile = { clawId: 'claw_abc', displayName: 'TestBot', publicKey: 'abc' }
      mockSuccess(profile)

      const result = await register('abc', 'TestBot')

      expect(result).toEqual(profile)
      expect(mockFetch).toHaveBeenCalledOnce()

      const [path, opts] = mockFetch.mock.calls[0]
      expect(path).toBe('/api/v1/register')
      expect(opts.method).toBe('POST')
      expect(opts.headers['X-Claw-Id']).toBeUndefined()
    })
  })

  describe('authenticated requests', () => {
    const keyPair = generateKeyPair()
    const clawId = generateClawId(keyPair.publicKey)

    beforeEach(() => {
      setCredentials(clawId, keyPair.privateKey)
    })

    it('should include signature headers for getMe', async () => {
      const profile = { clawId, displayName: 'Bot', publicKey: keyPair.publicKey }
      mockSuccess(profile)

      await getMe()

      const [, opts] = mockFetch.mock.calls[0]
      expect(opts.headers['X-Claw-Id']).toBe(clawId)
      expect(opts.headers['X-Claw-Timestamp']).toBeDefined()
      expect(opts.headers['X-Claw-Signature']).toBeDefined()
    })

    it('should call getStats', async () => {
      mockSuccess({ messagesSent: 5, messagesReceived: 3, friendsCount: 2 })

      const stats = await getStats()

      expect(stats.messagesSent).toBe(5)
      const [path] = mockFetch.mock.calls[0]
      expect(path).toBe('/api/v1/me/stats')
    })

    it('should call getInbox with query params', async () => {
      mockSuccess([])

      await getInbox({ status: 'unread', limit: 10 })

      const [path] = mockFetch.mock.calls[0]
      expect(path).toContain('/api/v1/inbox')
      expect(path).toContain('status=unread')
      expect(path).toContain('limit=10')
    })
  })

  describe('error handling', () => {
    it('should throw ApiError on failure', async () => {
      const keyPair = generateKeyPair()
      setCredentials(generateClawId(keyPair.publicKey), keyPair.privateKey)
      mockError('NOT_FOUND', 'Profile not found', 404)

      await expect(getMe()).rejects.toThrow('Profile not found')
    })

    it('should throw when not authenticated', async () => {
      await expect(getMe()).rejects.toThrow('Not authenticated')
    })
  })
})
