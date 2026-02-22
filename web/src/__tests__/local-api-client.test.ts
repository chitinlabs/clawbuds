/**
 * TDD tests for web/src/lib/local-api-client.ts
 * Phase 13a: web client that talks to the daemon's local HTTP API
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createLocalApiClient, type LocalApiClient } from '../lib/local-api-client.js'

// We use fetch mocking (vi.fn) — no real network calls
const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.restoreAllMocks()
  mockFetch.mockReset()
})

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('createLocalApiClient', () => {
  let client: LocalApiClient

  beforeEach(() => {
    client = createLocalApiClient({ baseUrl: 'http://127.0.0.1:7878' })
  })

  // ─── getStatus ─────────────────────────────────────────────────────────────

  describe('getStatus()', () => {
    it('should return daemon status on success', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ running: true, serverConnected: true, activeProfiles: ['default'] }),
      )
      const result = await client.getStatus()
      expect(result).not.toBeNull()
      expect(result!.running).toBe(true)
      expect(result!.serverConnected).toBe(true)
      expect(result!.activeProfiles).toEqual(['default'])
    })

    it('should return null when fetch fails (network error)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      const result = await client.getStatus()
      expect(result).toBeNull()
    })

    it('should return null when response is not OK', async () => {
      mockFetch.mockResolvedValueOnce(new Response('', { status: 500 }))
      const result = await client.getStatus()
      expect(result).toBeNull()
    })

    it('should use AbortController with 500ms timeout', async () => {
      const abortSpy = vi.spyOn(AbortController.prototype, 'abort')
      // Simulate a slow response that gets aborted
      mockFetch.mockImplementationOnce((_url: string, opts: { signal?: AbortSignal }) => {
        return new Promise((_res, reject) => {
          opts.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
      })

      vi.useFakeTimers()
      const promise = client.getStatus()
      vi.advanceTimersByTime(501) // trigger timeout
      const result = await promise
      vi.useRealTimers()

      expect(result).toBeNull()
      expect(abortSpy).toHaveBeenCalled()
    })
  })

  // ─── getCarapace ───────────────────────────────────────────────────────────

  describe('getCarapace()', () => {
    it('should return content on success', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ content: '# Carapace\n\ntest' }))
      const result = await client.getCarapace()
      expect(result).toBe('# Carapace\n\ntest')
    })

    it('should return null on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fail'))
      const result = await client.getCarapace()
      expect(result).toBeNull()
    })
  })

  // ─── putCarapace ───────────────────────────────────────────────────────────

  describe('putCarapace()', () => {
    it('should send PUT request with content and reason', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ version: 3, createdAt: '2026-02-22T00:00:00Z' }))
      const result = await client.putCarapace('# Updated', 'manual')
      expect(result).not.toBeNull()
      expect(result!.version).toBe(3)

      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('http://127.0.0.1:7878/local/carapace')
      expect(opts.method).toBe('PUT')
      expect(JSON.parse(opts.body as string)).toMatchObject({ content: '# Updated', reason: 'manual' })
    })

    it('should return null on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fail'))
      const result = await client.putCarapace('# test', 'manual')
      expect(result).toBeNull()
    })
  })

  // ─── syncCarapace ──────────────────────────────────────────────────────────

  describe('syncCarapace()', () => {
    it('should return version on success', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ version: 5 }))
      const result = await client.syncCarapace()
      expect(result).toBe(5)

      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('http://127.0.0.1:7878/local/carapace/sync')
      expect((opts.method ?? 'GET').toUpperCase()).toBe('POST')
    })

    it('should return null on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fail'))
      const result = await client.syncCarapace()
      expect(result).toBeNull()
    })
  })
})
